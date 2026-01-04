import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ExpenseType, RecurrenceInterval } from "@prisma/client";

// GET - Get single template
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

    const template = await prisma.recurringTemplate.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        category: { select: { id: true, name: true } },
        bankAccount: { select: { id: true, name: true } },
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, type, amount, currency, interval, dayOfMonth, categoryId, bankAccountId, isActive, autoGenerate } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const workspace = await prisma.workspace.findFirst({
      where: { members: { some: { userId: session.user.id } } },
    });

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
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

    const template = await prisma.recurringTemplate.update({
      where: { id },
      data: {
        name,
        type: type ? (type as ExpenseType) : existing.type,
        amount: amount !== undefined ? (amount ? parseFloat(amount) : null) : existing.amount,
        currency: currency || existing.currency,
        interval: interval ? (interval as RecurrenceInterval) : existing.interval,
        dayOfMonth: parsedDayOfMonth, // null = no specific day (monthly)
        categoryId: categoryId !== undefined ? (categoryId || null) : existing.categoryId,
        bankAccountId: bankAccountId !== undefined ? (bankAccountId || null) : existing.bankAccountId,
        isActive: isActive !== undefined ? isActive : existing.isActive,
        autoGenerate: autoGenerate !== undefined ? autoGenerate : existing.autoGenerate,
        nextDue,
      },
      include: {
        category: { select: { id: true, name: true } },
        bankAccount: { select: { id: true, name: true } },
      },
    });

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
