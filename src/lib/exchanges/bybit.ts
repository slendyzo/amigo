import crypto from "crypto";
import {
  ExchangeClient,
  ExchangePosition,
  ExchangeAccountSummary,
  ExchangeDepositRecord,
  ExchangeTrade,
} from "./types";

const DEFAULT_BASE_URL = "https://api.bybit.com";
const RECV_WINDOW = 5000;

// ---------------------------------------------------------------------------
// Stablecoins / FIAT treated as cash
// ---------------------------------------------------------------------------
const CASH_CODES = new Set(["USDT", "USDC", "DAI", "USD", "EUR", "GBP"]);

// ---------------------------------------------------------------------------
// Rate limiter — 120 requests per minute per endpoint
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Bybit V5 response shape
// ---------------------------------------------------------------------------
interface BybitResponse<T> {
  retCode: number;
  retMsg: string;
  result: T;
}

// ---------------------------------------------------------------------------
// Bybit client
// ---------------------------------------------------------------------------
export class BybitClient implements ExchangeClient {
  readonly provider = "BYBIT" as const;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;
  private readonly rateLimiter = new RateLimiter();

  constructor(apiKey: string, apiSecret: string, baseUrl: string = DEFAULT_BASE_URL) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = baseUrl;
  }

  // -------------------------------------------------------------------------
  // Signature — GET: timestamp + apiKey + recvWindow + queryString
  //             POST: timestamp + apiKey + recvWindow + body
  // -------------------------------------------------------------------------
  private sign(timestamp: number, payload: string): string {
    const message = `${timestamp}${this.apiKey}${RECV_WINDOW}${payload}`;
    return crypto
      .createHmac("sha256", this.apiSecret)
      .update(message)
      .digest("hex");
  }

  // -------------------------------------------------------------------------
  // Authenticated GET
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Public GET (no auth — for market data)
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // testConnection
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Fetch current USDT price for a symbol
  // -------------------------------------------------------------------------
  private async getUsdtPrice(symbol: string): Promise<number> {
    try {
      const result = await this.publicGet<{
        list: Array<{ symbol: string; lastPrice: string }>;
      }>("/v5/market/tickers", {
        category: "spot",
        symbol: `${symbol}USDT`,
      });

      const ticker = result.list?.[0];
      if (ticker) return Number(ticker.lastPrice);
    } catch {
      // fallback: no price found
    }
    return 0;
  }

  // -------------------------------------------------------------------------
  // getPositions
  // -------------------------------------------------------------------------
  async getPositions(): Promise<ExchangePosition[]> {
    type WalletCoin = {
      coin: string;
      equity: string;
      usdValue: string;
      availableToWithdraw: string;
      walletBalance: string;
      cumRealisedPnl: string;
      avgPrice: string;
    };
    type WalletResult = {
      list: Array<{ accountType: string; coin: WalletCoin[] }>;
    };

    const result = await this.privateGet<WalletResult>(
      "/v5/account/wallet-balance",
      { accountType: "UNIFIED" }
    );

    const account = result.list?.[0];
    if (!account) return [];

    const positions: ExchangePosition[] = [];

    for (const coin of account.coin ?? []) {
      const symbol = coin.coin;

      // Skip stablecoins/fiat — those are cash, not positions
      if (CASH_CODES.has(symbol)) continue;

      const quantity = Number(coin.equity);
      if (quantity <= 0) continue;

      try {
        const currentPrice = await this.getUsdtPrice(symbol);
        const averageBuyPrice = Number(coin.avgPrice ?? 0);
        const totalCost = averageBuyPrice * quantity;
        const currentValue = currentPrice * quantity;
        const unrealizedPnl = currentValue - totalCost;
        const unrealizedPnlPct =
          totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : 0;

        positions.push({
          symbol,
          name: symbol,
          assetType: "CRYPTO",
          quantity,
          averageBuyPrice,
          currentPrice,
          currency: "USDT",
          unrealizedPnl,
          unrealizedPnlPct,
          totalCost,
          currentValue,
        });
      } catch (err) {
        console.error("[Bybit] getPositions — skipping asset", symbol, err);
      }
    }

    return positions;
  }

  // -------------------------------------------------------------------------
  // getAccountSummary
  // -------------------------------------------------------------------------
  async getAccountSummary(): Promise<ExchangeAccountSummary> {
    type WalletCoin = {
      coin: string;
      equity: string;
      usdValue: string;
      walletBalance: string;
      cumRealisedPnl: string;
      avgPrice: string;
    };
    type WalletResult = {
      list: Array<{
        accountType: string;
        totalEquity: string;
        totalWalletBalance: string;
        totalAvailableBalance: string;
        coin: WalletCoin[];
      }>;
    };

    const result = await this.privateGet<WalletResult>(
      "/v5/account/wallet-balance",
      { accountType: "UNIFIED" }
    );

    const account = result.list?.[0];
    if (!account) {
      return {
        totalValue: 0,
        totalCost: 0,
        unrealizedPnl: 0,
        realizedPnl: 0,
        freeCash: 0,
        currency: "USDT",
      };
    }

    const totalValue = Number(account.totalEquity ?? 0);

    // Accumulate cost basis and realised P&L from individual coin records
    let totalCost = 0;
    let realizedPnl = 0;
    let freeCash = 0;

    for (const coin of account.coin ?? []) {
      const qty = Number(coin.equity);
      const avgPrice = Number(coin.avgPrice ?? 0);
      const cumRealised = Number(coin.cumRealisedPnl ?? 0);

      if (CASH_CODES.has(coin.coin)) {
        // Treat stablecoins as 1:1 USDT for free cash
        freeCash += qty;
      } else if (qty > 0 && avgPrice > 0) {
        totalCost += qty * avgPrice;
      }

      realizedPnl += cumRealised;
    }

    const unrealizedPnl = totalValue - freeCash - totalCost;

    return {
      totalValue,
      totalCost,
      unrealizedPnl,
      realizedPnl,
      freeCash,
      currency: "USDT",
    };
  }

  // -------------------------------------------------------------------------
  // getDeposits
  // -------------------------------------------------------------------------
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
      params.startTime = since.getTime();
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

  // -------------------------------------------------------------------------
  // getTradeHistory — paginates through all pages
  // -------------------------------------------------------------------------
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

    const trades: ExchangeTrade[] = [];
    let cursor = "";

    // Bybit returns trades newest-first; paginate until we go past `since`
    outer: while (true) {
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

        // Derive base/quote from symbol — Bybit spot symbols end in USDT/USDC/BTC/ETH/DAI
        const quoteGuesses = ["USDT", "USDC", "DAI", "BTC", "ETH", "BNB"];
        let baseSymbol = row.symbol;
        let quoteCurrency = "USDT";
        for (const q of quoteGuesses) {
          if (row.symbol.endsWith(q)) {
            baseSymbol = row.symbol.slice(0, -q.length);
            quoteCurrency = q;
            break;
          }
        }

        trades.push({
          externalId: row.execId,
          symbol: baseSymbol,
          side: row.side.toLowerCase() as "buy" | "sell",
          quantity: Number(row.execQty),
          price: Number(row.execPrice),
          fee: Number(row.execFee),
          feeCurrency: row.feeCurrency || quoteCurrency,
          date: new Date(execTime),
          currency: quoteCurrency,
        });
      }

      // If Bybit returned a next cursor, continue; otherwise we're done
      if (!result.nextPageCursor) break;
      cursor = result.nextPageCursor;
    }

    return trades;
  }
}
