import { effectiveEur } from "./split-utils";

export const PROJECT_TOTAL_MODES = ["AUTO", "INCLUDE", "EXCLUDE"] as const;
export type ProjectTotalMode = typeof PROJECT_TOTAL_MODES[number];
export type ProjectCounting = { fullyReimbursed?: boolean; projectTotalMode?: ProjectTotalMode };

export function countsInProjectTotal(expense: ProjectCounting): boolean {
  if (expense.projectTotalMode === "INCLUDE") return true;
  if (expense.projectTotalMode === "EXCLUDE") return false;
  return !expense.fullyReimbursed;
}

/** Only project totals use this policy. Split repayments never change own share. */
export function projectContributionEur(expense: Parameters<typeof effectiveEur>[0] & ProjectCounting): number {
  return countsInProjectTotal(expense) ? effectiveEur(expense) : 0;
}

/** Preserve omitted fields during partial updates; reject coercions and unknown modes. */
export function projectCountingUpdate(body: Record<string, unknown>): ProjectCounting {
  const update: ProjectCounting = {};
  if (body.fullyReimbursed !== undefined) {
    if (typeof body.fullyReimbursed !== "boolean") throw new Error("Invalid reimbursement status");
    update.fullyReimbursed = body.fullyReimbursed;
  }
  if (body.projectTotalMode !== undefined) {
    if (!PROJECT_TOTAL_MODES.includes(body.projectTotalMode as ProjectTotalMode)) throw new Error("Invalid project total mode");
    update.projectTotalMode = body.projectTotalMode as ProjectTotalMode;
  }
  return update;
}
