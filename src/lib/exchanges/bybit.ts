import crypto from "crypto";
import {
  ExchangeClient,
  ExchangePosition,
  ExchangeAccountSummary,
  ExchangeDepositRecord,
  ExchangeTrade,
  PriceStatus,
} from "./types";
import { makeCashPosition } from "@/lib/portfolio/cash";

const DEFAULT_BASE_URL = "https://api.bybit.com";
const RECV_WINDOW = 5000;

// ───────────────────────────────────────────────────────────────────────────────
// What's special about Bybit V5
//   - Multiple wallet types: Spot, Funding, Unified Trading Account, Earn.
//     A user's tokens can sit in any of them — we have to fetch all four.
//   - Symbols are concatenated like "BTCUSDT", "PUMPUSDT". The OLD code split
//     on a hardcoded suffix list with `endsWith` — wrong for any base symbol
//     that ENDS in one of those suffixes. We use /v5/market/instruments-info
//     for authoritative base/quote.
//   - Per-position currency reflects WHICH pair priced it: BTC priced via
//     BTCUSDT → currency=USDT; via BTCUSDC → currency=USDC. Stops the
//     hardcoded "USDT" lie that broke EUR conversion.
//   - All-tickers endpoint /v5/market/tickers?category=spot returns every
//     spot price in one call → no per-symbol HTTP round-trips.
// ───────────────────────────────────────────────────────────────────────────────

// Stablecoins / fiat that count as cash, not as positions
const FIAT_CODES = new Set(["USD", "EUR", "GBP"]);
const STABLE_CODES = new Set(["USDT", "USDC", "DAI", "BUSD", "FDUSD", "TUSD", "PYUSD"]);
const CASH_CODES = new Set([...FIAT_CODES, ...STABLE_CODES]);

// Quote currency preference for picking the best ticker pair per asset.
// USDT first because it's by far the deepest liquidity on Bybit.
const QUOTE_PREFERENCE = ["USDT", "USDC", "USD", "EUR"] as const;

// ───────────────────────────────────────────────────────────────────────────────
// Rate limiter — 120 requests per minute per endpoint
// ───────────────────────────────────────────────────────────────────────────────
class RateLimiter {
  private tokens = 120;
  private lastRefill = Date.now();
  private readonly max = 120;
  private readonly refillPerMs = 120 / 60_000; // 2 tokens/sec

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.max, this.tokens + elapsed * this.refillPerMs);
    this.lastRefill = now;
  }

  async consume(cost = 1) {
    this.refill();
    if (this.tokens < cost) {
      const waitMs = Math.ceil((cost - this.tokens) / this.refillPerMs);
      await sleep(waitMs);
      this.refill();
    }
    this.tokens -= cost;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ───────────────────────────────────────────────────────────────────────────────
// Bybit V5 response shape
// ───────────────────────────────────────────────────────────────────────────────
interface BybitResponse<T> {
  retCode: number;
  retMsg: string;
  result: T;
}

// ───────────────────────────────────────────────────────────────────────────────
// Internal cache types
// ───────────────────────────────────────────────────────────────────────────────

interface InstrumentInfo {
  symbol: string;
  baseCoin: string;
  quoteCoin: string;
}

interface InstrumentsCache {
  // symbol → { baseCoin, quoteCoin }
  bySymbol: Map<string, InstrumentInfo>;
  // baseCoin|quoteCoin → symbol (for "BTC|USDT" → "BTCUSDT" lookup)
  byBaseQuote: Map<string, string>;
}

interface TickerCache {
  // symbol → lastPrice
  bySymbol: Map<string, number>;
}

// Internal merged-balance row
interface BalanceRow {
  coin: string;
  liquid: number;
  locked: number; // staked / earn / locked portion
}

// ───────────────────────────────────────────────────────────────────────────────
// Bybit client
// ───────────────────────────────────────────────────────────────────────────────
export class BybitClient implements ExchangeClient {
  readonly provider = "BYBIT" as const;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;
  private readonly rateLimiter = new RateLimiter();

  private instrumentsPromise: Promise<InstrumentsCache> | null = null;
  private tickerPromise: Promise<TickerCache> | null = null;

  constructor(apiKey: string, apiSecret: string, baseUrl: string = DEFAULT_BASE_URL) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = baseUrl;
  }

  // ─── Signature ────────────────────────────────────────────────────────────────
  private sign(timestamp: number, payload: string): string {
    const message = `${timestamp}${this.apiKey}${RECV_WINDOW}${payload}`;
    return crypto
      .createHmac("sha256", this.apiSecret)
      .update(message)
      .digest("hex");
  }

  // ─── Authenticated GET ────────────────────────────────────────────────────────
  private async privateGet<T>(
    path: string,
    params: Record<string, string | number> = {}
  ): Promise<T> {
    await this.rateLimiter.consume();

    const timestamp = Date.now();
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    ).toString();

    const signature = this.sign(timestamp, qs);

    const res = await fetch(`${this.baseUrl}${path}${qs ? `?${qs}` : ""}`, {
      method: "GET",
      headers: {
        "X-BAPI-API-KEY": this.apiKey,
        "X-BAPI-TIMESTAMP": String(timestamp),
        "X-BAPI-SIGN": signature,
        "X-BAPI-RECV-WINDOW": String(RECV_WINDOW),
      },
    });

    if (!res.ok) {
      throw new Error(`Bybit HTTP ${res.status} on ${path}`);
    }

    const json = (await res.json()) as BybitResponse<T>;

    if (json.retCode !== 0) {
      throw new Error(`Bybit API error ${json.retCode}: ${json.retMsg}`);
    }

    return json.result;
  }

  // ─── Public GET ───────────────────────────────────────────────────────────────
  private async publicGet<T>(
    path: string,
    params: Record<string, string | number> = {}
  ): Promise<T> {
    await this.rateLimiter.consume();

    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    ).toString();

    const res = await fetch(`${this.baseUrl}${path}${qs ? `?${qs}` : ""}`);

    if (!res.ok) {
      throw new Error(`Bybit HTTP ${res.status} on ${path}`);
    }

    const json = (await res.json()) as BybitResponse<T>;

    if (json.retCode !== 0) {
      throw new Error(`Bybit API error ${json.retCode}: ${json.retMsg}`);
    }

    return json.result;
  }

  // ─── Metadata: spot instruments (paginated), cached per instance ──────────────
  private loadInstruments(): Promise<InstrumentsCache> {
    if (this.instrumentsPromise) return this.instrumentsPromise;

    this.instrumentsPromise = (async () => {
      type Resp = {
        list: Array<{
          symbol: string;
          baseCoin: string;
          quoteCoin: string;
          status: string;
        }>;
        nextPageCursor?: string;
      };

      const bySymbol = new Map<string, InstrumentInfo>();
      const byBaseQuote = new Map<string, string>();
      let cursor = "";

      // Bybit returns up to 1000 instruments per call; spot has ~600 today.
      // Loop in case it grows past the page size.
      for (let page = 0; page < 10; page++) {
        const params: Record<string, string | number> = {
          category: "spot",
          limit: 1000,
        };
        if (cursor) params.cursor = cursor;

        const result = await this.publicGet<Resp>("/v5/market/instruments-info", params);

        for (const inst of result.list ?? []) {
          if (inst.status !== "Trading") continue;
          const info = {
            symbol: inst.symbol,
            baseCoin: inst.baseCoin,
            quoteCoin: inst.quoteCoin,
          };
          bySymbol.set(inst.symbol, info);
          byBaseQuote.set(`${inst.baseCoin}|${inst.quoteCoin}`, inst.symbol);
        }

        if (!result.nextPageCursor) break;
        cursor = result.nextPageCursor;
      }

      return { bySymbol, byBaseQuote };
    })();

    return this.instrumentsPromise;
  }

  // ─── Metadata: all spot tickers, cached per instance ─────────────────────────
  // One call returns every spot price, no per-symbol round-trip.
  private loadTickers(): Promise<TickerCache> {
    if (this.tickerPromise) return this.tickerPromise;

    this.tickerPromise = (async () => {
      type Resp = {
        list: Array<{ symbol: string; lastPrice: string }>;
      };
      const result = await this.publicGet<Resp>("/v5/market/tickers", {
        category: "spot",
      });
      const bySymbol = new Map<string, number>();
      for (const t of result.list ?? []) {
        bySymbol.set(t.symbol, Number(t.lastPrice));
      }
      return { bySymbol };
    })();

    return this.tickerPromise;
  }

  // ─── Pick best pair for an asset, return { symbol, currency, price } ──────────
  private pickBestPair(
    coin: string,
    instruments: InstrumentsCache,
    tickers: TickerCache
  ): { symbol: string; currency: string; price: number } | null {
    for (const quote of QUOTE_PREFERENCE) {
      const pairSymbol = instruments.byBaseQuote.get(`${coin}|${quote}`);
      if (!pairSymbol) continue;
      const price = tickers.bySymbol.get(pairSymbol);
      if (price === undefined || price <= 0) continue;
      return { symbol: pairSymbol, currency: quote, price };
    }
    return null;
  }

  // ─── testConnection ───────────────────────────────────────────────────────────
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.privateGet("/v5/account/wallet-balance", {
        accountType: "UNIFIED",
      });
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Bybit] testConnection failed:", msg);
      return { success: false, error: msg };
    }
  }

  // ─── Wallet fetchers — each returns Map<coin, qty>; failures swallowed ────────

  private async fetchWalletBalances(
    accountType: "SPOT" | "UNIFIED"
  ): Promise<Map<string, number>> {
    type Resp = {
      list: Array<{ accountType: string; coin: Array<{ coin: string; equity: string; walletBalance: string }> }>;
    };
    try {
      const res = await this.privateGet<Resp>("/v5/account/wallet-balance", {
        accountType,
      });
      const account = res.list?.[0];
      const map = new Map<string, number>();
      for (const c of account?.coin ?? []) {
        const qty = Number(c.equity || c.walletBalance || 0);
        if (qty > 0) map.set(c.coin, qty);
      }
      return map;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // UTA-migrated accounts return "accountType only support UNIFIED" when
      // SPOT is requested — that's expected, not an error. Log as info.
      if (accountType === "SPOT" && /only support UNIFIED/i.test(msg)) {
        console.log("[Bybit] SPOT wallet skipped (UTA account — balances live in UNIFIED)");
      } else {
        console.warn(`[Bybit] ${accountType} wallet fetch failed:`, msg);
      }
      return new Map();
    }
  }

  private async fetchFundingBalances(): Promise<Map<string, number>> {
    type Resp = {
      balance: Array<{ coin: string; walletBalance: string }>;
    };
    try {
      const res = await this.privateGet<Resp>(
        "/v5/asset/transfer/query-account-coins-balance",
        { accountType: "FUND" }
      );
      const map = new Map<string, number>();
      for (const c of res.balance ?? []) {
        const qty = Number(c.walletBalance);
        if (qty > 0) map.set(c.coin, qty);
      }
      return map;
    } catch (err) {
      console.warn("[Bybit] FUND wallet fetch failed:", err instanceof Error ? err.message : err);
      return new Map();
    }
  }

  // Earn (Savings / On-chain Earn) — separate API surface; coin is staked.
  // We treat the staked amount as "locked" so Kraken-like UI rendering works.
  // Bybit's Earn endpoint requires a `category` parameter; the two main ones
  // are FlexibleSaving and OnChain. We try both, tolerating "no positions"
  // and "category not enabled" as silent zero results.
  private async fetchEarnBalances(): Promise<Map<string, number>> {
    type Resp = {
      list?: Array<{ coin: string; amount?: string; principal?: string }>;
    };

    const map = new Map<string, number>();

    for (const category of ["FlexibleSaving", "OnChain"] as const) {
      try {
        const res = await this.privateGet<Resp>("/v5/earn/position", {
          category,
        });
        for (const c of res.list ?? []) {
          const qty = Number(c.amount ?? c.principal ?? 0);
          if (qty > 0) map.set(c.coin, (map.get(c.coin) ?? 0) + qty);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // "Invalid parameter" / "category not enabled" / 180001 etc. — user
        // doesn't use this Earn product. Log at info level, not warn.
        if (/Invalid parameter|180001|180002/i.test(msg)) {
          console.log(`[Bybit] Earn ${category} not in use (skipped)`);
        } else {
          console.warn(`[Bybit] Earn ${category} fetch failed:`, msg);
        }
      }
    }

    return map;
  }

  // ─── getPositions ─────────────────────────────────────────────────────────────
  async getPositions(): Promise<ExchangePosition[]> {
    // 1. Fetch all wallets in parallel + metadata
    const [spot, unified, funding, earn, instruments, tickers] = await Promise.all([
      this.fetchWalletBalances("SPOT"),
      this.fetchWalletBalances("UNIFIED"),
      this.fetchFundingBalances(),
      this.fetchEarnBalances(),
      this.loadInstruments(),
      this.loadTickers(),
    ]);

    // 2. Merge into Map<coin, { liquid, locked }>
    const merged = new Map<string, BalanceRow>();
    const addLiquid = (coin: string, qty: number) => {
      const existing = merged.get(coin) ?? { coin, liquid: 0, locked: 0 };
      existing.liquid += qty;
      merged.set(coin, existing);
    };
    const addLocked = (coin: string, qty: number) => {
      const existing = merged.get(coin) ?? { coin, liquid: 0, locked: 0 };
      existing.locked += qty;
      merged.set(coin, existing);
    };

    for (const wallet of [spot, unified, funding]) {
      for (const [coin, qty] of wallet) addLiquid(coin, qty);
    }
    for (const [coin, qty] of earn) addLocked(coin, qty);

    // 3. Build positions. Cash (stablecoins + fiat) surfaces as CASH holdings
    //    rather than being hidden in a single freeCash scalar.
    const positions: ExchangePosition[] = [];
    for (const row of merged.values()) {
      const totalQty = row.liquid + row.locked;
      if (totalQty <= 0) continue;

      if (CASH_CODES.has(row.coin)) {
        positions.push(makeCashPosition(row.coin, totalQty, row.locked));
        continue;
      }

      // Pick the best pair to price this asset
      const pair = this.pickBestPair(row.coin, instruments, tickers);

      if (!pair) {
        // Asset has no tradeable pair on Bybit — surface as UNAVAILABLE so
        // the UI can hide it from totals but still show the holding.
        positions.push({
          symbol: row.coin,
          name: row.coin,
          assetType: "CRYPTO",
          quantity: totalQty,
          averageBuyPrice: 0,
          currentPrice: 0,
          currency: "USD",
          unrealizedPnl: 0,
          unrealizedPnlPct: 0,
          totalCost: 0,
          currentValue: 0,
          priceStatus: "UNAVAILABLE" as PriceStatus,
          priceUnavailableReason: "No tradeable pair on Bybit",
          lockedQuantity: row.locked > 0 ? row.locked : undefined,
        });
        continue;
      }

      const currentValue = pair.price * totalQty;

      positions.push({
        symbol: row.coin,
        name: row.coin,
        assetType: "CRYPTO",
        quantity: totalQty,
        // Cost basis from trade history is computed by sync.ts via the Trade
        // table once it backfills. The OLD bybit code returned avgPrice from
        // the wallet response but it was unreliable; leaving it 0 here so the
        // P&L only fills in once trades are persisted.
        averageBuyPrice: 0,
        currentPrice: pair.price,
        currency: pair.currency,
        unrealizedPnl: currentValue, // 0 cost basis → unrealizedPnl = currentValue (sync.ts can override later)
        unrealizedPnlPct: 0,
        totalCost: 0,
        currentValue,
        priceStatus: "OK" as PriceStatus,
        lockedQuantity: row.locked > 0 ? row.locked : undefined,
      });
    }

    return positions;
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
    type DepositRow = {
      txID: string;
      coin: string;
      amount: string;
      successAt: string;
      status: string;
    };
    type DepositResult = {
      rows: DepositRow[];
    };

    const params: Record<string, string | number> = {};
    if (since) {
      const startMs = since.getTime();
      // Bybit rejects intervals > 30 days — cap to last 30 days max
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      params.startTime = Math.max(startMs, thirtyDaysAgo);
      params.endTime = Date.now();
    }

    const result = await this.privateGet<DepositResult>(
      "/v5/asset/deposit/query-record",
      params
    );

    const rows = result.rows ?? [];
    const deposits: ExchangeDepositRecord[] = [];

    for (const row of rows) {
      // Only fiat / stablecoin deposits count as cash deposits
      if (!CASH_CODES.has(row.coin)) continue;

      deposits.push({
        externalId: row.txID || `bybit-deposit-${row.successAt}`,
        amount: Number(row.amount),
        currency: row.coin,
        date: new Date(Number(row.successAt)),
        status: row.status === "3" ? "completed" : "pending",
      });
    }

    return deposits;
  }

  // ─── getTradeHistory — paginates through all pages ─────────────────────────────
  async getTradeHistory(since?: Date): Promise<ExchangeTrade[]> {
    type ExecutionRow = {
      execId: string;
      symbol: string;
      side: string;
      execQty: string;
      execPrice: string;
      execFee: string;
      feeCurrency: string;
      execTime: string;
    };
    type ExecutionResult = {
      list: ExecutionRow[];
      nextPageCursor: string;
    };

    const instruments = await this.loadInstruments();

    const trades: ExchangeTrade[] = [];
    let cursor = "";
    const MAX_PAGES = 100; // 100 × 100 = 10k trades hard cap

    outer: for (let page = 0; page < MAX_PAGES; page++) {
      const params: Record<string, string | number> = {
        category: "spot",
        limit: 100,
      };
      if (since) params.startTime = since.getTime();
      if (cursor) params.cursor = cursor;

      const result = await this.privateGet<ExecutionResult>(
        "/v5/execution/list",
        params
      );

      const rows = result.list ?? [];
      if (rows.length === 0) break;

      for (const row of rows) {
        const execTime = Number(row.execTime);
        if (since && execTime < since.getTime()) break outer;

        const inst = instruments.bySymbol.get(row.symbol);
        if (!inst) {
          console.warn(`[Bybit] Unknown trade symbol "${row.symbol}" — skipping`);
          continue;
        }

        trades.push({
          externalId: row.execId,
          symbol: inst.baseCoin,
          side: row.side.toLowerCase() as "buy" | "sell",
          quantity: Number(row.execQty),
          price: Number(row.execPrice),
          fee: Number(row.execFee),
          feeCurrency: row.feeCurrency || inst.quoteCoin,
          date: new Date(execTime),
          currency: inst.quoteCoin,
        });
      }

      if (!result.nextPageCursor) break;
      cursor = result.nextPageCursor;
    }

    return trades;
  }
}
