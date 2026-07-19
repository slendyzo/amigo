"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

type LivingGaugeProps = {
  current: number;
  budget: number;
  label?: string;
};

export function LivingGauge({ current, budget, label }: LivingGaugeProps) {
  const t = useTranslations("dashboard");
  const displayLabel = label || t("survivalBudget");
  const percentage = useMemo(() => {
    // Handle NaN, undefined, or invalid values
    if (!budget || budget <= 0 || !Number.isFinite(budget)) return 0;
    if (!Number.isFinite(current)) return 0;
    return Math.min((current / budget) * 100, 100);
  }, [current, budget]);

  // Safely handle NaN values for display
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safeBudget = Number.isFinite(budget) ? budget : 0;
  const isOverBudget = safeCurrent > safeBudget;
  const remaining = safeBudget - safeCurrent;

  // SVG circle calculations
  const size = 180;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Color based on percentage
  const getColor = () => {
    if (isOverBudget) return "var(--negative)"; // over budget
    if (percentage > 80) return "var(--warning)"; // near budget
    return "var(--accent)"; // accent (violet)
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Background circle */}
        <svg
          className="transform -rotate-90"
          width={size}
          height={size}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            style={{ stroke: "var(--surface-3)" }}
            strokeWidth={strokeWidth}
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            style={{ stroke: getColor() }}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-[var(--ink)]">
            {percentage.toFixed(0)}%
          </span>
          <span className="text-sm text-[var(--ink-subtle)]">{t("used")}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 text-center">
        <p className="text-sm font-medium text-[var(--ink-muted)]">{displayLabel}</p>
        <p className="text-lg font-semibold" style={{ color: getColor() }}>
          €{safeCurrent.toFixed(2)} <span className="text-[var(--ink-subtle)] font-normal">/ €{safeBudget.toFixed(2)}</span>
        </p>
        <p className={`text-sm mt-1 ${isOverBudget ? "text-[var(--negative)]" : "text-[var(--ink-subtle)]"}`}>
          {isOverBudget
            ? t("overBudget", { amount: Math.abs(remaining).toFixed(2) })
            : t("remainingBudget", { amount: remaining.toFixed(2) })}
        </p>
      </div>
    </div>
  );
}
