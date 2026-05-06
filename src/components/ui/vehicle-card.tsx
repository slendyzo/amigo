"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Car, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currencies";
import { ValueSourceHint } from "@/components/ui/value-source-hint";

export type VehicleCardData = {
  id: string;
  name: string;
  status: "ACTIVE" | "SOLD";
  imageUrl: string | null;
  purchasePriceEur: number;
  currentValueEur: number | null;
  currentValueSource?: string | null;
  currentValueUpdatedAt?: string | null;
  realizedPnLEur?: number | null;
  monthlyTCOEur?: number | null;
  vehicle: {
    brand: string;
    model: string;
    year: number;
    vehicleClass?: "CAR" | "MOTORCYCLE";
  } | null;
};

type VehicleCardProps = {
  vehicle: VehicleCardData;
  className?: string;
  href?: string;
};

const SPRING = { type: "spring" as const, stiffness: 400, damping: 28 };

export function VehicleCard({ vehicle, className, href }: VehicleCardProps) {
  const t = useTranslations("rwa");
  const link = href ?? `/dashboard/networth/vehicle/${vehicle.id}`;
  const cost = vehicle.purchasePriceEur;
  const current = vehicle.currentValueEur ?? cost;
  const delta = cost > 0 ? ((current - cost) / cost) * 100 : 0;
  const deltaSign = delta > 0.1 ? "up" : delta < -0.1 ? "down" : "flat";
  const sold = vehicle.status === "SOLD";
  const isMoto = vehicle.vehicle?.vehicleClass === "MOTORCYCLE";

  return (
    <Link href={link} className="group block">
      <motion.article
        whileHover={sold ? undefined : { y: -2, scale: 1.005 }}
        transition={SPRING}
        className={cn(
          "relative overflow-hidden rounded-md border border-rule bg-card transition-colors",
          "hover:border-rule-strong",
          sold && "opacity-70",
          className
        )}
      >
        <VehicleImage src={vehicle.imageUrl} alt={vehicle.name} isMoto={isMoto} />

        <div className="space-y-3 p-4">
          <header className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-semibold leading-tight">
                {vehicle.vehicle ? `${vehicle.vehicle.brand} ${vehicle.vehicle.model}` : vehicle.name}
              </h3>
              {vehicle.vehicle && (
                <p className="text-xs text-muted-foreground">{vehicle.vehicle.year}</p>
              )}
            </div>
            <StatusPill status={vehicle.status} />
          </header>

          <div>
            <div className="flex items-center gap-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {sold ? t("soldFor") : t("estimatedValue")}
              </p>
              {!sold && (
                <ValueSourceHint
                  source={vehicle.currentValueSource ?? null}
                  updatedAt={vehicle.currentValueUpdatedAt ?? null}
                  assetType="vehicle"
                />
              )}
            </div>
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

          {(vehicle.monthlyTCOEur != null || sold) && (
            <footer className="flex items-center justify-between border-t border-border/40 pt-3 text-xs text-muted-foreground">
              {sold && vehicle.realizedPnLEur != null ? (
                <span
                  className={cn(
                    "font-medium tabular-nums",
                    vehicle.realizedPnLEur > 0 ? "text-moss" : "text-crimson"
                  )}
                >
                  {t("realizedPnL")} {vehicle.realizedPnLEur > 0 ? "+" : ""}
                  {formatCurrency(vehicle.realizedPnLEur, "EUR")}
                </span>
              ) : (
                <span className="tabular-nums">
                  TCO {t("tcoPerMonth", { amount: formatCurrency(vehicle.monthlyTCOEur ?? 0, "EUR") })}
                </span>
              )}
            </footer>
          )}
        </div>
      </motion.article>
    </Link>
  );
}

function VehicleImage({ src, alt, isMoto }: { src: string | null; alt: string; isMoto?: boolean }) {
  if (!src) {
    return (
      <div className="flex aspect-[16/9] max-h-[200px] w-full items-center justify-center bg-gradient-to-br from-muted/40 to-muted/10">
        {isMoto ? (
          <span className="text-4xl opacity-50" aria-hidden>🏍️</span>
        ) : (
          <Car className="h-10 w-10 text-muted-foreground/50" strokeWidth={1.5} />
        )}
      </div>
    );
  }
  return (
    <div className="aspect-[16/9] max-h-[200px] w-full overflow-hidden bg-muted/40">
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
  if (status === "SOLD") {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Sold
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
      ? "text-moss"
      : sign === "down"
        ? "text-crimson"
        : "text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium tabular-nums", color)}>
      <Icon className="h-3 w-3" />
      {delta > 0 ? "+" : ""}
      {delta.toFixed(1)}%
    </span>
  );
}

export function VehicleCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-rule bg-card",
        className
      )}
    >
      <div className="aspect-[16/9] w-full animate-pulse bg-muted/40" />
      <div className="space-y-3 p-4">
        <div className="h-5 w-2/3 animate-pulse rounded bg-muted/60" />
        <div className="h-7 w-1/2 animate-pulse rounded bg-muted/60" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted/40" />
      </div>
    </div>
  );
}
