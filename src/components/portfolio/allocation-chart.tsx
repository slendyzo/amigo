"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

interface Asset {
  symbol: string;
  name: string;
  assetType: string;
  currentValueEur: number;
  exchange: { provider: string; label: string };
}

interface AllocationChartProps {
  assets: Asset[];
  freeCashEur?: number;
}

// Segmented allocation bar (ref 2d): maps the app's asset-type grouping onto
// three buckets — Crypto (CRYPTO), ETFs (ETF + STOCK securities) and Cash
// (aggregated free cash across connections).
export function AllocationChart({ assets, freeCashEur = 0 }: AllocationChartProps) {
  const t = useTranslations("portfolio");

  const segments = useMemo(() => {
    let crypto = 0;
    let etfs = 0;
    for (const a of assets) {
      if (a.currentValueEur <= 0) continue;
      if (a.assetType === "CRYPTO") crypto += a.currentValueEur;
      else etfs += a.currentValueEur; // ETF, STOCK, and any other security
    }
    const cash = Math.max(0, freeCashEur);
    const total = crypto + etfs + cash;
    return [
      { key: "crypto", label: t("allocationCrypto"), value: crypto, color: "var(--accent)" },
      { key: "etfs", label: t("allocationEtfs"), value: etfs, color: "var(--accent-soft)" },
      { key: "cash", label: t("allocationCash"), value: cash, color: "var(--accent-fainter)" },
    ]
      .map((s) => ({ ...s, pct: total > 0 ? (s.value / total) * 100 : 0 }))
      .filter((s) => s.value > 0);
  }, [assets, freeCashEur, t]);

  if (segments.length === 0) return null;

  return (
    <div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-[5px]">
        {segments.map((s) => (
          <div key={s.key} style={{ width: `${s.pct}%`, background: s.color }} />
        ))}
      </div>
      <div
        className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] tabular-nums"
        style={{ color: "var(--ink-muted)" }}
      >
        {segments.map((s) => (
          <span key={s.key} className="inline-flex items-center">
            <span
              className="mr-[5px] inline-block h-2 w-2 rounded-[2px]"
              style={{ background: s.color }}
            />
            {s.label} {Math.round(s.pct)}%
          </span>
        ))}
      </div>
    </div>
  );
}
