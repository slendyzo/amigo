"use client";

// Modal that explains how an asset's currentValue was computed: shows the
// listings (with median, sample size, sources, scrape date, filter applied)
// behind a live_scrape or web_archive valuation. Linked to the headline
// "Estimated value" on RWA detail pages.
//
// Layout: bottom sheet on mobile, centered modal on desktop.

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, Loader2, X } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/currencies";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;
const MAX_VISIBLE = 50;

type Listing = {
  price: number;
  currency: string;
  source: string;
  url: string | null;
  urlStatus: "alive" | "dead" | "unknown";
  propertyType?: string | null;
  areaM2?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  location?: string | null;
  year?: number | null;
  mileage?: number | null;
  trim?: string | null;
};

type UserAsset =
  | {
      assetType: "property";
      propertyType: string;
      areaM2: number | null;
      bedrooms: number | null;
      location: string | null;
    }
  | {
      assetType: "vehicle";
      year: number;
      brand: string;
      model: string;
      trim: string | null;
      mileage: number | null;
    };

type Summary = {
  medianEur: number;
  sampleSize: number;
  totalCount: number;
  sources: string[];
  scrapedAt: string;
  filter: "area" | "mileage" | "none";
  userAsset: UserAsset;
};

type Payload =
  | { available: false; reason?: string }
  | { available: true; summary: Summary; listings: Listing[] };

export type ComparablesModalProps = {
  assetId: string;
  currentValueEur: number;
  isOpen: boolean;
  onClose: () => void;
};

const SOURCE_LABELS: Record<string, string> = {
  idealista: "Idealista",
  imovirtual: "Imovirtual",
  standvirtual: "Standvirtual",
  olx: "OLX",
  web_archive: "Web Archive",
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

function propertyTypeKey(t: string): string {
  // Maps APARTMENT → "T2 Apartamento" etc. via i18n.
  return `propertyTypeOption.${t}`;
}

export function ComparablesModal({
  assetId,
  currentValueEur,
  isOpen,
  onClose,
}: ComparablesModalProps) {
  const t = useTranslations("rwa.comparables");
  const tRwa = useTranslations("rwa");
  const formatter = useFormatter();
  const locale = useLocale();

  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setData(null);
    setError(null);
    setShowAll(false);
    (async () => {
      try {
        const res = await fetch(`/api/assets/${assetId}/comparables`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Payload;
        if (cancelled) return;
        setData(json);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, assetId]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-card shadow-2xl md:max-h-[80vh] md:rounded-2xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-border/40 px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">
                  {t("title", { value: formatCurrency(currentValueEur, "EUR") })}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("subtitle")}</p>
              </div>
              <button
                onClick={onClose}
                className="-mr-1 rounded-lg p-1 text-muted-foreground hover:bg-muted"
                aria-label={t("closeButton")}
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {data == null && error == null && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-500">
                  {t("loadError")}
                </div>
              )}

              {data?.available === false && (
                <div className="rounded-xl bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                  {t("empty")}
                </div>
              )}

              {data?.available === true && (
                <>
                  <SummaryBar
                    summary={data.summary}
                    locale={locale}
                    formatter={formatter}
                    t={t}
                  />
                  <UserReference summary={data.summary} t={t} tRwa={tRwa} />

                  <ul className="mt-3 divide-y divide-border/40 rounded-xl border border-border/40 bg-card/80">
                    {(showAll ? data.listings : data.listings.slice(0, MAX_VISIBLE)).map(
                      (l, i) => (
                        <ListingRow
                          key={i}
                          listing={l}
                          isVehicle={data.summary.userAsset.assetType === "vehicle"}
                          t={t}
                          tRwa={tRwa}
                        />
                      ),
                    )}
                  </ul>

                  {data.listings.length > MAX_VISIBLE && (
                    <button
                      onClick={() => setShowAll((v) => !v)}
                      className="mt-3 w-full rounded-lg border border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    >
                      {showAll
                        ? t("showLess")
                        : t("showAll", { n: data.listings.length })}
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function SummaryBar({
  summary,
  locale,
  formatter,
  t,
}: {
  summary: Summary;
  locale: string;
  formatter: ReturnType<typeof useFormatter>;
  t: ReturnType<typeof useTranslations<"rwa.comparables">>;
}) {
  void locale;
  const dateStr = formatter.dateTime(new Date(summary.scrapedAt), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const filterCopy =
    summary.filter === "area"
      ? t("summaryFilterArea")
      : summary.filter === "mileage"
        ? t("summaryFilterMileage")
        : t("summaryFilterNone");
  const sourcesStr = summary.sources.map(sourceLabel).join(" + ");

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.8px] text-muted-foreground">
          {t("medianHeader")}
        </span>
        <span className="text-lg font-semibold tabular-nums">
          {formatCurrency(summary.medianEur, "EUR")}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("summarySampleSize", { count: summary.sampleSize })}
        {" · "}
        {t("summarySources", { sources: sourcesStr })}
        {" · "}
        {filterCopy}
        {" · "}
        {t("summaryDate", { date: dateStr })}
      </p>
    </div>
  );
}

function UserReference({
  summary,
  t,
  tRwa,
}: {
  summary: Summary;
  t: ReturnType<typeof useTranslations<"rwa.comparables">>;
  tRwa: ReturnType<typeof useTranslations<"rwa">>;
}) {
  const ua = summary.userAsset;
  let ref: string;
  if (ua.assetType === "property") {
    const typeLabel = safeTranslate(tRwa, propertyTypeKey(ua.propertyType), ua.propertyType);
    if (ua.areaM2 != null && ua.bedrooms != null) {
      ref = t("listingPropertyShape", { type: typeLabel, area: ua.areaM2, bedrooms: ua.bedrooms });
    } else if (ua.areaM2 != null) {
      ref = t("listingPropertyShapeNoBedrooms", { type: typeLabel, area: ua.areaM2 });
    } else {
      ref = t("listingPropertyTypeOnly", { type: typeLabel });
    }
    if (ua.location) ref = `${ref} · ${ua.location}`;
  } else {
    if (ua.trim && ua.mileage != null) {
      ref = t("listingVehicleShape", { year: ua.year, mileage: ua.mileage, trim: ua.trim });
    } else if (ua.mileage != null) {
      ref = t("listingVehicleShapeNoTrim", { year: ua.year, mileage: ua.mileage });
    } else {
      ref = t("listingVehicleShapeYearOnly", { year: ua.year });
    }
    ref = `${ua.brand} ${ua.model} · ${ref}`;
  }
  return (
    <p className="mt-3 text-xs text-muted-foreground">
      {t("userReference", { ref })}
    </p>
  );
}

function ListingRow({
  listing,
  isVehicle,
  t,
  tRwa,
}: {
  listing: Listing;
  isVehicle: boolean;
  t: ReturnType<typeof useTranslations<"rwa.comparables">>;
  tRwa: ReturnType<typeof useTranslations<"rwa">>;
}) {
  const dead = listing.urlStatus === "dead";

  let primaryLabel: string;
  if (isVehicle) {
    if (listing.trim && listing.mileage != null && listing.year != null) {
      primaryLabel = t("listingVehicleShape", {
        year: listing.year,
        mileage: listing.mileage,
        trim: listing.trim,
      });
    } else if (listing.mileage != null && listing.year != null) {
      primaryLabel = t("listingVehicleShapeNoTrim", {
        year: listing.year,
        mileage: listing.mileage,
      });
    } else if (listing.year != null) {
      primaryLabel = t("listingVehicleShapeYearOnly", { year: listing.year });
    } else {
      primaryLabel = "—";
    }
  } else {
    const typeLabel = listing.propertyType
      ? safeTranslate(tRwa, propertyTypeKey(listing.propertyType), listing.propertyType)
      : "";
    if (typeLabel && listing.areaM2 != null && listing.bedrooms != null) {
      primaryLabel = t("listingPropertyShape", {
        type: typeLabel,
        area: listing.areaM2,
        bedrooms: listing.bedrooms,
      });
    } else if (typeLabel && listing.areaM2 != null) {
      primaryLabel = t("listingPropertyShapeNoBedrooms", {
        type: typeLabel,
        area: listing.areaM2,
      });
    } else if (listing.areaM2 != null) {
      primaryLabel = t("listingPropertyShapeAreaOnly", { area: listing.areaM2 });
    } else if (typeLabel) {
      primaryLabel = t("listingPropertyTypeOnly", { type: typeLabel });
    } else {
      primaryLabel = "—";
    }
  }

  const subtle = listing.location ?? null;

  const sourceName = sourceLabel(listing.source);

  const Inner = (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 text-sm",
        dead ? "opacity-60" : listing.url ? "transition-colors hover:bg-muted/40" : "",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{primaryLabel}</p>
        {subtle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtle}</p>}
      </div>
      <div className="text-right">
        <p className="font-semibold tabular-nums">
          {formatCurrency(listing.price, listing.currency || "EUR")}
        </p>
        <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {dead ? t("listingDead") : sourceName}
          {!dead && listing.url && <ExternalLink className="h-2.5 w-2.5" />}
        </p>
      </div>
    </div>
  );

  if (listing.url && !dead) {
    return (
      <li>
        <a
          href={listing.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block focus:outline-none focus:ring-2 focus:ring-primary/40"
          aria-label={t("openListing")}
        >
          {Inner}
        </a>
      </li>
    );
  }
  return <li>{Inner}</li>;
}

// Translation lookup that falls back to the raw key when not present.
// Used for property-type labels that may not have an i18n entry yet.
function safeTranslate<T extends ReturnType<typeof useTranslations<string>>>(
  fn: T,
  key: string,
  fallback: string,
): string {
  try {
    const v = (fn as unknown as (k: string) => string)(key);
    if (typeof v !== "string" || v === key) return fallback;
    return v;
  } catch {
    return fallback;
  }
}
