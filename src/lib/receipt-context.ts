import type { Expense } from "@prisma/client";

/** A private receipt context contains only fields needed to name and render shares. */
export function serializeReceiptExpense(expense: Expense) {
  return {
    id: expense.id,
    description: expense.name,
    date: expense.date.toISOString(),
    amount: Number(expense.amount),
    amountEur: Number(expense.amountEur),
    currency: expense.currency,
    splitCount: expense.splitCount,
    splitData: expense.splitData,
    updatedAt: expense.updatedAt.toISOString(),
  };
}
