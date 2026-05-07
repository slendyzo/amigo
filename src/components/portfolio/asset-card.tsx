"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePortfolioCurrency } from "./portfolio-currency-context";
import type { AggregatedAsset } from "@/lib/portfolio/aggregate-assets";

interface Props {
  asset: AggregatedAsset;
  t: ReturnType<typeof useTranslations<"portfolio">>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatQuantity(qty: number): string {
  if (qty < 0.01) return qty.toFixed(8);
  if (qty < 1) return qty.toFixed(6);
  if (qty < 100) return qty.toFixed(4);
  return qty.toFixed(2);
}

// ─── Asset type badge config ──────────────────────────────────────────────────

const ASSET_TYPE_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function AssetCard({ asset, t }: Props) {
  const { formatAmount, formatPrice } = usePortfolioCurrency();
  const isPnlPositive = asset.unrealizedPnlEur >= 0;
  const pnlBarWidthPct = Math.min(Math.abs(asset.unrealizedPnlPct), 100);

  const assetConfig = ASSET_TYPE_CONFIG[asset.assetType] ?? {
    label: asset.assetType,
    className:
      "bg-slate-100 text-slate-600 border border-slate-200",
  };

  // Source badge: single exchange label, or "N exchanges" when aggregated
  const exchangeBadgeText =
    asset.positions.length === 1
      ? asset.positions[0].exchange.label
      : `${asset.positions.length} exchanges`;

  // Detail link goes to the symbol-aggregated detail page when there are
  // multiple positions; falls back to the single-position page otherwise.
  const detailHref =
    asset.positions.length === 1
      ? `/dashboard/portfolio/${asset.positions[0].id}`
      : `/dashboard/portfolio/symbol/${encodeURIComponent(asset.symbol)}`;

  return (
    <Link
      href={detailHref}
      className="block bg-white border border-slate-200/50 rounded-xl p-4 hover:shadow-md transition-shadow"
    >
      {/* Main row */}
      <div className="flex items-start gap-3">
        {/* Left: Symbol + exchange */}
        <div className="flex-shrink-0 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-slate-900 tracking-tight">
              {asset.symbol}
            </span>
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${assetConfig.className}`}
            >
              {assetConfig.label}
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200/60/30">
              {exchangeBadgeText}
            </span>
            {asset.totalLockedQuantity > 0 && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-50 text-violet-700 border border-violet-200/60"
                title={`${formatQuantity(asset.totalLockedQuantity)} ${asset.symbol} staked / locked`}
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                {formatQuantity(asset.totalLockedQuantity)} staked
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[180px]">
            {asset.name}
          </p>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: P&L */}
        <div className="text-right flex-shrink-0">
          <p
            className={`text-sm font-bold tabular-nums ${
              isPnlPositive
                ? "text-emerald-600"
                : "text-red-500"
            }`}
          >
            {isPnlPositive ? "+" : ""}
            {formatAmount(asset.unrealizedPnlEur)}
          </p>
          <p
            className={`text-xs font-medium tabular-nums ${
              isPnlPositive
                ? "text-emerald-500"
                : "text-red-400"
            }`}
          >
            {isPnlPositive ? "+" : ""}
            {asset.unrealizedPnlPct.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Center row: Qty · Price · Value */}
      <div className="mt-3 flex items-center gap-4 text-xs text-slate-500 flex-wrap">
        <div>
          <span className="uppercase tracking-wide text-[10px] font-medium text-slate-400 block">
            {t("quantity")}
          </span>
          <span className="tabular-nums font-medium text-slate-700">
            {formatQuantity(asset.totalQuantity)}
          </span>
        </div>
        <div className="w-px h-8 bg-slate-100" />
        <div>
          <span className="uppercase tracking-wide text-[10px] font-medium text-slate-400 block">
            {t("currentPrice")}
          </span>
          <span className="tabular-nums font-medium text-slate-700">
            {formatPrice(asset.currentPriceEur)}
          </span>
        </div>
        <div className="w-px h-8 bg-slate-100" />
        <div>
          <span className="uppercase tracking-wide text-[10px] font-medium text-slate-400 block">
            {t("currentValue")}
          </span>
          <span className="tabular-nums font-medium text-slate-700">
            {formatAmount(asset.currentValueEur)}
          </span>
        </div>
      </div>

      {/* P&L bar */}
      <div className="mt-3 space-y-1">
        <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isPnlPositive
                ? "bg-emerald-400"
                : "bg-red-400"
            }`}
            style={{ width: `${pnlBarWidthPct}%` }}
          />
        </div>
        {/* DCA Average */}
        <p className="text-[10px] text-slate-400 tabular-nums">
          {t("dcaAverage")}: {formatPrice(asset.averageBuyPriceEur)}
        </p>
      </div>
    </Link>
  );
}
