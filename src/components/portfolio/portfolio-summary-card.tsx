"use client";

import { useTranslations } from "next-intl";
import { usePortfolioCurrency } from "./portfolio-currency-context";

interface Connection {
  id: string;
  provider: string;
  label: string;
  syncStatus: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  freeCash: number | null;
  freeCashCurrency: string | null;
  freeCashEur: number | null;
  freeCashRateEurPerUnit: number | null;
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

interface FxMeta {
  source: "live" | "static";
  sourceDate: string | null;
}

interface Props {
  connections: Connection[];
  assets: Asset[];
  fxMeta: FxMeta;
  t: ReturnType<typeof useTranslations<"portfolio">>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPct(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatNative(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency in CURRENCY_FALLBACK ? CURRENCY_FALLBACK[currency] : currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Stablecoins / unknown crypto codes that Intl.NumberFormat can't render as a currency
const CURRENCY_FALLBACK: Record<string, string> = {
  USDT: "USD",
  USDC: "USD",
  DAI: "USD",
  BUSD: "USD",
  FDUSD: "USD",
  TUSD: "USD",
  PYUSD: "USD",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PortfolioSummaryCard({ connections, assets, fxMeta, t }: Props) {
  const { formatAmount } = usePortfolioCurrency();
  // A position with real value but zero cost basis hasn't had its trades
  // backfilled yet (Bybit reports 0 cost until sync persists trade history).
  // Its raw unrealizedPnl equals the whole current value, so counting it as
  // profit inflates the total — exclude it from P&L while still counting value.
  const isPending = (a: Asset) => a.totalCostEur === 0 && a.currentValueEur > 0;
  // Aggregate totals across all assets
  const totalValueEur = assets.reduce((sum, a) => sum + a.currentValueEur, 0);
  const totalCostEur = assets.reduce((sum, a) => sum + a.totalCostEur, 0);
  const totalPnlEur = assets.reduce((sum, a) => sum + (isPending(a) ? 0 : a.unrealizedPnlEur), 0);
  const totalPnlPct = totalCostEur > 0 ? (totalPnlEur / totalCostEur) * 100 : 0;

  // Total free cash across all connections — converted to EUR per connection
  // before summing (USD/USDT/etc. would otherwise be treated as EUR by mistake)
  const totalFreeCashEur = connections.reduce(
    (sum, c) => sum + (c.freeCashEur ?? 0),
    0
  );

  // Per-currency aggregation for the tooltip native breakdown
  const cashByCurrency = connections.reduce<Record<string, { native: number; rate: number | null }>>(
    (acc, c) => {
      if (c.freeCash === null || !c.freeCashCurrency) return acc;
      const cur = c.freeCashCurrency;
      if (!acc[cur]) acc[cur] = { native: 0, rate: c.freeCashRateEurPerUnit };
      acc[cur].native += c.freeCash;
      return acc;
    },
    {}
  );
  const cashCurrencies = Object.entries(cashByCurrency);

  const isPnlPositive = totalPnlEur >= 0;

  // Per-exchange breakdown
  const exchangeBreakdown = connections.map((conn) => {
    const connAssets = assets.filter((a) => a.exchange.id === conn.id);
    const connValue = connAssets.reduce((sum, a) => sum + a.currentValueEur, 0);
    const connPnl = connAssets.reduce((sum, a) => sum + (isPending(a) ? 0 : a.unrealizedPnlEur), 0);
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
          {formatAmount(totalValueEur)}
        </p>
      </div>

      {/* P&L row */}
      <div className="flex items-center gap-3 flex-wrap">
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
          {formatAmount(Math.abs(totalPnlEur))}
          <span className="opacity-75">({formatPct(totalPnlPct)})</span>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400">
          {t("unrealizedPnl")}
        </div>

        {totalFreeCashEur > 0 && (
          <>
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
            <FreeCashChip
              totalEur={totalFreeCashEur}
              cashCurrencies={cashCurrencies}
              fxMeta={fxMeta}
              label={t("freeCash")}
            />
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
                  {formatAmount(connValue)}
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
                  {formatAmount(connPnl)} ({formatPct(connPct)})
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── FreeCashChip — shows the EUR total with a hover/focus tooltip listing the
//                   native breakdown per currency and the FX rate source.
// ──────────────────────────────────────────────────────────────────────────────

function FreeCashChip({
  totalEur,
  cashCurrencies,
  fxMeta,
  label,
}: {
  totalEur: number;
  cashCurrencies: [string, { native: number; rate: number | null }][];
  fxMeta: FxMeta;
  label: string;
}) {
  const { formatAmount } = usePortfolioCurrency();
  // Show tooltip only if there's something interesting to show: more than one
  // currency, or a single non-EUR currency (so the rate breakdown is useful).
  const hasMultipleCurrencies = cashCurrencies.length > 1;
  const hasNonEur = cashCurrencies.some(([cur]) => cur !== "EUR");
  const showTooltip = hasMultipleCurrencies || hasNonEur;

  const fxLabel =
    fxMeta.source === "live"
      ? `ECB${fxMeta.sourceDate ? ` ${fxMeta.sourceDate}` : ""}`
      : "Static fallback rate";

  return (
    <div className="relative group inline-flex">
      <button
        type="button"
        className="text-xs text-slate-500 dark:text-slate-400 cursor-default focus:outline-none focus:ring-2 focus:ring-[#0070f3]/40 rounded-md px-1 -mx-1"
        aria-describedby={showTooltip ? "freecash-tooltip" : undefined}
      >
        {label}:{" "}
        <span className="font-medium text-slate-700 dark:text-slate-300 tabular-nums">
          {formatAmount(totalEur)}
        </span>
      </button>

      {showTooltip && (
        <div
          id="freecash-tooltip"
          role="tooltip"
          className={[
            "pointer-events-none absolute left-0 top-full mt-2 z-20 min-w-[240px]",
            "rounded-xl border border-slate-200/60 dark:border-slate-700/60",
            "bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-lg p-3",
            "opacity-0 translate-y-1 transition-all duration-300 ease-out",
            "group-hover:opacity-100 group-hover:translate-y-0",
            "group-focus-within:opacity-100 group-focus-within:translate-y-0",
          ].join(" ")}
        >
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
            Native breakdown
          </p>
          <div className="space-y-1.5">
            {cashCurrencies.map(([currency, { native, rate }]) => {
              const eur = rate !== null ? native * rate : null;
              return (
                <div
                  key={currency}
                  className="flex items-center justify-between gap-3 text-xs tabular-nums"
                >
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {formatNative(native, currency)}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {eur !== null ? `≈ ${formatAmount(eur)}` : "—"}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-0.5">
            {cashCurrencies
              .filter(([cur, { rate }]) => cur !== "EUR" && rate !== null)
              .map(([cur, { rate }]) => (
                <p
                  key={cur}
                  className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums"
                >
                  1 {cur} = {rate!.toFixed(4)} EUR
                </p>
              ))}
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Source: {fxLabel}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
