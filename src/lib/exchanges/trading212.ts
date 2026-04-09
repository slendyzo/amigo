import { ExchangeProvider } from "@prisma/client";
import type {
  ExchangeClient,
  ExchangePosition,
  ExchangeAccountSummary,
  ExchangeDepositRecord,
  ExchangeTrade,
} from "./types";

const BASE_URL = "https://live.trading212.com/api/v0";

// Known ETF ticker patterns — checked via prefix/suffix matching and explicit list.
// Trading212 tickers use format like "CSPX_L_EQ", "VWCE_DE_EQ" etc.
const KNOWN_ETF_TICKERS = new Set([
  "CSPX",
  "VWCE",
  "VUAA",
  "XDWL",
  "IWDA",
  "EIMI",
  "VHYL",
  "HMWO",
  "SSAC",
  "LCWD",
  "SGLD",
  "WLDS",
  "VUSA",
  "VEUR",
  "VJPN",
  "VAPX",
  "VFEM",
  "AGBP",
  "AGGG",
  "XAIX",
  "XDEX",
  "XDJP",
  "XDEM",
  "XLFS",
  "XDWH",
  "XDWD",
  "SPXS",
  "IUIT",
  "IUHC",
  "IUCM",
  "IUFS",
  "IUUS",
  "IBTS",
  "IGLS",
  "IGLT",
  "INRG",
  "RBTX",
  "QDVE",
  "QDVH",
  "QDVD",
  "QDVW",
  "QDVS",
  "QDVG",
  "QDVT",
  "FLXG",
  "FLXI",
  "MEUD",
  "MXFD",
]);

const ETF_SUFFIXES = ["ETF", "UCITS", "ACC", "DIST"];

function isEtfTicker(ticker: string): boolean {
  // T212 tickers look like "CSPX_L_EQ" — extract the base symbol before "_"
  const base = ticker.split("_")[0].toUpperCase();
  if (KNOWN_ETF_TICKERS.has(base)) return true;
  return ETF_SUFFIXES.some((suffix) => base.includes(suffix));
}

// Extract display symbol from T212 ticker (e.g. "CSPX_L_EQ" → "CSPX")
function displaySymbol(ticker: string): string {
  return ticker.split("_")[0];
}

// ---------------------------------------------------------------------------
// Rate limiter — simple sliding window tracking request timestamps
// ---------------------------------------------------------------------------

class RateLimiter {
  private timestamps: number[] = [];
  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number
  ) {}

  async throttle(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxRequests) {
      const oldest = this.timestamps[0];
      const waitMs = this.windowMs - (now - oldest) + 50;
      await new Promise((r) => setTimeout(r, waitMs));
      return this.throttle();
    }
    this.timestamps.push(Date.now());
  }
}

// ---------------------------------------------------------------------------
// Trading212 API response shapes (matching official docs.trading212.com)
// ---------------------------------------------------------------------------

interface PagedResponse<TItem> {
  items: TItem[];
  nextPagePath: string | null;
}

// GET /equity/positions
interface T212Position {
  averagePricePaid: number;
  createdAt: string;
  currentPrice: number;
  instrument: {
    currency: string;
    isin: string;
    name: string;
    ticker: string; // e.g. "CSPX_L_EQ"
  };
  quantity: number;
  quantityAvailableForTrading: number;
  quantityInPies: number;
  walletImpact: {
    currency: string;
    currentValue: number;
    fxImpact: number;
    totalCost: number;
    unrealizedProfitLoss: number;
  };
}

// GET /equity/account/summary
interface T212AccountSummary {
  cash: {
    availableToTrade: number;
    inPies: number;
    reservedForOrders: number;
  };
  currency: string;
  id: number;
  investments: {
    currentValue: number;
    realizedProfitLoss: number;
    totalCost: number;
    unrealizedProfitLoss: number;
  };
  totalValue: number;
}

interface T212Transaction {
  reference: string;
  amount: number;
  type: string;
  dateCreated: string;
  status?: string;
}

interface T212Order {
  id: string;
  ticker: string;
  type: string;
  dateCreated: string;
  dateExecuted?: string | null;
  filledQuantity: number;
  fillPrice?: number | null;
  fillResult?: number | null;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class Trading212Client implements ExchangeClient {
  readonly provider: ExchangeProvider = "TRADING212";

  private generalLimiter = new RateLimiter(48, 60_000);
  private orderLimiter = new RateLimiter(5, 60_000);

  private readonly authHeader: string;

  constructor(apiKey: string, apiSecret: string) {
    const encoded = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
    this.authHeader = `Basic ${encoded}`;
  }

  // -------------------------------------------------------------------------
  // Core HTTP helper
  // -------------------------------------------------------------------------

  private async request<T>(
    path: string,
    limiter: RateLimiter = this.generalLimiter,
    retries = 2
  ): Promise<T> {
    await limiter.throttle();

    // If path starts with /api/v0, it's a full path from pagination — use base domain only
    const url = path.startsWith("/api/v0")
      ? `https://live.trading212.com${path}`
      : `${BASE_URL}${path}`;

    const res = await fetch(url, {
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
    });

    // Retry on 429 (rate limit) with backoff
    if (res.status === 429 && retries > 0) {
      const resetHeader = res.headers.get("x-ratelimit-reset");
      const waitMs = resetHeader
        ? Math.max(0, Number(resetHeader) * 1000 - Date.now()) + 500
        : 6000;
      console.warn(`[Trading212] 429 on ${path}, retrying in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
      return this.request<T>(path, limiter, retries - 1);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Trading212 API error ${res.status} on ${path}: ${body}`
      );
    }

    return res.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // Paginated helper — follows nextPagePath until exhausted
  // -------------------------------------------------------------------------

  private async fetchAllPages<TItem>(
    firstPath: string,
    limiter: RateLimiter,
    getItems: (page: PagedResponse<TItem>) => TItem[],
  ): Promise<TItem[]> {
    const all: TItem[] = [];
    let path: string | null = firstPath;

    while (path !== null) {
      const page: PagedResponse<TItem> = await this.request<PagedResponse<TItem>>(path, limiter);
      all.push(...getItems(page));
      path = page.nextPagePath ?? null;
    }

    return all;
  }

  // -------------------------------------------------------------------------
  // ExchangeClient implementation
  // -------------------------------------------------------------------------

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request<T212AccountSummary>("/equity/account/summary");
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[Trading212] testConnection failed:", message);
      return { success: false, error: message };
    }
  }

  async getPositions(): Promise<ExchangePosition[]> {
    try {
      const raw = await this.request<T212Position[]>("/equity/positions");

      return raw
        .filter((pos) => pos.instrument?.ticker && pos.quantity > 0)
        .map((pos) => {
          const ticker = pos.instrument.ticker;
          const symbol = displaySymbol(ticker);
          const assetType = isEtfTicker(ticker) ? "ETF" : "STOCK";
          const currency = pos.walletImpact?.currency ?? pos.instrument.currency ?? "EUR";

          return {
            symbol,
            name: pos.instrument.name || symbol,
            assetType,
            quantity: pos.quantity,
            averageBuyPrice: pos.averagePricePaid,
            currentPrice: pos.currentPrice,
            currency,
            unrealizedPnl: pos.walletImpact?.unrealizedProfitLoss ?? 0,
            unrealizedPnlPct:
              pos.walletImpact?.totalCost !== 0
                ? ((pos.walletImpact?.unrealizedProfitLoss ?? 0) / pos.walletImpact.totalCost) * 100
                : 0,
            totalCost: pos.walletImpact?.totalCost ?? 0,
            currentValue: pos.walletImpact?.currentValue ?? 0,
          } satisfies ExchangePosition;
        });
    } catch (err) {
      console.error("[Trading212] getPositions failed:", err);
      throw err;
    }
  }

  async getAccountSummary(): Promise<ExchangeAccountSummary> {
    try {
      const summary = await this.request<T212AccountSummary>(
        "/equity/account/summary"
      );

      return {
        totalValue: summary.totalValue,
        totalCost: summary.investments.totalCost,
        unrealizedPnl: summary.investments.unrealizedProfitLoss,
        realizedPnl: summary.investments.realizedProfitLoss,
        freeCash: summary.cash.availableToTrade,
        currency: summary.currency || "EUR",
      } satisfies ExchangeAccountSummary;
    } catch (err) {
      console.error("[Trading212] getAccountSummary failed:", err);
      throw err;
    }
  }

  async getDeposits(since?: Date): Promise<ExchangeDepositRecord[]> {
    const sinceMs = since?.getTime();

    try {
      const all = await this.fetchAllPages<T212Transaction>(
        "/equity/history/transactions",
        this.generalLimiter,
        (page) => page.items,
      );

      return all
        .filter((tx) => {
          if (tx.type !== "DEPOSIT") return false;
          if (sinceMs !== undefined) {
            const txMs = new Date(tx.dateCreated).getTime();
            return txMs >= sinceMs;
          }
          return true;
        })
        .map((tx) => ({
          externalId: tx.reference,
          amount: tx.amount,
          currency: "EUR",
          date: new Date(tx.dateCreated),
          status: tx.status ?? "COMPLETED",
        }));
    } catch (err) {
      console.error("[Trading212] getDeposits failed:", err);
      throw err;
    }
  }

  async getTradeHistory(since?: Date): Promise<ExchangeTrade[]> {
    const sinceMs = since?.getTime();

    try {
      const all = await this.fetchAllPages<T212Order>(
        "/equity/history/orders",
        this.orderLimiter,
        (page) => page.items,
      );

      return all
        .filter((order) => {
          if (!order.dateExecuted) return false;
          if (sinceMs !== undefined) {
            const orderMs = new Date(order.dateExecuted).getTime();
            return orderMs >= sinceMs;
          }
          return true;
        })
        .map((order) => {
          const isSell = order.type.includes("SELL");

          return {
            externalId: order.id,
            symbol: displaySymbol(order.ticker),
            side: isSell ? "sell" : "buy",
            quantity: order.filledQuantity,
            price: order.fillPrice ?? 0,
            fee: 0,
            feeCurrency: "EUR",
            date: new Date(order.dateExecuted!),
            currency: "EUR",
          } satisfies ExchangeTrade;
        });
    } catch (err) {
      console.error("[Trading212] getTradeHistory failed:", err);
      throw err;
    }
  }
}
