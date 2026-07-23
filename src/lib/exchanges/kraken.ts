import crypto from "crypto";
import {
  ExchangeClient,
  ExchangePosition,
  ExchangeAccountSummary,
  ExchangeDepositRecord,
  ExchangeTrade,
} from "./types";
import { makeCashPosition } from "@/lib/portfolio/cash";

const BASE_URL = "https://api.kraken.com";

// ───────────────────────────────────────────────────────────────────────────────
// What's special about Kraken
//   - Asset codes are non-standard: XXBT/XBT/XETH/ZUSD/ZEUR etc.
//   - Staked/locked balances appear with suffixes: ATOM.S, DOT.S, ETH2.S, KSM.B
//     The .S/.B/.M/.HOLD/.F/.P suffix means the user owns the asset but it's
//     locked. We MERGE these into the canonical symbol so the UI shows one row.
//   - Trade pairs use legacy concatenated codes: XXBTZEUR, MATICEUR, SHIBEUR.
//     We rely on /0/public/AssetPairs to map (base, quote) authoritatively
//     instead of slicing strings.
//   - Many low-cap pairs only quote in USD/USDT/USDC, not EUR.
//   - /0/private/TradesHistory returns max 50 trades per page; must paginate
//     via the `ofs` (offset) query param.
//   - Rate-limited: starter tier max 15, decay 0.33/sec. Trade endpoints cost 2.
// ───────────────────────────────────────────────────────────────────────────────

// Suffixes Kraken appends to staked / bonded / locked / margin balances.
// These are stripped to find the canonical symbol; the suffix portion is
// summed separately into lockedQuantity.
const LOCKED_SUFFIX_RE = /\.(S|B|M|F|P|HOLD)$/;

// Hard-coded fallback for the common Kraken codes that pre-date AssetPairs.
// Used only when the Assets-endpoint lookup is missing (e.g., dust assets that
// got listed/delisted between sync calls). AssetPairs is the source of truth.
const LEGACY_NORMALISE: Record<string, string> = {
  XXBT: "BTC",
  XBT: "BTC",
  XETH: "ETH",
  ZUSD: "USD",
  ZEUR: "EUR",
  ZGBP: "GBP",
  ZJPY: "JPY",
  ZCAD: "CAD",
  ZCHF: "CHF",
  ZAUD: "AUD",
};

const FIAT_CODES = new Set(["EUR", "USD", "GBP", "JPY", "CAD", "CHF", "AUD"]);
const STABLE_CODES = new Set(["USDT", "USDC", "DAI", "BUSD", "FDUSD", "TUSD", "PYUSD"]);
const CASH_CODES = new Set([...FIAT_CODES, ...STABLE_CODES]);

// Quote-currency preference order when picking a ticker pair for an asset.
// Tried first → last; we use the first one that exists in AssetPairs.
const QUOTE_PREFERENCE = ["EUR", "USD", "USDT", "USDC", "GBP"] as const;

// ───────────────────────────────────────────────────────────────────────────────
// Rate limiter — Starter tier: max 15, decay 0.33/sec, ledger/trade cost 2
// ───────────────────────────────────────────────────────────────────────────────
class RateLimiter {
  private counter = 0;
  private lastDecay = Date.now();
  private readonly max = 15;
  private readonly decayRate = 0.33; // per second

  private decay() {
    const now = Date.now();
    const elapsed = (now - this.lastDecay) / 1000;
    this.counter = Math.max(0, this.counter - elapsed * this.decayRate);
    this.lastDecay = now;
  }

  async consume(cost: number) {
    this.decay();
    if (this.counter + cost > this.max) {
      const waitMs = ((this.counter + cost - this.max) / this.decayRate) * 1000;
      await sleep(Math.ceil(waitMs));
      this.decay();
    }
    this.counter += cost;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ───────────────────────────────────────────────────────────────────────────────
// Metadata caches — populated lazily per client instance, refreshed per sync
// ───────────────────────────────────────────────────────────────────────────────

type KrakenAssetInfo = { altname: string; decimals: number };
type KrakenPairInfo = { base: string; quote: string; pairKey: string };

interface MetadataMaps {
  // raw code (e.g., "XXBT", "XATOM", "MATIC") → canonical symbol ("BTC", "ATOM", "MATIC")
  assetByCode: Map<string, string>;
  // canonical symbol (e.g., "BTC") → raw code (for pair lookup against AssetPairs)
  rawByCanonical: Map<string, string>;
  // pairKey (e.g., "XXBTZEUR", "MATICEUR") → { base, quote, pairKey }
  pairByKey: Map<string, KrakenPairInfo>;
  // canonical-symbol-pair "BTC|EUR" → pairKey, used for fast lookup
  pairByBaseQuote: Map<string, string>;
}

// ───────────────────────────────────────────────────────────────────────────────
// Kraken client
// ───────────────────────────────────────────────────────────────────────────────
export class KrakenClient implements ExchangeClient {
  readonly provider = "KRAKEN" as const;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly rateLimiter = new RateLimiter();
  private lastNonce = 0;
  private requestQueue: Promise<unknown> = Promise.resolve();

  // Metadata is loaded once per client instance lifetime (one sync = one instance).
  private metadataPromise: Promise<MetadataMaps> | null = null;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  private nextNonce(): number {
    const now = Date.now() * 1000;
    this.lastNonce = Math.max(now, this.lastNonce + 1);
    return this.lastNonce;
  }

  // ─── Signature ────────────────────────────────────────────────────────────────
  private sign(path: string, nonce: number, body: string): string {
    const message = nonce + body;
    const sha256 = crypto.createHash("sha256").update(message).digest();
    const secretBuffer = Buffer.from(this.apiSecret, "base64");
    const hmac = crypto
      .createHmac("sha512", secretBuffer)
      .update(path)
      .update(sha256)
      .digest("base64");
    return hmac;
  }

  // ─── Private POST ─────────────────────────────────────────────────────────────
  private privatePost(
    path: string,
    params: Record<string, string | number> = {},
    cost = 1
  ): Promise<Record<string, unknown>> {
    // Serialize all private requests so nonces arrive at Kraken in order
    const task = this.requestQueue.then(() =>
      this.doPrivatePost(path, params, cost)
    );
    this.requestQueue = task.catch(() => {}); // keep chain alive on errors
    return task;
  }

  private async doPrivatePost(
    path: string,
    params: Record<string, string | number>,
    cost: number
  ): Promise<Record<string, unknown>> {
    await this.rateLimiter.consume(cost);

    const nonce = this.nextNonce();
    const body = new URLSearchParams({
      nonce: String(nonce),
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      ),
    }).toString();

    const signature = this.sign(path, nonce, body);

    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "API-Key": this.apiKey,
        "API-Sign": signature,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!res.ok) {
      throw new Error(`Kraken HTTP ${res.status} on ${path}`);
    }

    const json = (await res.json()) as {
      error: string[];
      result: Record<string, unknown>;
    };

    if (json.error?.length) {
      throw new Error(`Kraken API error: ${json.error.join(", ")}`);
    }

    return json.result ?? {};
  }

  // ─── Public GET ───────────────────────────────────────────────────────────────
  private async publicGet(
    path: string,
    params: Record<string, string> = {}
  ): Promise<Record<string, unknown>> {
    const qs = new URLSearchParams(params).toString();
    const url = `${BASE_URL}${path}${qs ? `?${qs}` : ""}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Kraken HTTP ${res.status} on ${path}`);
    }

    const json = (await res.json()) as {
      error: string[];
      result: Record<string, unknown>;
    };

    if (json.error?.length) {
      throw new Error(`Kraken API error: ${json.error.join(", ")}`);
    }

    return json.result ?? {};
  }

  // ─── Metadata: AssetPairs + Assets, cached per instance ───────────────────────
  private async loadMetadata(): Promise<MetadataMaps> {
    if (this.metadataPromise) return this.metadataPromise;

    this.metadataPromise = (async () => {
      const [assets, pairs] = await Promise.all([
        this.publicGet("/0/public/Assets") as Promise<
          Record<string, KrakenAssetInfo>
        >,
        this.publicGet("/0/public/AssetPairs") as Promise<
          Record<string, { base: string; quote: string; altname?: string; wsname?: string }>
        >,
      ]);

      // Asset map: rawCode → canonical altname (e.g., XXBT → XBT)
      // Then we additionally normalise the altname (XBT → BTC) via LEGACY_NORMALISE.
      const assetByCode = new Map<string, string>();
      const rawByCanonical = new Map<string, string>();

      for (const [rawCode, info] of Object.entries(assets)) {
        const altname = info.altname ?? rawCode;
        const canonical = LEGACY_NORMALISE[altname] ?? altname;
        assetByCode.set(rawCode, canonical);
        rawByCanonical.set(canonical, rawCode);
      }

      // Pair map: pairKey → { base, quote }, base/quote stored as canonical symbols
      const pairByKey = new Map<string, KrakenPairInfo>();
      const pairByBaseQuote = new Map<string, string>();

      for (const [pairKey, info] of Object.entries(pairs)) {
        // Skip darkpool pairs (suffix ".d") — they share quotes with the regular pair
        if (pairKey.endsWith(".d")) continue;

        const baseCanonical =
          assetByCode.get(info.base) ??
          LEGACY_NORMALISE[info.base] ??
          info.base;
        const quoteCanonical =
          assetByCode.get(info.quote) ??
          LEGACY_NORMALISE[info.quote] ??
          info.quote;

        pairByKey.set(pairKey, {
          base: baseCanonical,
          quote: quoteCanonical,
          pairKey,
        });
        pairByBaseQuote.set(`${baseCanonical}|${quoteCanonical}`, pairKey);
      }

      return { assetByCode, rawByCanonical, pairByKey, pairByBaseQuote };
    })();

    return this.metadataPromise;
  }

  // ─── Asset code normalisation ─────────────────────────────────────────────────
  // Strips locked-suffix and resolves to canonical symbol via Assets map.
  // Returns { canonical, isLocked } so callers can split liquid vs locked.
  private normaliseAsset(
    rawCode: string,
    metadata: MetadataMaps
  ): { canonical: string; isLocked: boolean } {
    const isLocked = LOCKED_SUFFIX_RE.test(rawCode);
    const stripped = isLocked ? rawCode.replace(LOCKED_SUFFIX_RE, "") : rawCode;

    // Try Assets map first (authoritative)
    const fromMap = metadata.assetByCode.get(stripped);
    if (fromMap) return { canonical: fromMap, isLocked };

    // Try legacy table (XXBT → BTC, ZEUR → EUR)
    if (LEGACY_NORMALISE[stripped]) {
      return { canonical: LEGACY_NORMALISE[stripped], isLocked };
    }

    // Heuristic last resort: 4-char codes starting with X or Z
    if (
      (stripped.startsWith("X") || stripped.startsWith("Z")) &&
      stripped.length === 4
    ) {
      const guess = stripped.slice(1);
      console.warn(
        `[Kraken] Asset "${rawCode}" not in AssetPairs map — falling back to heuristic "${guess}"`
      );
      return { canonical: guess, isLocked };
    }

    return { canonical: stripped, isLocked };
  }

  // ─── Resolve trade pair → { baseSymbol, quoteCurrency } ────────────────────────
  // Replaces the broken slice() heuristic. Returns null if pair unknown.
  private resolvePair(
    pairKey: string,
    metadata: MetadataMaps
  ): { baseSymbol: string; quoteCurrency: string } | null {
    const info = metadata.pairByKey.get(pairKey);
    if (!info) return null;
    return { baseSymbol: info.base, quoteCurrency: info.quote };
  }

  // ─── Pick the best pair to fetch a current price for an asset ──────────────────
  // Returns { pairKey, quoteCurrency } from the first pair that exists in
  // AssetPairs, in order of QUOTE_PREFERENCE. Returns null if none exist.
  private pickBestPair(
    canonicalSymbol: string,
    metadata: MetadataMaps
  ): { pairKey: string; quoteCurrency: string } | null {
    for (const quote of QUOTE_PREFERENCE) {
      const pairKey = metadata.pairByBaseQuote.get(`${canonicalSymbol}|${quote}`);
      if (pairKey) return { pairKey, quoteCurrency: quote };
    }
    return null;
  }

  // ─── testConnection ───────────────────────────────────────────────────────────
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.privatePost("/0/private/Balance");
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Kraken] testConnection failed:", msg);
      return { success: false, error: msg };
    }
  }

  // ─── Earn allocations ─────────────────────────────────────────────────────────
  // Funds allocated to Kraken Earn/staking. Some strategies also surface in
  // /Balance (suffixed) and some don't — this endpoint is the authoritative
  // list. Non-fatal: the key may lack the Earn permission, or there may be no
  // Earn at all.
  private async getEarnAllocations(): Promise<
    { nativeAsset: string; amount: number }[]
  > {
    try {
      const res = (await this.privatePost("/0/private/Earn/Allocations", {
        hide_zero_allocations: "true",
      })) as {
        items?: Array<{
          native_asset?: string;
          amount_allocated?: { total?: { native?: string } };
        }>;
      };

      const out: { nativeAsset: string; amount: number }[] = [];
      for (const it of res?.items ?? []) {
        const asset = it.native_asset;
        const native = it.amount_allocated?.total?.native;
        if (!asset || native == null) continue;
        const amount = Number(native);
        if (amount > 0) out.push({ nativeAsset: asset, amount });
      }
      return out;
    } catch (err) {
      console.warn(
        "[Kraken] Earn/Allocations fetch failed (non-fatal):",
        err instanceof Error ? err.message : err
      );
      return [];
    }
  }

  // ─── getPositions ─────────────────────────────────────────────────────────────
  async getPositions(): Promise<ExchangePosition[]> {
    // 1. Load AssetPairs/Assets metadata + balances + Earn allocations
    const [metadata, balances, earnAllocations] = await Promise.all([
      this.loadMetadata(),
      this.privatePost("/0/private/Balance"),
      this.getEarnAllocations(),
    ]);

    // 2. Merge balances by canonical symbol, splitting liquid vs locked
    type MergedRow = { canonical: string; liquid: number; locked: number };
    const mergedBySymbol = new Map<string, MergedRow>();
    const cashBySymbol = new Map<string, MergedRow>();
    // Per-canonical list of individual /Balance amounts — used to dedup Earn
    // allocations that Kraken ALSO reports in /Balance (the .S/.B/.M suffixed
    // ones), so they aren't counted twice.
    const balanceAmounts = new Map<string, number[]>();

    const bucketFor = (canonical: string) =>
      CASH_CODES.has(canonical) ? cashBySymbol : mergedBySymbol;
    const addQty = (canonical: string, qty: number, locked: boolean) => {
      const bucket = bucketFor(canonical);
      const existing = bucket.get(canonical) ?? { canonical, liquid: 0, locked: 0 };
      if (locked) existing.locked += qty;
      else existing.liquid += qty;
      bucket.set(canonical, existing);
    };

    for (const [rawCode, qtyStr] of Object.entries(balances)) {
      const qty = Number(qtyStr);
      if (qty <= 0) continue;

      const { canonical, isLocked } = this.normaliseAsset(rawCode, metadata);

      const list = balanceAmounts.get(canonical) ?? [];
      list.push(qty);
      balanceAmounts.set(canonical, list);

      // Cash (stablecoins + fiat) → surfaced as CASH holdings rather than
      // hidden in a single freeCash scalar.
      addQty(canonical, qty, isLocked);
    }

    // 2b. Merge Earn allocations that /Balance doesn't already report. Kraken
    // surfaces some Earn (on-chain staking / bonded) in /Balance with .S/.B/.M
    // suffixes, but other strategies appear ONLY here — that's how a large BTC
    // allocation can go completely missing. Each allocation is matched against
    // a /Balance line of the same amount; unmatched ones are real, currently-
    // hidden holdings and get added as locked (staked) quantity.
    for (const alloc of earnAllocations) {
      if (alloc.amount <= 0) continue;
      const { canonical } = this.normaliseAsset(alloc.nativeAsset, metadata);

      const list = balanceAmounts.get(canonical);
      const tol = Math.max(1e-8, alloc.amount * 1e-6);
      const matchIdx = list
        ? list.findIndex((b) => Math.abs(b - alloc.amount) <= tol)
        : -1;
      if (matchIdx !== -1) {
        // Already counted via /Balance — consume the match so a second
        // identical allocation can't be swallowed by the same line.
        list!.splice(matchIdx, 1);
        continue;
      }
      addQty(canonical, alloc.amount, true);
    }

    // CASH holdings, built once so they survive even a crypto-empty account.
    const cashPositions: ExchangePosition[] = [];
    for (const c of cashBySymbol.values()) {
      const q = c.liquid + c.locked;
      if (q > 0) cashPositions.push(makeCashPosition(c.canonical, q, c.locked));
    }

    const merged = Array.from(mergedBySymbol.values());
    if (merged.length === 0) return cashPositions;

    // 3. Compute average buy prices from full paginated trade history
    const avgBuyPrices = await this.calcAverageBuyPrices(metadata);

    // 4. Pick the best pair per asset and batch-fetch current prices
    type PairAssignment = {
      asset: MergedRow;
      pairKey: string | null;
      quoteCurrency: string | null;
    };

    const assignments: PairAssignment[] = merged.map((asset) => {
      const buyInfo = avgBuyPrices[asset.canonical];
      // Honour the asset's dominant trade currency if the pair exists; else pick best
      let pickedPair: { pairKey: string; quoteCurrency: string } | null = null;

      if (buyInfo?.currency) {
        const pairKey = metadata.pairByBaseQuote.get(
          `${asset.canonical}|${buyInfo.currency}`
        );
        if (pairKey) {
          pickedPair = { pairKey, quoteCurrency: buyInfo.currency };
        }
      }
      if (!pickedPair) {
        pickedPair = this.pickBestPair(asset.canonical, metadata);
      }

      return {
        asset,
        pairKey: pickedPair?.pairKey ?? null,
        quoteCurrency: pickedPair?.quoteCurrency ?? null,
      };
    });

    // Batch ticker call: one request for all assignments that have a pair
    const batchPairKeys = assignments
      .map((a) => a.pairKey)
      .filter((p): p is string => p !== null);

    const tickerData = batchPairKeys.length
      ? ((await this.publicGet("/0/public/Ticker", {
          pair: batchPairKeys.join(","),
        })) as Record<string, { c: [string, string] }>)
      : {};

    // 5. Build positions
    const positions: ExchangePosition[] = [];

    for (const { asset, pairKey, quoteCurrency } of assignments) {
      const totalQty = asset.liquid + asset.locked;

      // Unpriceable: no pair anywhere in our preferred quote list
      if (!pairKey || !quoteCurrency) {
        positions.push({
          symbol: asset.canonical,
          name: asset.canonical,
          assetType: "CRYPTO",
          quantity: totalQty,
          averageBuyPrice: 0,
          currentPrice: 0,
          currency: "EUR",
          unrealizedPnl: 0,
          unrealizedPnlPct: 0,
          totalCost: 0,
          currentValue: 0,
          priceStatus: "UNAVAILABLE",
          priceUnavailableReason: "No tradeable pair on Kraken",
          lockedQuantity: asset.locked > 0 ? asset.locked : undefined,
        });
        continue;
      }

      const ticker = tickerData[pairKey];
      const currentPrice = ticker ? Number(ticker.c[0]) : 0;

      if (currentPrice === 0) {
        // Pair exists in AssetPairs but ticker returned no data — treat as
        // STALE rather than UNAVAILABLE so the user sees we tried but failed.
        positions.push({
          symbol: asset.canonical,
          name: asset.canonical,
          assetType: "CRYPTO",
          quantity: totalQty,
          averageBuyPrice: 0,
          currentPrice: 0,
          currency: quoteCurrency,
          unrealizedPnl: 0,
          unrealizedPnlPct: 0,
          totalCost: 0,
          currentValue: 0,
          priceStatus: "STALE",
          priceUnavailableReason: `Ticker returned no price for ${pairKey}`,
          lockedQuantity: asset.locked > 0 ? asset.locked : undefined,
        });
        continue;
      }

      // Cost basis: only valid if avg buy price was computed in the same currency
      const buyInfo = avgBuyPrices[asset.canonical];
      const averageBuyPrice =
        buyInfo && buyInfo.currency === quoteCurrency ? buyInfo.avgPrice : 0;

      const totalCost = averageBuyPrice * totalQty;
      const currentValue = currentPrice * totalQty;
      const unrealizedPnl = currentValue - totalCost;
      const unrealizedPnlPct =
        totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : 0;

      positions.push({
        symbol: asset.canonical,
        name: asset.canonical,
        assetType: "CRYPTO",
        quantity: totalQty,
        averageBuyPrice,
        currentPrice,
        currency: quoteCurrency,
        unrealizedPnl,
        unrealizedPnlPct,
        totalCost,
        currentValue,
        priceStatus: "OK",
        lockedQuantity: asset.locked > 0 ? asset.locked : undefined,
      });
    }

    return [...positions, ...cashPositions];
  }

  // ─── Helper: weighted average buy price per symbol from FULL trade history ─────
  // Paginates TradesHistory (Kraken returns 50 per page); computes per-(symbol,
  // quoteCurrency) weighted avg; picks the dominant quote currency per symbol.
  private async calcAverageBuyPrices(
    metadata: MetadataMaps
  ): Promise<Record<string, { avgPrice: number; currency: string }>> {
    type RawTrade = {
      pair: string;
      type: string;
      price: string;
      vol: string;
    };

    // Paginate all trades
    const allTrades: RawTrade[] = [];
    let offset = 0;
    const PAGE_SIZE = 50;

    // Hard cap to defend against runaway pagination on bizarre accounts.
    // 200 pages × 50 trades = 10,000 trades — plenty for personal use.
    const MAX_PAGES = 200;
    let pages = 0;

    while (pages < MAX_PAGES) {
      const result = await this.privatePost(
        "/0/private/TradesHistory",
        { ofs: offset },
        2
      );
      const trades = result.trades as Record<string, RawTrade> | undefined;
      const count = (result.count as number) ?? 0;

      if (!trades || Object.keys(trades).length === 0) break;

      allTrades.push(...Object.values(trades));
      offset += Object.keys(trades).length;
      pages++;

      // Stop early if we've fetched everything (count is total, not page size)
      if (offset >= count) break;
    }

    if (pages >= MAX_PAGES) {
      console.warn(
        `[Kraken] calcAverageBuyPrices hit ${MAX_PAGES}-page cap (${allTrades.length} trades); avg buy prices may be incomplete`
      );
    }

    // Aggregate per (canonical-symbol, canonical-quote-currency)
    const acc: Record<
      string,
      Record<string, { totalCost: number; totalQty: number }>
    > = {};

    for (const trade of allTrades) {
      if (trade.type !== "buy") continue;

      const resolved = this.resolvePair(trade.pair, metadata);
      if (!resolved) {
        console.warn(`[Kraken] Unknown pair "${trade.pair}" in trade history — skipping`);
        continue;
      }

      const { baseSymbol, quoteCurrency } = resolved;
      if (!acc[baseSymbol]) acc[baseSymbol] = {};
      if (!acc[baseSymbol][quoteCurrency]) {
        acc[baseSymbol][quoteCurrency] = { totalCost: 0, totalQty: 0 };
      }

      const qty = Number(trade.vol);
      const price = Number(trade.price);
      acc[baseSymbol][quoteCurrency].totalCost += qty * price;
      acc[baseSymbol][quoteCurrency].totalQty += qty;
    }

    // For each symbol, pick the quote currency with the most volume traded
    const averages: Record<string, { avgPrice: number; currency: string }> = {};

    for (const [symbol, byQuote] of Object.entries(acc)) {
      let dominantCurrency = "EUR";
      let maxQty = 0;

      for (const [currency, data] of Object.entries(byQuote)) {
        if (data.totalQty > maxQty) {
          maxQty = data.totalQty;
          dominantCurrency = currency;
        }
      }

      const data = byQuote[dominantCurrency];
      averages[symbol] = {
        avgPrice: data.totalQty > 0 ? data.totalCost / data.totalQty : 0,
        currency: dominantCurrency,
      };
    }

    return averages;
  }

  // ─── getAccountSummary ────────────────────────────────────────────────────────
  // Cash (stablecoins + fiat) is now surfaced as CASH positions by
  // getPositions, so there's no separate freeCash to report here — returning it
  // would double-count it in the portfolio total.
  async getAccountSummary(): Promise<ExchangeAccountSummary> {
    return {
      totalValue: 0, // computed by sync.ts from positions; not used by sync flow
      totalCost: 0,
      unrealizedPnl: 0,
      realizedPnl: 0,
      freeCash: 0,
      currency: "EUR",
    };
  }

  // ─── getDeposits ──────────────────────────────────────────────────────────────
  async getDeposits(since?: Date): Promise<ExchangeDepositRecord[]> {
    const metadata = await this.loadMetadata();

    const params: Record<string, string | number> = { type: "deposit" };
    if (since) params.start = Math.floor(since.getTime() / 1000);

    const result = await this.privatePost("/0/private/Ledgers", params, 2);
    const ledger = result.ledger as
      | Record<
          string,
          {
            refid: string;
            asset: string;
            amount: string;
            time: number;
            subtype: string;
          }
        >
      | undefined;

    if (!ledger) return [];

    const deposits: ExchangeDepositRecord[] = [];

    for (const [id, entry] of Object.entries(ledger)) {
      const { canonical } = this.normaliseAsset(entry.asset, metadata);
      // Only fiat deposits surface as "spent on the exchange" — stablecoin
      // deposits are usually internal transfers, not account funding.
      if (!FIAT_CODES.has(canonical)) continue;

      deposits.push({
        externalId: entry.refid || id,
        amount: Number(entry.amount),
        currency: canonical,
        date: new Date(entry.time * 1000),
        status: "completed",
      });
    }

    return deposits;
  }

  // ─── getTradeHistory — paginates fully ─────────────────────────────────────────
  async getTradeHistory(since?: Date): Promise<ExchangeTrade[]> {
    const metadata = await this.loadMetadata();

    type RawTrade = {
      ordertxid: string;
      pair: string;
      type: string;
      vol: string;
      price: string;
      fee: string;
      feecurrency?: string;
      time: number;
    };

    const allTrades: ExchangeTrade[] = [];
    let offset = 0;
    const MAX_PAGES = 200;
    let pages = 0;

    while (pages < MAX_PAGES) {
      const params: Record<string, string | number> = { ofs: offset };
      if (since) params.start = Math.floor(since.getTime() / 1000);

      const result = await this.privatePost("/0/private/TradesHistory", params, 2);
      const trades = result.trades as Record<string, RawTrade> | undefined;
      const count = (result.count as number) ?? 0;

      if (!trades || Object.keys(trades).length === 0) break;

      for (const [id, trade] of Object.entries(trades)) {
        const resolved = this.resolvePair(trade.pair, metadata);
        if (!resolved) {
          console.warn(`[Kraken] Unknown pair "${trade.pair}" in trade — skipping`);
          continue;
        }

        const feeCurrency = trade.feecurrency
          ? this.normaliseAsset(trade.feecurrency, metadata).canonical
          : resolved.quoteCurrency;

        allTrades.push({
          externalId: trade.ordertxid || id,
          symbol: resolved.baseSymbol,
          side: trade.type as "buy" | "sell",
          quantity: Number(trade.vol),
          price: Number(trade.price),
          fee: Number(trade.fee),
          feeCurrency,
          date: new Date(trade.time * 1000),
          currency: resolved.quoteCurrency,
        });
      }

      offset += Object.keys(trades).length;
      pages++;

      if (offset >= count) break;
    }

    if (pages >= MAX_PAGES) {
      console.warn(
        `[Kraken] getTradeHistory hit ${MAX_PAGES}-page cap (${allTrades.length} trades returned)`
      );
    }

    return allTrades;
  }
}
