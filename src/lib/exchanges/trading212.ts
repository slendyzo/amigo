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
// Trading212 tickers are usually the LSE/Xetra symbol; ETFs typically end in common
// suffixes or appear in this well-known set.
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

// Known ETF suffixes (Xetra/LSE conventions)
const ETF_SUFFIXES = ["ETF", "UCITS", "ACC", "DIST", "GBP", "USD", "EUR"];

function isEtfTicker(ticker: string): boolean {
  const upper = ticker.toUpperCase();
  if (KNOWN_ETF_TICKERS.has(upper)) return true;
  // Tickers that contain typical ETF suffix substrings
  return ETF_SUFFIXES.some((suffix) => upper.includes(suffix));
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
    // Drop timestamps outside the window
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxRequests) {
      const oldest = this.timestamps[0];
      const waitMs = this.windowMs - (now - oldest) + 50; // small buffer
      await new Promise((r) => setTimeout(r, waitMs));
      // Recurse to re-check after waiting
      return this.throttle();
    }
    this.timestamps.push(Date.now());
  }
}

// ---------------------------------------------------------------------------
// Trading212 API response shapes (internal — not exported)
// ---------------------------------------------------------------------------

interface PagedResponse<TItem> {
  items: TItem[];
  nextPagePath: string | null;
}

interface T212Position {
  ticker: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  ppl: number;
  fxPpl: number | null;
  initialFillDate: string;
  frontend?: string;
  maxBuy?: number;
  maxSell?: number;
}

interface T212AccountCash {
  free: number;
  total: number;
  ppl: number;
  result: number;
  invested: number;
  pipiResult: number;
  blocked?: number | null;
}

interface T212Transaction {
  reference: string;
  amount: number;
  type: string; // "DEPOSIT", "WITHDRAWAL", "FEE", etc.
  dateCreated: string;
  status?: string;
}

interface T212Order {
  id: string;
  ticker: string;
  type: "BUY" | "SELL" | "MARKET_BUY" | "MARKET_SELL" | "LIMIT_BUY" | "LIMIT_SELL" | "STOP_SELL";
  dateCreated: string;
  dateExecuted?: string | null;
  filledQuantity: number;
  fillPrice?: number | null;
  fillResult?: number | null;
  taxes?: Array<{ fillId: string; quantity: number; timeCharged: string }>;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class Trading212Client implements ExchangeClient {
  readonly provider: ExchangeProvider = "TRADING212";

  // General rate limit: 50 req/min
  private generalLimiter = new RateLimiter(48, 60_000); // stay a bit under
  // Order history: 6 req/min
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
    limiter: RateLimiter = this.generalLimiter
  ): Promise<T> {
    await limiter.throttle();

    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
    });

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
    sinceMs?: number
  ): Promise<TItem[]> {
    const all: TItem[] = [];
    let path: string | null = firstPath;

    while (path !== null) {
      const page: PagedResponse<TItem> = await this.request<PagedResponse<TItem>>(path, limiter);

      const items = getItems(page);
      all.push(...items);

      // nextPagePath is a full path like "/api/v0/...?cursor=..."
      // Strip leading slash duplication if the value already starts with "/"
      const next = page.nextPagePath;
      if (next) {
        path = next.startsWith("/") ? next : `/${next}`;
      } else {
        path = null;
      }
    }

    return all;
  }

  // -------------------------------------------------------------------------
  // ExchangeClient implementation
  // -------------------------------------------------------------------------

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request<T212AccountCash>("/equity/account/cash");
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

      return raw.map((pos) => {
        const assetType = isEtfTicker(pos.ticker) ? "ETF" : "STOCK";
        const totalCost = pos.quantity * pos.averagePrice;
        const currentValue = pos.quantity * pos.currentPrice;
        const unrealizedPnl = pos.ppl + (pos.fxPpl ?? 0);
        const unrealizedPnlPct =
          totalCost !== 0 ? (unrealizedPnl / totalCost) * 100 : 0;

        return {
          symbol: pos.ticker,
          name: pos.ticker, // T212 API doesn't return instrument name in positions
          assetType,
          quantity: pos.quantity,
          averageBuyPrice: pos.averagePrice,
          currentPrice: pos.currentPrice,
          currency: "EUR", // T212 reports all values in account currency (EUR for EU accounts)
          unrealizedPnl,
          unrealizedPnlPct,
          totalCost,
          currentValue,
        } satisfies ExchangePosition;
      });
    } catch (err) {
      console.error("[Trading212] getPositions failed:", err);
      throw err;
    }
  }

  async getAccountSummary(): Promise<ExchangeAccountSummary> {
    try {
      const cash = await this.request<T212AccountCash>(
        "/equity/account/cash"
      );

      // ppl = open P&L (unrealized), result = closed P&L (realized) + FX
      // invested = total cost basis in open positions
      const totalValue = cash.total;
      const totalCost = cash.invested;
      const unrealizedPnl = cash.ppl;
      // result includes both realized + FX; we subtract open ppl to isolate realized
      const realizedPnl = cash.result - cash.ppl;

      return {
        totalValue,
        totalCost,
        unrealizedPnl,
        realizedPnl,
        freeCash: cash.free,
        currency: "EUR",
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
        sinceMs
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
        this.orderLimiter, // stricter limit for this endpoint
        (page) => page.items,
        sinceMs
      );

      return all
        .filter((order) => {
          // Only include executed orders
          if (!order.dateExecuted) return false;
          if (sinceMs !== undefined) {
            const orderMs = new Date(order.dateExecuted).getTime();
            return orderMs >= sinceMs;
          }
          return true;
        })
        .map((order) => {
          const isSell =
            order.type === "SELL" ||
            order.type === "MARKET_SELL" ||
            order.type === "LIMIT_SELL" ||
            order.type === "STOP_SELL";

          return {
            externalId: order.id,
            symbol: order.ticker,
            side: isSell ? "sell" : "buy",
            quantity: order.filledQuantity,
            price: order.fillPrice ?? 0,
            fee: 0, // T212 is commission-free; taxes are listed separately in order.taxes
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
