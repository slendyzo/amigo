"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePortfolioCurrency } from "./portfolio-currency-context";

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
  asset: Asset;
  t: ReturnType<typeof useTranslations<"portfolio">>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatQuantity(qty: number): string {
  // Show up to 8 decimal places for crypto, fewer for stocks/ETFs
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
      "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-700/30",
  },
  ETF: {
    label: "ETF",
    className:
      "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200/60 dark:border-blue-700/30",
  },
  STOCK: {
    label: "Stock",
    className:
      "bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border border-purple-200/60 dark:border-purple-700/30",
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
      "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700",
  };

  return (
    <Link
      href={`/dashboard/portfolio/${asset.id}`}
      className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-xl p-4 hover:shadow-md transition-shadow"
    >
      {/* Main row */}
      <div className="flex items-start gap-3">
        {/* Left: Symbol + exchange */}
        <div className="flex-shrink-0 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              {asset.symbol}
            </span>
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${assetConfig.className}`}
            >
              {assetConfig.label}
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/30">
              {asset.exchange.label}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[180px]">
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
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-500 dark:text-red-400"
            }`}
          >
            {isPnlPositive ? "+" : ""}
            {formatAmount(asset.unrealizedPnlEur)}
          </p>
          <p
            className={`text-xs font-medium tabular-nums ${
              isPnlPositive
                ? "text-emerald-500 dark:text-emerald-500"
                : "text-red-400 dark:text-red-500"
            }`}
          >
            {isPnlPositive ? "+" : ""}
            {asset.unrealizedPnlPct.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Center row: Qty · Price · Value */}
      <div className="mt-3 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
        <div>
          <span className="uppercase tracking-wide text-[10px] font-medium text-slate-400 dark:text-slate-500 block">
            {t("quantity")}
          </span>
          <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">
            {formatQuantity(asset.quantity)}
          </span>
        </div>
        <div className="w-px h-8 bg-slate-100 dark:bg-slate-800" />
        <div>
          <span className="uppercase tracking-wide text-[10px] font-medium text-slate-400 dark:text-slate-500 block">
            {t("currentPrice")}
          </span>
          <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">
            {formatPrice(asset.currentPriceEur)}
          </span>
        </div>
        <div className="w-px h-8 bg-slate-100 dark:bg-slate-800" />
        <div>
          <span className="uppercase tracking-wide text-[10px] font-medium text-slate-400 dark:text-slate-500 block">
            {t("currentValue")}
          </span>
          <span className="tabular-nums font-medium text-slate-700 dark:text-slate-300">
            {formatAmount(asset.currentValueEur)}
          </span>
        </div>
      </div>

      {/* P&L bar */}
      <div className="mt-3 space-y-1">
        <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isPnlPositive
                ? "bg-emerald-400 dark:bg-emerald-500"
                : "bg-red-400 dark:bg-red-500"
            }`}
            style={{ width: `${pnlBarWidthPct}%` }}
          />
        </div>
        {/* DCA Average */}
        <p className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
          {t("dcaAverage")}: {formatPrice(asset.averageBuyPriceEur)}
        </p>
      </div>
    </Link>
  );
}
