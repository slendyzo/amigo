"use client";

import { countsAsSpending } from "@/lib/expense-spending";
import { useTranslations } from "next-intl";
import { countsInProjectTotal, PROJECT_TOTAL_MODES, type ProjectCounting, type ProjectTotalMode } from "@/lib/project-expense-totals";

export function ExpenseProjectCounting({ fullyReimbursed, projectTotalMode, onReimbursedChange, onModeChange }: {
  fullyReimbursed: boolean;
  projectTotalMode: ProjectTotalMode;
  onReimbursedChange: (value: boolean) => void;
  onModeChange: (value: ProjectTotalMode) => void;
}) {
  const t = useTranslations("modals.projectCounting");
  return <section className="space-y-4 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-4">
    <label className="flex min-h-11 cursor-pointer items-start gap-3">
      <input type="checkbox" checked={fullyReimbursed} onChange={e => onReimbursedChange(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]" />
      <span><span className="block text-[13px] font-medium text-[var(--ink)]">{t("reimbursed")}</span><span className="mt-1 block text-[12px] text-[var(--ink-muted)]">{t("reimbursedHint")}</span></span>
    </label>
    <fieldset>
      <legend className="mb-2 text-[13px] font-medium text-[var(--ink)]">{t("title")}</legend>
      <div className="grid grid-cols-3 gap-2">
        {PROJECT_TOTAL_MODES.map(mode => <button key={mode} type="button" aria-pressed={projectTotalMode === mode} onClick={() => onModeChange(mode)} className="min-h-11 rounded-[12px] px-2 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]" style={{ background: projectTotalMode === mode ? "var(--accent)" : "var(--surface-2)", color: projectTotalMode === mode ? "var(--accent-fg)" : "var(--ink)" }}>{t(mode)}</button>)}
      </div>
      <p className="mt-2 text-[12px] text-[var(--ink-muted)]">{t(`${projectTotalMode}Hint`)}</p>
      <p role="status" className="mt-2 text-[12px] font-medium text-[var(--ink)]">{t(countsInProjectTotal({ fullyReimbursed, projectTotalMode }) ? "counted" : "notCounted")}</p>
      <p className="mt-1 text-[12px] text-[var(--ink-muted)]">{t("scope")}</p>
    </fieldset>
  </section>;
}

export function ProjectExpenseStatus({ expense }: { expense: ProjectCounting }) {
  const t = useTranslations("modals.projectCounting");
  if (!expense.fullyReimbursed && (!expense.projectTotalMode || expense.projectTotalMode === "AUTO")) return null;
  return <span className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-[var(--ink-muted)]">
    <NetZeroExpenseStatus expense={expense} />
    {expense.fullyReimbursed && <span>{t("reimbursed")}</span>}
    <span>{t(countsInProjectTotal(expense) ? "counted" : "notCounted")}</span>
  </span>;
}

export function NetZeroExpenseStatus({ expense }: { expense: ProjectCounting }) {
  const t = useTranslations("modals.projectCounting");
  return countsAsSpending(expense) ? null : <span className="ml-2 shrink-0 rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--ink-muted)]">{t("netZero")}</span>;
}
