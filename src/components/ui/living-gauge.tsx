"use client";

import { useMemo } from "react";

type LivingGaugeProps = {
  current: number;
  budget: number;
  label?: string;
};

export function LivingGauge({ current, budget, label = "Living Budget" }: LivingGaugeProps) {
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
    if (isOverBudget) return "#ef4444"; // red
    if (percentage > 80) return "#f59e0b"; // amber
    return "#0070f3"; // electric blue
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
            stroke="#e2e8f0"
            strokeWidth={strokeWidth}
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={getColor()}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-slate-900">
            {percentage.toFixed(0)}%
          </span>
          <span className="text-sm text-slate-500">used</span>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 text-center">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-lg font-semibold" style={{ color: getColor() }}>
          €{safeCurrent.toFixed(2)} <span className="text-slate-400 font-normal">/ €{safeBudget.toFixed(2)}</span>
        </p>
        <p className={`text-sm mt-1 ${isOverBudget ? "text-red-500" : "text-slate-500"}`}>
          {isOverBudget
            ? `€${Math.abs(remaining).toFixed(2)} over budget`
            : `€${remaining.toFixed(2)} remaining`}
        </p>
      </div>
    </div>
  );
}
