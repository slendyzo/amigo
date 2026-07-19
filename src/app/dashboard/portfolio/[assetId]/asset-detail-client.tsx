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
      "bg-[var(--accent-tint)] text-[var(--accent-strong)] border border-[var(--line)]",
  },
  ETF: {
    label: "ETF",
    className:
      "bg-[var(--accent-tint)] text-[var(--accent-strong)] border border-[var(--line)]",
  },
  STOCK: {
    label: "Stock",
    className:
      "bg-[var(--accent-tint)] text-[var(--accent-strong)] border border-[var(--line)]",
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
      "bg-[var(--surface-2)] text-[var(--ink-muted)] border border-[var(--line)]",
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
          className="inline-flex items-center gap-1.5 text-sm transition-colors hover:opacity-70"
          style={{ color: "var(--ink-muted)" }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t("title")}
        </Link>
        <DisplayCurrencyToggle />
      </div>

      {/* Hero card */}
      <div
        className="rounded-[24px] p-6"
        style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
      >
        {/* Header: symbol + badges */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
                {asset.symbol}
              </h1>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${assetConfig.className}`}
              >
                {assetConfig.label}
              </span>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border"
                style={{ background: "var(--surface-2)", color: "var(--ink-muted)", borderColor: "var(--line)" }}
              >
                {asset.exchange.label}
              </span>
            </div>
            <p className="text-sm mt-1" style={{ color: "var(--ink-muted)" }}>
              {asset.name}
            </p>
          </div>

          {/* Sync status */}
          {(() => {
            const status = asset.exchange.syncStatus;
            const statusColor =
              status === "SUCCESS"
                ? "var(--positive)"
                : status === "ERROR"
                  ? "var(--negative)"
                  : status === "PARTIAL"
                    ? "var(--warning)"
                    : "var(--ink-muted)";
            const statusBg =
              status === "SUCCESS"
                ? "rgba(27,158,99,0.10)"
                : status === "ERROR"
                  ? "rgba(214,69,80,0.10)"
                  : status === "PARTIAL"
                    ? "rgba(199,90,58,0.10)"
                    : "var(--surface-2)";
            return (
              <div className="text-right shrink-0">
                <div
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium uppercase tracking-wide"
                  style={{ background: statusBg, color: statusColor }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: statusColor }}
                  />
                  {status === "SUCCESS"
                    ? t("syncSuccess")
                    : status === "ERROR"
                      ? t("syncError")
                      : t("syncing")}
                </div>
                {asset.lastUpdatedAt && (
                  <p className="text-[10px] mt-1" style={{ color: "var(--ink-subtle)" }}>
                    {formatRelativeTime(asset.lastUpdatedAt)}
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        {/* Current value + P&L hero */}
        <div className="mt-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wide font-medium mb-1" style={{ color: "var(--ink-subtle)" }}>
              {t("currentValue")}
            </p>
            <p className="text-3xl font-bold tabular-nums tracking-tight" style={{ color: "var(--ink)" }}>
              {formatAmount(asset.currentValueEur)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide font-medium mb-1" style={{ color: "var(--ink-subtle)" }}>
              {t("unrealizedPnl")}
            </p>
            <p
              className="text-xl font-bold tabular-nums"
              style={{ color: isPnlPositive ? "var(--positive)" : "var(--negative)" }}
            >
              {isPnlPositive ? "+" : ""}
              {formatAmount(asset.unrealizedPnlEur)}
            </p>
            <p
              className="text-sm font-semibold tabular-nums"
              style={{ color: isPnlPositive ? "var(--positive)" : "var(--negative)" }}
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
      <div
        className="rounded-[20px] p-5"
        style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
      >
        <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--ink)" }}>
          {t("totalCost")} vs {t("currentValue")}
        </h3>

        <div className="space-y-3">
          {/* Invested bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: "var(--ink-muted)" }}>{t("totalCost")}</span>
              <span className="font-medium tabular-nums" style={{ color: "var(--ink)" }}>
                {formatAmount(asset.totalCostEur)}
              </span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--surface-3)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${costBarPct}%`, background: "var(--ink-subtle)" }}
              />
            </div>
          </div>

          {/* Current value bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: "var(--ink-muted)" }}>{t("currentValue")}</span>
              <span className="font-medium tabular-nums" style={{ color: "var(--ink)" }}>
                {formatAmount(asset.currentValueEur)}
              </span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--surface-3)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${valueBarPct}%`, background: isPnlPositive ? "var(--positive)" : "var(--negative)" }}
              />
            </div>
          </div>
        </div>

        {/* P&L difference highlight */}
        <div
          className="mt-4 flex items-center justify-between px-4 py-2.5 rounded-[14px]"
          style={{
            background: isPnlPositive ? "rgba(27,158,99,0.10)" : "rgba(214,69,80,0.10)",
          }}
        >
          <span
            className="text-xs font-medium"
            style={{ color: isPnlPositive ? "var(--positive)" : "var(--negative)" }}
          >
            {isPnlPositive ? "Profit" : "Loss"}
          </span>
          <span
            className="text-sm font-bold tabular-nums"
            style={{ color: isPnlPositive ? "var(--positive)" : "var(--negative)" }}
          >
            {isPnlPositive ? "+" : ""}
            {formatAmount(asset.unrealizedPnlEur)} ({isPnlPositive ? "+" : ""}
            {asset.unrealizedPnlPct.toFixed(2)}%)
          </span>
        </div>
      </div>

      {/* Asset details meta */}
      <div
        className="rounded-[20px] p-5"
        style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
      >
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--ink)" }}>
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
    <div
      className="rounded-[16px] p-3.5"
      style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
    >
      <p className="text-[10px] uppercase tracking-wide font-medium mb-1" style={{ color: "var(--ink-subtle)" }}>
        {label}
      </p>
      <p className="text-sm font-bold tabular-nums" style={{ color: "var(--ink)" }}>
        {value}
      </p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between py-1.5 border-b last:border-0"
      style={{ borderColor: "var(--line)" }}
    >
      <dt style={{ color: "var(--ink-muted)" }}>{label}</dt>
      <dd className="font-medium tabular-nums" style={{ color: "var(--ink)" }}>{value}</dd>
    </div>
  );
}
