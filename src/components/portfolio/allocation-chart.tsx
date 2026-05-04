"use client";

import { useMemo, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { usePortfolioCurrency } from "./portfolio-currency-context";

interface Asset {
  symbol: string;
  name: string;
  assetType: string;
  currentValueEur: number;
  exchange: { provider: string; label: string };
}

interface AllocationChartProps {
  assets: Asset[];
}

type ViewMode = "asset" | "exchange" | "type";

const PALETTE = [
  "#0070f3", // blue
  "#8b5cf6", // purple
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#6366f1", // indigo
  "#84cc16", // lime
  "#f97316", // orange
];

const TYPE_COLORS: Record<string, string> = {
  CRYPTO: "#f59e0b",  // amber-500
  ETF: "#0070f3",     // blue-500
  STOCK: "#8b5cf6",   // purple-500
};

interface SliceEntry {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SliceEntry & { percentage: number } }>;
  formatAmount: (eurAmount: number) => string;
}

function CustomTooltip({ active, payload, formatAmount }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  return (
    <div className="bg-slate-900 text-white text-xs rounded-xl px-3 py-2.5 shadow-lg border border-slate-700/50 min-w-[140px]">
      <p className="font-semibold mb-1 truncate">{entry.name}</p>
      <p className="text-slate-300">{formatAmount(entry.value)}</p>
      <p className="text-slate-400 mt-0.5">{entry.percentage.toFixed(1)}%</p>
    </div>
  );
}

export function AllocationChart({ assets }: AllocationChartProps) {
  const t = useTranslations("portfolio");
  const { formatAmount } = usePortfolioCurrency();
  const [view, setView] = useState<ViewMode>("asset");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const tabs: { key: ViewMode; label: string }[] = [
    { key: "asset", label: t("byAsset") },
    { key: "exchange", label: t("byExchange") },
    { key: "type", label: t("byType") },
  ];

  const slices = useMemo((): SliceEntry[] => {
    const total = assets.reduce((s, a) => s + a.currentValueEur, 0);
    if (total === 0) return [];

    if (view === "asset") {
      // Dedupe by symbol — BTC on multiple exchanges = one slice
      const bySymbol = new Map<string, number>();
      for (const a of assets) {
        if (a.currentValueEur <= 0) continue;
        bySymbol.set(a.symbol, (bySymbol.get(a.symbol) ?? 0) + a.currentValueEur);
      }
      return Array.from(bySymbol.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([symbol, value], i) => ({
          name: symbol,
          value,
          color: PALETTE[i % PALETTE.length],
        }));
    }

    if (view === "exchange") {
      const map = new Map<string, { label: string; value: number }>();
      assets.forEach((a) => {
        const key = a.exchange.provider;
        const existing = map.get(key);
        if (existing) {
          existing.value += a.currentValueEur;
        } else {
          map.set(key, { label: a.exchange.label, value: a.currentValueEur });
        }
      });
      return Array.from(map.values())
        .filter((e) => e.value > 0)
        .map((e, i) => ({
          name: e.label,
          value: e.value,
          color: PALETTE[i % PALETTE.length],
        }));
    }

    // by type
    const map = new Map<string, number>();
    assets.forEach((a) => {
      map.set(a.assetType, (map.get(a.assetType) ?? 0) + a.currentValueEur);
    });
    return Array.from(map.entries())
      .filter(([, v]) => v > 0)
      .map(([type, value]) => ({
        name: type,
        value,
        color: TYPE_COLORS[type] ?? PALETTE[0],
      }));
  }, [assets, view]);

  const total = slices.reduce((s, sl) => s + sl.value, 0);

  const slicesWithPct = useMemo(
    () => slices.map((sl) => ({ ...sl, percentage: total > 0 ? (sl.value / total) * 100 : 0 })),
    [slices, total]
  );

  const handleMouseEnter = useCallback((_: unknown, index: number) => {
    setActiveIndex(index);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setActiveIndex(null);
  }, []);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t("allocation")}
        </h3>
        {/* View toggle tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-all duration-200 ${
                view === key
                  ? "bg-[#0070f3] text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {slicesWithPct.length === 0 ? (
        <div className="h-[280px] flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
          {t("noAssets")}
        </div>
      ) : (
        <>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slicesWithPct}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  onMouseEnter={handleMouseEnter}
                  onMouseLeave={handleMouseLeave}
                >
                  {slicesWithPct.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      opacity={activeIndex === null || activeIndex === index ? 1 : 0.5}
                      stroke="transparent"
                      style={{ cursor: "pointer", transition: "opacity 0.2s" }}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip formatAmount={formatAmount} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="mt-3 space-y-2">
            {slicesWithPct.map((entry, index) => (
              <div
                key={index}
                className="flex items-center justify-between text-xs"
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-slate-600 dark:text-slate-400 truncate">{entry.name}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {formatAmount(entry.value)}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 w-10 text-right">
                    {entry.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
