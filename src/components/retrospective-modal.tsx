"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

type MomHighlight = {
  category: string;
  currentTotal: number;
  prevTotal: number;
  pctChange: number;
};

type RetrospectiveOutput = {
  headline: string;
  observations: [string, string, string];
  momHighlights: MomHighlight[];
};

type InsightProps = {
  id: string;
  periodYear: number;
  periodMonth: number;
  content: RetrospectiveOutput;
  readAt: string | null;
};

interface RetrospectiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  insight: InsightProps;
  markReadOnClose?: boolean;
}

function formatEur(value: number) {
  return new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <div className="text-slate-500 mb-1">{payload[0]?.payload?.category}</div>
      <div className="flex gap-3">
        <span className="text-slate-400">Prev: {formatEur(payload[0]?.payload?.prevTotal ?? 0)}</span>
        <span className="text-slate-900 font-medium">
          Now: {formatEur(payload[0]?.payload?.currentTotal ?? 0)}
        </span>
      </div>
    </div>
  );
}

export default function RetrospectiveModal({
  isOpen,
  onClose,
  insight,
  markReadOnClose = true,
}: RetrospectiveModalProps) {
  const t = useTranslations("aiAdvisor");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [isClosing, setIsClosing] = useState(false);

  const periodLabel = new Date(insight.periodYear, insight.periodMonth - 1).toLocaleString(
    locale === "pt-PT" ? "pt-PT" : locale === "fr-FR" ? "fr-FR" : "en-GB",
    { month: "long", year: "numeric" }
  );

  const handleClose = async () => {
    if (isClosing) return;
    setIsClosing(true);
    try {
      if (markReadOnClose && !insight.readAt) {
        await fetch("/api/insights/retrospective", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: insight.id }),
        });
      }
    } catch { /* non-critical — modal still closes */ } finally {
      onClose();
      router.refresh();
      setIsClosing(false);
    }
  };

  const chartData = insight.content.momHighlights.map((h) => ({
    category: h.category,
    prevTotal: h.prevTotal,
    currentTotal: h.currentTotal,
    pctChange: h.pctChange,
  }));

  const indices = ["01", "02", "03"] as const;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-lg bg-white rounded-xl shadow-xl overflow-hidden"
          >
            {/* Header strip */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
              className="px-6 py-3 border-b border-slate-200"
            >
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                {periodLabel}
              </span>
            </motion.div>

            <div className="px-6 pt-5 pb-6 space-y-5">
              {/* Headline */}
              <motion.h2
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="text-xl font-semibold text-slate-900 leading-snug"
              >
                {insight.content.headline}
              </motion.h2>

              {/* Observations */}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-lg border border-slate-200 divide-y divide-slate-100"
              >
                {insight.content.observations.map((obs, i) => (
                  <div
                    key={i}
                    className="px-4 py-3"
                    aria-label={`${t("retrospective.observationLabel")} ${i + 1}`}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
                      {indices[i]}
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {obs}
                    </p>
                  </div>
                ))}
              </motion.div>

              {/* MoM chart */}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <ResponsiveContainer width="100%" height={Math.max(140, chartData.length * 38)}>
                  <BarChart
                    layout="vertical"
                    data={chartData}
                    margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                    barCategoryGap="30%"
                    barGap={3}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="category"
                      width={88}
                      tick={{ fontSize: 11, fill: "currentColor" }}
                      className="text-slate-500"
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<MomTooltip />} cursor={false} />
                    <Bar dataKey="prevTotal" radius={[2, 2, 2, 2]}>
                      {chartData.map((_, idx) => (
                        <Cell key={idx} className="fill-slate-200" fill="var(--tw-placeholder-color, #e2e8f0)" />
                      ))}
                    </Bar>
                    <Bar dataKey="currentTotal" radius={[2, 2, 2, 2]}>
                      {chartData.map((_, idx) => (
                        <Cell key={idx} className="fill-slate-900" fill="#0f172a" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>

              {/* Footer */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1 border-t border-slate-100"
              >
                <Link
                  href="/dashboard/insights"
                  onClick={handleClose}
                  className="text-xs text-slate-500 hover:text-slate-800 transition-colors underline underline-offset-2"
                >
                  {t("retrospective.viewArchive")}
                </Link>
                <button
                  onClick={handleClose}
                  disabled={isClosing}
                  className="sm:ml-auto rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {tCommon("close")}
                </button>
              </motion.div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
