"use client";

import { useState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import RetrospectiveModal from "@/components/retrospective-modal";

type MomHighlight = {
  category: string;
  currentTotal: number;
  prevTotal: number;
  pctChange: number;
};

type RetrospectiveContent = {
  headline: string;
  observations: [string, string, string];
  momHighlights: MomHighlight[];
};

type Insight = {
  id: string;
  periodYear: number;
  periodMonth: number;
  content: RetrospectiveContent;
  readAt: string | null;
  generatedAt: string;
};

export default function InsightsPage() {
  const t = useTranslations("aiAdvisor");
  const locale = useLocale();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);

  useEffect(() => {
    fetch("/api/insights/retrospective?mode=list")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Insight[]) => setInsights(data))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const formatPeriod = (year: number, month: number) =>
    new Date(year, month - 1).toLocaleString(
      locale === "pt-PT" ? "pt-PT" : locale === "fr-FR" ? "fr-FR" : "en-GB",
      { month: "long", year: "numeric" }
    );

  const formatGeneratedDate = (iso: string) =>
    new Date(iso).toLocaleDateString(
      locale === "pt-PT" ? "pt-PT" : locale === "fr-FR" ? "fr-FR" : "en-GB",
      { day: "numeric", month: "short", year: "numeric" }
    );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
          {t("retrospective.archiveTitle")}
        </h1>
        {!isLoading && insights.length > 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t("retrospective.archiveSubtitle", { count: insights.length })}
          </p>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
            >
              <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
              <div className="h-3 w-64 bg-slate-100 dark:bg-slate-800 rounded" />
            </div>
          ))}
        </div>
      ) : insights.length === 0 ? (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
            {t("retrospective.archiveEmpty")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {insights.map((insight) => (
            <button
              key={insight.id}
              onClick={() => setSelectedInsight(insight)}
              className="w-full text-left rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                    {formatPeriod(insight.periodYear, insight.periodMonth)}
                  </div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {insight.content.headline}
                  </p>
                </div>
                <div className="shrink-0 text-xs text-slate-400 dark:text-slate-500 mt-0.5 whitespace-nowrap">
                  {formatGeneratedDate(insight.generatedAt)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Archive view modal — read-only, never marks as read */}
      {selectedInsight && (
        <RetrospectiveModal
          isOpen={true}
          onClose={() => setSelectedInsight(null)}
          insight={selectedInsight}
          markReadOnClose={false}
        />
      )}
    </div>
  );
}
