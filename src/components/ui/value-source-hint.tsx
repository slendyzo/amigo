"use client";

// Tiny ? hint icon next to "Estimated value" labels on RWA cards. Hovering
// reveals a popover explaining where the number comes from + when it was
// last refreshed. Inert on touch — hover-only.
//
// The component sits inside <Link> wrappers, so we stopPropagation on the
// trigger to prevent accidental navigation when the user clicks the icon
// to keep the tooltip pinned.

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

export type ValueSourceHintProps = {
  /** RealAsset.currentValueSource — one of the documented source labels. */
  source: string | null;
  /** ISO timestamp of last refresh, or null if never. */
  updatedAt: string | null;
  /** Optional last sample size from the most recent ValuationHistory row. */
  sampleSize?: number | null;
  /** Asset class — affects which scrape sources are mentioned. */
  assetType?: "vehicle" | "property";
  className?: string;
};

const SOURCE_DESCRIPTIONS: Record<
  string,
  (assetType: "vehicle" | "property") => { label: string; body: string }
> = {
  live_scrape: (t) => ({
    label: "Market data",
    body:
      t === "vehicle"
        ? "Median of comparable Standvirtual + OLX listings, refreshed every 5 days. Filtered by your mileage (±15%)."
        : "Median of comparable Idealista + Imovirtual listings for your concelho, refreshed every 5 days.",
  }),
  web_archive: () => ({
    label: "Market data (archived)",
    body:
      "Median of comparable listings from a Web Archive snapshot near this date. Useful for backfilled history before the live cron started running.",
  }),
  heuristic: (t) =>
    t === "vehicle"
      ? {
          label: "Depreciation curve",
          body:
            "Computed from the standard EU depreciation curve (15% year 1, 12% year 2, 10% years 3–5, 7% thereafter), adjusted for your mileage. Updated daily.",
        }
      : {
          label: "Index estimate",
          body:
            "Computed from the INE concelho housing index, rebased to your purchase price at the purchase quarter. Updated when the index publishes.",
        },
  ai_estimate: () => ({
    label: "AI estimate",
    body:
      "Z.AI GLM-4.6 estimated this value by interpolating between the surrounding real-data anchors. It's interpolation, not market data.",
  }),
  manual: () => ({
    label: "Manual entry",
    body: "You logged this value yourself (independent appraisal, insurance value, or offer received).",
  }),
  purchase: () => ({
    label: "Purchase price",
    body: "The original purchase price you entered when adding this asset.",
  }),
  stale: () => ({
    label: "Stale",
    body:
      "We don't have fresh enough data to recompute. Keeping the last known value. Will refresh when new market data lands.",
  }),
};

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const min = ms / 60_000;
  if (min < 1) return "just now";
  if (min < 60) return `${Math.round(min)} min ago`;
  const hr = min / 60;
  if (hr < 24) return `${Math.round(hr)}h ago`;
  const day = hr / 24;
  if (day < 30) return `${Math.round(day)}d ago`;
  const mo = day / 30.44;
  if (mo < 12) return `${Math.round(mo)}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

export function ValueSourceHint({
  source,
  updatedAt,
  sampleSize,
  assetType = "vehicle",
  className,
}: ValueSourceHintProps) {
  const [open, setOpen] = useState(false);
  const desc = source ? SOURCE_DESCRIPTIONS[source] : null;

  if (!desc) return null;
  const { label, body } = desc(assetType);

  // Stop propagation so tapping the icon doesn't navigate the parent Link.
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen((v) => !v);
  };

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground/80"
        aria-label={`About this value: ${label}`}
      >
        <HelpCircle className="h-3 w-3" strokeWidth={2.25} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.16, ease: EASE }}
            role="tooltip"
            className={cn(
              "absolute left-1/2 top-full z-50 mt-1 w-64 -translate-x-1/2",
              "rounded-lg border border-border/80 bg-popover/98 p-3 text-left shadow-2xl backdrop-blur-md",
            )}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.6px] text-foreground/90">
              {label}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
            <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground/80">
              {updatedAt ? <span>Updated {formatRelative(updatedAt)}</span> : <span />}
              {sampleSize != null && sampleSize > 0 && (
                <span className="tabular-nums">{sampleSize} listings</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
