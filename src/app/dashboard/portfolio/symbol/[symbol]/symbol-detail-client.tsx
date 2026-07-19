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
      "bg-[var(--surface-2)] text-[var(--ink-muted)] border border-[var(--line)]",
  };

  return (
    <div className="space-y-6 max-w-3xl">
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
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
                {symbol}
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
                {positions.length === 1
                  ? positions[0].exchange.label
                  : `${positions.length} exchanges`}
              </span>
              {totalLocked > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border"
                  style={{ background: "var(--accent-tint)", color: "var(--accent-strong)", borderColor: "var(--line)" }}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  {formatQuantity(totalLocked)} staked
                </span>
              )}
            </div>
            <p className="text-sm mt-1" style={{ color: "var(--ink-muted)" }}>{name}</p>
          </div>
        </div>

        <div className="mt-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wide font-medium mb-1" style={{ color: "var(--ink-subtle)" }}>
              {t("currentValue")}
            </p>
            <p className="text-3xl font-bold tabular-nums tracking-tight" style={{ color: "var(--ink)" }}>
              {formatAmount(totalValueEur)}
            </p>
            <p className="text-xs mt-1 tabular-nums" style={{ color: "var(--ink-muted)" }}>
              {formatQuantity(totalQty)} {symbol} @ {formatPrice(currentPriceEur)}
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
              {formatAmount(totalPnlEur)}
            </p>
            <p
              className="text-sm font-semibold tabular-nums"
              style={{ color: isPnlPositive ? "var(--positive)" : "var(--negative)" }}
            >
              {isPnlPositive ? "+" : ""}
              {totalPnlPct.toFixed(2)}%
            </p>
            {hasRealized && (
              <p className="text-[10px] mt-1" style={{ color: "var(--ink-subtle)" }}>
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
        <div
          className="rounded-[20px] p-5"
          style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
        >
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--ink)" }}>
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
                  className="flex items-center gap-3 px-3 py-3 rounded-[16px] transition-colors hover:opacity-90"
                  style={{ background: "var(--surface-2)" }}
                >
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide shrink-0 min-w-[70px] justify-center"
                    style={{ background: "var(--surface-3)", color: "var(--ink-muted)" }}
                  >
                    {p.exchange.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs tabular-nums" style={{ color: "var(--ink)" }}>
                      {formatQuantity(p.quantity)} {symbol}
                      {p.lockedQuantity && p.lockedQuantity > 0 && (
                        <span className="ml-1.5 text-[10px]" style={{ color: "var(--accent-strong)" }}>
                          ({formatQuantity(p.lockedQuantity)} staked)
                        </span>
                      )}
                    </p>
                    <div className="h-1 mt-1 rounded-full overflow-hidden" style={{ background: "var(--surface-3)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${sharePct}%`, background: "var(--accent)" }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0 min-w-[100px]">
                    <p className="text-sm font-medium tabular-nums" style={{ color: "var(--ink)" }}>
                      {formatAmount(p.currentValueEur)}
                    </p>
                    <p
                      className="text-[11px] font-medium tabular-nums"
                      style={{ color: posPnlPositive ? "var(--positive)" : "var(--negative)" }}
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
