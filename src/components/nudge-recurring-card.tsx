"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";

interface NudgeRecurringCardProps {
  name: string;
  amount: number;
  dayOfMonth: number;
  monthsObserved: number;
  sampleExpenseIds: string[];
  onAccepted: () => void;
}

function formatEur(amount: number): string {
  return new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatOrdinal(day: number, locale: string): string {
  if (locale.startsWith("pt")) {
    return `${day}º`;
  }
  if (locale.startsWith("fr")) {
    return day === 1 ? `${day}er` : `${day}e`;
  }
  // English default
  const suffix = ["th", "st", "nd", "rd"];
  const v = day % 100;
  return `${day}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`;
}

export default function NudgeRecurringCard({
  name,
  amount,
  dayOfMonth,
  monthsObserved,
  sampleExpenseIds,
  onAccepted,
}: NudgeRecurringCardProps) {
  const t = useTranslations("aiAdvisor");
  const locale = useLocale();
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (dismissed) return null;

  const namePrefix8 = name.toLowerCase().trim().slice(0, 8);

  const handleDismiss = async () => {
    setDismissed(true); // optimistic
    try {
      await fetch("/api/insights/dismiss", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "NUDGE_RECURRING", scope: { namePrefix8 } }),
      });
    } catch (err) {
      console.error("[advisor] dismiss failed:", err);
    }
  };

  const handleAccept = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/insights/nudges/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, amount, dayOfMonth, sampleExpenseIds }),
      });
      if (res.ok) {
        onAccepted();
      } else {
        console.error("Nudge accept failed:", await res.text());
      }
    } catch (err) {
      console.error("Nudge accept error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full rounded-lg border border-slate-200 bg-white px-4 py-3.5">
      <button
        onClick={handleDismiss}
        aria-label={t("nudges.common.dismiss")}
        className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <p className="text-sm font-medium text-ink pr-6">
        {t("nudges.recurring.cardHeading", { name, amount: formatEur(amount), day: formatOrdinal(dayOfMonth, locale) })}
      </p>
      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
        {t("nudges.recurring.cardSubtitle")}
      </p>
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={handleAccept}
          disabled={loading}
          className="px-3 py-1.5 bg-[#0070f3] text-white text-xs rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading && (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {t("nudges.recurring.createTemplate")}
        </button>
        <button
          onClick={handleDismiss}
          className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          {t("nudges.common.notNow")}
        </button>
      </div>
    </div>
  );
}
