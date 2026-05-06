"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type Expense = {
  date: string;
  amountEur: number;
};

type BurnChartProps = {
  currentMonthExpenses: Expense[];
  previousMonthExpenses: Expense[];
  currentMonthLabel: string;
  previousMonthLabel: string;
  compact?: boolean;
};

export function BurnChart({
  currentMonthExpenses,
  previousMonthExpenses,
  currentMonthLabel,
  previousMonthLabel,
  compact = false,
}: BurnChartProps) {
  const t = useTranslations("dashboard");
  const chartData = useMemo(() => {
    // Create cumulative data for each day of the month (1-31)
    const data: { day: number; current: number | null; previous: number }[] = [];

    // Group expenses by day and calculate cumulative totals
    const currentByDay = new Map<number, number>();
    const previousByDay = new Map<number, number>();

    currentMonthExpenses.forEach((e) => {
      const day = new Date(e.date).getDate();
      currentByDay.set(day, (currentByDay.get(day) || 0) + e.amountEur);
    });

    previousMonthExpenses.forEach((e) => {
      const day = new Date(e.date).getDate();
      previousByDay.set(day, (previousByDay.get(day) || 0) + e.amountEur);
    });

    // Get max day from current month (today or end of month)
    const today = new Date();
    const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const maxDay = Math.min(today.getDate(), currentMonthEnd);

    let currentCumulative = 0;
    let previousCumulative = 0;

    for (let day = 1; day <= 31; day++) {
      currentCumulative += currentByDay.get(day) || 0;
      previousCumulative += previousByDay.get(day) || 0;

      data.push({
        day,
        current: day <= maxDay ? currentCumulative : null,
        previous: previousCumulative,
      });
    }

    // Only show days up to max meaningful day
    const lastPreviousDay = Math.max(...Array.from(previousByDay.keys()), 0);
    const lastDay = Math.max(maxDay, lastPreviousDay, 28);

    return data.slice(0, lastDay);
  }, [currentMonthExpenses, previousMonthExpenses]);

  const lastCurrentEntry = [...chartData].reverse().find((d) => d.current !== null);
  const currentTotal = lastCurrentEntry?.current || 0;
  const previousTotal = chartData[chartData.length - 1]?.previous || 0;
  const difference = currentTotal - previousTotal;
  const percentChange = previousTotal > 0 ? (difference / previousTotal) * 100 : 0;

  if (compact) {
    return (
      <div className="w-full">
        {/* Compact header */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-ink-mute uppercase tracking-wider">{t("chart.spendingVelocity")}</p>
          <div className="text-right">
            <span className={`text-[12px] font-bold ${difference > 0 ? "text-crimson" : "text-moss"}`}>
              {difference > 0 ? "+" : ""}€{difference.toFixed(2)}
            </span>
            <p className="text-[10px] text-ink-faint">
              {t("chart.vsLastMonth", { percent: `${percentChange > 0 ? "+" : ""}${percentChange.toFixed(1)}` })}
            </p>
          </div>
        </div>
        {/* Compact chart */}
        <div className="h-24 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 2, right: 4, left: 4, bottom: 2 }}>
              <Line type="monotone" dataKey="previous" stroke="var(--ink-faint)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="previous" />
              <Line type="monotone" dataKey="current" stroke="var(--forest)" strokeWidth={2} dot={false} name="current" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {/* Compact legend */}
        <div className="flex items-center justify-center gap-4 mt-1">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-forest rounded" />
            <span className="text-[10px] text-ink-mute">{currentMonthLabel}: €{currentTotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ backgroundImage: "repeating-linear-gradient(90deg, var(--ink-faint), var(--ink-faint) 3px, transparent 3px, transparent 6px)" }} />
            <span className="text-[10px] text-ink-mute">{previousMonthLabel}: €{previousTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Summary */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-ink">{t("chart.spendingVelocity")}</h3>
          <p className="text-sm text-ink-mute">{t("chart.cumulativeComparison")}</p>
        </div>
        <div className="text-right">
          <p className={`text-lg font-semibold ${difference > 0 ? "text-crimson" : "text-moss"}`}>
            {difference > 0 ? "+" : ""}€{difference.toFixed(2)}
          </p>
          <p className="text-sm text-ink-mute">
            {t("chart.vsLastMonth", { percent: `${percentChange > 0 ? "+" : ""}${percentChange.toFixed(1)}` })}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--rule)" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 12, fill: "var(--ink-mute)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--rule)" }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "var(--ink-mute)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--rule)" }}
              tickFormatter={(value) => `€${value}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--paper-deep)",
                border: "1px solid var(--rule)",
                borderRadius: "10px",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
              formatter={(value, name) => [
                value === null ? "—" : `€${Number(value ?? 0).toFixed(2)}`,
                name === "current" ? currentMonthLabel : previousMonthLabel,
              ]}
              labelFormatter={(day) => t("chart.day", { day })}
            />
            <Legend
              formatter={(value) =>
                value === "current" ? currentMonthLabel : previousMonthLabel
              }
            />
            <Line
              type="monotone"
              dataKey="previous"
              stroke="var(--ink-faint)"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="previous"
            />
            <Line
              type="monotone"
              dataKey="current"
              stroke="var(--forest)"
              strokeWidth={3}
              dot={false}
              name="current"
              activeDot={{ r: 6, fill: "var(--forest)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-2">
        <div className="flex items-center gap-2">
          <div className="w-4 h-1 bg-forest rounded" />
          <span className="text-sm text-ink-soft">{currentMonthLabel}: €{currentTotal.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-1 rounded" style={{ backgroundImage: "repeating-linear-gradient(90deg, var(--ink-faint), var(--ink-faint) 4px, transparent 4px, transparent 8px)" }} />
          <span className="text-sm text-ink-soft">{previousMonthLabel}: €{previousTotal.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
