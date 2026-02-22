import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseQuickAdd, CATEGORY_VARIANTS } from "@/lib/parser";
import { convertToEur } from "@/lib/currency";
import { stripHtmlTags } from "@/lib/utils";
import { getActiveWorkspace } from "@/lib/workspace";

// GET - List expenses
export async function GET(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace } = context;

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const type = searchParams.get("type");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const projectId = searchParams.get("projectId");

    // Build where clause
    type WhereClause = {
      workspaceId: string;
      type?: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT";
      date?: { gte?: Date; lte?: Date };
      projects?: { some: { id: string } } | { none: Record<string, never> };
    };

    const where: WhereClause = {
      workspaceId: workspace.id,
    };

    if (type) {
      where.type = type as "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT";
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    if (projectId) {
      if (projectId === "__none__") {
        where.projects = { none: {} };
      } else {
        where.projects = { some: { id: projectId } };
      }
    }

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: limit,
        skip: offset,
        select: {
          id: true,
          name: true,
          amount: true,
          currency: true,
          amountEur: true,
          exchangeRate: true,
          type: true,
          date: true,
          status: true,
          dueDate: true,
          paidAt: true,
          isRecurring: true,
          recurringTemplateId: true,
          excludeFromBudget: true,
          category: { include: { parent: true } },
          bankAccount: true,
          projects: true,
          createdAt: true,
        },
      }),
      prisma.expense.count({ where }),
    ]);

    return NextResponse.json({ expenses, total });
  } catch (error) {
    console.error("Get expenses error:", error);
    return NextResponse.json({ error: "Failed to fetch expenses" }, { status: 500 });
  }
}

// POST - Create expense
export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace } = context;

    const body = await request.json();
    const { quickAdd, name, amount, type, categoryId, bankAccountId, projectId, projectIds, date, currency, excludeFromBudget, status, dueDate } = body;

    // Support both single projectId (legacy) and projectIds array
    const projectIdsToConnect: string[] = projectIds || (projectId ? [projectId] : []);

    let expenseData: {
      name: string;
      amount: number;
      type: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT";
      categoryId: string | null;
      bankAccountId: string | null;
    };

    // Quick-add mode: parse the input string
    if (quickAdd) {
      const parsed = parseQuickAdd(quickAdd);

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
      let mappedType: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT" = "LIFESTYLE";

      // Search using original input (before parser transforms it)
      const inputLower = quickAdd.toLowerCase();
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
          mappedType = bestMatch.expenseType as typeof mappedType;
        }
      }

      // If no database mapping found, try to find category by parser's suggestion
      // Try all language variants of the category name
      if (!category && parsed.category) {
        const variants = CATEGORY_VARIANTS[parsed.category] || [parsed.category];
        category = await prisma.category.findFirst({
          where: {
            workspaceId: workspace.id,
            name: { in: variants }
          },
        });
      }

      expenseData = {
        name: stripHtmlTags(parsed.name, 255),
        amount: parsed.amount,
        type: mappedType,
        categoryId: category?.id || null,
        bankAccountId: bankAccount?.id || null,
      };
    } else {
      // Manual mode
      if (!name || amount === undefined) {
        return NextResponse.json({ error: "Name and amount are required" }, { status: 400 });
      }

      // Auto-categorization for manual mode when no category specified
      let resolvedCategoryId = categoryId || null;
      let resolvedType: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT" = type || "LIFESTYLE";

      if (!categoryId) {
        // Search for keyword mappings that match the expense name
        const nameLower = name.toLowerCase();
        const mappings = await prisma.keywordMapping.findMany({
          where: { workspaceId: workspace.id },
          include: { category: true },
        });

        // Find the best matching keyword (longest match wins)
        let bestMatch: typeof mappings[0] | null = null;
        for (const mapping of mappings) {
          if (nameLower.includes(mapping.keyword)) {
            if (!bestMatch || mapping.keyword.length > bestMatch.keyword.length) {
              bestMatch = mapping;
            }
          }
        }

        if (bestMatch) {
          if (bestMatch.categoryId) {
            resolvedCategoryId = bestMatch.categoryId;
          }
          if (bestMatch.expenseType && !type) {
            resolvedType = bestMatch.expenseType as typeof resolvedType;
          }
        }
      }

      expenseData = {
        name: stripHtmlTags(name, 255),
        amount: parseFloat(amount),
        type: resolvedType,
        categoryId: resolvedCategoryId,
        bankAccountId: bankAccountId || null,
      };
    }

    // Ensure we have a default category
    if (!expenseData.categoryId) {
      let defaultCategory = await prisma.category.findFirst({
        where: { workspaceId: workspace.id, name: "Uncategorized" },
      });

      if (!defaultCategory) {
        defaultCategory = await prisma.category.create({
          data: { workspaceId: workspace.id, name: "Uncategorized", isSystem: true },
        });
      }

      expenseData.categoryId = defaultCategory.id;
    }

    // Convert to EUR for consistent totals
    const expenseCurrency = currency || workspace.defaultCurrency || "EUR";
    const { amountEur, exchangeRate } = await convertToEur(expenseData.amount, expenseCurrency);

    // Determine expense status (PAID or PENDING for scheduled expenses)
    const expenseStatus = status === "PENDING" ? "PENDING" : "PAID";
    const expenseDate = date ? new Date(date) : new Date();
    const expenseDueDate = dueDate ? new Date(dueDate) : null;

    const expense = await prisma.expense.create({
      data: {
        workspaceId: workspace.id,
        name: expenseData.name,
        rawInput: quickAdd ? stripHtmlTags(quickAdd, 500) : null,
        type: expenseData.type,
        status: expenseStatus,
        amount: expenseData.amount,
        currency: expenseCurrency,
        amountEur,
        exchangeRate,
        date: expenseDate,
        dueDate: expenseDueDate,
        categoryId: expenseData.categoryId,
        bankAccountId: expenseData.bankAccountId,
        excludeFromBudget: excludeFromBudget || false,
        projects: projectIdsToConnect.length > 0
          ? { connect: projectIdsToConnect.map(id => ({ id })) }
          : undefined,
      },
      include: {
        category: { include: { parent: true } },
        bankAccount: true,
        projects: true,
      },
    });

    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    console.error("Create expense error:", error);
    return NextResponse.json({ error: "Failed to create expense" }, { status: 500 });
  }
}

// DELETE - Delete expense
export async function DELETE(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace } = context;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Expense ID is required" }, { status: 400 });
    }

    // Verify the expense belongs to the user's workspace
    const expense = await prisma.expense.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    await prisma.expense.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete expense error:", error);
    return NextResponse.json({ error: "Failed to delete expense" }, { status: 500 });
  }
}
