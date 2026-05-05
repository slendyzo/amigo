"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface NudgeCategorizeCardProps {
  count: number;
  onClick: () => void;
}

export default function NudgeCategorizeCard({ count, onClick }: NudgeCategorizeCardProps) {
  const t = useTranslations("aiAdvisor");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="relative w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3.5">
      <button
        onClick={async () => {
          setDismissed(true); // optimistic
          try {
            await fetch("/api/insights/dismiss", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "NUDGE_CATEGORIZE", scope: {} }),
            });
          } catch (err) {
            console.error("[advisor] dismiss failed:", err);
          }
        }}
        aria-label={t("nudges.common.dismiss")}
        className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <p className="text-sm font-medium text-slate-900 dark:text-white pr-6">
        {t("nudges.categorize.cardHeading", { count })}
      </p>
      <button
        onClick={onClick}
        className="mt-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
      >
        {t("nudges.categorize.cardCta")} →
      </button>
    </div>
  );
}
