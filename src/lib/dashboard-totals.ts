import { spendingEur } from "./expense-spending";

type SpendingRow = Parameters<typeof spendingEur>[0] & { id: string; date: Date | string; status: string; type: string };
type IncomeRow = {
  amountEur: unknown; date: Date | string; isRecurring: boolean;
  type?: string; name?: string; currency?: string; bankAccountId?: string | null;
  interval?: string | null; dayOfMonth?: number | null;
};
export type AnnualSummary = { income: number; spent: number; net: number };
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function yearToDateBounds(asOf: Date) {
  return { gte: new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1)), lte: asOf };
}

// Recurring income is stored once; the income screen synthesizes later paydays.
// Query schedules starting before this year too, but never another workspace.
export function annualIncomeWhere(workspaceId: string, asOf: Date) {
  return { workspaceId, OR: [
    { isRecurring: false, date: yearToDateBounds(asOf) },
    { isRecurring: true, date: { lte: asOf } },
  ] };
}

function incomeThroughDate(incomes: IncomeRow[], asOf: Date): number {
  const { gte } = yearToDateBounds(asOf);
  const recorded = incomes.filter(row => !row.isRecurring && +new Date(row.date) >= +gte && +new Date(row.date) <= +asOf);
  const usedReceipts = new Set<number>();
  const sourceName = (name?: string) => name?.trim().toLocaleLowerCase("en-US");
  let total = recorded.reduce((sum, row) => sum + Number(row.amountEur), 0);
  for (const row of incomes.filter(row => row.isRecurring)) {
    const start = new Date(row.date);
    if (!Number.isFinite(+start) || start > asOf) continue;
    const interval = row.interval ?? "MONTHLY";
    const add = (payday: Date) => {
      if (payday < start || payday < gte || payday > asOf) return;
      // There is no occurrence/source foreign key. Only replace an estimate
      // when the explicit source identity matches; never guess from amount or
      // account alone. A receipt group can replace just one schedule.
      const matches = recorded.flatMap((actual, index) => {
        const date = new Date(actual.date);
        const samePeriod = date.getUTCFullYear() === payday.getUTCFullYear()
          && date.getUTCMonth() === payday.getUTCMonth()
          && (interval !== "WEEKLY" || date.getUTCDate() === payday.getUTCDate());
        return !usedReceipts.has(index) && row.name?.trim() && row.type && row.currency
          && actual.type === row.type && sourceName(actual.name) === sourceName(row.name)
          && actual.currency === row.currency
          && (actual.bankAccountId ?? null) === (row.bankAccountId ?? null) && samePeriod ? [index] : [];
      });
      matches.forEach(index => usedReceipts.add(index));
      const replaced = matches.length > 0;
      if (!replaced) total += Number(row.amountEur);
    };
    if (interval === "WEEKLY") {
      const week = 7 * 86400000;
      for (let time = +start + Math.max(0, Math.ceil((+gte - +start) / week)) * week; time <= +asOf; time += week) add(new Date(time));
    } else {
      const step = interval === "MONTHLY" ? 1 : interval === "QUARTERLY" ? 3 : interval === "YEARLY" ? 12 : 0;
      if (!step) { add(start); continue; }
      const startMonth = start.getUTCFullYear() * 12 + start.getUTCMonth();
      const firstMonth = Math.max(startMonth, gte.getUTCFullYear() * 12);
      const lastMonth = asOf.getUTCFullYear() * 12 + asOf.getUTCMonth();
      for (let month = startMonth + Math.ceil((firstMonth - startMonth) / step) * step; month <= lastMonth; month += step) {
        const year = Math.floor(month / 12), index = month % 12;
        // The stored date is the first receipt; later dates follow the schedule.
        const day = Math.min(Math.max(1, row.dayOfMonth ?? start.getUTCDate()), new Date(Date.UTC(year, index + 1, 0)).getUTCDate());
        add(month === startMonth ? start : new Date(Date.UTC(year, index, day)));
      }
    }
  }
  return round(total);
}

/** Income through today, including elapsed configured paydays; spending is paid only. */
export function annualSummary(incomes: IncomeRow[], expenses: SpendingRow[], asOf: Date, transferExpenseIds: Iterable<string> = []): AnnualSummary {
  const bounds = yearToDateBounds(asOf);
  const inPeriod = (date: Date | string) => { const value = new Date(date).getTime(); return value >= +bounds.gte && value <= +bounds.lte; };
  const transfers = new Set(transferExpenseIds);
  const income = incomeThroughDate(incomes, asOf);
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
