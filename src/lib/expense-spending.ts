import { effectiveEur } from "./split-utils";
import type { ProjectCounting } from "./project-expense-totals";

/** Bookkeeping-only records remain in history but have no financial impact.
 * INCLUDE is a project-only override; it cannot restore overall spending. */
export function countsAsSpending(expense: ProjectCounting): boolean {
  return !expense.fullyReimbursed && expense.projectTotalMode !== "EXCLUDE";
}

export function spendingEur(expense: Parameters<typeof effectiveEur>[0] & ProjectCounting): number {
  return countsAsSpending(expense) ? effectiveEur(expense) : 0;
}

/** Database counterpart for aggregate queries; legacy records have false/AUTO defaults. */
export const spendingWhere = { fullyReimbursed: false, projectTotalMode: { not: "EXCLUDE" as const } };
