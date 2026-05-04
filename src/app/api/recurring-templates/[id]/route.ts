import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { ExpenseType, RecurrenceInterval } from "@prisma/client";

// GET - Get single template
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

    const template = await prisma.recurringTemplate.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        category: { select: { id: true, name: true } },
        bankAccount: { select: { id: true, name: true } },
        projects: { select: { id: true, name: true } },
        _count: { select: { expenses: true } },
      },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error("Get template error:", error);
    return NextResponse.json({ error: "Failed to fetch template" }, { status: 500 });
  }
}

// PUT - Update template
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
    const { name, type, amount, currency, interval, dayOfMonth, categoryId, bankAccountId, isActive, autoGenerate, projectIds, excludeFromBudget, description } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const existing = await prisma.recurringTemplate.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Parse dayOfMonth - empty string means null (no specific day)
    const parsedDayOfMonth = dayOfMonth !== undefined
      ? (dayOfMonth === "" || dayOfMonth === null ? null : parseInt(dayOfMonth))
      : existing.dayOfMonth;

    // Recalculate next due if dayOfMonth changed
    let nextDue = existing.nextDue;
    if (parsedDayOfMonth !== existing.dayOfMonth) {
      const now = new Date();
      nextDue = new Date(now.getFullYear(), now.getMonth(), parsedDayOfMonth || 1);
      if (nextDue <= now) {
        nextDue.setMonth(nextDue.getMonth() + 1);
      }
    }

    const newAmount = amount !== undefined ? (amount ? parseFloat(amount) : null) : existing.amount;

    const template = await prisma.recurringTemplate.update({
      where: { id },
      data: {
        name,
        type: type ? (type as ExpenseType) : existing.type,
        amount: newAmount,
        currency: currency || existing.currency,
        interval: interval ? (interval as RecurrenceInterval) : existing.interval,
        dayOfMonth: parsedDayOfMonth, // null = no specific day (monthly)
        categoryId: categoryId !== undefined ? (categoryId || null) : existing.categoryId,
        bankAccountId: bankAccountId !== undefined ? (bankAccountId || null) : existing.bankAccountId,
        isActive: isActive !== undefined ? isActive : existing.isActive,
        autoGenerate: autoGenerate !== undefined ? autoGenerate : existing.autoGenerate,
        description: description !== undefined ? (description || null) : existing.description,
        excludeFromBudget: excludeFromBudget !== undefined ? excludeFromBudget : existing.excludeFromBudget,
        nextDue,
        ...(projectIds !== undefined
          ? { projects: { set: projectIds.map((pid: string) => ({ id: pid })) } }
          : {}),
      },
      include: {
        category: { select: { id: true, name: true } },
        bankAccount: { select: { id: true, name: true } },
        projects: { select: { id: true, name: true } },
      },
    });

    // Bidirectional sync: propagate name/amount changes to any linked Liability.
    const linkedLoans = await prisma.liability.findMany({
      where: { recurringTemplateId: id, workspaceId: workspace.id },
      select: { id: true, name: true, monthlyPayment: true, currency: true },
    });
    for (const loan of linkedLoans) {
      const updates: { name?: string; monthlyPayment?: number } = {};
      if (name !== undefined && name !== loan.name) updates.name = name;
      if (newAmount != null && Number(loan.monthlyPayment) !== Number(newAmount)) {
        updates.monthlyPayment = Number(newAmount);
      }
      if (Object.keys(updates).length > 0) {
        await prisma.liability.update({
          where: { id: loan.id },
          data: updates,
        });
      }
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error("Update template error:", error);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}

// DELETE - Delete template
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

    const existing = await prisma.recurringTemplate.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Unlink expenses from this template
    await prisma.expense.updateMany({
      where: { recurringTemplateId: id },
      data: { recurringTemplateId: null },
    });

    // Delete the template
    await prisma.recurringTemplate.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete template error:", error);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
