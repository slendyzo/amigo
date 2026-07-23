// Cash (stablecoins + fiat) helpers shared across exchange connectors and the UI.
//
// Historically each connector swept stablecoin/fiat balances into a single
// hidden `freeCash` scalar and never surfaced them as holdings. We now emit
// every cash balance as a CASH-typed position so the user can see exactly what
// they hold on each exchange. Detection of what counts as "cash" stays local to
// each connector (their fiat sets differ — Kraken lists JPY/CHF/etc.), but the
// shape of the emitted position is built here so it's identical everywhere.

import type { ExchangePosition, PriceStatus } from "@/lib/exchanges/types";

// Canonical stablecoins + the common fiat codes. Used by the UI to tell a cash
// holding apart from a crypto one without a DB round-trip.
export const STABLE_SYMBOLS = new Set([
  "USDT",
  "USDC",
  "DAI",
  "BUSD",
  "FDUSD",
  "TUSD",
  "PYUSD",
]);

export const FIAT_SYMBOLS = new Set([
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "CHF",
  "AUD",
  "BRL",
  "PLN",
]);

export function isCashSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return STABLE_SYMBOLS.has(s) || FIAT_SYMBOLS.has(s);
}

/**
 * Build a CASH ExchangePosition for a cash balance.
 *
 * Cash is priced 1:1 in its own unit (currentPrice = 1); the EUR value is
 * derived downstream by convertToEur, which normalises stablecoins → USD and
 * passes fiat straight through. Cost basis is set equal to value so unrealized
 * P&L is ~0 — cash is excluded from P&L in the UI regardless, but this keeps
 * snapshots consistent.
 */
export function makeCashPosition(
  coin: string,
  quantity: number,
  locked = 0
): ExchangePosition {
  const value = quantity; // price is 1 in the coin's own unit
  return {
    symbol: coin,
    name: coin,
    assetType: "CASH",
    quantity,
    averageBuyPrice: 1,
    currentPrice: 1,
    currency: coin, // convertToEur normalises USDT→USD, passes EUR/GBP/… through
    unrealizedPnl: 0,
    unrealizedPnlPct: 0,
    totalCost: value,
    currentValue: value,
    priceStatus: "OK" as PriceStatus,
    lockedQuantity: locked > 0 ? locked : undefined,
  };
}
