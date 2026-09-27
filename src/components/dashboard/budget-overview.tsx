"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, Wallet } from "lucide-react";
import { monthlyBudgetSummary, type AnnualSummary } from "@/lib/dashboard-totals";

export default function BudgetOverview({ monthlyBudget, expectedIncome, spent, annual, asOf, netWorth }: {
  monthlyBudget: number | null; expectedIncome: number; spent: number;
  annual: AnnualSummary; asOf: string; netWorth: number;
}) {
  const t = useTranslations("dashboard.budgetOverview");
  const locale = useLocale();
  const [annualView, setAnnualView] = useState<"net" | "spent">("net");
  const date = new Date(asOf);
  const month = date.toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const year = date.getUTCFullYear();
  const daysRemaining = new Date(Date.UTC(year, date.getUTCMonth() + 1, 0)).getUTCDate() - date.getUTCDate() + 1;
  const budget = monthlyBudget ?? (expectedIncome > 0 ? expectedIncome : null);
  const summary = monthlyBudgetSummary(budget, spent, daysRemaining);
  const money = (value: number, signed = false) => new Intl.NumberFormat(locale, {
    style: "currency", currency: "EUR", maximumFractionDigits: Math.abs(value) > 0 && Math.abs(value) < 1 ? 2 : 0, minimumFractionDigits: 0,
    ...(signed ? { signDisplay: "exceptZero" as const } : {}),
  }).format(value);
  const exactMoney = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(value);
  const yearValue = annualView === "net" ? annual.net : annual.spent;
  const yearColor = annualView === "spent" || annual.net === 0 ? "var(--ink)" : annual.net > 0 ? "var(--positive)" : "var(--negative)";

  return <div className="budget-overview min-w-0 space-y-3">
    <div className="budget-overview-cards min-w-0">
      <section aria-labelledby="monthly-budget-heading" className="min-w-0 rounded-[24px] border border-[var(--line)] p-5" style={{ background: "linear-gradient(140deg, var(--accent-tint), var(--surface) 70%)", boxShadow: "var(--shadow-card)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="monthly-budget-heading" className="text-[14px] font-semibold first-letter:uppercase text-[var(--ink)]">{month}</h2>
          <Link href="/dashboard/settings" className="flex min-h-11 items-center gap-1 text-[12px] font-medium text-[var(--accent-strong)]">{t("editBudget")}<ArrowUpRight size={14} aria-hidden="true" /></Link>
        </div>
        <p className="mt-2 text-[13px] font-medium text-[var(--ink-muted)]">{summary.over ? t("overBudget") : t("remaining")}</p>
        <p className="mt-1 break-words text-[clamp(2rem,6vw,3rem)] leading-tight font-bold tracking-tight tabular-nums" style={{ color: summary.over ? "var(--negative)" : "var(--ink)" }} title={summary.remaining === null ? undefined : exactMoney(summary.remaining)}>
          {summary.remaining === null ? "—" : money(Math.abs(summary.remaining))}
        </p>
        {budget === null ? <Link href="/dashboard/settings" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-fg)]">{t("setBudget")}</Link> : <>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-[var(--surface-3)]" role="progressbar" aria-label={t("budgetUsed")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.progress} aria-valuetext={t("spentOf", { spent: exactMoney(spent), budget: exactMoney(budget) })}>
            <div className="h-full rounded-full" style={{ width: `${summary.progress}%`, background: summary.over ? "var(--negative)" : "var(--accent)" }} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] text-[var(--ink-muted)]">
            <Link href="/dashboard/expenses" className="rounded-lg py-1"><span>{t("spent")}</span><strong className="mt-0.5 block text-[16px] font-semibold tabular-nums text-[var(--ink)]">{money(spent)}</strong></Link>
            <div className="py-1 text-right"><span>{t("budget")}</span><strong className="mt-0.5 block text-[16px] font-semibold tabular-nums text-[var(--ink)]">{money(budget)}</strong></div>
          </div>
          <div className="mt-4 border-t border-[var(--line)] pt-3 text-[12px] text-[var(--ink-muted)]">{t("daily", { amount: money(summary.daily ?? 0), days: daysRemaining })}</div>
        </>}
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-muted)]">{monthlyBudget === null && budget !== null ? t("forecastBudget") : t("plannedHint")}</p>
      </section>

      <section aria-labelledby="annual-summary-heading" className="min-w-0 rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-5" style={{ boxShadow: "var(--shadow-card)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="annual-summary-heading" className="text-[14px] font-semibold">{t("yearToDate", { year })}</h2>
          <span className="text-[11px] text-[var(--ink-muted)]">{t("through", { date: date.toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" }) })}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-[14px] bg-[var(--surface-2)] p-1" role="group" aria-label={t("annualMetric")}>
          {(["net", "spent"] as const).map(view => <button key={view} type="button" aria-pressed={annualView === view} onClick={() => setAnnualView(view)} className="min-h-11 min-w-0 rounded-[11px] px-2 text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]" style={{ background: annualView === view ? "var(--surface)" : "transparent", color: annualView === view ? "var(--ink)" : "var(--ink-muted)", boxShadow: annualView === view ? "var(--shadow-card)" : undefined }}>{view === "net" ? t("net") : t("totalSpent")}</button>)}
        </div>
        <div className="mt-4" aria-live="polite" aria-atomic="true">
          <p className="text-[12px] text-[var(--ink-muted)]">{annualView === "spent" ? t("totalSpent") : annual.net < 0 ? t("overspent") : t("kept")}</p>
          <p className="mt-1 break-words text-[clamp(1.8rem,5vw,2.5rem)] leading-tight font-bold tracking-tight tabular-nums" style={{ color: yearColor }} title={exactMoney(yearValue)}>{money(yearValue, annualView === "net")}</p>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-[12px]">
          <div><dt className="text-[var(--ink-muted)]">{t("received")}</dt><dd className="mt-1 text-[15px] font-semibold tabular-nums">{money(annual.income)}</dd></div>
          <div className="text-right"><dt className="text-[var(--ink-muted)]">{t("paidSpending")}</dt><dd className="mt-1 text-[15px] font-semibold tabular-nums">{money(annual.spent)}</dd></div>
        </dl>
        <p className="mt-4 border-t border-[var(--line)] pt-3 text-[11px] leading-relaxed text-[var(--ink-muted)]">{t("actualHint")}</p>
      </section>
    </div>

    <Link href="/dashboard/networth" className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
      <span className="flex items-center gap-2.5 text-[13px] font-medium text-[var(--ink-muted)]"><Wallet size={17} aria-hidden="true" />{t("wealth")}</span>
      <span className="flex items-center gap-2 text-[17px] font-semibold tabular-nums">{money(netWorth)}<ArrowUpRight size={17} aria-hidden="true" /></span>
    </Link>
  </div>;
}
