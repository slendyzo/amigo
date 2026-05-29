// Z.AI HTML parser — turns scraped search-result HTML into structured listings.
//
// Used by both the live scrapers (current Standvirtual/OLX/Idealista/Imovirtual)
// and the Web Archive backfill (historical archive.org snapshots of the same
// sites). Resilient to site redesigns by virtue of doing the parsing with an
// LLM instead of brittle CSS selectors.
//
// Returns an empty array on any failure — never throws — so the calling
// scraper can fail-soft and the median calculator can decide whether the
// snapshot has enough samples to count.

const ENDPOINT = "https://api.z.ai/api/coding/paas/v4/chat/completions";
const MODEL = "glm-4.6";

export type ListingSource =
  | "standvirtual"
  | "olx"
  | "idealista"
  | "imovirtual";

export type AssetTypeForParse = "VEHICLE" | "PROPERTY";

export type ParsedVehicleListing = {
  price: number;
  currency: string;
  make: string | null;
  model: string | null;
  year: number | null;
  mileage: number | null;
  trim: string | null;
  url: string | null;
};

export type ParsedPropertyListing = {
  price: number;
  currency: string;
  areaM2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  propertyType: string | null;
  location: string | null;
  url: string | null;
};

export type ParseListingsInput = {
  html: string;
  source: ListingSource;
  assetType: AssetTypeForParse;
};

// ─── Make/model matching ──────────────────────────────────────────────────────
//
// The scrapers occasionally return cross-category junk (a CFMoto 450NK search
// surfacing MINI Coopers from the cars index). Before any median is computed we
// drop listings that don't actually match the asset's make + model. Without this
// guard the median is whatever soup the search returned — that's how Nuno's
// €4.5k bike read €23k.

// Lowercase and strip everything that isn't a letter or digit, so "MX-5",
// "mx 5" and "MX5" all collapse to "mx5", and "Mercedes-Benz" → "mercedesbenz".
function normalizeToken(s: string | null | undefined): string {
  if (!s) return "";
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Lenient bidirectional containment: "mercedes" matches "mercedesbenz",
// "450nk" matches "450nkabs". Either being empty is not a match.
function tokensRelated(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

/**
 * True if a scraped vehicle listing plausibly refers to the same make + model
 * as the asset being valued. Uses the listing's extracted make/model when
 * present, and falls back to the listing URL slug (which always carries the
 * make/model on Standvirtual/OLX). A listing we can't verify at all is rejected
 * — for valuation we'd rather drop an ambiguous comp than poison the median.
 */
export function vehicleListingMatches(
  listing: ParsedVehicleListing,
  spec: { make: string; model: string },
): boolean {
  const specMake = normalizeToken(spec.make);
  const specModel = normalizeToken(spec.model);
  if (!specMake || !specModel) return true; // nothing to match against — don't filter

  const listingMake = normalizeToken(listing.make);
  const listingModel = normalizeToken(listing.model);

  if (listingMake && listingModel) {
    return tokensRelated(listingMake, specMake) && tokensRelated(listingModel, specModel);
  }

  // Fallback: the detail URL slug carries make + model on every site we scrape.
  const urlNorm = normalizeToken(listing.url);
  if (urlNorm) {
    return urlNorm.includes(specMake) && urlNorm.includes(specModel);
  }

  return false;
}

// Soft cap on cleaned HTML sent to the model. GLM-4.6 supports a large context
// but listings are dense — keeping each chunk modest keeps cost predictable
// and avoids tail truncation of the tool-call output.
const MAX_CHARS_PER_CHUNK = 60_000;

const SYSTEM_PROMPT_VEHICLE = `You are a vehicle listing extractor for Portuguese-market classifieds (Standvirtual, OLX, archived versions of either). Given the HTML of a search-results page, invoke the record_listings tool with one entry per car listing visible on the page.

For each listing, extract:
- price: the asking price as a number, in the listing's currency. Strip thousand separators ("18 500 €" → 18500). If only "Preço sob consulta" / "Price on request" is shown, omit the listing entirely.
- currency: the ISO code ("EUR" almost always; "USD" only if clearly marked).
- make: the manufacturer/brand exactly as shown ("Mazda", "CFMoto", "Mercedes-Benz"), or null if not shown.
- model: the model name only, without the brand ("MX-5", "450NK", "Classe A"), or null if not shown.
- year: the model year (4-digit), or null if not shown.
- mileage: kilometres as an integer, or null if not shown. Convert "180.000 km" or "180,000 km" to 180000.
- trim: the trim/version string as the seller wrote it (e.g. "RF GT", "Skyactiv-G 2.0 Sport"), or null.
- url: the absolute URL to the listing detail page, or null.

Hard rules:
- Only include actual listings — skip ads, sponsored tiles, "you might also like" sections, dealer banners.
- If the page has zero listings, return an empty array.
- Never hallucinate fields. Use null when the data isn't on the page.`;

const SYSTEM_PROMPT_PROPERTY = `You are a real-estate listing extractor for Portuguese-market classifieds (Idealista, Imovirtual, archived versions of either). Given the HTML of a search-results page, invoke the record_listings tool with one entry per property listing visible on the page.

For each listing, extract:
- price: the asking price as a number, in the listing's currency. Strip thousand separators ("285 000 €" → 285000). If "Preço sob consulta" / "Price on request", omit the listing.
- currency: ISO code ("EUR" almost always).
- areaM2: livable area in square metres as an integer, or null.
- bedrooms: integer count of bedrooms (interpret "T2" → 2, "T3" → 3, "T0" → 0). Null if unknown.
- bathrooms: integer count, or null.
- propertyType: one of "APARTMENT", "HOUSE", "LAND", "COMMERCIAL", "OTHER".
- location: the most specific location string on the listing (concelho or freguesia), or null.
- url: absolute URL to detail page, or null.

Hard rules:
- Skip ads, sponsored content, dealer banners.
- Empty array if page has no listings.
- Never invent fields. Null when missing.`;

const TOOL_VEHICLE = {
  type: "function" as const,
  function: {
    name: "record_listings",
    description: "Record the structured vehicle listings extracted from the page.",
    parameters: {
      type: "object" as const,
      properties: {
        listings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              price: { type: "number" },
              currency: { type: "string" },
              make: { type: ["string", "null"] },
              model: { type: ["string", "null"] },
              year: { type: ["integer", "null"] },
              mileage: { type: ["integer", "null"] },
              trim: { type: ["string", "null"] },
              url: { type: ["string", "null"] },
            },
            required: ["price", "currency", "make", "model", "year", "mileage", "trim", "url"],
          },
        },
      },
      required: ["listings"],
    },
  },
};

const TOOL_PROPERTY = {
  type: "function" as const,
  function: {
    name: "record_listings",
    description: "Record the structured property listings extracted from the page.",
    parameters: {
      type: "object" as const,
      properties: {
        listings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              price: { type: "number" },
              currency: { type: "string" },
              areaM2: { type: ["integer", "null"] },
              bedrooms: { type: ["integer", "null"] },
              bathrooms: { type: ["integer", "null"] },
              propertyType: {
                type: ["string", "null"],
                enum: ["APARTMENT", "HOUSE", "LAND", "COMMERCIAL", "OTHER", null],
              },
              location: { type: ["string", "null"] },
              url: { type: ["string", "null"] },
            },
            required: [
              "price",
              "currency",
              "areaM2",
              "bedrooms",
              "bathrooms",
              "propertyType",
              "location",
              "url",
            ],
          },
        },
      },
      required: ["listings"],
    },
  },
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      tool_calls?: Array<{
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
};

export async function parseVehicleListings(
  input: Omit<ParseListingsInput, "assetType">,
): Promise<ParsedVehicleListing[]> {
  const raw = await runParse(input.html, "VEHICLE");
  const out: ParsedVehicleListing[] = [];
  for (const item of raw) {
    const price = numOrNaN(item.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    out.push({
      price,
      currency: typeof item.currency === "string" && item.currency.length <= 5 ? item.currency : "EUR",
      make: nullableString(item.make),
      model: nullableString(item.model),
      year: nullableInt(item.year),
      mileage: nullableInt(item.mileage),
      trim: nullableString(item.trim),
      url: nullableString(item.url),
    });
  }
  const deduped = dedupeByUrl(out);
  console.log(
    `[listing-html-parser] source=${input.source} type=VEHICLE in=${raw.length} out=${deduped.length}`,
  );
  return deduped;
}

export async function parsePropertyListings(
  input: Omit<ParseListingsInput, "assetType">,
): Promise<ParsedPropertyListing[]> {
  const raw = await runParse(input.html, "PROPERTY");
  const out: ParsedPropertyListing[] = [];
  for (const item of raw) {
    const price = numOrNaN(item.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    out.push({
      price,
      currency: typeof item.currency === "string" && item.currency.length <= 5 ? item.currency : "EUR",
      areaM2: nullableInt(item.areaM2),
      bedrooms: nullableInt(item.bedrooms),
      bathrooms: nullableInt(item.bathrooms),
      propertyType: nullableString(item.propertyType),
      location: nullableString(item.location),
      url: nullableString(item.url),
    });
  }
  const deduped = dedupeByUrl(out);
  console.log(
    `[listing-html-parser] source=${input.source} type=PROPERTY in=${raw.length} out=${deduped.length}`,
  );
  return deduped;
}

async function runParse(
  html: string,
  assetType: AssetTypeForParse,
): Promise<Array<Record<string, unknown>>> {
  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    console.warn("[listing-html-parser] ZAI_API_KEY missing — returning []");
    return [];
  }

  const cleaned = stripBoilerplate(html);
  if (cleaned.length === 0) return [];

  const chunks = chunkHtml(cleaned, MAX_CHARS_PER_CHUNK);
  const results: Array<Record<string, unknown>> = [];

  for (const chunk of chunks) {
    const sysPrompt = assetType === "VEHICLE" ? SYSTEM_PROMPT_VEHICLE : SYSTEM_PROMPT_PROPERTY;
    const tool = assetType === "VEHICLE" ? TOOL_VEHICLE : TOOL_PROPERTY;

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          thinking: { type: "disabled" },
          max_tokens: 4096,
          messages: [
            { role: "system", content: sysPrompt },
            { role: "user", content: chunk },
          ],
          tools: [tool],
          tool_choice: { type: "function", function: { name: tool.function.name } },
        }),
      });

      if (!res.ok) {
        console.error(
          "[listing-html-parser] Z.AI HTTP",
          res.status,
          await res.text().catch(() => ""),
        );
        continue;
      }

      const data: ChatCompletionResponse = await res.json();
      const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) continue;

      const parsed = JSON.parse(args) as { listings?: unknown };
      if (!Array.isArray(parsed.listings)) continue;

      for (const entry of parsed.listings) {
        if (entry && typeof entry === "object") {
          results.push(entry as Record<string, unknown>);
        }
      }
    } catch (err) {
      console.error("[listing-html-parser] chunk failed:", err);
    }
  }

  return results;
}

// ─── HTML preprocessing ─────────────────────────────────────────────────────

// Strip boilerplate that the AI doesn't need to see: <script>, <style>,
// <noscript>, <head>, <svg>, HTML comments, common navigation/footer chrome,
// and excessive whitespace. Keeps text content + relevant attributes (href,
// data-* commonly used for listing IDs).
function stripBoilerplate(html: string): string {
  let s = html;

  // Drop entire blocks that never contain listing data.
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "");
  s = s.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "");
  s = s.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  // Common chrome — best-effort. If the site uses unusual tag names this
  // is a no-op, which is fine.
  s = s.replace(/<(nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, "");

  // Compact whitespace.
  s = s.replace(/\s+/g, " ");
  s = s.trim();

  return s;
}

// Split HTML into chunks ≤ maxChars without slicing through tags when
// avoidable. Naive: prefer breaking on tag boundaries; if no boundary in
// range, hard-split at maxChars.
function chunkHtml(html: string, maxChars: number): string[] {
  if (html.length <= maxChars) return [html];

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < html.length) {
    const remaining = html.length - cursor;
    if (remaining <= maxChars) {
      chunks.push(html.slice(cursor));
      break;
    }

    // Try to find a closing tag near the soft limit.
    const slice = html.slice(cursor, cursor + maxChars);
    const lastClose = slice.lastIndexOf(">");
    const cut = lastClose > maxChars * 0.6 ? lastClose + 1 : maxChars;
    chunks.push(html.slice(cursor, cursor + cut));
    cursor += cut;
  }

  return chunks;
}

// ─── Coercion helpers ───────────────────────────────────────────────────────

function numOrNaN(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d.,-]/g, "").replace(/(?<=\d)[.,](?=\d{3}\b)/g, "").replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function nullableInt(v: unknown): number | null {
  if (v == null) return null;
  const n = numOrNaN(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function nullableString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length === 0 ? null : s;
}

function dedupeByUrl<T extends { url: string | null }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (item.url && seen.has(item.url)) continue;
    if (item.url) seen.add(item.url);
    out.push(item);
  }
  return out;
}
