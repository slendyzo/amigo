import { spendingEur } from "./expense-spending";

type SpendingRow = Parameters<typeof spendingEur>[0] & { id: string; date: Date | string; status: string; type: string };
type IncomeRow = { amountEur: unknown; date: Date | string; isRecurring: boolean };
export type AnnualSummary = { income: number; spent: number; net: number };
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function yearToDateBounds(asOf: Date) {
  return { gte: new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1)), lte: asOf };
}

/** Actual cash flow only: templates, future/pending items and broker transfers aren't spending. */
export function annualSummary(incomes: IncomeRow[], expenses: SpendingRow[], asOf: Date, transferExpenseIds: Iterable<string> = []): AnnualSummary {
  const bounds = yearToDateBounds(asOf);
  const inPeriod = (date: Date | string) => { const value = new Date(date).getTime(); return value >= +bounds.gte && value <= +bounds.lte; };
  const transfers = new Set(transferExpenseIds);
  const income = round(incomes.filter(row => !row.isRecurring && inPeriod(row.date)).reduce((sum, row) => sum + Number(row.amountEur), 0));
  const spent = round(expenses.filter(row => row.status === "PAID" && row.type !== "INVESTMENT" && !transfers.has(row.id) && inPeriod(row.date)).reduce((sum, row) => sum + spendingEur(row), 0));
  return { income, spent, net: round(income - spent) };
}

export function monthlyBudgetSummary(budget: number | null, spent: number, daysRemaining: number) {
  const remaining = budget === null ? null : round(budget - spent);
  return {
    remaining,
    over: remaining !== null && remaining < 0,
    progress: budget !== null && budget > 0 ? Math.min(100, Math.max(0, spent / budget * 100)) : spent > 0 ? 100 : 0,
    daily: remaining === null ? null : Math.max(0, Math.floor(remaining / Math.max(1, daysRemaining))),
  };
}
