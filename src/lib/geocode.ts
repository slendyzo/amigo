// Nominatim wrapper for postal-code → lat/lon. Free, no API key.
// Used by /api/assets POST + PUT to cache geocoded coords on Property
// for OSM static-map thumbnails.
//
// Nominatim usage policy requires:
//  - A real User-Agent identifying the app
//  - Max 1 req/s (we don't enforce here — callers fire one per save)
//  - Caching results (we keep an in-memory LRU)

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Amigo/1.0 (https://amigo.slendyzo.pt)";
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_MAX = 500;

export type GeocodeError = "NOT_FOUND" | "RATE_LIMITED" | "TIMEOUT" | "NETWORK" | "INVALID_INPUT";

export type GeocodeResult =
  | { ok: true; lat: number; lon: number }
  | { ok: false; error: GeocodeError };

type CacheEntry = { result: GeocodeResult; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function cacheKey(country: string, postalCode: string): string {
  return `${country.toUpperCase()}:${postalCode.trim().toUpperCase()}`;
}

function rememberResult(key: string, result: GeocodeResult): void {
  if (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function geocodePostalCode(input: {
  postalCode: string;
  country?: string;
}): Promise<GeocodeResult> {
  const country = (input.country ?? "PT").trim();
  const postalCode = input.postalCode.trim();
  if (!postalCode || !country) return { ok: false, error: "INVALID_INPUT" };

  const key = cacheKey(country, postalCode);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const url = new URL(NOMINATIM_BASE);
  url.searchParams.set("format", "json");
  url.searchParams.set("country", country);
  url.searchParams.set("postalcode", postalCode);
  url.searchParams.set("limit", "1");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 429) {
      const result: GeocodeResult = { ok: false, error: "RATE_LIMITED" };
      rememberResult(key, result);
      return result;
    }
    if (!res.ok) {
      return { ok: false, error: "NETWORK" };
    }
    const json = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const first = Array.isArray(json) ? json[0] : null;
    const lat = first?.lat != null ? Number(first.lat) : NaN;
    const lon = first?.lon != null ? Number(first.lon) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const result: GeocodeResult = { ok: false, error: "NOT_FOUND" };
      rememberResult(key, result);
      return result;
    }
    const result: GeocodeResult = { ok: true, lat, lon };
    rememberResult(key, result);
    return result;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "TIMEOUT" };
    }
    return { ok: false, error: "NETWORK" };
  } finally {
    clearTimeout(timer);
  }
}
