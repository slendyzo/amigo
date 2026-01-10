"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

type CategoryBreakdownProps = {
  expenses: Array<{
    amountEur: number;
    categoryName: string;
  }>;
  budget: number;
};

// Predefined colors for categories
const CATEGORY_COLORS = [
  "#0070f3", // blue
  "#8b5cf6", // purple
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#6366f1", // indigo
];

export function CategoryBreakdown({ expenses, budget }: CategoryBreakdownProps) {
  const t = useTranslations("dashboard");

  const categoryData = useMemo(() => {
    // Group expenses by category and sum amounts
    const categoryMap = new Map<string, number>();

    expenses.forEach((expense) => {
      const category = expense.categoryName || t("uncategorized");
      const current = categoryMap.get(category) || 0;
      categoryMap.set(category, current + expense.amountEur);
    });

    // Convert to array and sort by amount (descending)
    const sorted = Array.from(categoryMap.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    // Calculate total
    const total = sorted.reduce((sum, cat) => sum + cat.amount, 0);

    // Add percentage and color
    return sorted.map((cat, index) => ({
      ...cat,
      percentage: total > 0 ? (cat.amount / total) * 100 : 0,
      color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    }));
  }, [expenses, t]);

  const totalSpent = categoryData.reduce((sum, cat) => sum + cat.amount, 0);

  // Budget calculations
  const safeBudget = Number.isFinite(budget) && budget > 0 ? budget : 0;
  const budgetPercentage = safeBudget > 0 ? Math.min((totalSpent / safeBudget) * 100, 100) : 0;
  const isOverBudget = totalSpent > safeBudget && safeBudget > 0;
  const remaining = safeBudget - totalSpent;

  // SVG circle calculations
  const size = 180;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Calculate stroke segments for each category
  const categorySegments = useMemo(() => {
    if (categoryData.length === 0 || safeBudget <= 0) return [];

    let currentOffset = 0;
    return categoryData.map((cat) => {
      // Each category's arc length based on its percentage of total spent
      // But capped at the budget percentage
      const categoryBudgetPercent = (cat.amount / safeBudget) * 100;
      const arcLength = (Math.min(categoryBudgetPercent, 100) / 100) * circumference;
      const segment = {
        ...cat,
        offset: circumference - currentOffset,
        length: arcLength,
      };
      currentOffset += arcLength;
      return segment;
    });
  }, [categoryData, safeBudget, circumference]);

  if (categoryData.length === 0) {
    return (
      <div className="text-center text-slate-500 py-8">
        {t("noExpenses")}
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row items-center gap-6">
      {/* Circular gauge with category colors */}
      <div className="flex flex-col items-center flex-shrink-0">
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
            {/* Category segments */}
            {categorySegments.map((segment, index) => (
              <circle
                key={segment.name}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${segment.length} ${circumference}`}
                strokeDashoffset={segment.offset}
                className="transition-all duration-700 ease-out"
                style={{
                  // Small gap between segments
                  strokeDasharray: index < categorySegments.length - 1
                    ? `${Math.max(segment.length - 2, 0)} ${circumference}`
                    : `${segment.length} ${circumference}`
                }}
              />
            ))}
          </svg>

          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-slate-900">
              {budgetPercentage.toFixed(0)}%
            </span>
            <span className="text-sm text-slate-500">{t("used")}</span>
          </div>
        </div>

        {/* Budget info below gauge */}
        <div className="mt-3 text-center">
          <p className="text-sm font-medium text-slate-700">{t("monthlyBudget")}</p>
          <p className={`text-lg font-semibold ${isOverBudget ? "text-red-500" : "text-[#0070f3]"}`}>
            €{totalSpent.toFixed(2)} <span className="text-slate-400 font-normal">/ €{safeBudget.toFixed(2)}</span>
          </p>
          <p className={`text-sm ${isOverBudget ? "text-red-500" : "text-slate-500"}`}>
            {isOverBudget
              ? t("overBudget", { amount: Math.abs(remaining).toFixed(2) })
              : t("remainingBudget", { amount: remaining.toFixed(2) })}
          </p>
        </div>
      </div>

      {/* Category list */}
      <div className="flex-1 w-full md:w-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900">{t("categoryBreakdown")}</h3>
          <span className="text-sm text-slate-500">
            {t("totalSpent")}: <span className="font-medium text-slate-900">€{totalSpent.toFixed(0)}</span>
          </span>
        </div>

        {/* Stacked bar */}
        <div className="h-3 rounded-full overflow-hidden bg-slate-100 flex mb-4">
          {categoryData.map((cat, index) => (
            <div
              key={cat.name}
              className="h-full transition-all duration-500"
              style={{
                width: `${cat.percentage}%`,
                backgroundColor: cat.color,
                marginLeft: index > 0 ? "1px" : 0,
              }}
              title={`${cat.name}: €${cat.amount.toFixed(2)} (${cat.percentage.toFixed(1)}%)`}
            />
          ))}
        </div>

        {/* Category items */}
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {categoryData.slice(0, 5).map((cat) => (
            <div key={cat.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="text-sm text-slate-700 truncate">{cat.name}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-sm font-medium text-slate-900">
                  €{cat.amount.toFixed(0)}
                </span>
                <span className="text-xs text-slate-400 w-10 text-right">
                  {cat.percentage.toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
          {categoryData.length > 5 && (
            <div className="text-xs text-slate-400 text-center pt-1">
              +{categoryData.length - 5} {t("moreCategories")}
            </div>
          )}
        </div>

        {/* Budget comparison */}
        {safeBudget > 0 && (
          <div className="pt-3 mt-3 border-t border-slate-100">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">{t("budgetUsed")}</span>
              <span className={`font-medium ${isOverBudget ? "text-red-500" : "text-green-600"}`}>
                {((totalSpent / safeBudget) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
