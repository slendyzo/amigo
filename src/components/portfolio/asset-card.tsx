"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { usePortfolioCurrency } from "./portfolio-currency-context";
import type { AggregatedAsset } from "@/lib/portfolio/aggregate-assets";

interface Props {
  asset: AggregatedAsset;
  t: ReturnType<typeof useTranslations<"portfolio">>;
  divider?: boolean;
  /** Removes the manual position(s) behind a double-count warning. */
  onRemoveManual?: (positionIds: string[]) => void;
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

/**
 * Dismissals are keyed to the exact quantities that triggered the warning, so
 * "Keep" silences this situation but a later change (more staked, a partial
 * unstake) surfaces it again rather than staying quiet forever.
 */
function dismissKey(asset: AggregatedAsset): string | null {
  const risk = asset.duplicateRisk;
  if (!risk) return null;
  return `amigo:dupdismiss:${asset.symbol}:${risk.syncedQuantity}:${risk.manualQuantity}`;
}

export default function AssetCard({ asset, t, divider, onRemoveManual }: Props) {
  const { formatAmount } = usePortfolioCurrency();
  const isPnlPositive = asset.unrealizedPnlEur >= 0;
  const tile = symbolTile(asset.symbol);

  const [dismissed, setDismissed] = useState(true);

  // Read the dismissal after mount — localStorage isn't available during SSR,
  // and starting dismissed avoids the warning flashing in then vanishing.
  useEffect(() => {
    const key = dismissKey(asset);
    if (!key) return;
    setDismissed(window.localStorage.getItem(key) === "1");
  }, [asset]);

  const showDuplicateWarning = Boolean(asset.duplicateRisk) && !dismissed;

  const handleKeep = () => {
    const key = dismissKey(asset);
    if (key) window.localStorage.setItem(key, "1");
    setDismissed(true);
  };

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
    <div style={divider ? { borderBottom: "1px solid var(--line)" } : undefined}>
    <Link
      href={detailHref}
      className="flex items-center gap-3 py-[11px] transition-transform active:scale-[0.99]"
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

      {/* Possible double count — warn, never touch the user's number */}
      <AnimatePresence initial={false}>
        {showDuplicateWarning && asset.duplicateRisk && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div
              className="mb-[11px] rounded-[12px] px-3 py-2.5"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
              }}
            >
              <div
                className="text-[11.5px] font-semibold"
                style={{ color: "var(--warning)" }}
              >
                {t("duplicateTitle")}
              </div>
              <div
                className="mt-0.5 text-[11.5px] leading-[1.5]"
                style={{ color: "var(--ink-subtle)" }}
              >
                {t("duplicateBody", {
                  sources: asset.duplicateRisk.syncedSourceLabels.join(", "),
                  syncedQty: formatQuantity(asset.duplicateRisk.syncedQuantity),
                  manualQty: formatQuantity(asset.duplicateRisk.manualQuantity),
                  symbol: asset.symbol,
                })}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleKeep}
                  className="rounded-[9px] px-2.5 py-1 text-[11.5px] font-semibold transition-opacity active:opacity-70"
                  style={{
                    background: "var(--surface)",
                    color: "var(--ink)",
                    border: "1px solid var(--line)",
                  }}
                >
                  {t("duplicateKeep")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onRemoveManual?.(asset.duplicateRisk!.manualPositionIds)
                  }
                  className="rounded-[9px] px-2.5 py-1 text-[11.5px] font-semibold transition-opacity active:opacity-70"
                  style={{ background: "var(--warning)", color: "#fff" }}
                >
                  {t("duplicateRemove")}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
