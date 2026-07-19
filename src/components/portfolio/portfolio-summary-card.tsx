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
  assetType: string;
  currentValueEur: number;
  totalCostEur: number;
  unrealizedPnlEur: number;
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

// ─── Component — lavender hero card (ref 2d) ──────────────────────────────────

export default function PortfolioSummaryCard({ connections, assets, t }: Props) {
  const { formatAmount } = usePortfolioCurrency();

  // A position with real value but zero cost basis hasn't had its trades
  // backfilled yet — its raw unrealizedPnl equals the whole value, which would
  // inflate the total. Exclude it from P&L while still counting its value.
  const isPending = (a: Asset) => a.totalCostEur === 0 && a.currentValueEur > 0;

  const totalValueEur = assets.reduce((sum, a) => sum + a.currentValueEur, 0);
  const totalCostEur = assets.reduce((sum, a) => sum + a.totalCostEur, 0);
  const totalPnlEur = assets.reduce((sum, a) => sum + (isPending(a) ? 0 : a.unrealizedPnlEur), 0);
  const totalPnlPct = totalCostEur > 0 ? (totalPnlEur / totalCostEur) * 100 : 0;
  const totalFreeCashEur = connections.reduce((sum, c) => sum + (c.freeCashEur ?? 0), 0);

  const isPnlPositive = totalPnlEur >= 0;
  const grandTotal = totalValueEur + totalFreeCashEur;

  return (
    <div className="rounded-[24px] px-[22px] py-5" style={{ background: "var(--hero-gradient)" }}>
      <div className="flex items-start justify-between">
        <span className="text-[13px] font-medium" style={{ color: "var(--hero-ink)" }}>
          {t("totalValue")}
        </span>
        <span
          className="rounded-[20px] px-2.5 py-1 text-[12px] font-semibold tabular-nums bg-[rgba(255,255,255,0.5)] dark:bg-[rgba(255,255,255,0.1)]"
          style={{ color: isPnlPositive ? "var(--positive)" : "var(--negative)" }}
        >
          {isPnlPositive ? "▲ " : "▼ "}
          {formatAmount(Math.abs(totalPnlEur))} ({formatPct(totalPnlPct)})
        </span>
      </div>

      <div
        className="mt-1.5 text-[34px] font-bold tabular-nums leading-none"
        style={{ color: "var(--hero-ink)", letterSpacing: "-0.03em" }}
      >
        <span style={{ color: "var(--ink)" }}>{formatAmount(grandTotal)}</span>
      </div>

      <div className="mt-2.5 text-[12px] tabular-nums" style={{ color: "var(--hero-ink)" }}>
        {t("unrealizedPnl")} {isPnlPositive ? "+" : "−"}
        {formatAmount(Math.abs(totalPnlEur))} · {t("costBasisLabel")} {formatAmount(totalCostEur)}
      </div>
    </div>
  );
}
