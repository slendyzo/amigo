// A salary can vary each month without being a recurring forecast.
export function isRegularIncome(income: { type: string; isRecurring: boolean }): boolean {
  return income.type === "SALARY" || income.isRecurring;
}

// A manually recorded paycheck replaces the recurring salary estimate for
// that account in this month. Other recurring income streams remain intact.
export function hasRecordedSalary(
  recurring: { type: string; bankAccountId: string | null },
  recorded: { type: string; isRecurring: boolean; bankAccountId: string | null }[],
): boolean {
  return recurring.type === "SALARY" && recorded.some(income =>
    income.type === "SALARY" && !income.isRecurring && income.bankAccountId === recurring.bankAccountId);
}
