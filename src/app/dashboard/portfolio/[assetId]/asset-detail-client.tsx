"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePortfolioCurrency } from "@/components/portfolio/portfolio-currency-context";
import DisplayCurrencyToggle from "@/components/portfolio/display-currency-toggle";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssetDetail {
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
  asset: AssetDetail;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatQuantity(qty: number): string {
  if (qty < 0.01) return qty.toFixed(8);
  if (qty < 1) return qty.toFixed(6);
  if (qty < 100) return qty.toFixed(4);
  return qty.toFixed(2);
}

// Format a NATIVE currency price (e.g., BTC's price in USDT) — no toggle
// conversion since the value is already in the asset's exchange currency.
function formatNativePrice(price: number, currency: string): string {
  const decimals = price < 0.01 ? { min: 4, max: 6 } : { min: 2, max: 4 };
  // Intl can choke on USDT/USDC, fall back to symbol prefix
  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency,
      minimumFractionDigits: decimals.min,
      maximumFractionDigits: decimals.max,
    }).format(price);
  } catch {
    return `${price.toFixed(decimals.max)} ${currency}`;
  }
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Asset type badge config ──────────────────────────────────────────────────

const ASSET_TYPE_CONFIG: Record<string, { label: string; className: string }> = {
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

export default function AssetDetailClient({ asset }: Props) {
  const t = useTranslations("portfolio");
  const { formatAmount, formatPrice } = usePortfolioCurrency();
  const isPnlPositive = asset.unrealizedPnlEur >= 0;

  const assetConfig = ASSET_TYPE_CONFIG[asset.assetType] ?? {
    label: asset.assetType,
    className:
      "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700",
  };

  // Visual bar: ratio of cost vs current value
  const maxBar = Math.max(asset.totalCostEur, asset.currentValueEur, 1);
  const costBarPct = (asset.totalCostEur / maxBar) * 100;
  const valueBarPct = (asset.currentValueEur / maxBar) * 100;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Back link + currency toggle */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/dashboard/portfolio"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t("title")}
        </Link>
        <DisplayCurrencyToggle />
      </div>

      {/* Hero card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-6">
        {/* Header: symbol + badges */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {asset.symbol}
              </h1>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${assetConfig.className}`}
              >
                {assetConfig.label}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/30">
                {asset.exchange.label}
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {asset.name}
            </p>
          </div>

          {/* Sync status */}
          <div className="text-right shrink-0">
            <div
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium uppercase tracking-wide ${
                asset.exchange.syncStatus === "SUCCESS"
                  ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
                  : asset.exchange.syncStatus === "ERROR"
                    ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  asset.exchange.syncStatus === "SUCCESS"
                    ? "bg-emerald-500"
                    : asset.exchange.syncStatus === "ERROR"
                      ? "bg-red-500"
                      : "bg-slate-400"
                }`}
              />
              {asset.exchange.syncStatus === "SUCCESS"
                ? t("syncSuccess")
                : asset.exchange.syncStatus === "ERROR"
                  ? t("syncError")
                  : t("syncing")}
            </div>
            {asset.lastUpdatedAt && (
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                {formatRelativeTime(asset.lastUpdatedAt)}
              </p>
            )}
          </div>
        </div>

        {/* Current value + P&L hero */}
        <div className="mt-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 font-medium mb-1">
              {t("currentValue")}
            </p>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums tracking-tight">
              {formatAmount(asset.currentValueEur)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 font-medium mb-1">
              {t("unrealizedPnl")}
            </p>
            <p
              className={`text-xl font-bold tabular-nums ${
                isPnlPositive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-500 dark:text-red-400"
              }`}
            >
              {isPnlPositive ? "+" : ""}
              {formatAmount(asset.unrealizedPnlEur)}
            </p>
            <p
              className={`text-sm font-semibold tabular-nums ${
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
      </div>

      {/* DCA Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label={t("dcaAverage")}
          value={formatPrice(asset.averageBuyPriceEur)}
        />
        <StatCard
          label={t("quantity")}
          value={formatQuantity(asset.quantity)}
        />
        <StatCard
          label={t("totalCost")}
          value={formatAmount(asset.totalCostEur)}
        />
        <StatCard
          label={t("currentPrice")}
          value={formatPrice(asset.currentPriceEur)}
        />
      </div>

      {/* Invested vs Current Value visual comparison */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
          {t("totalCost")} vs {t("currentValue")}
        </h3>

        <div className="space-y-3">
          {/* Invested bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">{t("totalCost")}</span>
              <span className="font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                {formatAmount(asset.totalCostEur)}
              </span>
            </div>
            <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-slate-400 dark:bg-slate-500 transition-all duration-500"
                style={{ width: `${costBarPct}%` }}
              />
            </div>
          </div>

          {/* Current value bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">{t("currentValue")}</span>
              <span className="font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                {formatAmount(asset.currentValueEur)}
              </span>
            </div>
            <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isPnlPositive
                    ? "bg-emerald-400 dark:bg-emerald-500"
                    : "bg-red-400 dark:bg-red-500"
                }`}
                style={{ width: `${valueBarPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* P&L difference highlight */}
        <div
          className={`mt-4 flex items-center justify-between px-4 py-2.5 rounded-xl ${
            isPnlPositive
              ? "bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200/50 dark:border-emerald-700/30"
              : "bg-red-50 dark:bg-red-900/15 border border-red-200/50 dark:border-red-700/30"
          }`}
        >
          <span
            className={`text-xs font-medium ${
              isPnlPositive
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-red-700 dark:text-red-400"
            }`}
          >
            {isPnlPositive ? "Profit" : "Loss"}
          </span>
          <span
            className={`text-sm font-bold tabular-nums ${
              isPnlPositive
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-red-700 dark:text-red-400"
            }`}
          >
            {isPnlPositive ? "+" : ""}
            {formatAmount(asset.unrealizedPnlEur)} ({isPnlPositive ? "+" : ""}
            {asset.unrealizedPnlPct.toFixed(2)}%)
          </span>
        </div>
      </div>

      {/* Asset details meta */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
          {t("details")}
        </h3>
        <dl className="space-y-2.5 text-sm">
          <DetailRow label={t("exchange")} value={`${asset.exchange.label} (${asset.exchange.provider})`} />
          <DetailRow label={t("assetType")} value={assetConfig.label} />
          <DetailRow label={t("currentPrice")} value={formatPrice(asset.currentPriceEur)} />
          <DetailRow label={t("avgBuyPrice")} value={formatPrice(asset.averageBuyPriceEur)} />
          {asset.currency !== "EUR" && (
            <>
              <DetailRow
                label={`${t("currentPrice")} (${asset.currency})`}
                value={formatNativePrice(asset.currentPrice, asset.currency)}
              />
              <DetailRow
                label={`${t("avgBuyPrice")} (${asset.currency})`}
                value={formatNativePrice(asset.averageBuyPrice, asset.currency)}
              />
            </>
          )}
        </dl>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-xl p-3.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 font-medium mb-1">
        {label}
      </p>
      <p className="text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
        {value}
      </p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-700 dark:text-slate-300 tabular-nums">{value}</dd>
    </div>
  );
}
