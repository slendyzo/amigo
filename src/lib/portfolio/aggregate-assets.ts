/**
 * Roll up per-exchange PortfolioAsset rows into one row per symbol.
 *
 * The user thinks of their portfolio symbol-first: "I have 0.1 BTC", not "I
 * have 0.012 on Kraken + 0.086 on Bybit". Per-exchange detail is preserved on
 * the aggregated row so the symbol detail page can render the breakdown.
 *
 * EUR is the canonical unit here — values, costs and P&L are summed across
 * exchanges. The "current price" we surface is the value-weighted average
 * (currentValueEur / totalQty), which is meaningful when the same coin trades
 * at slightly different prices in two venues.
 *
 * priceStatus aggregation rule: if ANY constituent has UNAVAILABLE price, the
 * aggregated row is UNAVAILABLE (we'd be hiding real holdings otherwise). If
 * any is STALE, it's STALE. Else OK.
 *
 * isDust: only true if EVERY constituent is dust — one non-dust position is
 * enough to make the rollup non-dust.
 *
 * MANUAL positions (user-entered staked/locked/vesting holdings) count toward
 * quantity, value and allocation but are excluded from every P&L calculation.
 * They have no cost basis by design, so folding them in would either report
 * their whole value as profit or — via costBasisPending — blank the P&L on a
 * symbol the user has tracked properly for months.
 */

export type AggPriceStatus = "OK" | "UNAVAILABLE" | "STALE";

export interface PerExchangePosition {
  id: string;
  exchange: { id: string; provider: string; label: string };
  quantity: number;
  currentPriceEur: number;
  currentValueEur: number;
  averageBuyPriceEur: number;
  totalCostEur: number;
  unrealizedPnlEur: number;
  unrealizedPnlPct: number;
  lockedQuantity: number | null;
  realizedPnlEur: number | null;
  // Native-currency fields preserved for the detail page
  currency: string;
  averageBuyPrice: number;
  currentPrice: number;
}

export interface AggregatedAsset {
  symbol: string;
  name: string;
  assetType: string;

  // Aggregated EUR values
  totalQuantity: number;
  totalLockedQuantity: number; // sum of lockedQuantity across exchanges
  currentValueEur: number;
  currentPriceEur: number; // value-weighted (currentValueEur / totalQuantity)
  totalCostEur: number;
  averageBuyPriceEur: number; // qty-weighted (totalCostEur / totalQuantity)
  unrealizedPnlEur: number;
  unrealizedPnlPct: number;
  realizedPnlEur: number | null;

  // True when at least one constituent has a real value but no cost basis yet
  // (e.g. Bybit trade-history backfill still running). P&L excludes those
  // positions, so callers should render "—" rather than a misleading number.
  costBasisPending: boolean;

  isDust: boolean;
  priceStatus: AggPriceStatus;
  priceUnavailableReason: string | null;

  // Set when the same symbol is held BOTH manually and by a synced source.
  // Usually means the user unstaked (or moved funds) and the real source has
  // caught up, while the manual row is still counting the same coins — so the
  // total reads high. We surface it and let the user decide; we never edit or
  // delete their number for them.
  duplicateRisk: {
    syncedQuantity: number;
    manualQuantity: number;
    manualPositionIds: string[];
    syncedSourceLabels: string[];
  } | null;

  // Per-exchange constituents — drives the symbol-detail page
  positions: PerExchangePosition[];
}

// Minimal shape we accept (matches what portfolio-client passes around)
export interface AssetInput {
  id: string;
  symbol: string;
  name: string;
  assetType: string;
  quantity: number;
  averageBuyPrice: number;
  averageBuyPriceEur: number;
  currentPrice: number;
  currentPriceEur: number;
  currentValue: number;
  currentValueEur: number;
  totalCost: number;
  totalCostEur: number;
  unrealizedPnl: number;
  unrealizedPnlEur: number;
  unrealizedPnlPct: number;
  currency: string;
  lockedQuantity?: number | null;
  realizedPnlEur?: number | null;
  isDust?: boolean;
  priceStatus?: string;
  priceUnavailableReason?: string | null;
  exchange: { id: string; provider: string; label: string };
}

function worsePriceStatus(a: AggPriceStatus, b: AggPriceStatus): AggPriceStatus {
  // OK < STALE < UNAVAILABLE
  const rank = { OK: 0, STALE: 1, UNAVAILABLE: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
}

export function aggregateAssetsBySymbol(assets: AssetInput[]): AggregatedAsset[] {
  const bySymbol = new Map<string, AssetInput[]>();
  for (const a of assets) {
    const list = bySymbol.get(a.symbol);
    if (list) list.push(a);
    else bySymbol.set(a.symbol, [a]);
  }

  const result: AggregatedAsset[] = [];

  for (const [symbol, list] of bySymbol) {
    const positions: PerExchangePosition[] = list.map((a) => ({
      id: a.id,
      exchange: a.exchange,
      quantity: a.quantity,
      currentPriceEur: a.currentPriceEur,
      currentValueEur: a.currentValueEur,
      averageBuyPriceEur: a.averageBuyPriceEur,
      totalCostEur: a.totalCostEur,
      unrealizedPnlEur: a.unrealizedPnlEur,
      unrealizedPnlPct: a.unrealizedPnlPct,
      lockedQuantity: a.lockedQuantity ?? null,
      realizedPnlEur: a.realizedPnlEur ?? null,
      currency: a.currency,
      averageBuyPrice: a.averageBuyPrice,
      currentPrice: a.currentPrice,
    }));

    const totalQuantity = list.reduce((s, a) => s + a.quantity, 0);
    const totalLockedQuantity = list.reduce(
      (s, a) => s + (a.lockedQuantity ?? 0),
      0
    );
    const currentValueEur = list.reduce((s, a) => s + a.currentValueEur, 0);

    // Manual positions are value-only — they never contribute to cost or P&L.
    const isManual = (a: AssetInput) => a.exchange.provider === "MANUAL";
    const costed = list.filter((a) => !isManual(a));
    const totalCostEur = costed.reduce((s, a) => s + a.totalCostEur, 0);

    // A position with real value but zero cost basis hasn't had its trades
    // backfilled yet (Bybit reports 0 cost until sync.ts persists trade history).
    // Counting its whole value as profit inflates P&L — exclude it from the P&L
    // math while still counting its value in currentValueEur. P&L fills in once
    // backfill completes.
    //
    // Manual positions are exempt: they're *expected* to have zero cost, so
    // they must not trip this flag. Without the exemption, adding one staked
    // holding would blank the return on everything else you own of that symbol.
    const isPending = (a: AssetInput) => a.totalCostEur === 0 && a.currentValueEur > 0;
    const costBasisPending = costed.some(isPending);
    const knownForPnl = costed.filter((a) => !isPending(a));
    const knownValueEur = knownForPnl.reduce((s, a) => s + a.currentValueEur, 0);
    const knownCostEur = knownForPnl.reduce((s, a) => s + a.totalCostEur, 0);
    const unrealizedPnlEur = knownValueEur - knownCostEur;
    const unrealizedPnlPct =
      knownCostEur > 0 ? (unrealizedPnlEur / knownCostEur) * 100 : 0;

    const realizedPnls = list
      .map((a) => a.realizedPnlEur)
      .filter((v): v is number => v !== null && v !== undefined);
    const realizedPnlEur =
      realizedPnls.length > 0 ? realizedPnls.reduce((s, v) => s + v, 0) : null;

    const currentPriceEur =
      totalQuantity > 0 ? currentValueEur / totalQuantity : 0;

    // Averaged over the costed quantity only. Dividing by totalQuantity would
    // let a zero-cost manual position drag the average buy price toward zero.
    const costedQuantity = costed.reduce((s, a) => s + a.quantity, 0);
    const averageBuyPriceEur =
      costedQuantity > 0 ? totalCostEur / costedQuantity : 0;

    const isDust = list.every((a) => a.isDust ?? false);

    // Both kinds of source holding the same symbol = probable double count.
    // Two *real* exchanges holding the same coin is normal and not flagged.
    const manualPositions = list.filter(isManual);
    const duplicateRisk =
      manualPositions.length > 0 && costed.length > 0
        ? {
            syncedQuantity: costed.reduce((s, a) => s + a.quantity, 0),
            manualQuantity: manualPositions.reduce((s, a) => s + a.quantity, 0),
            manualPositionIds: manualPositions.map((a) => a.id),
            syncedSourceLabels: Array.from(
              new Set(costed.map((a) => a.exchange.label))
            ),
          }
        : null;

    let priceStatus: AggPriceStatus = "OK";
    let priceUnavailableReason: string | null = null;
    for (const a of list) {
      const status = (a.priceStatus ?? "OK") as AggPriceStatus;
      const next = worsePriceStatus(priceStatus, status);
      if (next !== priceStatus && a.priceUnavailableReason) {
        priceUnavailableReason = a.priceUnavailableReason;
      }
      priceStatus = next;
    }

    result.push({
      symbol,
      name: list[0].name,
      assetType: list[0].assetType,
      totalQuantity,
      totalLockedQuantity,
      currentValueEur,
      currentPriceEur,
      totalCostEur,
      averageBuyPriceEur,
      unrealizedPnlEur,
      unrealizedPnlPct,
      realizedPnlEur,
      costBasisPending,
      isDust,
      priceStatus,
      priceUnavailableReason,
      duplicateRisk,
      positions,
    });
  }

  // Sort by current value desc (matches the existing single-asset sort)
  result.sort((a, b) => b.currentValueEur - a.currentValueEur);

  return result;
}
