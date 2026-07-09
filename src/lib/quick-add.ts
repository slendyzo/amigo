import { prisma } from "@/lib/db";
import { parseQuickAdd, CATEGORY_VARIANTS } from "@/lib/parser";
import { convertToEur } from "@/lib/currency";
import { stripHtmlTags } from "@/lib/utils";

/** Minimal workspace shape needed to create a quick-add expense */
export interface QuickAddWorkspace {
  id: string;
  defaultCurrency: string;
}

export interface QuickAddOptions {
  date?: Date; // Transaction date (defaults to now)
  currency?: string; // Original currency (defaults to workspace default)
  amount?: number; // Override the parsed amount (Shortcuts Mode B, supports negatives/refunds)
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

  // Convert to EUR for consistent totals
  const amount = opts.amount ?? parsed.amount;
  const expenseCurrency = opts.currency || workspace.defaultCurrency || "EUR";
  const { amountEur, exchangeRate } = await convertToEur(amount, expenseCurrency);

  const expense = await prisma.expense.create({
    data: {
      workspaceId: workspace.id,
      name: stripHtmlTags(parsed.name, 255),
      rawInput: stripHtmlTags(input, 500),
      type: mappedType,
      status: "PAID",
      amount,
      currency: expenseCurrency,
      amountEur,
      exchangeRate,
      date: opts.date || new Date(),
      categoryId,
      bankAccountId: bankAccount?.id || null,
    },
    include: {
      category: { include: { parent: true } },
      bankAccount: true,
      projects: true,
    },
  });

  return expense;
}
