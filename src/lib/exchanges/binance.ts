import crypto from "crypto";
import {
  ExchangeClient,
  ExchangePosition,
  ExchangeAccountSummary,
  ExchangeDepositRecord,
  ExchangeTrade,
} from "./types";

const BASE_URL = "https://api.binance.com";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const FIAT_CODES = new Set(["USD", "EUR", "GBP"]);
// Stablecoins + fiat — all treated as cash, never as positions
const CASH_CODES = new Set(["USD", "EUR", "GBP", "USDT", "USDC", "BUSD", "DAI"]);
// Dust threshold — balances below this are ignored
const DUST_THRESHOLD = 0.00000001;

// ---------------------------------------------------------------------------
// Rate limiter — weight-based, max 6000 weight per minute (spot)
// ---------------------------------------------------------------------------
class WeightRateLimiter {
  private usedWeight = 0;
  private windowStart = Date.now();
  private readonly maxWeight = 6000;
  private readonly windowMs = 60_000; // 1 minute

  private reset() {
    const now = Date.now();
    if (now - this.windowStart >= this.windowMs) {
      this.usedWeight = 0;
      this.windowStart = now;
    }
  }

  async consume(weight: number) {
    this.reset();
    if (this.usedWeight + weight > this.maxWeight) {
      const elapsed = Date.now() - this.windowStart;
      const waitMs = this.windowMs - elapsed + 100; // wait for window to expire
      await sleep(waitMs);
      this.usedWeight = 0;
      this.windowStart = Date.now();
    }
    this.usedWeight += weight;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Binance API response shapes
// ---------------------------------------------------------------------------
interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

interface BinanceAccountResponse {
  balances: BinanceBalance[];
  canTrade: boolean;
}

interface BinancePriceTicker {
  symbol: string;
  price: string;
}

interface BinanceTrade {
  id: number;
  orderId: number;
  symbol: string;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
}

interface BinanceDepositRecord {
  id: string;
  amount: string;
  coin: string;
  status: number; // 0=pending, 1=success, 6=credited
  insertTime: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function depositStatus(code: number): string {
  switch (code) {
    case 0: return "pending";
    case 1: return "completed";
    case 6: return "credited";
    default: return "unknown";
  }
}

// ---------------------------------------------------------------------------
// BinanceClient
// ---------------------------------------------------------------------------
export class BinanceClient implements ExchangeClient {
  readonly provider = "BINANCE" as const;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly rateLimiter = new WeightRateLimiter();

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  // -------------------------------------------------------------------------
  // Signature generation
  // Binance uses HMAC-SHA256 over the full query string
  // -------------------------------------------------------------------------
  private sign(queryString: string): string {
    return crypto
      .createHmac("sha256", this.apiSecret)
      .update(queryString)
      .digest("hex");
  }

  // -------------------------------------------------------------------------
  // Private GET request (signed)
  // -------------------------------------------------------------------------
  private async privateGet<T>(
    path: string,
    params: Record<string, string | number> = {},
    weight = 1
  ): Promise<T> {
    await this.rateLimiter.consume(weight);

    const timestamp = Date.now();
    const qs = new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      ),
      timestamp: String(timestamp),
    }).toString();

    const signature = this.sign(qs);
    const url = `${BASE_URL}${path}?${qs}&signature=${signature}`;

    const res = await fetch(url, {
      headers: {
        "X-MBX-APIKEY": this.apiKey,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Binance HTTP ${res.status} on ${path}: ${body}`);
    }

    return res.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // Public GET request (unsigned)
  // -------------------------------------------------------------------------
  private async publicGet<T>(
    path: string,
    params: Record<string, string> = {},
    weight = 1
  ): Promise<T> {
    await this.rateLimiter.consume(weight);

    const qs = new URLSearchParams(params).toString();
    const url = `${BASE_URL}${path}${qs ? `?${qs}` : ""}`;

    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Binance HTTP ${res.status} on ${path}: ${body}`);
    }

    return res.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // testConnection
  // -------------------------------------------------------------------------
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // GET /api/v3/account — weight 20, requires signed request
      await this.privateGet<BinanceAccountResponse>("/api/v3/account", {}, 20);
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Binance] testConnection failed:", msg);
      return { success: false, error: msg };
    }
  }

  // -------------------------------------------------------------------------
  // Helper: fetch all current USDT prices as a symbol→price map
  // -------------------------------------------------------------------------
  private async fetchPrices(): Promise<Map<string, number>> {
    const tickers = await this.publicGet<BinancePriceTicker[]>(
      "/api/v3/ticker/price",
      {},
      2
    );
    const map = new Map<string, number>();
    for (const t of tickers) {
      map.set(t.symbol, Number(t.price));
    }
    return map;
  }

  // -------------------------------------------------------------------------
  // Helper: calculate average buy price per asset from trade history
  // Queries myTrades per held asset — each call costs weight 20.
  // Returns { avgPrice, currency } per symbol (base asset).
  // -------------------------------------------------------------------------
  private async calcAverageBuyPrices(
    assets: string[],
    priceMap: Map<string, number>
  ): Promise<Record<string, { avgPrice: number; currency: string }>> {
    const averages: Record<string, { avgPrice: number; currency: string }> = {};

    for (const asset of assets) {
      // Try USDT pair first, then BUSD, then EUR
      const quotesToTry = ["USDT", "BUSD", "EUR"];
      let symbol: string | null = null;
      let quoteCurrency: string | null = null;

      for (const quote of quotesToTry) {
        const candidate = `${asset}${quote}`;
        if (priceMap.has(candidate)) {
          symbol = candidate;
          quoteCurrency = quote;
          break;
        }
      }

      if (!symbol || !quoteCurrency) {
        // Asset has no recognisable pair — skip avg buy price
        averages[asset] = { avgPrice: 0, currency: "USDT" };
        continue;
      }

      try {
        const trades = await this.privateGet<BinanceTrade[]>(
          "/api/v3/myTrades",
          { symbol },
          20
        );

        let totalCost = 0;
        let totalQty = 0;

        for (const trade of trades) {
          if (trade.isBuyer) {
            const qty = Number(trade.qty);
            const price = Number(trade.price);
            totalCost += qty * price;
            totalQty += qty;
          }
        }

        averages[asset] = {
          avgPrice: totalQty > 0 ? totalCost / totalQty : 0,
          currency: quoteCurrency,
        };
      } catch (err) {
        console.error("[Binance] calcAverageBuyPrices — skipping", asset, err);
        averages[asset] = { avgPrice: 0, currency: quoteCurrency };
      }
    }

    return averages;
  }

  // -------------------------------------------------------------------------
  // getPositions
  // -------------------------------------------------------------------------
  async getPositions(): Promise<ExchangePosition[]> {
    // 1. Fetch account balances
    const account = await this.privateGet<BinanceAccountResponse>(
      "/api/v3/account",
      {},
      20
    );

    // 2. Filter non-dust, non-cash balances
    const holdings = account.balances.filter((b) => {
      const total = Number(b.free) + Number(b.locked);
      return total > DUST_THRESHOLD && !CASH_CODES.has(b.asset);
    });

    if (holdings.length === 0) return [];

    // 3. Fetch all prices once (weight: 2)
    const priceMap = await this.fetchPrices();

    // 4. Calculate average buy prices per asset
    const assetSymbols = holdings.map((h) => h.asset);
    const avgBuyPrices = await this.calcAverageBuyPrices(assetSymbols, priceMap);

    // 5. Build position objects
    const positions: ExchangePosition[] = [];

    for (const holding of holdings) {
      try {
        const quantity = Number(holding.free) + Number(holding.locked);
        const buyInfo = avgBuyPrices[holding.asset] ?? { avgPrice: 0, currency: "USDT" };

        // Resolve current price using the same quote currency as buy trades
        const quotesToTry = [buyInfo.currency, "USDT", "BUSD", "EUR"];
        let currentPrice = 0;
        let positionCurrency = buyInfo.currency;

        for (const quote of quotesToTry) {
          const pairKey = `${holding.asset}${quote}`;
          const price = priceMap.get(pairKey);
          if (price !== undefined) {
            currentPrice = price;
            positionCurrency = quote;
            break;
          }
        }

        // If the price currency differs from the buy currency, zero out avg buy
        // so P&L isn't calculated across mismatched currencies
        const averageBuyPrice =
          positionCurrency === buyInfo.currency ? buyInfo.avgPrice : 0;

        const totalCost = averageBuyPrice * quantity;
        const currentValue = currentPrice * quantity;
        const unrealizedPnl = currentValue - totalCost;
        const unrealizedPnlPct =
          totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : 0;

        positions.push({
          symbol: holding.asset,
          name: holding.asset,
          assetType: "CRYPTO",
          quantity,
          averageBuyPrice,
          currentPrice,
          currency: positionCurrency,
          unrealizedPnl,
          unrealizedPnlPct,
          totalCost,
          currentValue,
        });
      } catch (err) {
        console.error(
          "[Binance] getPositions — skipping asset",
          holding.asset,
          err
        );
      }
    }

    return positions;
  }

  // -------------------------------------------------------------------------
  // getAccountSummary
  // -------------------------------------------------------------------------
  async getAccountSummary(): Promise<ExchangeAccountSummary> {
    const account = await this.privateGet<BinanceAccountResponse>(
      "/api/v3/account",
      {},
      20
    );

    const priceMap = await this.fetchPrices();

    // Approximate stablecoin/fiat rates to USDT (1:1 for stables, rough for EUR/GBP)
    const toUSDT: Record<string, number> = {
      USDT: 1,
      USDC: 1,
      BUSD: 1,
      DAI: 1,
      USD: 1,
      EUR: 1.08,
      GBP: 1.27,
    };

    let freeCash = 0;
    let totalValue = 0;
    let totalCost = 0;

    for (const balance of account.balances) {
      const total = Number(balance.free) + Number(balance.locked);
      if (total <= DUST_THRESHOLD) continue;

      if (CASH_CODES.has(balance.asset)) {
        const rate = toUSDT[balance.asset] ?? 1;
        freeCash += total * rate;
        totalValue += total * rate;
        continue;
      }

      // Crypto — value in USDT
      const usdtPrice =
        priceMap.get(`${balance.asset}USDT`) ??
        priceMap.get(`${balance.asset}BUSD`) ??
        0;

      totalValue += total * usdtPrice;

      // We'd need per-asset cost basis here — approximation only
      // (same limitation as Kraken's TradeBalance approach)
      totalCost += 0;
    }

    // Realized P&L is not directly available from Binance's Spot API
    // without iterating all trade history — leave as 0 (same as Trading212)
    const unrealizedPnl = totalValue - totalCost;

    return {
      totalValue,
      totalCost,
      unrealizedPnl,
      realizedPnl: 0,
      freeCash,
      currency: "USDT",
    };
  }

  // -------------------------------------------------------------------------
  // getDeposits
  // -------------------------------------------------------------------------
  async getDeposits(since?: Date): Promise<ExchangeDepositRecord[]> {
    const params: Record<string, string | number> = {};
    if (since) {
      params.startTime = since.getTime();
    }

    // sapi/v1/capital/deposit/hisrec — weight: 1
    const records = await this.privateGet<BinanceDepositRecord[]>(
      "/sapi/v1/capital/deposit/hisrec",
      params,
      1
    );

    const deposits: ExchangeDepositRecord[] = [];

    for (const record of records) {
      // Only fiat deposits — skip crypto deposits
      if (!FIAT_CODES.has(record.coin)) continue;

      deposits.push({
        externalId: record.id,
        amount: Number(record.amount),
        currency: record.coin,
        date: new Date(record.insertTime),
        status: depositStatus(record.status),
      });
    }

    return deposits;
  }

  // -------------------------------------------------------------------------
  // getTradeHistory
  // -------------------------------------------------------------------------
  async getTradeHistory(since?: Date): Promise<ExchangeTrade[]> {
    // Binance requires a symbol for myTrades — we need to discover what pairs
    // the account has traded. We do this by checking current balances plus
    // fetching from all USDT/BUSD/EUR pairs for held assets.
    const account = await this.privateGet<BinanceAccountResponse>(
      "/api/v3/account",
      {},
      20
    );

    // Gather all non-trivial, non-cash assets that were ever held
    const tradedAssets = account.balances
      .filter((b) => {
        const total = Number(b.free) + Number(b.locked);
        return total > 0 && !CASH_CODES.has(b.asset);
      })
      .map((b) => b.asset);

    const priceMap = await this.fetchPrices();

    const allTrades: ExchangeTrade[] = [];
    const seenIds = new Set<string>();

    const params: Record<string, string | number> = {};
    if (since) params.startTime = since.getTime();

    for (const asset of tradedAssets) {
      // Try USDT, BUSD, EUR pairs
      const quotesToTry = ["USDT", "BUSD", "EUR"];

      for (const quote of quotesToTry) {
        const symbol = `${asset}${quote}`;
        if (!priceMap.has(symbol)) continue;

        try {
          const trades = await this.privateGet<BinanceTrade[]>(
            "/api/v3/myTrades",
            { symbol, ...params },
            20
          );

          for (const trade of trades) {
            const externalId = String(trade.id);
            if (seenIds.has(externalId)) continue;
            seenIds.add(externalId);

            allTrades.push({
              externalId,
              symbol: asset,
              side: trade.isBuyer ? "buy" : "sell",
              quantity: Number(trade.qty),
              price: Number(trade.price),
              fee: Number(trade.commission),
              feeCurrency: trade.commissionAsset,
              date: new Date(trade.time),
              currency: quote,
            });
          }
        } catch (err) {
          console.error("[Binance] getTradeHistory — skipping pair", symbol, err);
        }
      }
    }

    // Sort ascending by date
    allTrades.sort((a, b) => a.date.getTime() - b.date.getTime());

    return allTrades;
  }
}
