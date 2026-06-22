"use client";

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Plus, Car, ArrowRight } from "lucide-react";
import { VehicleCard, VehicleCardSkeleton, type VehicleCardData } from "@/components/ui/vehicle-card";
import { PropertyCard, type PropertyCardData } from "@/components/ui/property-card";
import { formatCurrency } from "@/lib/currencies";
import { cn } from "@/lib/utils";

const AddVehicleModal = lazy(() => import("@/components/add-vehicle-modal"));

type ApiAsset = {
  id: string;
  name: string;
  type: "VEHICLE" | "PROPERTY";
  status: "ACTIVE" | "SOLD";
  imageUrl: string | null;
  purchasePriceEur: string | number;
  currentValueEur: string | number | null;
  currentValueSource: string | null;
  currentValueUpdatedAt: string | null;
  vehicle: {
    brand: string;
    model: string;
    year: number;
    vehicleClass?: "CAR" | "MOTORCYCLE" | "BICYCLE";
  } | null;
  property: {
    propertyType: string;
    concelho: string | null;
    address: string | null;
    livableAreaM2: number | null;
    bedrooms: number | null;
    latitude: string | number | null;
    longitude: string | number | null;
  } | null;
};

type RwaCard =
  | { kind: "vehicle"; data: VehicleCardData }
  | { kind: "property"; data: PropertyCardData };

type DashboardRwaSectionProps = {
  className?: string;
};

const EASE = [0.16, 1, 0.3, 1] as const;

export default function DashboardRwaSection({ className }: DashboardRwaSectionProps) {
  const t = useTranslations("rwa");
  const [assets, setAssets] = useState<RwaCard[] | null>(null);
  const [linkedDebt, setLinkedDebt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const fetchAssets = async () => {
    try {
      const [res, liabRes] = await Promise.all([
        fetch("/api/assets?status=ACTIVE", { cache: "no-store" }),
        fetch("/api/liabilities?status=ACTIVE", { cache: "no-store" }),
      ]);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { assets: ApiAsset[] };

      // Only loans linked to an asset net against asset value — standalone debt
      // (credit cards) belongs on the net-worth page, not in this asset tile.
      // Best-effort: a liabilities failure must not sink the whole section.
      if (liabRes.ok) {
        const lj = (await liabRes.json()) as {
          liabilities: Array<{ currentBalanceEur: string | number; realAssetId: string | null }>;
        };
        setLinkedDebt(
          lj.liabilities
            .filter((l) => l.realAssetId)
            .reduce((s, l) => s + Number(l.currentBalanceEur), 0),
        );
      }
      setAssets(
        data.assets.map((a): RwaCard => {
          const common = {
            id: a.id,
            name: a.name,
            status: a.status,
            imageUrl: a.imageUrl,
            purchasePriceEur: Number(a.purchasePriceEur),
            currentValueEur: a.currentValueEur != null ? Number(a.currentValueEur) : null,
            currentValueSource: a.currentValueSource ?? null,
            currentValueUpdatedAt: a.currentValueUpdatedAt ?? null,
          };
          if (a.type === "PROPERTY") {
            return {
              kind: "property",
              data: {
                ...common,
                property: a.property
                  ? {
                      propertyType: a.property.propertyType,
                      concelho: a.property.concelho,
                      address: a.property.address,
                      livableAreaM2: a.property.livableAreaM2,
                      bedrooms: a.property.bedrooms,
                      latitude: a.property.latitude != null ? Number(a.property.latitude) : null,
                      longitude:
                        a.property.longitude != null ? Number(a.property.longitude) : null,
                    }
                  : null,
              },
            };
          }
          return {
            kind: "vehicle",
            data: {
              ...common,
              vehicle: a.vehicle
                ? {
                    brand: a.vehicle.brand,
                    model: a.vehicle.model,
                    year: a.vehicle.year,
                    vehicleClass: a.vehicle.vehicleClass,
                  }
                : null,
            },
          };
        }),
      );
    } catch (e) {
      console.error("[rwa-section] fetch failed:", e);
      setError("Couldn't load assets");
      setAssets([]);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  const grossValue = useMemo(() => {
    if (!assets) return null;
    return assets.reduce(
      (sum, a) => sum + (a.data.currentValueEur ?? a.data.purchasePriceEur),
      0,
    );
  }, [assets]);

  const netEquity = grossValue != null ? grossValue - linkedDebt : null;

  const handleSuccess = () => fetchAssets();

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-primary/80">
            {linkedDebt > 0 ? t("netEquity") : t("section")}
          </p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <h2 className="text-xl font-bold tabular-nums">
              {netEquity != null ? formatCurrency(netEquity, "EUR") : "—"}
            </h2>
          </div>
          {linkedDebt > 0 && netEquity != null && (
            <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
              {t("afterLoans", { amount: formatCurrency(linkedDebt, "EUR") })}
            </p>
          )}
        </div>
        {assets && assets.length > 0 && (
          <Link
            href="/dashboard/networth"
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {t("viewAll")} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {assets === null && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <VehicleCardSkeleton />
          <VehicleCardSkeleton className="hidden sm:block" />
          <VehicleCardSkeleton className="hidden lg:block" />
        </div>
      )}

      {assets && assets.length === 0 && (
        <EmptyState onAddClick={() => setShowAdd(true)} error={error} t={t} />
      )}

      {assets && assets.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((a, i) => (
            <motion.div
              key={a.data.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE, delay: i * 0.06 }}
            >
              {a.kind === "property" ? (
                <PropertyCard property={a.data} />
              ) : (
                <VehicleCard vehicle={a.data} />
              )}
            </motion.div>
          ))}
          <AddCard onClick={() => setShowAdd(true)} t={t} />
        </div>
      )}

      {showAdd && (
        <Suspense fallback={null}>
          <AddVehicleModal isOpen={showAdd} onClose={() => setShowAdd(false)} onSuccess={handleSuccess} />
        </Suspense>
      )}
    </section>
  );
}

function EmptyState({
  onAddClick,
  error,
  t,
}: {
  onAddClick: () => void;
  error: string | null;
  t: (key: string) => string;
}) {
  return (
    <button
      type="button"
      onClick={onAddClick}
      className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/60 bg-muted/20 p-8 text-center transition-colors hover:border-border hover:bg-muted/40"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Car className="h-6 w-6 text-primary" />
      </div>
      <div>
        <p className="text-sm font-medium">{error ?? t("addFirstVehicle")}</p>
        <p className="text-xs text-muted-foreground">
          {error ? "Try refreshing the page" : t("addFirstVehicleDescription")}
        </p>
      </div>
    </button>
  );
}

function AddCard({ onClick, t }: { onClick: () => void; t: (key: string) => string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 bg-muted/10 p-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted transition-colors group-hover:bg-primary/10">
        <Plus className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
      </div>
      <p className="text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
        {t("addAnother")}
      </p>
    </button>
  );
}
