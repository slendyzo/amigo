"use client";

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Car, ArrowRight } from "lucide-react";
import { VehicleCard, VehicleCardSkeleton, type VehicleCardData } from "@/components/ui/vehicle-card";
import { formatCurrency } from "@/lib/currencies";
import { cn } from "@/lib/utils";

const AddVehicleModal = lazy(() => import("@/components/add-vehicle-modal"));

type ApiAsset = {
  id: string;
  name: string;
  status: "ACTIVE" | "SOLD";
  imageUrl: string | null;
  purchasePriceEur: string | number;
  currentValueEur: string | number | null;
  vehicle: {
    brand: string;
    model: string;
    year: number;
  } | null;
};

type DashboardRwaSectionProps = {
  className?: string;
};

const EASE = [0.16, 1, 0.3, 1] as const;

export default function DashboardRwaSection({ className }: DashboardRwaSectionProps) {
  const [assets, setAssets] = useState<VehicleCardData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const fetchAssets = async () => {
    try {
      const res = await fetch("/api/assets?type=VEHICLE&status=ACTIVE", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { assets: ApiAsset[] };
      setAssets(
        data.assets.map((a) => ({
          id: a.id,
          name: a.name,
          status: a.status,
          imageUrl: a.imageUrl,
          purchasePriceEur: Number(a.purchasePriceEur),
          currentValueEur: a.currentValueEur != null ? Number(a.currentValueEur) : null,
          vehicle: a.vehicle ? { brand: a.vehicle.brand, model: a.vehicle.model, year: a.vehicle.year } : null,
        }))
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

  const totalValue = useMemo(() => {
    if (!assets) return null;
    return assets.reduce((sum, a) => sum + (a.currentValueEur ?? a.purchasePriceEur), 0);
  }, [assets]);

  const handleSuccess = () => fetchAssets();

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-primary/80">
            Real-World Assets
          </p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <h2 className="text-xl font-bold tabular-nums">
              {totalValue != null ? formatCurrency(totalValue, "EUR") : "—"}
            </h2>
            {assets && assets.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {assets.length} {assets.length === 1 ? "vehicle" : "vehicles"}
              </span>
            )}
          </div>
        </div>
        {assets && assets.length > 0 && (
          <Link
            href="/dashboard/networth"
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            View all <ArrowRight className="h-3 w-3" />
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
        <EmptyState onAddClick={() => setShowAdd(true)} error={error} />
      )}

      {assets && assets.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE, delay: i * 0.06 }}
            >
              <VehicleCard vehicle={a} />
            </motion.div>
          ))}
          <AddCard onClick={() => setShowAdd(true)} />
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

function EmptyState({ onAddClick, error }: { onAddClick: () => void; error: string | null }) {
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
        <p className="text-sm font-medium">{error ?? "Add your first vehicle"}</p>
        <p className="text-xs text-muted-foreground">
          {error ? "Try refreshing the page" : "Track its value, mileage, loan, and total cost of ownership"}
        </p>
      </div>
    </button>
  );
}

function AddCard({ onClick }: { onClick: () => void }) {
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
        Add another vehicle
      </p>
    </button>
  );
}
