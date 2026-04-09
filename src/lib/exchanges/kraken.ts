import crypto from "crypto";
import {
  ExchangeClient,
  ExchangePosition,
  ExchangeAccountSummary,
  ExchangeDepositRecord,
  ExchangeTrade,
} from "./types";

const BASE_URL = "https://api.kraken.com";

// ---------------------------------------------------------------------------
// Asset code normalisation
// Kraken uses non-standard codes like XXBT, XETH, ZUSD, ZEUR etc.
// ---------------------------------------------------------------------------
function normaliseAsset(raw: string): string {
  const known: Record<string, string> = {
    XXBT: "BTC",
    XBT: "BTC",
    XETH: "ETH",
    ZUSD: "USD",
    XXLM: "XLM",
    ZEUR: "EUR",
    ZGBP: "GBP",
  };
  if (known[raw]) return known[raw];
  // Strip leading X or Z when the result would be a 3-char ticker
  if ((raw.startsWith("X") || raw.startsWith("Z")) && raw.length === 4) {
    return raw.slice(1);
  }
  return raw;
}

const FIAT_CODES = new Set(["EUR", "USD", "GBP", "ZEUR", "ZUSD", "ZGBP"]);

// ---------------------------------------------------------------------------
// Rate limiter — Starter tier: max 15, decay 0.33/sec, ledger/trade cost 2
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Kraken client
// ---------------------------------------------------------------------------
export class KrakenClient implements ExchangeClient {
  readonly provider = "KRAKEN" as const;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly rateLimiter = new RateLimiter();
  private lastNonce = 0;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  private nextNonce(): number {
    const now = Date.now() * 1000;
    this.lastNonce = Math.max(now, this.lastNonce + 1);
    return this.lastNonce;
  }

  // -------------------------------------------------------------------------
  // Signature generation
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Private POST request
  // -------------------------------------------------------------------------
  private async privatePost(
    path: string,
    params: Record<string, string | number> = {},
    cost = 1
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

  // -------------------------------------------------------------------------
  // Public GET request
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // testConnection
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // getPositions
  // -------------------------------------------------------------------------
  async getPositions(): Promise<ExchangePosition[]> {
    // 1. Fetch all balances
    const balances = await this.privatePost("/0/private/Balance");

    // 2. Filter crypto assets with non-zero balance
    const cryptoAssets = Object.entries(balances)
      .filter(([rawCode, qty]) => {
        const normalised = normaliseAsset(rawCode);
        return !FIAT_CODES.has(rawCode) && !FIAT_CODES.has(normalised) && Number(qty) > 0;
      })
      .map(([rawCode, qty]) => ({
        rawCode,
        symbol: normaliseAsset(rawCode),
        quantity: Number(qty),
      }));

    // 3. Build average buy prices from trade history
    const avgBuyPrices = await this.calcAverageBuyPrices();

    // 4. Fetch current prices and build positions
    const positions: ExchangePosition[] = [];

    for (const asset of cryptoAssets) {
      try {
        const pair = `${asset.rawCode}EUR`;
        const ticker = await this.publicGet("/0/public/Ticker", { pair });

        // Ticker result key may vary; grab the first key
        const tickerData = Object.values(ticker)[0] as { c: [string, string] } | undefined;
        const currentPrice = tickerData ? Number(tickerData.c[0]) : 0;

        const averageBuyPrice = avgBuyPrices[asset.symbol] ?? 0;
        const totalCost = averageBuyPrice * asset.quantity;
        const currentValue = currentPrice * asset.quantity;
        const unrealizedPnl = currentValue - totalCost;
        const unrealizedPnlPct =
          totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : 0;

        positions.push({
          symbol: asset.symbol,
          name: asset.symbol,
          assetType: "CRYPTO",
          quantity: asset.quantity,
          averageBuyPrice,
          currentPrice,
          currency: "EUR",
          unrealizedPnl,
          unrealizedPnlPct,
          totalCost,
          currentValue,
        });
      } catch (err) {
        console.error("[Kraken] getPositions — skipping asset", asset.symbol, err);
      }
    }

    return positions;
  }

  // -------------------------------------------------------------------------
  // Helper: calculate average buy price per normalised symbol from trade history
  // -------------------------------------------------------------------------
  private async calcAverageBuyPrices(): Promise<Record<string, number>> {
    const result = await this.privatePost("/0/private/TradesHistory", {}, 2);
    const trades = result.trades as Record<
      string,
      { pair: string; type: string; price: string; vol: string }
    > | undefined;

    if (!trades) return {};

    // Weighted average for buy side
    const acc: Record<string, { totalCost: number; totalQty: number }> = {};

    for (const trade of Object.values(trades)) {
      if (trade.type !== "buy") continue;

      // Pair is something like "XXBTZEUR" — extract base asset
      const pairRaw = trade.pair;
      // Kraken pairs are 6-8 chars; base is usually first 4 chars (X/Z prefixed)
      const baseRaw = pairRaw.slice(0, pairRaw.length === 8 ? 4 : 3);
      const symbol = normaliseAsset(baseRaw);

      if (!acc[symbol]) acc[symbol] = { totalCost: 0, totalQty: 0 };
      const qty = Number(trade.vol);
      const price = Number(trade.price);
      acc[symbol].totalCost += qty * price;
      acc[symbol].totalQty += qty;
    }

    return Object.fromEntries(
      Object.entries(acc).map(([sym, { totalCost, totalQty }]) => [
        sym,
        totalQty > 0 ? totalCost / totalQty : 0,
      ])
    );
  }

  // -------------------------------------------------------------------------
  // getAccountSummary
  // -------------------------------------------------------------------------
  async getAccountSummary(): Promise<ExchangeAccountSummary> {
    // Trade balance gives overall equity in EUR
    const tradeBalance = await this.privatePost(
      "/0/private/TradeBalance",
      { asset: "ZEUR" }
    );

    const totalValue = Number(tradeBalance.eb ?? 0); // equivalent balance
    const totalCost = Number(tradeBalance.c ?? 0);   // cost basis
    const unrealizedPnl = Number(tradeBalance.n ?? 0); // unrealized P&L
    const realizedPnl = Number(tradeBalance.rp ?? 0);  // realized P&L

    // Fiat cash = sum of EUR/USD/GBP balances converted naively to EUR
    // (for a simple implementation we just sum EUR-denominated fiat)
    const balances = await this.privatePost("/0/private/Balance");
    let freeCash = 0;
    for (const [rawCode, qty] of Object.entries(balances)) {
      if (FIAT_CODES.has(rawCode) || FIAT_CODES.has(normaliseAsset(rawCode))) {
        freeCash += Number(qty);
      }
    }

    return {
      totalValue,
      totalCost,
      unrealizedPnl,
      realizedPnl,
      freeCash,
      currency: "EUR",
    };
  }

  // -------------------------------------------------------------------------
  // getDeposits
  // -------------------------------------------------------------------------
  async getDeposits(since?: Date): Promise<ExchangeDepositRecord[]> {
    const params: Record<string, string | number> = { type: "deposit" };
    if (since) params.start = Math.floor(since.getTime() / 1000);

    const result = await this.privatePost("/0/private/Ledgers", params, 2);
    const ledger = result.ledger as Record<
      string,
      {
        refid: string;
        asset: string;
        amount: string;
        time: number;
        subtype: string;
      }
    > | undefined;

    if (!ledger) return [];

    const deposits: ExchangeDepositRecord[] = [];

    for (const [id, entry] of Object.entries(ledger)) {
      const normalised = normaliseAsset(entry.asset);
      // Only fiat deposits
      if (!FIAT_CODES.has(entry.asset) && !FIAT_CODES.has(normalised)) continue;

      deposits.push({
        externalId: entry.refid || id,
        amount: Number(entry.amount),
        currency: normalised,
        date: new Date(entry.time * 1000),
        status: "completed",
      });
    }

    return deposits;
  }

  // -------------------------------------------------------------------------
  // getTradeHistory
  // -------------------------------------------------------------------------
  async getTradeHistory(since?: Date): Promise<ExchangeTrade[]> {
    const params: Record<string, string | number> = {};
    if (since) params.start = Math.floor(since.getTime() / 1000);

    const result = await this.privatePost("/0/private/TradesHistory", params, 2);
    const trades = result.trades as Record<
      string,
      {
        ordertxid: string;
        pair: string;
        type: string;
        vol: string;
        price: string;
        fee: string;
        feecurrency?: string;
        time: number;
      }
    > | undefined;

    if (!trades) return [];

    return Object.entries(trades).map(([id, trade]) => {
      const pairRaw = trade.pair;
      const baseRaw = pairRaw.slice(0, pairRaw.length === 8 ? 4 : 3);
      const symbol = normaliseAsset(baseRaw);

      const quoteRaw = pairRaw.slice(pairRaw.length === 8 ? 4 : 3);
      const currency = normaliseAsset(quoteRaw);

      return {
        externalId: trade.ordertxid || id,
        symbol,
        side: trade.type as "buy" | "sell",
        quantity: Number(trade.vol),
        price: Number(trade.price),
        fee: Number(trade.fee),
        feeCurrency: trade.feecurrency ? normaliseAsset(trade.feecurrency) : currency,
        date: new Date(trade.time * 1000),
        currency,
      };
    });
  }
}
