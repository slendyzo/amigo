"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";

interface Category {
  id: string;
  name: string;
}

interface NudgeRow {
  expenseId: string;
  expenseName: string;
  expenseAmount: number;
  expenseDate: string;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  confidence: "high" | "medium" | "low";
  origin: "keyword" | "ai";
}

type RowState = "pending" | "accepted" | "rejected";

const CONFIDENCE_DOT: Record<"high" | "medium" | "low", string> = {
  high: "bg-slate-700 dark:bg-slate-300",
  medium: "bg-slate-500",
  low: "bg-slate-400",
};

interface NudgeCategorizeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NudgeCategorizeModal({ isOpen, onClose }: NudgeCategorizeModalProps) {
  const t = useTranslations("aiAdvisor");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState<NudgeRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch("/api/insights/nudges/categorize")
      .then((r) => r.json())
      .then((data) => {
        setRows(data.rows ?? []);
        setCategories(data.categories ?? []);
        const initial: Record<string, RowState> = {};
        const initOverrides: Record<string, string | null> = {};
        for (const row of (data.rows ?? []) as NudgeRow[]) {
          initial[row.expenseId] = "pending";
          initOverrides[row.expenseId] = row.suggestedCategoryId;
        }
        setRowStates(initial);
        setOverrides(initOverrides);
      })
      .catch(() => { /* graceful — rows stays empty */ })
      .finally(() => setLoading(false));
  }, [isOpen]);

  const setRowState = (id: string, state: RowState) =>
    setRowStates((prev) => ({ ...prev, [id]: state }));

  const setOverride = (id: string, categoryId: string | null) =>
    setOverrides((prev) => ({ ...prev, [id]: categoryId }));

  const acceptedRows = rows.filter(
    (r) => rowStates[r.expenseId] === "accepted" && overrides[r.expenseId]
  );

  const handleApply = async () => {
    if (acceptedRows.length === 0) return;
    setSubmitting(true);
    try {
      await fetch("/api/insights/nudges/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignments: acceptedRows.map((r) => ({
            expenseId: r.expenseId,
            categoryId: overrides[r.expenseId],
          })),
        }),
      });
      onClose();
    } catch { /* non-critical */ } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end md:items-center justify-center md:p-4">
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-full md:max-w-2xl bg-white dark:bg-slate-900 rounded-t-xl md:rounded-xl shadow-xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("nudges.categorize.modalTitle")}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t("nudges.categorize.modalSubtitle")}
              </p>
            </div>

            {/* Body */}
            <div className="overflow-y-auto max-h-[60vh] divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <div className="px-5 py-8 text-center text-sm text-slate-400">
                  Loading...
                </div>
              ) : rows.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-slate-400">
                  {t("nudges.categorize.noChanges")}
                </div>
              ) : (
                rows.map((row) => {
                  const state = rowStates[row.expenseId] ?? "pending";
                  return (
                    <div
                      key={row.expenseId}
                      className={`flex items-center gap-3 px-5 py-3 transition-colors ${
                        state === "rejected" ? "opacity-40" : ""
                      }`}
                    >
                      {/* Expense info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-900 dark:text-white truncate max-w-[160px]">
                            {row.expenseName}
                          </span>
                          <span className="text-xs text-slate-400">{formatDate(row.expenseDate)}</span>
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full ${CONFIDENCE_DOT[row.confidence]}`}
                            title={t(`nudges.categorize.confidence${row.confidence.charAt(0).toUpperCase() + row.confidence.slice(1)}` as "nudges.categorize.confidenceHigh")}
                          />
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                            {row.origin === "keyword"
                              ? t("nudges.categorize.originKeyword")
                              : t("nudges.categorize.originAi")}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          €{Math.abs(row.expenseAmount).toFixed(2)}
                        </span>
                      </div>

                      {/* Category dropdown */}
                      <select
                        value={overrides[row.expenseId] ?? ""}
                        onChange={(e) => setOverride(row.expenseId, e.target.value || null)}
                        disabled={state === "rejected"}
                        className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-2 py-1.5 max-w-[130px] focus:outline-none focus:ring-1 focus:ring-slate-400"
                      >
                        <option value="">—</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>

                      {/* Accept / Reject */}
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => setRowState(row.expenseId, state === "accepted" ? "pending" : "accepted")}
                          aria-label="Accept"
                          className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
                            state === "accepted"
                              ? "bg-slate-800 dark:bg-white text-white dark:text-slate-900"
                              : "border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setRowState(row.expenseId, state === "rejected" ? "pending" : "rejected")}
                          aria-label="Reject"
                          className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
                            state === "rejected"
                              ? "bg-red-100 dark:bg-red-900/40 text-red-500"
                              : "border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-400"
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {t("nudges.categorize.noChanges")}
              </button>
              <button
                onClick={handleApply}
                disabled={acceptedRows.length === 0 || submitting}
                className="flex-1 px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-100 disabled:opacity-40 transition-colors"
              >
                {t("nudges.categorize.applyButton", { count: acceptedRows.length })}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
