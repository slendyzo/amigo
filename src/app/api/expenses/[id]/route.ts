import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { convertToEur } from "@/lib/currency";

const LEARNING_THRESHOLD = 3;

// Helper to trigger category learning after categorization
async function triggerCategoryLearning(
  expenseName: string,
  categoryId: string,
  workspaceId: string
) {
  const keyword = expenseName.toLowerCase().trim();

  // Skip very short keywords
  if (keyword.length < 3) return;

  // Check if mapping already exists
  const existingMapping = await prisma.keywordMapping.findUnique({
    where: {
      workspaceId_keyword: {
        workspaceId,
        keyword,
      },
    },
  });

  if (existingMapping) return;

  // Count categorizations of this name to this category
  const count = await prisma.expense.count({
    where: {
      workspaceId,
      categoryId,
      name: {
        equals: expenseName,
        mode: "insensitive",
      },
    },
  });

  // Create mapping if threshold reached
  if (count >= LEARNING_THRESHOLD) {
    await prisma.keywordMapping.create({
      data: {
        workspaceId,
        keyword,
        categoryId,
        isSystem: false,
      },
    });
    console.log(`[Learning] Created mapping: "${keyword}" → category ${categoryId}`);
  }
}

// GET - Get single expense
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const { id } = await params;

    const expense = await prisma.expense.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        category: { include: { parent: true } },
        bankAccount: true,
        projects: true,
      },
    });

    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    return NextResponse.json({ expense });
  } catch (error) {
    console.error("Get expense error:", error);
    return NextResponse.json({ error: "Failed to fetch expense" }, { status: 500 });
  }
}

// PUT - Update expense
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const { id } = await params;
    const body = await request.json();
    const { name, amount, amountExpression, type, categoryId, bankAccountId, projectId, projectIds, date, currency, excludeFromBudget, status, imageUrls, categorizedAt, splitCount, splitData, description } = body;

    // Support both single projectId (legacy) and projectIds array
    const projectIdsToSet: string[] | undefined = projectIds !== undefined
      ? projectIds
      : (projectId !== undefined ? (projectId ? [projectId] : []) : undefined);

    // Verify expense exists and belongs to workspace
    const existing = await prisma.expense.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    // Build update data
    type UpdateData = {
      name?: string;
      amount?: number;
      amountExpression?: string | null;
      amountEur?: number;
      exchangeRate?: number;
      type?: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT";
      status?: "PAID" | "PENDING";
      categoryId?: string | null;
      bankAccountId?: string | null;
      date?: Date;
      currency?: string;
      projects?: { set: { id: string }[] };
      excludeFromBudget?: boolean;
      paidAt?: Date | null;
      imageUrls?: string | null;
      categorizedAt?: Date | null;
      splitCount?: number | null;
      splitData?: string | null;
      description?: string | null;
    };

    const updateData: UpdateData = {};

    if (name !== undefined) updateData.name = name;
    if (amountExpression !== undefined) updateData.amountExpression = amountExpression || null;
    if (type !== undefined) updateData.type = type;
    if (categoryId !== undefined) updateData.categoryId = categoryId || null;
    if (bankAccountId !== undefined) updateData.bankAccountId = bankAccountId || null;
    if (projectIdsToSet !== undefined) {
      updateData.projects = { set: projectIdsToSet.map(pid => ({ id: pid })) };
    }
    if (date !== undefined) updateData.date = new Date(date);
    if (excludeFromBudget !== undefined) updateData.excludeFromBudget = excludeFromBudget;
    if (imageUrls !== undefined) updateData.imageUrls = imageUrls || null;
    if (categorizedAt !== undefined) updateData.categorizedAt = categorizedAt ? new Date(categorizedAt) : null;
    if (splitCount !== undefined) updateData.splitCount = splitCount || null;
    if (splitData !== undefined) updateData.splitData = splitData || null;
    if (description !== undefined) updateData.description = description || null;
    if (status !== undefined) {
      updateData.status = status;
      // Set paidAt when marking as paid
      if (status === "PAID" && existing.status === "PENDING") {
        updateData.paidAt = new Date();
      } else if (status === "PENDING") {
        updateData.paidAt = null;
      }
    }

    // Handle amount and currency changes together
    const newAmount = amount !== undefined ? parseFloat(amount) : existing.amount.toNumber();
    const newCurrency = currency !== undefined ? currency : existing.currency;

    // Recalculate EUR amount if amount or currency changed
    if (amount !== undefined || currency !== undefined) {
      const { amountEur, exchangeRate } = await convertToEur(newAmount, newCurrency);
      updateData.amount = newAmount;
      updateData.currency = newCurrency;
      updateData.amountEur = amountEur;
      updateData.exchangeRate = exchangeRate;
    }

    const expense = await prisma.expense.update({
      where: { id },
      data: updateData,
      include: {
        category: { include: { parent: true } },
        bankAccount: true,
        projects: true,
      },
    });

    // Trigger learning if category was updated
    if (categoryId && expense.name) {
      // Fire and forget - don't wait for learning to complete
      triggerCategoryLearning(expense.name, categoryId, workspace.id).catch(
        (err) => console.error("Category learning failed:", err)
      );
    }

    return NextResponse.json({ expense });
  } catch (error) {
    console.error("Update expense error:", error);
    return NextResponse.json({ error: "Failed to update expense" }, { status: 500 });
  }
}

// DELETE - Delete expense
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const { id } = await params;

    // Verify expense exists and belongs to workspace
    const existing = await prisma.expense.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    await prisma.expense.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete expense error:", error);
    return NextResponse.json({ error: "Failed to delete expense" }, { status: 500 });
  }
}
