// ---------------------------------------------------------------------------
// CoinGecko free API — shared price service for wallet clients
// Rate limit: ~10-30 calls/min on free tier. We cache + rate-limit locally.
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.coingecko.com/api/v3";

type PriceMap = Record<string, { usd: number; eur: number }>;

// ---------------------------------------------------------------------------
// In-memory cache (1 minute TTL)
// ---------------------------------------------------------------------------
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL_MS = 60_000;

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Rate limiter — max 10 requests per minute (conservative for free tier)
// ---------------------------------------------------------------------------
let requestTimestamps: number[] = [];
const MAX_REQUESTS_PER_MINUTE = 10;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter((t) => now - t < 60_000);

  if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    const oldestInWindow = requestTimestamps[0];
    const waitMs = 60_000 - (now - oldestInWindow) + 100;
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  }

  requestTimestamps.push(Date.now());

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (res.status === 429) {
    // Rate limited — back off 30s and retry once
    await new Promise<void>((resolve) => setTimeout(resolve, 30_000));
    requestTimestamps.push(Date.now());
    return fetch(url, { headers: { Accept: "application/json" } });
  }

  return res;
}

// ---------------------------------------------------------------------------
// Get prices by CoinGecko coin IDs (e.g., "bitcoin", "ethereum", "solana")
// ---------------------------------------------------------------------------
export async function getTokenPrices(coinIds: string[]): Promise<PriceMap> {
  if (coinIds.length === 0) return {};

  const cacheKey = `prices:${coinIds.sort().join(",")}`;
  const cached = getCached<PriceMap>(cacheKey);
  if (cached) return cached;

  const ids = coinIds.join(",");
  const url = `${BASE_URL}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd,eur`;

  try {
    const res = await rateLimitedFetch(url);
    if (!res.ok) {
      console.error(`[CoinGecko] Price fetch failed: HTTP ${res.status}`);
      return {};
    }

    const data = (await res.json()) as Record<
      string,
      { usd?: number; eur?: number }
    >;

    const result: PriceMap = {};
    for (const [id, prices] of Object.entries(data)) {
      result[id] = {
        usd: prices.usd ?? 0,
        eur: prices.eur ?? 0,
      };
    }

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error("[CoinGecko] getTokenPrices error:", error);
    return {};
  }
}

// ---------------------------------------------------------------------------
// Get prices by contract address on a specific platform
// Returns { [contractAddress (lowercased)]: { usd, eur } }
// ---------------------------------------------------------------------------
export async function getTokenPriceByContract(
  platform: "ethereum" | "solana",
  contractAddresses: string[]
): Promise<PriceMap> {
  if (contractAddresses.length === 0) return {};

  const normalised = contractAddresses.map((a) => a.toLowerCase());
  const cacheKey = `contract:${platform}:${normalised.sort().join(",")}`;
  const cached = getCached<PriceMap>(cacheKey);
  if (cached) return cached;

  const addresses = normalised.join(",");
  const url = `${BASE_URL}/simple/token_price/${platform}?contract_addresses=${encodeURIComponent(addresses)}&vs_currencies=usd,eur`;

  try {
    const res = await rateLimitedFetch(url);
    if (!res.ok) {
      console.error(
        `[CoinGecko] Contract price fetch failed: HTTP ${res.status}`
      );
      return {};
    }

    const data = (await res.json()) as Record<
      string,
      { usd?: number; eur?: number }
    >;

    const result: PriceMap = {};
    for (const [addr, prices] of Object.entries(data)) {
      result[addr.toLowerCase()] = {
        usd: prices.usd ?? 0,
        eur: prices.eur ?? 0,
      };
    }

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error("[CoinGecko] getTokenPriceByContract error:", error);
    return {};
  }
}

// ---------------------------------------------------------------------------
// Search coins by name or ticker — powers the manual-holding asset picker.
//
// Tickers collide badly across chains (Oobit alone has an old Ethereum OBT and
// a new Solana OOB), so results carry a live price and we let the user confirm
// the match visually before they commit. Ranked by market cap so the coin you
// meant is normally first.
// ---------------------------------------------------------------------------

export interface CoinSearchResult {
  id: string; // CoinGecko coin id — what we persist
  symbol: string;
  name: string;
  thumb: string | null;
  marketCapRank: number | null;
  priceUsd: number | null;
  priceEur: number | null;
}

const SEARCH_RESULT_LIMIT = 8;

export async function searchCoins(query: string): Promise<CoinSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const cacheKey = `search:${q.toLowerCase()}`;
  const cached = getCached<CoinSearchResult[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await rateLimitedFetch(
      `${BASE_URL}/search?query=${encodeURIComponent(q)}`
    );

    if (!res.ok) {
      console.error(`[CoinGecko] Search failed: HTTP ${res.status}`);
      return [];
    }

    const data = (await res.json()) as {
      coins?: Array<{
        id: string;
        symbol: string;
        name: string;
        thumb?: string;
        market_cap_rank?: number | null;
      }>;
    };

    const coins = (data.coins ?? []).slice(0, SEARCH_RESULT_LIMIT);
    if (coins.length === 0) return [];

    // Enrich with live prices so the picker can show what it matched. A price
    // failure must not sink the search — the user can still pick, they just
    // lose the confirmation cue.
    let prices: PriceMap = {};
    try {
      prices = await getTokenPrices(coins.map((c) => c.id));
    } catch {
      // Non-fatal
    }

    const results: CoinSearchResult[] = coins.map((c) => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      thumb: c.thumb ?? null,
      marketCapRank: c.market_cap_rank ?? null,
      priceUsd: prices[c.id]?.usd ?? null,
      priceEur: prices[c.id]?.eur ?? null,
    }));

    setCache(cacheKey, results);
    return results;
  } catch (error) {
    console.error("[CoinGecko] searchCoins error:", error);
    return [];
  }
}
