"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

const DISMISSED_KEY = "advisor-coldstart-dismissed";

interface AdvisorColdstartCardProps {
  expenseCount: number;
  monthsTracked: number;
}

export default function AdvisorColdstartCard({ expenseCount }: AdvisorColdstartCardProps) {
  const t = useTranslations("aiAdvisor");
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED_KEY) === "true") {
        setDismissed(true);
      }
    } catch { /* ignore */ }
    setMounted(true);
  }, []);

  if (!mounted || dismissed) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "true");
    } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div className="relative w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3.5">
      <button
        onClick={handleDismiss}
        aria-label={t("coldstart.dismiss")}
        className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <p className="text-sm font-medium text-slate-900 dark:text-white pr-6">
        {t("coldstart.heading")}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
        {t("coldstart.body", { count: expenseCount })}
      </p>
    </div>
  );
}
