"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { usePortfolioCurrency } from "./portfolio-currency-context";
import type { AggregatedAsset } from "@/lib/portfolio/aggregate-assets";

interface Props {
  asset: AggregatedAsset;
  t: ReturnType<typeof useTranslations<"portfolio">>;
  divider?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatQuantity(qty: number): string {
  if (qty < 0.01) return qty.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
  if (qty < 1) return qty.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  if (qty < 100) return qty.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return qty.toFixed(2);
}

// Symbol tile tints — fixed brand-ish data hexes per the design handoff.
function symbolTile(symbol: string): { bg: string; fg: string } {
  const s = symbol.toUpperCase();
  if (s === "BTC" || s === "XBT") return { bg: "#F5EEE1", fg: "#A8823C" };
  if (s === "ETH") return { bg: "#E9F1FB", fg: "#3D74B8" };
  return { bg: "var(--surface-2)", fg: "var(--accent)" };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AssetCard({ asset, t, divider }: Props) {
  const { formatAmount } = usePortfolioCurrency();
  const isPnlPositive = asset.unrealizedPnlEur >= 0;
  const tile = symbolTile(asset.symbol);

  const exchangeLabel =
    asset.positions.length === 1
      ? asset.positions[0].exchange.label
      : t("nExchanges", { count: asset.positions.length });

  const detailHref =
    asset.positions.length === 1
      ? `/dashboard/portfolio/${asset.positions[0].id}`
      : `/dashboard/portfolio/symbol/${encodeURIComponent(asset.symbol)}`;

  const symLen = asset.symbol.length;
  const symFontPx = symLen >= 5 ? 10 : symLen === 4 ? 11 : 12;

  return (
    <Link
      href={detailHref}
      className="flex items-center gap-3 py-[11px] transition-transform active:scale-[0.99]"
      style={divider ? { borderBottom: "1px solid var(--line)" } : undefined}
    >
      {/* Symbol tile */}
      <div
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] font-bold"
        style={{ background: tile.bg, color: tile.fg, fontSize: `${symFontPx}px` }}
      >
        {asset.symbol.slice(0, 5)}
      </div>

      {/* Name + qty · exchange */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold" style={{ color: "var(--ink)" }}>
          {asset.name}
        </div>
        <div className="truncate text-[11.5px] tabular-nums" style={{ color: "var(--ink-subtle)" }}>
          {formatQuantity(asset.totalQuantity)} {asset.symbol} · {exchangeLabel}
          {asset.totalLockedQuantity > 0 && ` · ${formatQuantity(asset.totalLockedQuantity)} ${t("staked")}`}
        </div>
      </div>

      {/* Value + P/L% */}
      <div className="shrink-0 text-right">
        <div className="text-[13.5px] font-semibold tabular-nums" style={{ color: "var(--ink)" }}>
          {formatAmount(asset.currentValueEur)}
        </div>
        {asset.costBasisPending ? (
          <div className="text-[11px] font-semibold" style={{ color: "var(--ink-subtle)" }}>
            {t("costBasisPending")}
          </div>
        ) : (
          <div
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: isPnlPositive ? "var(--positive)" : "var(--negative)" }}
          >
            {isPnlPositive ? "+" : ""}
            {asset.unrealizedPnlPct.toFixed(1)}%
          </div>
        )}
      </div>
    </Link>
  );
}
