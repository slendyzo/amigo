/**
 * AMIGO-119 — Cost-basis + realized P&L computation from the persisted Trade
 * table. Used by sync.ts to override the values returned by per-connector
 * getPositions() once we have the full trade history backfilled.
 *
 * Algorithm (weighted average, per-symbol):
 *   - Walk trades ordered by date
 *   - Maintain { totalQty, totalCostInQuote } per (symbol, quoteCurrency)
 *   - BUY:  totalQty += vol, totalCost += vol * price
 *   - SELL: realizedPnl += (sellPrice - avgBuyAtTime) * sellVol
 *           totalQty -= sellVol
 *           totalCost -= sellVol * avgBuyAtTime  (proportional reduction)
 *
 * If a symbol traded across multiple quote currencies (e.g., BTC/USDT and
 * BTC/USDC), we compute per-quote and pick the one with the most cumulative
 * volume — this is what the user is most exposed to.
 */

import { prisma } from "@/lib/db";
import { convertToEur } from "@/lib/currency";

export interface CostBasis {
  symbol: string;
  // Currency the avg buy price is denominated in (the dominant quote currency
  // for the user's trades on this symbol).
  currency: string;
  // Weighted-average cost per unit, in `currency`.
  avgBuyPrice: number;
  // Remaining qty after net buys/sells. Should match the exchange's reported
  // balance (give or take fee dust); we use it for sanity-check, not display.
  netQty: number;
  // Cumulative realized profit/loss in `currency` from all SELL trades.
  realizedPnl: number;
}

/**
 * Build cost-basis info for every symbol that has at least one trade for the
 * given connection. Returns a Map keyed by canonical symbol.
 *
 * Only call this once the connection's tradeHistoryComplete flag is true —
 * otherwise the avg buy price will be wrong (we'd be averaging only recent
 * trades while older ones we never fetched are missing).
 */
export async function computeCostBasisFromTrades(
  exchangeConnectionId: string
): Promise<Map<string, CostBasis>> {
  const trades = await prisma.trade.findMany({
    where: { exchangeConnectionId },
    orderBy: { date: "asc" },
    select: {
      symbol: true,
      side: true,
      quantity: true,
      price: true,
      currency: true,
    },
  });

  if (trades.length === 0) return new Map();

  // Per (symbol, currency) running totals
  type Bucket = { qty: number; cost: number; realizedPnl: number };
  const buckets = new Map<string, Map<string, Bucket>>();

  for (const trade of trades) {
    const sym = trade.symbol;
    const cur = trade.currency;
    const vol = Number(trade.quantity);
    const price = Number(trade.price);

    let perCurrency = buckets.get(sym);
    if (!perCurrency) {
      perCurrency = new Map();
      buckets.set(sym, perCurrency);
    }
    let bucket = perCurrency.get(cur);
    if (!bucket) {
      bucket = { qty: 0, cost: 0, realizedPnl: 0 };
      perCurrency.set(cur, bucket);
    }

    if (trade.side === "BUY") {
      bucket.qty += vol;
      bucket.cost += vol * price;
    } else {
      // SELL — realize P&L, reduce holdings proportionally
      const avgBuyAtTime = bucket.qty > 0 ? bucket.cost / bucket.qty : 0;
      const sellQty = Math.min(vol, bucket.qty); // can't sell what you don't have on the books
      bucket.realizedPnl += (price - avgBuyAtTime) * sellQty;
      bucket.qty -= sellQty;
      bucket.cost -= sellQty * avgBuyAtTime;
      // If the user sold MORE than we have on the books (e.g., short, or
      // pre-import balance), ignore the excess — we have no cost basis for it.
    }
  }

  // Per symbol: pick the dominant quote currency (most cumulative quantity
  // bought in that currency) — gives the most representative avg buy price.
  const result = new Map<string, CostBasis>();

  for (const [symbol, perCurrency] of buckets) {
    let dominantCurrency = "";
    let maxAbsQty = -1;
    for (const [currency, bucket] of perCurrency) {
      // Use absolute qty so a fully-sold symbol still picks a currency
      const abs = Math.abs(bucket.qty) + Math.abs(bucket.realizedPnl);
      if (abs > maxAbsQty) {
        maxAbsQty = abs;
        dominantCurrency = currency;
      }
    }

    const dominant = perCurrency.get(dominantCurrency)!;
    const avgBuyPrice = dominant.qty > 0 ? dominant.cost / dominant.qty : 0;

    result.set(symbol, {
      symbol,
      currency: dominantCurrency,
      avgBuyPrice,
      netQty: dominant.qty,
      realizedPnl: dominant.realizedPnl,
    });
  }

  return result;
}

/**
 * Convert realized P&L to EUR using TODAY's FX rate.
 *
 * NOTE: This is approximate — proper accounting would convert each SELL trade
 * at the FX rate ON THE TRADE DATE. Doing that requires historical FX lookups
 * (Frankfurter supports it: /v1/{date}). Tracked as a follow-up; for now we
 * use today's rate so the UI has something to show.
 */
export async function realizedPnlToEur(
  realizedPnl: number,
  currency: string
): Promise<number> {
  if (realizedPnl === 0) return 0;
  const { amountEur } = await convertToEur(realizedPnl, currency);
  return amountEur;
}
