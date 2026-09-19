type Movement = { currency: string; amount: number; amountEur: number };

// Preserve exact native amounts; use recorded EUR values only for foreign
// transactions. The opening amount never becomes an income transaction.
export function trackedAccountBalance(
  opening: number,
  currency: string,
  eurPerUnit: number,
  incomes: Movement[],
  expenses: Movement[],
): number {
  const amount = (entry: Movement) => entry.currency === currency ? entry.amount : entry.amountEur / eurPerUnit;
  return Math.round((opening + incomes.reduce((sum, i) => sum + amount(i), 0)
    - expenses.reduce((sum, e) => sum + amount(e), 0)) * 100) / 100;
}
