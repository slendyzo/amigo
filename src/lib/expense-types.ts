/**
 * Expense type constants and utilities.
 * Centralizes expense type definitions to avoid duplication.
 */

export const EXPENSE_TYPE_VALUES = [
  "LIFESTYLE",
  "SURVIVAL_FIXED",
  "SURVIVAL_VARIABLE",
] as const;

export type ExpenseTypeValue = (typeof EXPENSE_TYPE_VALUES)[number];

export const EXPENSE_TYPE_COLORS: Record<ExpenseTypeValue, string> = {
  LIFESTYLE: "purple",
  SURVIVAL_FIXED: "blue",
  SURVIVAL_VARIABLE: "cyan",
};

/**
 * Get the Tailwind CSS classes for an expense type button.
 * @param type - The expense type
 * @param isSelected - Whether the button is selected
 * @returns Tailwind CSS class string
 */
export function getExpenseTypeButtonClass(type: ExpenseTypeValue, isSelected: boolean): string {
  if (!isSelected) {
    return "bg-slate-100 text-slate-600 hover:bg-slate-200";
  }

  const color = EXPENSE_TYPE_COLORS[type];
  switch (color) {
    case "purple":
      return "bg-purple-600 text-white";
    case "blue":
      return "bg-blue-600 text-white";
    case "cyan":
      return "bg-cyan-600 text-white";
    default:
      return "bg-slate-600 text-white";
  }
}

/**
 * Get the badge/pill classes for displaying an expense type.
 */
export const EXPENSE_TYPE_BADGE_CLASSES: Record<string, string> = {
  SURVIVAL_FIXED: "bg-blue-100 text-blue-700",
  SURVIVAL_VARIABLE: "bg-cyan-100 text-cyan-700",
  LIFESTYLE: "bg-purple-100 text-purple-700",
  PROJECT: "bg-amber-100 text-amber-700",
};
