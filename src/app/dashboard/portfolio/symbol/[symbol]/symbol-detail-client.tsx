"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePortfolioCurrency } from "@/components/portfolio/portfolio-currency-context";
import DisplayCurrencyToggle from "@/components/portfolio/display-currency-toggle";

interface Position {
  id: string;
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
  lockedQuantity: number | null;
  realizedPnlEur: number | null;
  priceStatus: string;
  priceUnavailableReason: string | null;
  lastUpdatedAt: string;
  exchange: {
    id: string;
    provider: string;
    label: string;
    syncStatus: string;
    lastSyncAt: string | null;
  };
}

interface Props {
  symbol: string;
  name: string;
  assetType: string;
  positions: Position[];
}

const ASSET_TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  CRYPTO: {
    label: "Crypto",
    className:
      "bg-amber-50 text-amber-700 border border-amber-200/60",
  },
  ETF: {
    label: "ETF",
    className:
      "bg-blue-50 text-blue-700 border border-blue-200/60",
  },
  STOCK: {
    label: "Stock",
    className:
      "bg-purple-50 text-purple-700 border border-purple-200/60",
  },
};

function formatQuantity(qty: number): string {
  if (qty < 0.01) return qty.toFixed(8);
  if (qty < 1) return qty.toFixed(6);
  if (qty < 100) return qty.toFixed(4);
  return qty.toFixed(2);
}

export default function SymbolDetailClient({
  symbol,
  name,
  assetType,
  positions,
}: Props) {
  const t = useTranslations("portfolio");
  const { formatAmount, formatPrice } = usePortfolioCurrency();

  const totalQty = positions.reduce((s, p) => s + p.quantity, 0);
  const totalLocked = positions.reduce(
    (s, p) => s + (p.lockedQuantity ?? 0),
    0
  );
  const totalValueEur = positions.reduce((s, p) => s + p.currentValueEur, 0);
  const totalCostEur = positions.reduce((s, p) => s + p.totalCostEur, 0);
  const totalPnlEur = totalValueEur - totalCostEur;
  const totalPnlPct = totalCostEur > 0 ? (totalPnlEur / totalCostEur) * 100 : 0;
  const isPnlPositive = totalPnlEur >= 0;

  const totalRealized = positions
    .map((p) => p.realizedPnlEur)
    .filter((v): v is number => v !== null && v !== undefined)
    .reduce((s, v) => s + v, 0);
  const hasRealized = positions.some(
    (p) => p.realizedPnlEur !== null && p.realizedPnlEur !== 0
  );

  // Aggregate avg buy + current price (qty-weighted in EUR)
  const avgBuyEur = totalQty > 0 ? totalCostEur / totalQty : 0;
  const currentPriceEur = totalQty > 0 ? totalValueEur / totalQty : 0;

  const assetConfig = ASSET_TYPE_CONFIG[assetType] ?? {
    label: assetType,
    className:
      "bg-slate-100 text-slate-600 border border-slate-200",
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back link + currency toggle */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/dashboard/portfolio"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t("title")}
        </Link>
        <DisplayCurrencyToggle />
      </div>

      {/* Hero card */}
      <div className="bg-white border border-slate-200/50 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                {symbol}
              </h1>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${assetConfig.className}`}
              >
                {assetConfig.label}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200/60/30">
                {positions.length === 1
                  ? positions[0].exchange.label
                  : `${positions.length} exchanges`}
              </span>
              {totalLocked > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-violet-50 text-violet-700 border border-violet-200/60">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  {formatQuantity(totalLocked)} staked
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-1">{name}</p>
          </div>
        </div>

        <div className="mt-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 font-medium mb-1">
              {t("currentValue")}
            </p>
            <p className="text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
              {formatAmount(totalValueEur)}
            </p>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              {formatQuantity(totalQty)} {symbol} @ {formatPrice(currentPriceEur)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-400 font-medium mb-1">
              {t("unrealizedPnl")}
            </p>
            <p
              className={`text-xl font-bold tabular-nums ${
                isPnlPositive
                  ? "text-emerald-600"
                  : "text-red-500"
              }`}
            >
              {isPnlPositive ? "+" : ""}
              {formatAmount(totalPnlEur)}
            </p>
            <p
              className={`text-sm font-semibold tabular-nums ${
                isPnlPositive
                  ? "text-emerald-500"
                  : "text-red-400"
              }`}
            >
              {isPnlPositive ? "+" : ""}
              {totalPnlPct.toFixed(2)}%
            </p>
            {hasRealized && (
              <p className="text-[10px] text-slate-400 mt-1">
                Realized: {totalRealized >= 0 ? "+" : ""}
                {formatAmount(totalRealized)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t("dcaAverage")} value={formatPrice(avgBuyEur)} />
        <StatCard label={t("quantity")} value={formatQuantity(totalQty)} />
        <StatCard label={t("totalCost")} value={formatAmount(totalCostEur)} />
        <StatCard label={t("currentPrice")} value={formatPrice(currentPriceEur)} />
      </div>

      {/* Per-exchange breakdown — only when there's more than one position */}
      {positions.length > 1 && (
        <div className="bg-white border border-slate-200/50 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">
            Across {positions.length} exchanges
          </h3>
          <div className="space-y-2">
            {positions.map((p) => {
              const sharePct =
                totalValueEur > 0 ? (p.currentValueEur / totalValueEur) * 100 : 0;
              const posPnlPositive = p.unrealizedPnlEur >= 0;
              return (
                <Link
                  key={p.id}
                  href={`/dashboard/portfolio/${p.id}`}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl bg-slate-50/40 hover:bg-slate-100 transition-colors"
                >
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-200 text-slate-700 uppercase tracking-wide shrink-0 min-w-[70px] justify-center">
                    {p.exchange.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-700 tabular-nums">
                      {formatQuantity(p.quantity)} {symbol}
                      {p.lockedQuantity && p.lockedQuantity > 0 && (
                        <span className="ml-1.5 text-violet-600 text-[10px]">
                          ({formatQuantity(p.lockedQuantity)} staked)
                        </span>
                      )}
                    </p>
                    <div className="h-1 mt-1 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#0070f3]"
                        style={{ width: `${sharePct}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0 min-w-[100px]">
                    <p className="text-sm font-medium text-slate-800 tabular-nums">
                      {formatAmount(p.currentValueEur)}
                    </p>
                    <p
                      className={`text-[11px] font-medium tabular-nums ${
                        posPnlPositive
                          ? "text-emerald-600"
                          : "text-red-500"
                      }`}
                    >
                      {posPnlPositive ? "+" : ""}
                      {formatAmount(p.unrealizedPnlEur)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200/50 rounded-xl p-3.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mb-1">
        {label}
      </p>
      <p className="text-sm font-bold text-slate-900 tabular-nums">
        {value}
      </p>
    </div>
  );
}
