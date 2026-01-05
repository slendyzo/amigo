import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseQuickAdd } from "@/lib/parser";

// GET - List expenses
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const type = searchParams.get("type");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const projectId = searchParams.get("projectId");

    const workspace = await prisma.workspace.findFirst({
      where: { members: { some: { userId: session.user.id } } },
    });

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

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
        orderBy: { date: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          name: true,
          amount: true,
          amountEur: true,
          type: true,
          date: true,
          isRecurring: true,
          recurringTemplateId: true,
          excludeFromBudget: true,
          category: true,
          bankAccount: true,
          projects: true,
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { quickAdd, name, amount, type, categoryId, bankAccountId, projectId, projectIds, date, currency } = body;

    // Support both single projectId (legacy) and projectIds array
    const projectIdsToConnect: string[] = projectIds || (projectId ? [projectId] : []);

    const workspace = await prisma.workspace.findFirst({
      where: { members: { some: { userId: session.user.id } } },
    });

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

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

      // Find category by parsed category name
      let category = null;
      if (parsed.category) {
        category = await prisma.category.findFirst({
          where: { workspaceId: workspace.id, name: parsed.category },
        });
      }

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

      // Look up keyword mappings for auto-categorization
      let mappedType: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT" = "LIFESTYLE";
      if (!category) {
        // Search for keyword mappings that match the expense name
        const nameLower = parsed.name.toLowerCase();
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
            category = bestMatch.category;
          }
          if (bestMatch.expenseType) {
            mappedType = bestMatch.expenseType as typeof mappedType;
          }
        }
      }

      expenseData = {
        name: parsed.name,
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

      expenseData = {
        name,
        amount: parseFloat(amount),
        type: type || "LIFESTYLE",
        categoryId: categoryId || null,
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

    const expense = await prisma.expense.create({
      data: {
        workspaceId: workspace.id,
        name: expenseData.name,
        rawInput: quickAdd || null,
        type: expenseData.type,
        status: "PAID",
        amount: expenseData.amount,
        currency: currency || "EUR",
        amountEur: expenseData.amount, // TODO: Currency conversion
        date: date ? new Date(date) : new Date(),
        categoryId: expenseData.categoryId,
        bankAccountId: expenseData.bankAccountId,
        projects: projectIdsToConnect.length > 0
          ? { connect: projectIdsToConnect.map(id => ({ id })) }
          : undefined,
      },
      include: {
        category: true,
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Expense ID is required" }, { status: 400 });
    }

    const workspace = await prisma.workspace.findFirst({
      where: { members: { some: { userId: session.user.id } } },
    });

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
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
