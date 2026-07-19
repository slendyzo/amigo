"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  LineChart,
  Line,
  Area,
  ComposedChart,
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

    // Show the WHOLE month on the axis: the current line stops at today (null
    // after), the previous month is the faded full-month ghost behind it — so
    // you see "this month so far" against last month's full trajectory.
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    return data.slice(0, daysInMonth);
  }, [currentMonthExpenses, previousMonthExpenses]);

  const lastCurrentEntry = [...chartData].reverse().find((d) => d.current !== null);
  const currentTotal = lastCurrentEntry?.current || 0;
  const previousTotal = chartData[chartData.length - 1]?.previous || 0;
  const difference = currentTotal - previousTotal;
  const percentChange = previousTotal > 0 ? (difference / previousTotal) * 100 : 0;

  if (compact) {
    const isOver = difference > 0;
    return (
      <div className="w-full">
        {/* Compact header */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-muted)" }}>{t("chart.spendingVelocity")}</p>
          <div className="text-right">
            <span className="text-[12px] font-bold" style={{ color: isOver ? "var(--negative)" : "var(--positive)" }}>
              {isOver ? "+" : ""}€{difference.toFixed(2)}
            </span>
            <p className="text-[10px]" style={{ color: "var(--ink-subtle)" }}>
              {t("chart.vsLastMonth", { percent: `${percentChange > 0 ? "+" : ""}${percentChange.toFixed(1)}` })}
            </p>
          </div>
        </div>
        {/* Whole-month chart: this month solid (+ subtle fill), last month faded ghost */}
        <div className="h-24 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 2 }}>
              <defs>
                <linearGradient id="burnFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Line type="monotone" dataKey="previous" stroke="var(--accent)" strokeOpacity={0.28} strokeWidth={1.5} dot={false} name="previous" isAnimationActive={false} />
              <Area type="monotone" dataKey="current" stroke="var(--accent)" strokeWidth={2.25} fill="url(#burnFill)" dot={false} name="current" connectNulls={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {/* Compact legend */}
        <div className="flex items-center justify-center gap-4 mt-1">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-[3px] rounded" style={{ background: "var(--accent)" }} />
            <span className="text-[10px]" style={{ color: "var(--ink-muted)" }}>{currentMonthLabel}: €{currentTotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-[3px] rounded" style={{ background: "var(--accent)", opacity: 0.3 }} />
            <span className="text-[10px]" style={{ color: "var(--ink-subtle)" }}>{previousMonthLabel}: €{previousTotal.toFixed(2)}</span>
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
          <h3 className="font-semibold" style={{ color: "var(--ink)" }}>{t("chart.spendingVelocity")}</h3>
          <p className="text-sm" style={{ color: "var(--ink-muted)" }}>{t("chart.cumulativeComparison")}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums" style={{ color: difference > 0 ? "var(--negative)" : "var(--positive)" }}>
            {difference > 0 ? "+" : ""}€{difference.toFixed(2)}
          </p>
          <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
            {t("chart.vsLastMonth", { percent: `${percentChange > 0 ? "+" : ""}${percentChange.toFixed(1)}` })}
          </p>
        </div>
      </div>

      {/* Chart — current month solid accent, previous month faded ghost */}
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 12, fill: "var(--ink-subtle)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--line)" }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "var(--ink-subtle)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--line)" }}
              tickFormatter={(value) => `€${value}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: "12px",
                boxShadow: "var(--shadow-pop)",
                color: "var(--ink)",
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
              stroke="var(--accent-fainter)"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="previous"
            />
            <Line
              type="monotone"
              dataKey="current"
              stroke="var(--accent)"
              strokeWidth={3}
              dot={false}
              name="current"
              activeDot={{ r: 6, fill: "var(--accent)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-2">
        <div className="flex items-center gap-2">
          <div className="w-4 h-1 rounded" style={{ background: "var(--accent)" }} />
          <span className="text-sm tabular-nums" style={{ color: "var(--ink-muted)" }}>{currentMonthLabel}: €{currentTotal.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-1 rounded" style={{ background: "var(--accent-fainter)" }} />
          <span className="text-sm tabular-nums" style={{ color: "var(--ink-muted)" }}>{previousMonthLabel}: €{previousTotal.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
