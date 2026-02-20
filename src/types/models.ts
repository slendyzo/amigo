/**
 * Shared type definitions for the Amigo application.
 * These types are used across multiple components and should be imported from this file.
 */

export type Category = {
  id: string;
  name: string;
};

export type BankAccount = {
  id: string;
  name: string;
};

export type Project = {
  id: string;
  name: string;
  isActive?: boolean;
};

export type ExpenseType = "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT";

export type ExpenseStatus = "PAID" | "PENDING";

export type Expense = {
  id: string;
  name: string;
  amount: number;
  currency?: string;
  amountEur?: number;
  exchangeRate?: number;
  type: ExpenseType;
  date: string;
  isRecurring?: boolean;
  recurringTemplateId?: string | null;
  category: Category | null;
  bankAccount: BankAccount | null;
  projects: Project[];
  excludeFromBudget?: boolean;
  notes?: string;
  description?: string;
  rawInput?: string;
  merchant?: string;
  status?: ExpenseStatus;
  dueDate?: string;
  paidAt?: string;
  importLogId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type IncomeType = "SALARY" | "FREELANCE" | "INVESTMENT" | "SALE" | "GIFT" | "REFUND" | "OTHER";

export type Income = {
  id: string;
  name: string;
  description?: string;
  type: IncomeType;
  amount: number;
  currency: string;
  date: string;
  bankAccount: BankAccount | null;
};
