"use client";

// Shared hero card for RWA detail pages (vehicle, motorcycle, property).
//
// Visual grammar:
//   • Side-by-side image + info on desktop (md+); stacked on mobile
//   • Image column capped at 360px on desktop so the row never gets taller
//     than the info content, even with a tall portrait
//   • Info column has a title block at the top and a 2-stat × 2-row stats
//     grid at the bottom, separated by a hairline divider
//   • Stats grid always renders 4 cells; callers MUST pass exactly 4 stats
//
// Why this exists: keeping the layout in one place is the only way to
// guarantee parity between vehicle and property. The previous setup
// duplicated the JSX and the vehicle copy was missing pieces in ways that
// were silent until users complained.

import { cn } from "@/lib/utils";

export type HeroStat = {
  label: string;
  value: string;
  hint?: React.ReactNode;
  accent?: React.ReactNode;
  valueClass?: string;
  /** When set, the value renders as a button with subtle hover-underline. */
  onValueClick?: () => void;
  valueAriaLabel?: string;
};

export type AssetHeroProps = {
  /** The image content (img element, icon, map fallback). The cell wrapper
   *  with aspect ratio + gradient background is applied here. */
  imageNode: React.ReactNode;
  /** Optional override for the image cell's gradient (asset-class accent). */
  imageBgClass?: string;
  /** Greys out + dims the image when the asset is sold. */
  sold?: boolean;
  /** Optional badge rendered in the top-left of the image (e.g. "Sold on …"). */
  imageBadge?: React.ReactNode;

  /** Small uppercase line above the heading ("2025" or "Apartment · 2004"). */
  eyebrow: React.ReactNode;
  heading: React.ReactNode;
  subtitle?: React.ReactNode;
  chips?: React.ReactNode;
  /** Kebab + dropdown markup (sell / edit / delete actions). */
  menu?: React.ReactNode;

  /** Exactly 4 stats — they fill a 2x2 grid below the title block. */
  stats: [HeroStat, HeroStat, HeroStat, HeroStat];
};

export function AssetHero({
  imageNode,
  imageBgClass,
  sold = false,
  imageBadge,
  eyebrow,
  heading,
  subtitle,
  chips,
  menu,
  stats,
}: AssetHeroProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/80 backdrop-blur-sm">
      <div className="grid md:grid-cols-[1.4fr_1fr] md:max-h-[360px]">
        {/* Image cell */}
        <div
          className={cn(
            "relative aspect-[16/10] w-full md:aspect-auto md:h-full",
            imageBgClass ?? "bg-gradient-to-br from-muted/40 to-muted/10",
            sold && "opacity-70 grayscale",
          )}
        >
          {imageNode}
          {imageBadge && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-card/95 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm backdrop-blur-sm">
              {imageBadge}
            </span>
          )}
        </div>

        {/* Info column */}
        <div className="flex min-w-0 flex-col justify-between p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
              <h1 className="mt-0.5 truncate text-2xl font-bold leading-tight md:text-[26px]">
                {heading}
              </h1>
              {subtitle && (
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>
              )}
              {chips && <div className="mt-2.5 flex flex-wrap gap-1.5">{chips}</div>}
            </div>
            {menu && <div className="relative shrink-0">{menu}</div>}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/40 pt-4 md:mt-3 md:pt-3">
            {stats.map((s, i) => (
              <HeroStatCell key={i} {...s} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroStatCell({
  label,
  value,
  hint,
  accent,
  valueClass,
  onValueClick,
  valueAriaLabel,
}: HeroStat) {
  const valueClasses = cn(
    "truncate text-base font-semibold tabular-nums md:text-lg",
    valueClass,
  );
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {hint}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        {onValueClick ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onValueClick();
            }}
            className={cn(
              valueClasses,
              "cursor-pointer rounded-sm decoration-muted-foreground/40 underline-offset-4 transition-all hover:underline hover:decoration-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40",
            )}
            aria-label={valueAriaLabel}
          >
            {value}
          </button>
        ) : (
          <p className={valueClasses}>{value}</p>
        )}
        {accent}
      </div>
    </div>
  );
}
