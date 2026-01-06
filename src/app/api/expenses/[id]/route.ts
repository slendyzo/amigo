import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { convertToEur } from "@/lib/currency";

// GET - Get single expense
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const workspace = await prisma.workspace.findFirst({
      where: { members: { some: { userId: session.user.id } } },
    });

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const expense = await prisma.expense.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        category: true,
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, amount, type, categoryId, bankAccountId, projectId, projectIds, date, currency, excludeFromBudget } = body;

    // Support both single projectId (legacy) and projectIds array
    const projectIdsToSet: string[] | undefined = projectIds !== undefined
      ? projectIds
      : (projectId !== undefined ? (projectId ? [projectId] : []) : undefined);

    const workspace = await prisma.workspace.findFirst({
      where: { members: { some: { userId: session.user.id } } },
    });

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

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
      amountEur?: number;
      exchangeRate?: number;
      type?: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT";
      categoryId?: string | null;
      bankAccountId?: string | null;
      date?: Date;
      currency?: string;
      projects?: { set: { id: string }[] };
      excludeFromBudget?: boolean;
    };

    const updateData: UpdateData = {};

    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (categoryId !== undefined) updateData.categoryId = categoryId || null;
    if (bankAccountId !== undefined) updateData.bankAccountId = bankAccountId || null;
    if (projectIdsToSet !== undefined) {
      updateData.projects = { set: projectIdsToSet.map(pid => ({ id: pid })) };
    }
    if (date !== undefined) updateData.date = new Date(date);
    if (excludeFromBudget !== undefined) updateData.excludeFromBudget = excludeFromBudget;

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
        category: true,
        bankAccount: true,
        projects: true,
      },
    });

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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const workspace = await prisma.workspace.findFirst({
      where: { members: { some: { userId: session.user.id } } },
    });

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

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
