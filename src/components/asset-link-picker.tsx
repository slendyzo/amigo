"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Car, X } from "lucide-react";

type AssetOption = {
  id: string;
  name: string;
  vehicle: { brand: string; model: string; year: number } | null;
};

type AssetLinkPickerProps = {
  value: string | null;
  onChange: (id: string | null) => void;
  className?: string;
};

export default function AssetLinkPicker({ value, onChange, className }: AssetLinkPickerProps) {
  const t = useTranslations("rwa");
  const [assets, setAssets] = useState<AssetOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/assets?type=VEHICLE&status=ACTIVE")
      .then((r) => (r.ok ? r.json() : { assets: [] }))
      .then((data) => {
        if (cancelled) return;
        const list = (data.assets ?? []).map((a: AssetOption) => ({
          id: a.id,
          name: a.name,
          vehicle: a.vehicle ?? null,
        }));
        setAssets(list);
      })
      .catch(() => !cancelled && setAssets([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (assets === null || assets.length === 0) return null;

  const selected = value ? assets.find((a) => a.id === value) : null;

  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {t("linkedVehicle")}
      </label>
      {selected ? (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-900/40 dark:bg-blue-950/20">
          <div className="flex items-center gap-2">
            <Car className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {selected.vehicle ? `${selected.vehicle.brand} ${selected.vehicle.model}` : selected.name}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded p-1 text-slate-400 hover:bg-blue-100 hover:text-slate-700"
            aria-label={t("unlinkVehicle")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">{t("linkedVehicleNone")}</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.vehicle ? `${a.vehicle.brand} ${a.vehicle.model}` : a.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
