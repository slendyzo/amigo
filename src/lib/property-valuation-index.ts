// INE quarterly housing price index ingest — fetcher + parser + upsert.
//
// The default source is the INE pindica.jsp JSON endpoint which historically
// exposed the "Preço mediano por m² de alojamentos familiares" indicator
// (varcd 0011784) at concelho granularity. The fetch URL is env-overridable
// via INE_HOUSING_INDEX_URL.
//
// **Status (May 2026):** INE has retired the pindica.jsp endpoint entirely —
// every varcd + every path under /ine/json_indicadores/ now returns 404.
// `fetchLatestIneHousingIndex` will throw `IneEndpointGoneError` in that case;
// the cron handler catches it and returns a 200 with `mode: "ine_unavailable"`
// so we don't spam alerts. Manual seed mode (POST {rows: [...]} to the cron
// endpoint) still works and is the recommended path until we migrate.
//
// **Migration target (AMIGO-178 follow-up):** INE BDMUNICIPIOS or the newer
// Geohab platform. Both expose similar concelho-level data but in a different
// shape than pindica.jsp — the parser will need adapting.
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

const DEFAULT_URL =
  "https://www.ine.pt/ine/json_indicadores/pindica.jsp?op=2&varcd=0011784&lang=PT";

/**
 * Fetch the latest quarter's data from INE. Returns parsed rows + the dimension
 * period code used (e.g. "S7A2024T4"). Throws on network or parse failure.
 */
export async function fetchLatestIneHousingIndex(
  url: string = process.env.INE_HOUSING_INDEX_URL || DEFAULT_URL,
): Promise<IneFetchResult> {
  const warnings: string[] = [];
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
  const rows = parseInePayload(json, warnings);
  return { rows, source: "INE", warnings };
}

/**
 * Parse the INE pindica.jsp JSON shape. The structure looks like:
 *   [
 *     {
 *       "IndicadorCod": "0011784",
 *       "Dados": {
 *         "S7A2024T4": [
 *           { "geocod": "1106", "geodsg": "Lisboa", "valor": "3850" },
 *           ...
 *         ]
 *       }
 *     }
 *   ]
 *
 * INE's geographic codes mix concelhos (4-digit) and aggregates (NUTS levels).
 * For this v1 we keep every row and let the matcher key off of `concelhoName`
 * — concelho-level callers will hit a row, NUTS-level rows are harmless ballast.
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
 * INE period codes for quarterly series look like "S7A2024T4" — Trimestral, year
 * 2024, quarter 4. We don't validate the prefix strictly; we just extract YYYY
 * and the trailing T<N>.
 */
export function parsePeriodCode(code: string): { year: number; quarter: number } | null {
  const m = code.match(/A(\d{4})T(\d)/);
  if (!m) return null;
  const year = Number(m[1]);
  const quarter = Number(m[2]);
  if (!Number.isFinite(year) || quarter < 1 || quarter > 4) return null;
  return { year, quarter };
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
