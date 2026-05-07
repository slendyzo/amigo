"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface NudgeKeywordCardProps {
  merchantKey: string;
  categoryId: string;
  categoryName: string;
  count: number;
  onAccepted: () => void;
}

export default function NudgeKeywordCard({
  merchantKey,
  categoryId,
  categoryName,
  count,
  onAccepted,
}: NudgeKeywordCardProps) {
  const t = useTranslations("aiAdvisor");
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (dismissed) return null;

  const handleDismiss = async () => {
    setDismissed(true); // optimistic
    try {
      await fetch("/api/insights/dismiss", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "NUDGE_KEYWORD", scope: { merchantKey, categoryId } }),
      });
    } catch (err) {
      console.error("[advisor] dismiss failed:", err);
    }
  };

  const handleAccept = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/insights/nudges/keyword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantKey, categoryId }),
      });
      if (!res.ok) {
        console.error("nudge-keyword-card: POST failed", await res.text());
        return;
      }
      onAccepted();
    } catch (err) {
      console.error("nudge-keyword-card: network error", err);
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
        {t("nudges.keyword.cardHeading", { merchant: merchantKey, category: categoryName, count })}
      </p>
      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
        {t("nudges.keyword.cardSubtitle")}
      </p>

      <div className="flex gap-2 mt-3">
        <button
          onClick={handleAccept}
          disabled={loading}
          className="text-xs font-medium px-3 py-1.5 rounded-md bg-slate-900 text-white hover:opacity-80 disabled:opacity-50 transition-opacity"
        >
          {t("nudges.keyword.createRule")}
        </button>
        <button
          onClick={handleDismiss}
          className="text-xs font-medium px-3 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
        >
          {t("nudges.common.notNow")}
        </button>
      </div>
    </div>
  );
}
