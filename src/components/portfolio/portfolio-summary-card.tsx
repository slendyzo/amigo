"use client";

import { useTranslations } from "next-intl";

interface Connection {
  id: string;
  provider: string;
  label: string;
  syncStatus: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  freeCash: number | null;
  freeCashCurrency: string | null;
  isActive: boolean;
  _count: { assets: number };
}

interface Asset {
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
  exchange: { id: string; provider: string; label: string };
}

interface Props {
  connections: Connection[];
  assets: Asset[];
  t: ReturnType<typeof useTranslations<"portfolio">>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEur(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formatPct(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PortfolioSummaryCard({ connections, assets, t }: Props) {
  // Aggregate totals across all assets
  const totalValueEur = assets.reduce((sum, a) => sum + a.currentValueEur, 0);
  const totalCostEur = assets.reduce((sum, a) => sum + a.totalCostEur, 0);
  const totalPnlEur = assets.reduce((sum, a) => sum + a.unrealizedPnlEur, 0);
  const totalPnlPct = totalCostEur > 0 ? (totalPnlEur / totalCostEur) * 100 : 0;

  // Total free cash across all connections (convert all to EUR — approximation)
  const totalFreeCash = connections.reduce(
    (sum, c) => sum + (c.freeCash ?? 0),
    0
  );

  const isPnlPositive = totalPnlEur >= 0;

  // Per-exchange breakdown
  const exchangeBreakdown = connections.map((conn) => {
    const connAssets = assets.filter((a) => a.exchange.id === conn.id);
    const connValue = connAssets.reduce((sum, a) => sum + a.currentValueEur, 0);
    const connPnl = connAssets.reduce((sum, a) => sum + a.unrealizedPnlEur, 0);
    const connCost = connAssets.reduce((sum, a) => sum + a.totalCostEur, 0);
    const connPct = connCost > 0 ? (connPnl / connCost) * 100 : 0;
    return { conn, connValue, connPnl, connPct };
  });

  return (
    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200/50 dark:border-slate-700/50 rounded-2xl shadow-sm p-6 space-y-5">
      {/* Hero: total portfolio value */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
          {t("totalValue")}
        </p>
        <p className="text-4xl font-bold tabular-nums text-slate-900 dark:text-slate-50 tracking-tight">
          {formatEur(totalValueEur)}
        </p>
      </div>

      {/* P&L row */}
      <div className="flex items-center gap-3">
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold tabular-nums ${
            isPnlPositive
              ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
              : "bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400"
          }`}
        >
          {isPnlPositive ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          )}
          {formatEur(Math.abs(totalPnlEur))}
          <span className="opacity-75">({formatPct(totalPnlPct)})</span>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400">
          {t("unrealizedPnl")}
        </div>

        {totalFreeCash > 0 && (
          <>
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {t("freeCash")}:{" "}
              <span className="font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                {formatEur(totalFreeCash)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Divider */}
      {exchangeBreakdown.length > 1 && (
        <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-2">
          {exchangeBreakdown.map(({ conn, connValue, connPnl, connPct }) => {
            const isConnPositive = connPnl >= 0;
            return (
              <div key={conn.id} className="flex items-center gap-3">
                {/* Provider badge */}
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase tracking-wide shrink-0 w-24 justify-center">
                  {conn.label}
                </span>

                {/* Value */}
                <span className="text-sm font-medium tabular-nums text-slate-800 dark:text-slate-200 flex-1">
                  {formatEur(connValue)}
                </span>

                {/* P&L */}
                <span
                  className={`text-xs font-semibold tabular-nums ${
                    isConnPositive
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-500 dark:text-red-400"
                  }`}
                >
                  {isConnPositive ? "+" : ""}
                  {formatEur(connPnl)} ({formatPct(connPct)})
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
