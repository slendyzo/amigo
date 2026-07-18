import { prisma } from "@/lib/db";
import { parseQuickAdd, CATEGORY_VARIANTS } from "@/lib/parser";
import { convertToEur } from "@/lib/currency";
import { stripHtmlTags } from "@/lib/utils";
import { createInstallmentPlan } from "@/lib/installments";

/** Minimal workspace shape needed to create a quick-add expense */
export interface QuickAddWorkspace {
  id: string;
  defaultCurrency: string;
}

export interface QuickAddOptions {
  date?: Date; // Transaction date (defaults to now)
  currency?: string; // Original currency (defaults to workspace default)
  amount?: number; // Override the parsed amount (Shortcuts Mode B, supports negatives/refunds)
  apiTokenId?: string; // Set when created through an iOS Shortcut

  // Passed straight through to the create. Before this logic was extracted, a
  // quick-add body fell through to the manual path and these were honoured, so
  // they stay honoured here.
  status?: "PAID" | "PENDING";
  dueDate?: Date | null;
  projectIds?: string[];
  excludeFromBudget?: boolean;
  description?: string | null;
  amountExpression?: string | null;
  imageUrls?: string | null;
  splitCount?: number | null;
  splitData?: string | null;
  realAssetId?: string | null;
}

type ExpenseTypeValue = "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT";

/**
 * Create an expense from a quick-add string like "mcd 12".
 *
 * Extracted verbatim from POST /api/expenses (quick-add branch) so the
 * iOS Shortcuts endpoint can share the exact same behaviour:
 * parse -> bank account hint -> keyword mappings (longest match wins) ->
 * category variants -> default "Uncategorized" -> EUR conversion -> create.
 */
export async function createQuickAddExpense(
  workspace: QuickAddWorkspace,
  input: string,
  opts: QuickAddOptions = {}
) {
  const parsed = parseQuickAdd(input);

  // Find bank account by hint
  let bankAccount = null;
  if (parsed.accountHint) {
    bankAccount = await prisma.bankAccount.findFirst({
      where: {
        workspaceId: workspace.id,
        name: { contains: parsed.accountHint, mode: "insensitive" },
      },
    });
  }

  // Look up keyword mappings for auto-categorization (check original input first)
  let category = null;
  let mappedType: ExpenseTypeValue = "LIFESTYLE";

  // Search using original input (before parser transforms it)
  const inputLower = input.toLowerCase();
  const mappings = await prisma.keywordMapping.findMany({
    where: { workspaceId: workspace.id },
    include: { category: true },
  });

  // Find the best matching keyword (longest match wins)
  let bestMatch: typeof mappings[0] | null = null;
  for (const mapping of mappings) {
    if (inputLower.includes(mapping.keyword)) {
      if (!bestMatch || mapping.keyword.length > bestMatch.keyword.length) {
        bestMatch = mapping;
      }
    }
  }

  if (bestMatch) {
    if (bestMatch.categoryId) {
      category = bestMatch.category;
    }
    if (bestMatch.expenseType) {
      mappedType = bestMatch.expenseType as ExpenseTypeValue;
    }
  }

  // If no database mapping found, try to find category by parser's suggestion
  // Try all language variants of the category name
  if (!category && parsed.category) {
    const variants = CATEGORY_VARIANTS[parsed.category] || [parsed.category];
    category = await prisma.category.findFirst({
      where: {
        workspaceId: workspace.id,
        name: { in: variants },
      },
    });
  }

  // Ensure we have a default category
  let categoryId = category?.id || null;
  if (!categoryId) {
    let defaultCategory = await prisma.category.findFirst({
      where: { workspaceId: workspace.id, name: "Uncategorized" },
    });

    if (!defaultCategory) {
      defaultCategory = await prisma.category.create({
        data: { workspaceId: workspace.id, name: "Uncategorized", isSystem: true },
      });
    }

    categoryId = defaultCategory.id;
  }

  // "iphone 600 12x" → create an installment plan (fixed-term recurring
  // template) instead of a single expense, and return installment 1.
  const amount = opts.amount ?? parsed.amount;
  if (parsed.installmentMonths && amount > 0) {
    const { template } = await createInstallmentPlan({
      workspaceId: workspace.id,
      name: stripHtmlTags(parsed.name, 255),
      totalAmount: amount,
      months: parsed.installmentMonths,
      currency: opts.currency || workspace.defaultCurrency || "EUR",
      startDate: opts.date || new Date(),
      type: mappedType,
      categoryId,
      bankAccountId: bankAccount?.id || null,
      description: opts.description ?? null,
      projectIds: opts.projectIds ?? [],
      excludeFromBudget: opts.excludeFromBudget ?? false,
    });
    const firstInstallment = await prisma.expense.findFirst({
      where: { recurringTemplateId: template.id },
      orderBy: { date: "asc" },
      include: {
        category: { include: { parent: true } },
        bankAccount: true,
        projects: true,
      },
    });
    if (!firstInstallment) {
      throw new Error("Installment plan created but no installment was generated");
    }
    return firstInstallment;
  }

  // Convert to EUR for consistent totals
  const expenseCurrency = opts.currency || workspace.defaultCurrency || "EUR";
  const { amountEur, exchangeRate } = await convertToEur(amount, expenseCurrency);

  const projectIds = opts.projectIds ?? [];

  const expense = await prisma.expense.create({
    data: {
      workspaceId: workspace.id,
      name: stripHtmlTags(parsed.name, 255),
      rawInput: stripHtmlTags(input, 500),
      type: mappedType,
      status: opts.status === "PENDING" ? "PENDING" : "PAID",
      amount,
      amountExpression: opts.amountExpression ?? null,
      currency: expenseCurrency,
      amountEur,
      exchangeRate,
      date: opts.date || new Date(),
      dueDate: opts.dueDate ?? null,
      categoryId,
      bankAccountId: bankAccount?.id || null,
      apiTokenId: opts.apiTokenId ?? null,
      excludeFromBudget: opts.excludeFromBudget ?? false,
      description: opts.description ?? null,
      imageUrls: opts.imageUrls ?? null,
      splitCount: opts.splitCount ?? null,
      splitData: opts.splitData ?? null,
      realAssetId: opts.realAssetId ?? null,
      projects: projectIds.length > 0 ? { connect: projectIds.map((id) => ({ id })) } : undefined,
    },
    include: {
      category: { include: { parent: true } },
      bankAccount: true,
      projects: true,
    },
  });

  return expense;
}
