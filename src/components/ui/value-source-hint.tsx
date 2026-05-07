"use client";

// Tiny ? hint icon next to "Estimated value" labels on RWA cards. Hovering
// reveals a popover explaining where the number comes from + when it was
// last refreshed.
//
// Rendered through a Portal with position:fixed so it can escape any
// `overflow-hidden` ancestor (e.g. the rounded card it lives in). We
// recompute coordinates on open + on scroll/resize so it tracks the trigger.
//
// The component sits inside <Link> wrappers, so we stopPropagation on the
// trigger to prevent accidental navigation when the user taps the icon.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;
const POPOVER_WIDTH_PX = 256;
const VIEWPORT_MARGIN_PX = 12;
const HOVER_GRACE_MS = 120;

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

const SOURCE_KEYS: Record<string, string> = {
  live_scrape: "liveScrape",
  web_archive: "webArchive",
  heuristic: "heuristic",
  ai_estimate: "aiEstimate",
  manual: "manual",
  purchase: "purchase",
  stale: "stale",
};

type RelativeKey = "justNow" | "minutes" | "hours" | "days" | "months" | "years";

function formatRelative(iso: string): { key: RelativeKey; count: number } {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return { key: "justNow", count: 0 };
  const min = ms / 60_000;
  if (min < 1) return { key: "justNow", count: 0 };
  if (min < 60) return { key: "minutes", count: Math.round(min) };
  const hr = min / 60;
  if (hr < 24) return { key: "hours", count: Math.round(hr) };
  const day = hr / 24;
  if (day < 30) return { key: "days", count: Math.round(day) };
  const mo = day / 30.44;
  if (mo < 12) return { key: "months", count: Math.round(mo) };
  return { key: "years", count: Math.round(mo / 12) };
}

export function ValueSourceHint({
  source,
  updatedAt,
  sampleSize,
  assetType = "vehicle",
  className,
}: ValueSourceHintProps) {
  const t = useTranslations("rwa.valueSourceHint");
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const sourceKey = source ? SOURCE_KEYS[source] : null;

  const computePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const half = POPOVER_WIDTH_PX / 2;
    const triggerCenter = rect.left + rect.width / 2;
    let left: number;
    if (triggerCenter + half + VIEWPORT_MARGIN_PX > vw) {
      left = Math.max(VIEWPORT_MARGIN_PX, vw - POPOVER_WIDTH_PX - VIEWPORT_MARGIN_PX);
    } else if (triggerCenter - half - VIEWPORT_MARGIN_PX < 0) {
      left = VIEWPORT_MARGIN_PX;
    } else {
      left = triggerCenter - half;
    }
    setCoords({ top: rect.bottom + 6, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    computePosition();
    const onUpdate = () => computePosition();
    window.addEventListener("scroll", onUpdate, true);
    window.addEventListener("resize", onUpdate);
    return () => {
      window.removeEventListener("scroll", onUpdate, true);
      window.removeEventListener("resize", onUpdate);
    };
  }, [open, computePosition]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  if (!sourceKey) return null;

  const cancelClose = () => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), HOVER_GRACE_MS);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen((v) => !v);
  };

  let label: string;
  let body: string;
  if (sourceKey === "liveScrape") {
    label = t("sources.liveScrape.label");
    body = t(`sources.liveScrape.${assetType}Body`);
  } else if (sourceKey === "heuristic") {
    label = t(`sources.heuristic.${assetType}.label`);
    body = t(`sources.heuristic.${assetType}.body`);
  } else {
    label = t(`sources.${sourceKey}.label`);
    body = t(`sources.${sourceKey}.body`);
  }

  let updatedText: string | null = null;
  if (updatedAt) {
    const { key, count } = formatRelative(updatedAt);
    const time = key === "justNow" ? t("relative.justNow") : t(`relative.${key}`, { count });
    updatedText = t("updated", { time });
  }

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={handleClick}
        className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground/80"
        aria-label={label}
      >
        <HelpCircle className="h-3 w-3" strokeWidth={2.25} />
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && coords && (
              <motion.div
                ref={popoverRef}
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.16, ease: EASE }}
                role="tooltip"
                style={{
                  position: "fixed",
                  top: coords.top,
                  left: coords.left,
                  width: POPOVER_WIDTH_PX,
                }}
                className="z-[100] rounded-lg border border-border/80 bg-popover/98 p-3 text-left shadow-2xl backdrop-blur-md"
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
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
                  {updatedText ? <span>{updatedText}</span> : <span />}
                  {sampleSize != null && sampleSize > 0 && (
                    <span className="tabular-nums">{t("listings", { count: sampleSize })}</span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </span>
  );
}
