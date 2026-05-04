"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { usePortfolioCurrency } from "./portfolio-currency-context";

interface Snapshot {
  date: string;
  totalValueEur: number;
  totalCostEur: number;
}

interface PerformanceChartProps {
  initialRange?: string;
}

type RangeKey = "1w" | "1m" | "3m" | "6m" | "1y" | "all";

const RANGES: RangeKey[] = ["1w", "1m", "3m", "6m", "1y", "all"];

const RANGE_LABEL_KEYS: Record<RangeKey, string> = {
  "1w": "range1w",
  "1m": "range1m",
  "3m": "range3m",
  "6m": "range6m",
  "1y": "range1y",
  "all": "rangeAll",
};

function formatDateLabel(dateStr: string, range: RangeKey): string {
  const date = new Date(dateStr);
  if (range === "1w" || range === "1m") {
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  }
  return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  label?: string;
  range: RangeKey;
  formatAmount: (eurAmount: number) => string;
}

function CustomTooltip({ active, payload, label, range, formatAmount }: CustomTooltipProps) {
  if (!active || !payload?.length || !label) return null;

  const portfolioEntry = payload.find((p) => p.name === "totalValueEur");
  const costEntry = payload.find((p) => p.name === "totalCostEur");
  const portfolioValue = portfolioEntry?.value ?? 0;
  const costValue = costEntry?.value ?? 0;
  const pnl = portfolioValue - costValue;

  const date = new Date(label);
  const dateLabel =
    range === "1w" || range === "1m"
      ? date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
      : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="bg-slate-900 text-white text-xs rounded-xl px-3 py-2.5 shadow-xl border border-slate-700/50 min-w-[160px]">
      <p className="text-slate-400 mb-2">{dateLabel}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2 h-2 rounded-full bg-[#0070f3]" />
            Value
          </span>
          <span className="font-semibold">{formatAmount(portfolioValue)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2 h-0.5 rounded bg-slate-400" />
            Cost
          </span>
          <span className="text-slate-300">{formatAmount(costValue)}</span>
        </div>
        <div className="flex items-center justify-between gap-4 pt-1 mt-1 border-t border-slate-700">
          <span className="text-slate-300">P&amp;L</span>
          <span className={`font-semibold ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {pnl >= 0 ? "+" : ""}{formatAmount(pnl)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function PerformanceChart({ initialRange = "1m" }: PerformanceChartProps) {
  const t = useTranslations("portfolio");
  const { formatAmount, formatAxis } = usePortfolioCurrency();
  const [range, setRange] = useState<RangeKey>(initialRange as RangeKey);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSnapshots = useCallback(async (r: RangeKey) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portfolio/snapshots?range=${r}`);
      if (!res.ok) {
        setSnapshots([]);
        return;
      }
      const json = await res.json();
      const data: Snapshot[] = json.snapshots ?? json;
      setSnapshots(Array.isArray(data) ? data : []);
    } catch {
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshots(range);
  }, [range, fetchSnapshots]);

  const handleRangeChange = (r: RangeKey) => {
    setRange(r);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t("performance")}
        </h3>
        {/* Range selector pills */}
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => handleRangeChange(r)}
              className={`px-3 py-1 text-xs rounded-full font-medium transition-all duration-200 ${
                range === r
                  ? "bg-[#0070f3] text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {t(RANGE_LABEL_KEYS[r])}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      {loading ? (
        <div className="h-[280px] w-full">
          {/* Skeleton */}
          <div className="h-full w-full rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
        </div>
      ) : snapshots.length < 2 ? (
        <div className="h-[280px] flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 gap-2">
          <svg className="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-sm">Not enough data yet</p>
        </div>
      ) : (
        <>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={snapshots}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gradPortfolio" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0070f3" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#0070f3" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#94a3b8" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#94a3b8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                  className="dark:[stroke:#334155]"
                  vertical={false}
                />

                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => formatDateLabel(d, range)}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />

                <YAxis
                  tickFormatter={(v) => formatAxis(v)}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
                  width={58}
                />

                <Tooltip
                  content={<CustomTooltip range={range} formatAmount={formatAmount} />}
                  cursor={{ stroke: "#0070f3", strokeWidth: 1, strokeDasharray: "4 4" }}
                />

                {/* Cost basis — dashed line drawn as an area with no fill */}
                <Area
                  type="monotone"
                  dataKey="totalCostEur"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  fill="url(#gradCost)"
                  dot={false}
                  activeDot={false}
                  name="totalCostEur"
                />

                {/* Portfolio value — solid filled area on top */}
                <Area
                  type="monotone"
                  dataKey="totalValueEur"
                  stroke="#0070f3"
                  strokeWidth={2.5}
                  fill="url(#gradPortfolio)"
                  dot={false}
                  activeDot={{ r: 5, fill: "#0070f3", strokeWidth: 2, stroke: "#fff" }}
                  name="totalValueEur"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Chart legend */}
          <div className="flex items-center justify-center gap-5 mt-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="block w-4 h-[2px] bg-[#0070f3] rounded" />
              {t("totalValue")}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span
                className="block w-4 h-[2px] bg-slate-400 rounded"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg, #94a3b8, #94a3b8 4px, transparent 4px, transparent 8px)",
                }}
              />
              {t("totalCost")}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
