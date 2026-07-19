"use client";

/**
 * MoneyHubTabs — Calm Violet redesign shared segmented control (Phase 4).
 * Unifies the three Money routes (/dashboard/expenses, /incomes, /recurring)
 * into one visual hub: a "Money" title + a 3-segment pill control that
 * router.pushes between the routes while preserving URLs / deep links.
 *
 * The active pill animates between segments with a framer-motion `layoutId`.
 */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

export type MoneyTab = "expenses" | "income" | "recurring";

const ROUTES: Record<MoneyTab, string> = {
  expenses: "/dashboard/expenses",
  income: "/dashboard/incomes",
  recurring: "/dashboard/recurring",
};

const EASE = [0.16, 1, 0.3, 1] as const;

export default function MoneyHubTabs({ active }: { active: MoneyTab }) {
  const router = useRouter();
  const t = useTranslations("expenses");

  const segments: { key: MoneyTab; label: string }[] = [
    { key: "expenses", label: t("tabExpenses") },
    { key: "income", label: t("tabIncome") },
    { key: "recurring", label: t("tabRecurring") },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="flex flex-col gap-4"
    >
      <div className="text-[20px] font-bold tracking-[-0.02em]" style={{ color: "var(--ink)" }}>
        {t("money")}
      </div>
      <div
        className="flex rounded-[16px] p-1"
        style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
      >
        {segments.map((seg) => {
          const isActive = seg.key === active;
          return (
            <button
              key={seg.key}
              type="button"
              onClick={() => {
                if (!isActive) router.push(ROUTES[seg.key]);
              }}
              className="relative flex-1 rounded-[12px] py-2 text-center text-[12.5px] tap-none"
              style={{
                color: isActive ? "var(--accent-fg)" : "var(--ink-muted)",
                fontWeight: isActive ? 600 : 500,
              }}
            >
              {isActive && (
                <motion.span
                  layoutId="money-hub-pill"
                  className="absolute inset-0 rounded-[12px]"
                  style={{ background: "var(--ink)" }}
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                />
              )}
              <span className="relative z-10">{seg.label}</span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
