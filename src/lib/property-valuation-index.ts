// INE housing price index ingest — fetcher + parser + upsert.
//
// **Source:** INE pindica.jsp JSON endpoint, indicator 0011370
// "Valor mediano das vendas de alojamentos familiares (Metodologia 2022 - €/m²)"
// at concelho granularity, **annual** cadence covering 306 concelhos
// (2019–2022 series — INE's quarterly variant 0011373 only covers ~58
// large concelhos and excludes Figueira da Foz, Coimbra, Évora, etc).
//
// **History:** the original implementation hit `/ine/json_indicadores/` (plural)
// which INE retired entirely. The working path is `/ine/json_indicador/`
// (singular) per the dados.gov.pt CKAN catalog. Variable was also wrong —
// 0011784 in the legacy code was "Construction production index", not a
// housing price series.
//
// **Periodicity:** the indicator is published annually with one row per
// (concelho × dim_3 [Novos|Existentes|Total]) per year. We filter to
// `dim_3_t === "Total"` for the broad-market median, and store under
// quarter=4 of the published year so the existing quarter-aware query
// path keeps working unchanged.
//
// **Pagination:** pindica.jsp returns only one period per request. To
// backfill 2019–2022 we issue one HTTP call per year via the `Dim1`
// query parameter (S7A2019, S7A2020, ...) and merge the rows.
//
// We don't trust the underlying unit — the engine only ever uses ratios between
// two rows for the same concelho, so this storage layer is unit-agnostic.

export class IneEndpointGoneError extends Error {
  constructor(public url: string, public status: number) {
    super(`INE endpoint gone (HTTP ${status}) for ${url} — see lib/property-valuation-index.ts header`);
    this.name = "IneEndpointGoneError";
  }
}

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type IneIndexRow = {
  concelhoName: string;
  year: number;
  quarter: number;
  indexValue: number;
};

export type IneFetchResult = {
  rows: IneIndexRow[];
  source: string;
  warnings: string[];
};

/**
 * Normalize a concelho free-text name into a stable lookup key.
 *  - lowercase
 *  - strip diacritics (Lisbôa -> lisboa)
 *  - collapse whitespace
 */
export function concelhoKey(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const DEFAULT_BASE_URL = "https://www.ine.pt/ine/json_indicador/pindica.jsp";
const DEFAULT_VARCD = "0011370";
// Years to fetch when no explicit override URL is given. INE's series for
// this indicator currently runs 2019–2022; bump as new years are published.
const DEFAULT_YEARS = [2019, 2020, 2021, 2022];

/**
 * Fetch the INE housing-price index. Returns parsed rows.
 *
 * If `INE_HOUSING_INDEX_URL` is set, it's used as a single-shot URL (the
 * legacy behavior — useful for tests/mocks/manual overrides). Otherwise
 * we issue one request per year of `DEFAULT_YEARS` against `DEFAULT_BASE_URL`
 * with the appropriate `Dim1=S7AYYYY` parameter and merge results.
 */
export async function fetchLatestIneHousingIndex(
  url: string | null = process.env.INE_HOUSING_INDEX_URL || null,
): Promise<IneFetchResult> {
  const warnings: string[] = [];

  if (url) {
    const rows = await fetchSingleUrl(url, warnings);
    return { rows, source: "INE", warnings };
  }

  // Multi-year fetch path — one HTTP call per year, merged.
  const merged: IneIndexRow[] = [];
  for (const year of DEFAULT_YEARS) {
    const yearUrl = `${DEFAULT_BASE_URL}?op=2&varcd=${DEFAULT_VARCD}&Dim1=S7A${year}&lang=PT`;
    try {
      const rows = await fetchSingleUrl(yearUrl, warnings);
      merged.push(...rows);
    } catch (err) {
      // One bad year shouldn't fail the whole refresh.
      if (err instanceof IneEndpointGoneError) throw err;
      warnings.push(`year ${year}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { rows: merged, source: "INE", warnings };
}

async function fetchSingleUrl(url: string, warnings: string[]): Promise<IneIndexRow[]> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 404) {
    // The whole pindica.jsp surface was retired upstream — surface a
    // dedicated error type so the cron can degrade quietly instead of
    // alerting on every run.
    throw new IneEndpointGoneError(url, res.status);
  }
  if (!res.ok) {
    throw new Error(`INE fetch failed ${res.status} ${res.statusText} for ${url}`);
  }
  const json: unknown = await res.json();
  return parseInePayload(json, warnings);
}

/**
 * Parse the INE pindica.jsp JSON shape. Real-world examples:
 *   Annual (varcd 0011370):
 *     "Dados": { "2022": [{ "geocod": "16E0605", "geodsg": "Figueira da Foz",
 *                            "dim_3": "T", "dim_3_t": "Total", "valor": "1208" }, ...] }
 *   Quarterly (varcd 0011373):
 *     "Dados": { "4.º Trimestre de 2023": [...] }
 *   Legacy quarterly:
 *     "Dados": { "S7A2024T4": [...] }
 *
 * INE's geographic codes mix concelhos (7-digit), NUTS regions, and Portugal-wide
 * aggregates. For housing-price series there's also a `dim_3` dimension splitting
 * Total / Novos / Existentes — we filter to Total since the chart only wants the
 * broad-market median.
 */
export function parseInePayload(payload: unknown, warnings: string[]): IneIndexRow[] {
  if (!Array.isArray(payload) || payload.length === 0) {
    warnings.push("INE payload was empty or not an array");
    return [];
  }
  const rows: IneIndexRow[] = [];
  for (const block of payload) {
    if (!block || typeof block !== "object") continue;
    const dados = (block as Record<string, unknown>).Dados;
    if (!dados || typeof dados !== "object") continue;

    for (const [periodCode, entries] of Object.entries(dados as Record<string, unknown>)) {
      const period = parsePeriodCode(periodCode);
      if (!period) {
        warnings.push(`Unrecognised period code ${periodCode}`);
        continue;
      }
      if (!Array.isArray(entries)) continue;
      for (const e of entries) {
        if (!e || typeof e !== "object") continue;
        const row = e as Record<string, unknown>;
        const name = typeof row.geodsg === "string" ? row.geodsg.trim() : null;

        // Drop Novos / Existentes splits — keep Total only. Series without
        // a dim_3 (e.g. legacy 0011784) are passed through unchanged.
        const dim3Code = typeof row.dim_3 === "string" ? row.dim_3 : null;
        const dim3Text = typeof row.dim_3_t === "string" ? row.dim_3_t : null;
        if ((dim3Code !== null && dim3Code !== "T") || (dim3Text !== null && dim3Text !== "Total")) {
          continue;
        }

        const valorRaw = row.valor;
        const numericValue =
          typeof valorRaw === "number"
            ? valorRaw
            : typeof valorRaw === "string"
              ? Number(valorRaw.replace(",", "."))
              : NaN;
        if (!name || !Number.isFinite(numericValue) || numericValue <= 0) continue;
        rows.push({
          concelhoName: name,
          year: period.year,
          quarter: period.quarter,
          indexValue: numericValue,
        });
      }
    }
  }
  return rows;
}

/**
 * Recognise INE period codes:
 *   - "2022"                    → annual (year=2022, quarter=4)
 *   - "1.º Trimestre de 2024"   → quarterly Portuguese
 *   - "S7A2024T4"               → legacy quarterly code
 * For annual periods we synthesise quarter=4 so the row sorts to end-of-year
 * relative to other quarterly rows.
 */
export function parsePeriodCode(code: string): { year: number; quarter: number } | null {
  // Legacy "S7A2024T4"
  let m = code.match(/A(\d{4})T(\d)/);
  if (m) {
    const year = Number(m[1]);
    const quarter = Number(m[2]);
    if (Number.isFinite(year) && quarter >= 1 && quarter <= 4) return { year, quarter };
  }
  // Portuguese quarterly "N.º Trimestre de YYYY"
  m = code.match(/^(\d)\.?º\s+Trimestre\s+de\s+(\d{4})/i);
  if (m) {
    const quarter = Number(m[1]);
    const year = Number(m[2]);
    if (Number.isFinite(year) && quarter >= 1 && quarter <= 4) return { year, quarter };
  }
  // Bare annual "YYYY"
  m = code.match(/^(\d{4})$/);
  if (m) {
    const year = Number(m[1]);
    if (Number.isFinite(year) && year >= 1900 && year <= 2100) {
      return { year, quarter: 4 };
    }
  }
  return null;
}

/**
 * Idempotently upsert a batch of rows. Same (concelhoKey, year, quarter) twice
 * is a no-op except for refreshing `indexValue` and `updatedAt`.
 */
export async function upsertIneRows(
  rows: IneIndexRow[],
  source: "INE" | "manual" = "INE",
): Promise<{ written: number; skipped: number }> {
  let written = 0;
  let skipped = 0;
  for (const r of rows) {
    const key = concelhoKey(r.concelhoName);
    if (!key) {
      skipped++;
      continue;
    }
    try {
      await prisma.propertyValuationIndex.upsert({
        where: {
          concelhoKey_year_quarter: { concelhoKey: key, year: r.year, quarter: r.quarter },
        },
        create: {
          concelhoKey: key,
          concelhoName: r.concelhoName,
          year: r.year,
          quarter: r.quarter,
          indexValue: new Prisma.Decimal(r.indexValue),
          source,
        },
        update: {
          indexValue: new Prisma.Decimal(r.indexValue),
          source,
          concelhoName: r.concelhoName,
        },
      });
      written++;
    } catch {
      skipped++;
    }
  }
  return { written, skipped };
}

/**
 * Lookup the latest index for a concelho. Returns null if we have no data.
 * Used both for purchase-quarter alignment and current-quarter valuation.
 */
export async function getLatestIndex(concelhoNameOrKey: string): Promise<{
  year: number;
  quarter: number;
  indexValue: number;
} | null> {
  const key = concelhoKey(concelhoNameOrKey);
  if (!key) return null;
  const row = await prisma.propertyValuationIndex.findFirst({
    where: { concelhoKey: key },
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
  });
  if (!row) return null;
  return { year: row.year, quarter: row.quarter, indexValue: Number(row.indexValue) };
}

/**
 * Lookup the index for the quarter that contains the given purchase date,
 * falling back to the closest earlier quarter we have for that concelho. Used
 * by the heuristic engine to anchor "what was the price level when bought."
 */
export async function getIndexAtOrBefore(
  concelhoNameOrKey: string,
  purchaseDate: Date,
): Promise<{ year: number; quarter: number; indexValue: number } | null> {
  const key = concelhoKey(concelhoNameOrKey);
  if (!key) return null;

  const targetYear = purchaseDate.getUTCFullYear();
  const targetQuarter = Math.floor(purchaseDate.getUTCMonth() / 3) + 1;

  const row = await prisma.propertyValuationIndex.findFirst({
    where: {
      concelhoKey: key,
      OR: [
        { year: { lt: targetYear } },
        { year: targetYear, quarter: { lte: targetQuarter } },
      ],
    },
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
  });
  if (!row) return null;
  return { year: row.year, quarter: row.quarter, indexValue: Number(row.indexValue) };
}
