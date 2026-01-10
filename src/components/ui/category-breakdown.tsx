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

  if (categoryData.length === 0) {
    return (
      <div className="text-center text-slate-500 py-4">
        {t("noExpenses")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">{t("categoryBreakdown")}</h3>
        <span className="text-sm text-slate-500">
          {t("totalSpent")}: <span className="font-medium text-slate-900">€{totalSpent.toFixed(0)}</span>
        </span>
      </div>

      {/* Stacked bar */}
      <div className="h-4 rounded-full overflow-hidden bg-slate-100 flex">
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

      {/* Category list */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {categoryData.slice(0, 6).map((cat) => (
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
        {categoryData.length > 6 && (
          <div className="text-xs text-slate-400 text-center pt-1">
            +{categoryData.length - 6} {t("moreCategories")}
          </div>
        )}
      </div>

      {/* Budget comparison */}
      {budget > 0 && (
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">{t("budgetUsed")}</span>
            <span className={`font-medium ${totalSpent > budget ? "text-red-500" : "text-green-600"}`}>
              {((totalSpent / budget) * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
