// Nominatim wrapper for address → lat/lon. Free, no API key.
// Used by /api/assets POST + PUT to cache geocoded coords on Property
// for OSM static-map thumbnails.
//
// Cascading strategy: full free-text address first (street + postal + city +
// country) for rooftop accuracy, then postal-code-only fallback when the
// full query returns nothing — this preserves a sensible map for properties
// where the street isn't in OSM, at the cost of a postal-area centroid.
//
// Nominatim usage policy requires:
//  - A real User-Agent identifying the app
//  - Max 1 req/s (we don't enforce here — callers fire one per save; the
//    backfill script paces itself)
//  - Caching results (we keep an in-memory LRU)

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Amigo/1.0 (https://amigo.slendyzo.pt)";
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_MAX = 500;

export type GeocodeError = "NOT_FOUND" | "RATE_LIMITED" | "TIMEOUT" | "NETWORK" | "INVALID_INPUT";

// `precision` reflects which query branch produced the result.
//  - "address" → full free-text matched (rooftop / street level)
//  - "postal"  → only the postal-code centroid matched
export type GeocodePrecision = "address" | "postal";

export type GeocodeResult =
  | { ok: true; lat: number; lon: number; precision: GeocodePrecision }
  | { ok: false; error: GeocodeError };

export type GeocodeInput = {
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
};

type CacheEntry = { result: GeocodeResult; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function normalize(s: string | null | undefined): string {
  return (s ?? "").trim();
}

// PT addresses commonly include floor + apartment descriptors that Nominatim
// can't resolve (it indexes the building, not the unit). "Rua X 10, 2º Esq"
// returns 0 results; "Rua X 10" returns the street. Strip the unit tail
// before geocoding — we still keep the original in the address column so
// the user sees their full input.
const UNIT_PATTERNS = [
  /,\s*\d+\s*[ºo°]?\s*(esq|esquerdo|dto|dir|direito|frt|frente|tras|traseiras)\.?$/i,
  /,\s*[ºo°]?\s*(esq|esquerdo|dto|dir|direito|frt|frente)\.?$/i,
  /,\s*\d+\s*[ºo°]\s*(andar|piso)\.?$/i,
  /,\s*r\/?c\s*(esq|dto|frt)?\.?$/i,
  /,\s*[a-z]\s*-\s*\d+\s*[ºo°]?$/i, // "Bloco A - 2º"
];

function stripUnitDescriptors(address: string): string {
  let s = address.trim();
  // Multiple passes — strip iteratively (some addresses chain two patterns).
  for (let i = 0; i < 3; i++) {
    let changed = false;
    for (const re of UNIT_PATTERNS) {
      const next = s.replace(re, "").trim().replace(/,\s*$/, "");
      if (next !== s) {
        s = next;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return s;
}

function cacheKey(input: GeocodeInput): string {
  const country = normalize(input.country) || "PT";
  return [
    country.toUpperCase(),
    normalize(input.postalCode).toUpperCase(),
    normalize(input.city).toUpperCase(),
    normalize(input.address).toUpperCase(),
  ].join("|");
}

function rememberResult(key: string, result: GeocodeResult): void {
  if (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function nominatimQuery(params: URLSearchParams): Promise<{ lat: number; lon: number } | { error: GeocodeError }> {
  const url = new URL(NOMINATIM_BASE);
  params.forEach((value, key) => url.searchParams.set(key, value));
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 429) return { error: "RATE_LIMITED" };
    if (!res.ok) return { error: "NETWORK" };
    const json = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const first = Array.isArray(json) ? json[0] : null;
    const lat = first?.lat != null ? Number(first.lat) : NaN;
    const lon = first?.lon != null ? Number(first.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { error: "NOT_FOUND" };
    }
    return { lat, lon };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return { error: "TIMEOUT" };
    return { error: "NETWORK" };
  } finally {
    clearTimeout(timer);
  }
}

export async function geocodeAddress(input: GeocodeInput): Promise<GeocodeResult> {
  const country = (normalize(input.country) || "PT").toUpperCase();
  const postalCode = normalize(input.postalCode);
  const address = normalize(input.address);
  const city = normalize(input.city);

  if (!address && !postalCode) return { ok: false, error: "INVALID_INPUT" };

  const key = cacheKey(input);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  // 1) Full free-text query — best chance at rooftop accuracy. We only run
  //    this when there's a real street address; otherwise it degrades to
  //    just the postal centroid anyway, so skip the round-trip.
  //    We try the address first as-stored, then a cleaned variant with PT
  //    floor/unit descriptors stripped (Nominatim indexes buildings, not
  //    units, so "Rua X 10, 2º Esq" returns 0 results but "Rua X 10" works).
  if (address) {
    const cleaned = stripUnitDescriptors(address);
    const variants = cleaned !== address ? [address, cleaned] : [address];
    for (const variant of variants) {
      const q = [variant, postalCode, city].filter(Boolean).join(", ");
      const params = new URLSearchParams();
      params.set("q", q);
      params.set("countrycodes", country.toLowerCase());
      const full = await nominatimQuery(params);
      if ("lat" in full) {
        const result: GeocodeResult = { ok: true, lat: full.lat, lon: full.lon, precision: "address" };
        rememberResult(key, result);
        return result;
      }
      if (full.error === "RATE_LIMITED" || full.error === "TIMEOUT" || full.error === "NETWORK") {
        // Don't fall back on transient failures — bubble up.
        return { ok: false, error: full.error };
      }
      // NOT_FOUND → try next variant, or fall through to postal-only below.
    }
  }

  // 2) Postal-code fallback — preserves the previous behavior (postal-area
  //    centroid). Used when no address is set OR the full query came up empty.
  if (postalCode) {
    const params = new URLSearchParams();
    params.set("country", country);
    params.set("postalcode", postalCode);
    const postal = await nominatimQuery(params);
    if ("lat" in postal) {
      const result: GeocodeResult = { ok: true, lat: postal.lat, lon: postal.lon, precision: "postal" };
      rememberResult(key, result);
      return result;
    }
    const result: GeocodeResult = { ok: false, error: postal.error };
    if (postal.error === "NOT_FOUND") rememberResult(key, result);
    return result;
  }

  const result: GeocodeResult = { ok: false, error: "NOT_FOUND" };
  rememberResult(key, result);
  return result;
}

// Back-compat shim — older callers passed only postal+country. Forwards to
// the cascading geocoder with no address (so it uses the postal fallback).
export async function geocodePostalCode(input: {
  postalCode: string;
  country?: string;
}): Promise<GeocodeResult> {
  return geocodeAddress({ postalCode: input.postalCode, country: input.country });
}
