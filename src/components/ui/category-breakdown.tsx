"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useCategoryTranslation } from "@/hooks/use-category-translation";

type CategoryBreakdownProps = {
  expenses: Array<{
    amountEur: number;
    categoryName: string;
    parentCategoryName?: string;
  }>;
  budget: number;
};

// Forest & Bracket category palette — earthy, restrained tones
const CATEGORY_COLORS = [
  "var(--cat-forest)",
  "var(--cat-clay)",
  "var(--cat-ochre)",
  "var(--cat-sage)",
  "var(--cat-rust)",
  "var(--cat-stone)",
  "var(--cat-plum)",
  "var(--cat-bronze)",
  "var(--cat-moss-d)",
  "var(--cat-fog)",
];

export function CategoryBreakdown({ expenses, budget }: CategoryBreakdownProps) {
  const t = useTranslations("dashboard");
  const { translateCategory } = useCategoryTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const categoryData = useMemo(() => {
    // Group expenses by parent category (for roll-up) or by category name
    const categoryMap = new Map<string, number>();

    expenses.forEach((expense) => {
      // Use parent category name for roll-up if available, otherwise use category name
      const rawName = expense.parentCategoryName || expense.categoryName;
      const category = rawName ? translateCategory(rawName) : t("uncategorized");
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
  }, [expenses, t, translateCategory]);

  const totalSpent = useMemo(() => {
    return expenses.reduce((sum, e) => sum + e.amountEur, 0);
  }, [expenses]);

  // Budget calculations
  const safeBudget = Number.isFinite(budget) && budget > 0 ? budget : 0;
  const percentage = useMemo(() => {
    if (!safeBudget || safeBudget <= 0) return 0;
    if (!Number.isFinite(totalSpent)) return 0;
    return Math.min((totalSpent / safeBudget) * 100, 100);
  }, [totalSpent, safeBudget]);

  const isOverBudget = totalSpent > safeBudget && safeBudget > 0;
  const remaining = safeBudget - totalSpent;

  // SVG circle calculations
  const size = 180;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Color based on percentage
  const getColor = () => {
    if (isOverBudget) return "var(--crimson)";
    if (percentage > 80) return "var(--amber)";
    return "var(--forest)";
  };

  if (expenses.length === 0) {
    return (
      <div className="text-center text-ink-mute py-8">
        {t("noExpenses")}
      </div>
    );
  }

  return (
    <>
      {/* Main gauge - clickable */}
      <div
        className="flex flex-col items-center cursor-pointer group"
        onClick={() => setIsModalOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setIsModalOpen(true)}
      >
        <div className="relative" style={{ width: size, height: size }}>
          {/* Background circle */}
          <svg
            className="transform -rotate-90 group-hover:scale-105 transition-transform duration-200"
            width={size}
            height={size}
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--rule)"
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
            <span className="text-3xl font-bold text-ink">
              {percentage.toFixed(0)}%
            </span>
            <span className="text-sm text-ink-mute">{t("used")}</span>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 text-center">
          <p className="text-sm font-medium text-ink-soft">{t("monthlyBudget")}</p>
          <p className="text-lg font-semibold" style={{ color: getColor() }}>
            €{totalSpent.toFixed(2)} <span className="text-ink-faint font-normal">/ €{safeBudget.toFixed(2)}</span>
          </p>
          <p className={`text-sm mt-1 ${isOverBudget ? "text-crimson" : "text-ink-mute"}`}>
            {isOverBudget
              ? t("overBudget", { amount: Math.abs(remaining).toFixed(2) })
              : t("remainingBudget", { amount: remaining.toFixed(2) })}
          </p>
        </div>

        {/* Tap hint */}
        <p className="text-xs text-ink-faint mt-2 group-hover:text-ink-mute transition-colors">
          {t("tapForDetails")}
        </p>
      </div>

      {/* Modal with full category breakdown */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className="bg-paper-deep rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-rule"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between p-4 border-b border-rule">
              <h2 className="text-lg font-semibold text-ink">{t("categoryBreakdown")}</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-ink-faint hover:text-ink-soft hover:bg-paper-soft rounded-md transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal content */}
            <div className="p-4 space-y-4">
              {/* Total spent header */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-mute">{t("totalSpent")}</span>
                <span className="text-lg font-bold text-ink">€{totalSpent.toFixed(2)}</span>
              </div>

              {/* Stacked bar */}
              <div className="h-4 rounded-full overflow-hidden bg-paper-soft flex">
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

              {/* Category items - ALL categories shown */}
              <div className="space-y-3">
                {categoryData.map((cat) => (
                  <div key={cat.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-sm text-ink-soft truncate">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                      <span className="text-sm font-medium text-ink">
                        €{cat.amount.toFixed(2)}
                      </span>
                      <span className="text-xs text-ink-faint w-12 text-right">
                        {cat.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Budget comparison */}
              {safeBudget > 0 && (
                <div className="pt-4 mt-4 border-t border-rule">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-mute">{t("budgetUsed")}</span>
                    <span className={`text-lg font-bold ${isOverBudget ? "text-crimson" : "text-moss"}`}>
                      {((totalSpent / safeBudget) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm text-ink-mute">{isOverBudget ? t("overBudgetLabel") : t("remainingLabel")}</span>
                    <span className={`text-sm font-medium ${isOverBudget ? "text-crimson" : "text-moss"}`}>
                      €{Math.abs(remaining).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
