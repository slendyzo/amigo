"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Car, Home, X } from "lucide-react";

type AssetOption = {
  id: string;
  name: string;
  type: "VEHICLE" | "PROPERTY";
  vehicle: { brand: string; model: string; year: number } | null;
  property: { propertyType: string; concelho: string | null } | null;
};

type AssetLinkPickerProps = {
  value: string | null;
  onChange: (id: string | null) => void;
  className?: string;
};

function displayName(a: AssetOption): string {
  if (a.type === "VEHICLE" && a.vehicle) return `${a.vehicle.brand} ${a.vehicle.model}`;
  if (a.type === "PROPERTY" && a.property?.concelho) return `${a.name} · ${a.property.concelho}`;
  return a.name;
}

export default function AssetLinkPicker({ value, onChange, className }: AssetLinkPickerProps) {
  const t = useTranslations("rwa");
  const [assets, setAssets] = useState<AssetOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/assets?status=ACTIVE")
      .then((r) => (r.ok ? r.json() : { assets: [] }))
      .then((data) => {
        if (cancelled) return;
        const list = (data.assets ?? []).map((a: AssetOption) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          vehicle: a.vehicle ?? null,
          property: a.property ?? null,
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
  const SelectedIcon = selected?.type === "PROPERTY" ? Home : Car;

  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--ink-subtle)]">
        {t("linkedAsset")}
      </label>
      {selected ? (
        <div className="flex items-center justify-between rounded-lg border border-[var(--accent-soft)] bg-[var(--accent-tint)] px-3 py-2">
          <div className="flex items-center gap-2">
            <SelectedIcon className="h-4 w-4 text-[var(--accent)]" />
            <span className="text-sm font-medium text-[var(--ink)]">
              {displayName(selected)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded p-1 text-[var(--ink-subtle)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink-muted)]"
            aria-label={t("unlinkAsset")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm"
        >
          <option value="">{t("linkedAssetNone")}</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {displayName(a)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
