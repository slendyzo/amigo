"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronDown } from "lucide-react";
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

type ExpenseLite = {
  amountEur: number;
  type: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT";
  date: string;
  excludeFromBudget?: boolean;
  category?: { name: string; parent?: { name: string } | null } | null;
};

const RAMP = ["var(--accent)", "var(--accent-soft)", "var(--accent-faint)", "var(--accent-fainter)"];

const ease = [0.16, 1, 0.3, 1] as const;

export default function InsightsPage() {
  const t = useTranslations("aiAdvisor");
  const locale = useLocale();
  const router = useRouter();
  const intlLocale = locale === "pt-PT" ? "pt-PT" : locale === "fr-FR" ? "fr-FR" : "en-GB";

  const [insights, setInsights] = useState<Insight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);

  const [expenses, setExpenses] = useState<ExpenseLite[]>([]);
  const [expLoading, setExpLoading] = useState(true);
  const [focus, setFocus] = useState(5); // index into months (0=oldest, 5=current)
  const [pillOpen, setPillOpen] = useState(false);

  useEffect(() => {
    fetch("/api/insights/retrospective?mode=list")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Insight[]) => setInsights(data))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const qs = `?limit=100000&startDate=${start.toISOString()}`;
    fetch(`/api/expenses${qs}`)
      .then((res) => (res.ok ? res.json() : { expenses: [] }))
      .then((data) => setExpenses((data.expenses || []) as ExpenseLite[]))
      .catch(() => {})
      .finally(() => setExpLoading(false));
  }, []);

  // ---- 6-month buckets ----
  const months = useMemo(() => {
    const now = new Date();
    const arr = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        year: d.getFullYear(),
        month: d.getMonth(), // 0-indexed
        short: d.toLocaleString(intlLocale, { month: "short" }),
        long: d.toLocaleString(intlLocale, { month: "long", year: "numeric" }),
        total: 0,
      };
    });
    for (const e of expenses) {
      if (e.type === "PROJECT" || e.excludeFromBudget) continue;
      const d = new Date(e.date);
      const idx = arr.findIndex((m) => m.year === d.getFullYear() && m.month === d.getMonth());
      if (idx >= 0) arr[idx].total += e.amountEur;
    }
    return arr;
  }, [expenses, intlLocale]);

  const maxMonthTotal = Math.max(1, ...months.map((m) => m.total));
  const focusMonth = months[focus];
  const prevMonth = focus > 0 ? months[focus - 1] : null;

  const formatEur = (n: number) => {
    const v = Math.abs(n).toLocaleString(intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${n < 0 ? "−" : ""}€${v}`;
  };
  const formatEur0 = (n: number) =>
    `€${Math.abs(Math.round(n)).toLocaleString(intlLocale)}`;

  // ---- delta vs previous month ----
  const delta = prevMonth && prevMonth.total > 0
    ? ((focusMonth.total - prevMonth.total) / prevMonth.total) * 100
    : 0;
  const improved = focusMonth.total <= (prevMonth?.total ?? focusMonth.total);

  // ---- category breakdown for focus month ----
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      if (e.type === "PROJECT" || e.excludeFromBudget) continue;
      const d = new Date(e.date);
      if (d.getFullYear() !== focusMonth.year || d.getMonth() !== focusMonth.month) continue;
      const name = e.category?.parent?.name || e.category?.name || t("overview.uncategorized");
      map.set(name, (map.get(name) || 0) + e.amountEur);
    }
    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [expenses, focusMonth, t]);
  const maxCat = Math.max(1, ...categories.map((c) => c.total));

  // ---- burn rate: cumulative to day X, focus vs previous month ----
  const now = new Date();
  const isCurrentMonth = focusMonth.year === now.getFullYear() && focusMonth.month === now.getMonth();
  const daysInFocus = new Date(focusMonth.year, focusMonth.month + 1, 0).getDate();
  const burnDay = isCurrentMonth ? now.getDate() : daysInFocus;

  const cumulativeToDay = (year: number, month: number, day: number) => {
    let sum = 0;
    for (const e of expenses) {
      if (e.type === "PROJECT" || e.excludeFromBudget) continue;
      const d = new Date(e.date);
      if (d.getFullYear() === year && d.getMonth() === month && d.getDate() <= day) sum += e.amountEur;
    }
    return sum;
  };
  const focusBurn = cumulativeToDay(focusMonth.year, focusMonth.month, burnDay);
  const prevBurn = prevMonth ? cumulativeToDay(prevMonth.year, prevMonth.month, burnDay) : 0;
  const burnMax = Math.max(1, focusBurn, prevBurn);
  const burnDiff = focusBurn - prevBurn;

  const formatPeriod = (year: number, month: number) =>
    new Date(year, month - 1).toLocaleString(intlLocale, { month: "long", year: "numeric" });
  const formatGeneratedDate = (iso: string) =>
    new Date(iso).toLocaleDateString(intlLocale, { day: "numeric", month: "short", year: "numeric" });

  const hasData = !expLoading && months.some((m) => m.total > 0);

  return (
    <div className="max-w-2xl mx-auto pb-8">
      {/* Pushed-page header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => router.back()}
          aria-label={t("overview.back")}
          className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
        >
          <ChevronLeft size={18} strokeWidth={1.8} style={{ color: "var(--ink)" }} />
        </button>
        <div className="text-[16px] font-semibold" style={{ color: "var(--ink)" }}>
          {t("retrospective.archiveTitle")}
        </div>
        {/* Month pill */}
        <div className="relative">
          <button
            onClick={() => setPillOpen((o) => !o)}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold active:scale-95 transition-transform"
            style={{ background: "var(--surface-2)", color: "var(--accent)" }}
          >
            {focusMonth.short}
            <ChevronDown size={13} strokeWidth={2} />
          </button>
          <AnimatePresence>
            {pillOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.96 }}
                transition={{ duration: 0.2, ease }}
                className="absolute right-0 mt-2 z-20 rounded-2xl overflow-hidden min-w-[160px]"
                style={{ background: "var(--surface)", boxShadow: "var(--shadow-pop)", border: "1px solid var(--line)" }}
              >
                {months.map((m, i) => (
                  <button
                    key={`${m.year}-${m.month}`}
                    onClick={() => { setFocus(i); setPillOpen(false); }}
                    className="block w-full text-left px-4 py-2.5 text-[13px] transition-colors"
                    style={{
                      color: i === focus ? "var(--accent)" : "var(--ink)",
                      fontWeight: i === focus ? 600 : 500,
                      background: i === focus ? "var(--surface-2)" : "transparent",
                    }}
                  >
                    {m.long}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ---- Data cards ---- */}
      {expLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-[20px] h-40 animate-pulse" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }} />
          ))}
        </div>
      ) : !hasData ? (
        <div className="rounded-[20px] px-5 py-10 text-center" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
          <p className="text-[13px] leading-relaxed max-w-sm mx-auto" style={{ color: "var(--ink-muted)" }}>
            {t("overview.noData")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Trend card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease }}
            className="rounded-[20px] p-4 px-[18px]"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
          >
            <div className="text-[12px]" style={{ color: "var(--ink-muted)" }}>{t("overview.spentThisMonth")}</div>
            <div className="flex items-baseline gap-2">
              <div className="text-[26px] font-bold tabular-nums" style={{ color: "var(--ink)", letterSpacing: "-0.02em" }}>
                {formatEur(focusMonth.total)}
              </div>
              {prevMonth && prevMonth.total > 0 && (
                <div className="text-[12px] font-semibold tabular-nums" style={{ color: improved ? "var(--positive)" : "var(--negative)" }}>
                  {improved ? "▼" : "▲"} {Math.abs(delta).toFixed(0)}% {t("overview.vsMonth", { month: prevMonth.short })}
                </div>
              )}
            </div>
            {/* 6-month bar chart */}
            <div className="flex items-end gap-1.5 h-24 mt-3.5">
              {months.map((m, i) => {
                const h = Math.max(6, Math.round((m.total / maxMonthTotal) * 84));
                const isFocus = i === focus;
                return (
                  <button
                    key={`${m.year}-${m.month}`}
                    onClick={() => setFocus(i)}
                    className="flex-1 flex flex-col items-center gap-1.5"
                  >
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: h }}
                      transition={{ duration: 0.5, ease }}
                      className="w-full rounded-md"
                      style={{
                        background: isFocus ? "linear-gradient(180deg, var(--accent), var(--accent-soft))" : "var(--accent-fainter)",
                      }}
                    />
                    <span className="text-[10px]" style={{ color: isFocus ? "var(--accent)" : "var(--ink-subtle)", fontWeight: isFocus ? 600 : 400 }}>
                      {m.short}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* By category card */}
          {categories.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease, delay: 0.05 }}
              className="rounded-[20px] p-4 px-[18px] flex flex-col gap-3"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
            >
              <div className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>{t("overview.byCategory")}</div>
              {categories.map((c, i) => (
                <div key={c.name}>
                  <div className="flex justify-between text-[12.5px] mb-1.5">
                    <span className="font-semibold" style={{ color: "var(--ink)" }}>{c.name}</span>
                    <span className="tabular-nums" style={{ color: "var(--ink-muted)" }}>{formatEur(c.total)}</span>
                  </div>
                  <div className="h-1.5 rounded-[3px]" style={{ background: "var(--app-bg)" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round((c.total / maxCat) * 100)}%` }}
                      transition={{ duration: 0.5, ease }}
                      className="h-full rounded-[3px]"
                      style={{ background: RAMP[Math.min(i, 3)] }}
                    />
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {/* Burn rate card */}
          {prevMonth && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease, delay: 0.1 }}
              className="rounded-[20px] p-4 px-[18px]"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex justify-between items-baseline">
                <span className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
                  {t("overview.burnRateDay", { day: burnDay })}
                </span>
                <span className="text-[11px]" style={{ color: "var(--ink-subtle)" }}>{t("overview.vsMonth", { month: prevMonth.short })}</span>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-[11px] w-7" style={{ color: "var(--ink-muted)" }}>{focusMonth.short}</span>
                  <div className="flex-1 h-2 rounded-full" style={{ background: "var(--app-bg)" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round((focusBurn / burnMax) * 100)}%` }}
                      transition={{ duration: 0.5, ease }}
                      className="h-full rounded-full"
                      style={{ background: "var(--bar-gradient)" }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--ink)" }}>{formatEur0(focusBurn)}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-[11px] w-7" style={{ color: "var(--ink-muted)" }}>{prevMonth.short}</span>
                  <div className="flex-1 h-2 rounded-full" style={{ background: "var(--app-bg)" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round((prevBurn / burnMax) * 100)}%` }}
                      transition={{ duration: 0.5, ease }}
                      className="h-full rounded-full"
                      style={{ background: "var(--accent-fainter)" }}
                    />
                  </div>
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--ink-subtle)" }}>{formatEur0(prevBurn)}</span>
                </div>
              </div>
              <div className="text-[11px] font-semibold mt-2.5" style={{ color: burnDiff <= 0 ? "var(--positive)" : "var(--negative)" }}>
                {burnDiff <= 0
                  ? t("overview.takeawayLess", { amount: formatEur0(burnDiff) })
                  : t("overview.takeawayMore", { amount: formatEur0(burnDiff) })}
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* ---- Retrospective archive ---- */}
      {!isLoading && insights.length > 0 && (
        <div className="mt-7">
          <div className="text-[11.5px] font-semibold uppercase mb-2" style={{ color: "var(--ink-subtle)", letterSpacing: ".06em" }}>
            {t("overview.archiveHeading")}
          </div>
          <div className="space-y-2">
            {insights.map((insight) => (
              <button
                key={insight.id}
                onClick={() => setSelectedInsight(insight)}
                className="w-full text-left rounded-[20px] px-5 py-4 active:scale-[.99] transition-transform"
                style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase mb-1" style={{ color: "var(--ink-subtle)", letterSpacing: ".06em" }}>
                      {formatPeriod(insight.periodYear, insight.periodMonth)}
                    </div>
                    <p className="text-[13.5px] font-semibold truncate" style={{ color: "var(--ink)" }}>
                      {insight.content.headline}
                    </p>
                  </div>
                  <div className="shrink-0 text-[11px] mt-0.5 whitespace-nowrap" style={{ color: "var(--ink-subtle)" }}>
                    {formatGeneratedDate(insight.generatedAt)}
                  </div>
                </div>
              </button>
            ))}
          </div>
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
