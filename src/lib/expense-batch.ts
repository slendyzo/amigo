import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { CATEGORY_VARIANTS, parseQuickAdd } from "./parser";
import { CURRENCIES } from "./currencies";

const TYPES = ["SURVIVAL_FIXED", "SURVIVAL_VARIABLE", "LIFESTYLE", "PROJECT"] as const;
type ExpenseType = typeof TYPES[number];
const SUPPORTED_CURRENCIES = new Set<string>(CURRENCIES);
const KEYS = new Set(["clientId", "name", "merchant", "amount", "currency", "date", "categoryId", "bankAccountId", "type", "projectIds", "excludeFromBudget", "description"]);

export class ExpenseBatchError extends Error {
  constructor(message: string, public status = 400, public code = "INVALID_BATCH") {
    super(message);
    this.name = "ExpenseBatchError";
  }
}

export interface BatchExpense {
  clientId: string;
  name: string;
  merchant: string | null;
  amount: number;
  currency: string;
  date: string;
  categoryId?: string;
  bankAccountId?: string | null;
  type?: ExpenseType;
  projectIds: string[];
  excludeFromBudget: boolean;
  description: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ExpenseBatchError(`Invalid ${field}`);
  }
  const cleaned = value.replace(/<[^>]*>/g, "").trim();
  if (!cleaned) throw new ExpenseBatchError(`Invalid ${field}`);
  return cleaned;
}

function note(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new ExpenseBatchError("Invalid description");
  return value.replace(/<[^>]*>/g, "").trim() || null;
}

function expectedWorkspaceId(body: unknown): string {
  if (!isRecord(body)) throw new ExpenseBatchError("Invalid import");
  return text(body.expectedWorkspaceId, "expected workspace ID", 100);
}

export function assertExpenseBatchWorkspace(body: unknown, activeWorkspaceId: string): void {
  if (expectedWorkspaceId(body) !== activeWorkspaceId) throw new ExpenseBatchError("The active workspace changed. Return to the original workspace before saving this import.", 409, "WORKSPACE_CHANGED");
}

export function validateExpenseBatch(body: unknown): BatchExpense[] {
  expectedWorkspaceId(body);
  if (!isRecord(body) || Object.keys(body).some(key => key !== "expenses" && key !== "expectedWorkspaceId") || !Array.isArray(body.expenses) || body.expenses.length < 1 || body.expenses.length > 50) {
    throw new ExpenseBatchError("Provide between 1 and 50 expenses");
  }
  const clientIds = new Set<string>();
  return body.expenses.map(value => {
    if (!isRecord(value) || Object.keys(value).some(key => !KEYS.has(key))) throw new ExpenseBatchError("Invalid expense fields");
    if (typeof value.clientId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.clientId)) throw new ExpenseBatchError("Invalid client ID");
    const clientId = value.clientId.toLowerCase();
    if (clientIds.has(clientId)) throw new ExpenseBatchError("Duplicate client ID");
    clientIds.add(clientId);
    if (typeof value.amount !== "number" || !Number.isFinite(value.amount) || value.amount <= 0 || value.amount > 9999999999.99 || Math.abs(value.amount * 100 - Math.round(value.amount * 100)) > 0.0001) throw new ExpenseBatchError("Invalid expense amount");
    if (typeof value.currency !== "string" || !SUPPORTED_CURRENCIES.has(value.currency)) throw new ExpenseBatchError("Unsupported currency");
    if (typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !Number.isFinite(Date.parse(value.date)) || new Date(value.date).toISOString().slice(0, 10) !== value.date || Number(value.date.slice(0, 4)) < 1900) throw new ExpenseBatchError("Invalid expense date");
    if (value.type !== undefined && !TYPES.includes(value.type as ExpenseType)) throw new ExpenseBatchError("Invalid expense type");
    if (value.excludeFromBudget !== undefined && typeof value.excludeFromBudget !== "boolean") throw new ExpenseBatchError("Invalid budget option");
    if (value.projectIds !== undefined && (!Array.isArray(value.projectIds) || value.projectIds.length > 50)) throw new ExpenseBatchError("Invalid projects");
    const projectIds = (value.projectIds as unknown[] | undefined ?? []).map(id => text(id, "project ID", 100));
    if (new Set(projectIds).size !== projectIds.length) throw new ExpenseBatchError("Duplicate project ID");
    return {
      clientId,
      name: text(value.name, "name", 255),
      merchant: value.merchant == null ? null : text(value.merchant, "merchant", 255),
      amount: Math.round(value.amount * 100) / 100,
      currency: value.currency,
      date: value.date,
      categoryId: value.categoryId === undefined ? undefined : text(value.categoryId, "category ID", 100),
      bankAccountId: value.bankAccountId === undefined ? undefined : value.bankAccountId === null ? null : text(value.bankAccountId, "bank account ID", 100),
      type: value.type as ExpenseType | undefined,
      projectIds: projectIds.sort(),
      excludeFromBudget: value.excludeFromBudget as boolean | undefined ?? false,
      description: note(value.description),
    };
  });
}

export function screenshotExpenseId(workspaceId: string, clientId: string): string {
  return `ss_${createHash("sha256").update(JSON.stringify([workspaceId, clientId])).digest("hex")}`;
}

function fingerprint(expense: BatchExpense): string {
  return `screenshot-batch:${createHash("sha256").update(JSON.stringify(expense)).digest("hex")}`;
}

export async function saveExpenseBatch(
  db: PrismaClient,
  workspace: { id: string; defaultBankAccountId: string | null },
  expenses: BatchExpense[],
  convert: (amount: number, currency: string) => Promise<{ amountEur: number; exchangeRate: number }>,
) {
  const ids = expenses.map(expense => screenshotExpenseId(workspace.id, expense.clientId));
  const lookup = {
    where: { workspaceId: workspace.id, id: { in: ids } },
    include: { category: { include: { parent: true } }, bankAccount: true, projects: true },
  } as const;
  // A completed retry must work even if exchange rates are temporarily unavailable.
  // The transaction repeats this check under the lock for races and partial retries.
  const previous = await db.expense.findMany(lookup);
  const previousById = new Map(previous.map(expense => [expense.id, expense]));
  expenses.forEach((expense, index) => {
    const saved = previousById.get(ids[index]);
    if (saved && saved.rawInput !== fingerprint(expense)) throw new ExpenseBatchError("This import was already saved with different details. Refresh expenses before trying again.", 409, "IMPORT_CONFLICT");
  });
  if (previous.length === expenses.length) return { expenses: ids.map(id => previousById.get(id)!), replayed: true };
  // Fetch exchange rates before opening a transaction to avoid holding a database
  // connection while waiting for an external rate service. Only currency is sent.
  const conversions = await Promise.all(expenses.map(expense => convert(expense.amount, expense.currency)));
  if (conversions.some(item => !Number.isFinite(item.amountEur) || item.amountEur <= 0 || item.amountEur > 9999999999.99 || !Number.isFinite(item.exchangeRate) || item.exchangeRate <= 0 || item.exchangeRate >= 1000000)) throw new ExpenseBatchError("Converted amount is outside the supported range");
  return db.$transaction(async tx => {
    // Serialize screenshot imports in this workspace so concurrent retries cannot
    // race their existence check or create duplicate fallback categories.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${workspace.id}, 0))`;
    const existing = await tx.expense.findMany(lookup);
    const byId = new Map(existing.map(expense => [expense.id, expense]));
    expenses.forEach((expense, index) => {
      const saved = byId.get(ids[index]);
      if (saved && saved.rawInput !== fingerprint(expense)) throw new ExpenseBatchError("This import was already saved with different details. Refresh expenses before trying again.", 409, "IMPORT_CONFLICT");
    });
    if (existing.length === expenses.length) return { expenses: ids.map(id => byId.get(id)!), replayed: true };

    const categoryIds = [...new Set(expenses.flatMap(expense => expense.categoryId ? [expense.categoryId] : []))];
    const accountIds = [...new Set(expenses.flatMap(expense => expense.bankAccountId ? [expense.bankAccountId] : expense.bankAccountId === undefined && workspace.defaultBankAccountId ? [workspace.defaultBankAccountId] : []))];
    const projectIds = [...new Set(expenses.flatMap(expense => expense.projectIds))];
    const [categories, accounts, projects, mappings] = await Promise.all([
      tx.category.findMany({ where: { workspaceId: workspace.id } }),
      tx.bankAccount.findMany({ where: { workspaceId: workspace.id, id: { in: accountIds } }, select: { id: true } }),
      tx.project.findMany({ where: { workspaceId: workspace.id, id: { in: projectIds } }, select: { id: true } }),
      tx.keywordMapping.findMany({ where: { workspaceId: workspace.id } }),
    ]);
    if (categoryIds.some(id => !categories.some(category => category.id === id)) || accountIds.some(id => !accounts.some(account => account.id === id)) || projectIds.some(id => !projects.some(project => project.id === id))) throw new ExpenseBatchError("A category, account or project does not belong to the active workspace", 400, "INVALID_REFERENCE");
    let fallback = categories.find(category => category.name === "Uncategorized");
    const results = [];
    for (const [index, expense] of expenses.entries()) {
      const saved = byId.get(ids[index]);
      if (saved) { results.push(saved); continue; }
      const search = `${expense.name} ${expense.merchant ?? ""}`.toLowerCase();
      const match = mappings.filter(mapping => search.includes(mapping.keyword.toLowerCase())).sort((a, b) => b.keyword.length - a.keyword.length)[0];
      let categoryId = expense.categoryId ?? (match?.categoryId && categories.some(category => category.id === match.categoryId) ? match.categoryId : undefined);
      if (!categoryId) {
        const suggested = parseQuickAdd(`${expense.merchant ?? expense.name} ${expense.amount}`).category;
        const variants = suggested ? CATEGORY_VARIANTS[suggested] ?? [suggested] : [];
        categoryId = categories.find(category => variants.includes(category.name))?.id;
      }
      if (!categoryId) {
        fallback ??= await tx.category.create({ data: { workspaceId: workspace.id, name: "Uncategorized", isSystem: true } });
        categoryId = fallback.id;
      }
      const mappedType = match?.expenseType && TYPES.includes(match.expenseType as ExpenseType) ? match.expenseType as ExpenseType : "LIFESTYLE";
      results.push(await tx.expense.create({
        data: {
          id: ids[index], workspaceId: workspace.id, rawInput: fingerprint(expense),
          name: expense.name, merchant: expense.merchant, amount: expense.amount,
          currency: expense.currency, ...conversions[index], date: new Date(`${expense.date}T00:00:00.000Z`),
          type: expense.type ?? mappedType, status: "PAID", categoryId,
          bankAccountId: expense.bankAccountId === undefined ? workspace.defaultBankAccountId : expense.bankAccountId,
          excludeFromBudget: expense.excludeFromBudget, description: expense.description,
          projects: expense.projectIds.length ? { connect: expense.projectIds.map(id => ({ id })) } : undefined,
        },
        include: { category: { include: { parent: true } }, bankAccount: true, projects: true },
      }));
    }
    return { expenses: results, replayed: false };
  }, { timeout: 15000 });
}
