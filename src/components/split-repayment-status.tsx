"use client";

import { UserRoundCheck, UserRoundX } from "lucide-react";
import { useTranslations } from "next-intl";
import { getRepaymentSummary } from "@/lib/split-utils";

/** A compact read-only summary; the expense row remains the single click target. */
export function SplitRepaymentStatus({ splitCount, splitData }: {
  splitCount?: number | null;
  splitData?: string | null;
}) {
  const t = useTranslations("expenses.repayment");
  const summary = getRepaymentSummary(splitCount, splitData);
  if (!summary) return null;
  const label = t("summary", { paid: summary.paid, total: summary.total });
  return <span role="img" aria-label={label} title={label} className="ml-1.5 inline-flex shrink-0 items-center gap-1 align-middle">
    {summary.people.slice(0, 3).map((person, index) => {
      const Icon = person.paid ? UserRoundCheck : UserRoundX;
      return <span key={index} aria-hidden="true" title={`${person.label || t("person", { number: index + 2 })}: ${t(person.paid ? "paid" : "unpaid")}`}>
        <Icon size={14} strokeWidth={2} style={{ color: person.paid ? "var(--positive)" : "var(--negative)" }} />
      </span>;
    })}
    {summary.total > 3 && <span aria-hidden="true" className="text-[10px] font-medium text-[var(--ink-muted)]">+{summary.total - 3}</span>}
    <span aria-hidden="true" className="text-[11px] font-medium tabular-nums text-[var(--ink-muted)]">{summary.paid}/{summary.total}</span>
  </span>;
}
