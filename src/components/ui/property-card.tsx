"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Home, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currencies";

export type PropertyCardData = {
  id: string;
  name: string;
  status: "ACTIVE" | "SOLD";
  imageUrl: string | null;
  purchasePriceEur: number;
  currentValueEur: number | null;
  realizedPnLEur?: number | null;
  monthlyTCOEur?: number | null;
  property: {
    propertyType: string;
    concelho: string | null;
    address: string | null;
    livableAreaM2: number | null;
    bedrooms: number | null;
  } | null;
};

type PropertyCardProps = {
  property: PropertyCardData;
  className?: string;
  href?: string;
};

const SPRING = { type: "spring" as const, stiffness: 400, damping: 28 };

export function PropertyCard({ property, className, href }: PropertyCardProps) {
  const t = useTranslations("rwa");
  const link = href ?? `/dashboard/networth/property/${property.id}`;
  const cost = property.purchasePriceEur;
  const current = property.currentValueEur ?? cost;
  const delta = cost > 0 ? ((current - cost) / cost) * 100 : 0;
  const deltaSign = delta > 0.1 ? "up" : delta < -0.1 ? "down" : "flat";
  const sold = property.status === "SOLD";

  const subtitle = property.property?.concelho ?? property.property?.address ?? null;

  return (
    <Link href={link} className="group block">
      <motion.article
        whileHover={sold ? undefined : { y: -2, scale: 1.005 }}
        transition={SPRING}
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm transition-colors",
          "hover:border-border hover:shadow-md",
          sold && "opacity-70",
          className,
        )}
      >
        <PropertyImage src={property.imageUrl} alt={property.name} />

        <div className="space-y-3 p-4">
          <header className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-semibold leading-tight">
                {property.name}
              </h3>
              {subtitle && (
                <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
            <StatusPill status={property.status} />
          </header>

          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {sold ? t("soldFor") : t("estimatedValue")}
            </p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {formatCurrency(current, "EUR")}
              </span>
              <DeltaBadge delta={delta} sign={deltaSign} sold={sold} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {t("costBasis")} {formatCurrency(cost, "EUR")}
            </p>
          </div>

          {(property.monthlyTCOEur != null || sold) && (
            <footer className="flex items-center justify-between border-t border-border/40 pt-3 text-xs text-muted-foreground">
              {sold && property.realizedPnLEur != null ? (
                <span
                  className={cn(
                    "font-medium tabular-nums",
                    property.realizedPnLEur > 0 ? "text-emerald-500" : "text-rose-500",
                  )}
                >
                  {t("realizedPnL")} {property.realizedPnLEur > 0 ? "+" : ""}
                  {formatCurrency(property.realizedPnLEur, "EUR")}
                </span>
              ) : (
                <span className="tabular-nums">
                  TCO {t("tcoPerMonth", { amount: formatCurrency(property.monthlyTCOEur ?? 0, "EUR") })}
                </span>
              )}
            </footer>
          )}
        </div>
      </motion.article>
    </Link>
  );
}

function PropertyImage({ src, alt }: { src: string | null; alt: string }) {
  if (!src) {
    return (
      <div className="flex aspect-[16/9] w-full items-center justify-center bg-gradient-to-br from-violet-500/10 to-violet-500/5">
        <Home className="h-10 w-10 text-violet-500/60" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <div className="aspect-[16/9] w-full overflow-hidden bg-muted/40">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
      />
    </div>
  );
}

function StatusPill({ status }: { status: "ACTIVE" | "SOLD" }) {
  const t = useTranslations("rwa");
  if (status === "SOLD") {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("sold")}
      </span>
    );
  }
  return null;
}

function DeltaBadge({
  delta,
  sign,
  sold,
}: {
  delta: number;
  sign: "up" | "down" | "flat";
  sold: boolean;
}) {
  if (sold) return null;
  const Icon = sign === "up" ? TrendingUp : sign === "down" ? TrendingDown : Minus;
  const color =
    sign === "up"
      ? "text-emerald-500"
      : sign === "down"
        ? "text-rose-500"
        : "text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium tabular-nums", color)}>
      <Icon className="h-3 w-3" />
      {delta > 0 ? "+" : ""}
      {delta.toFixed(1)}%
    </span>
  );
}
