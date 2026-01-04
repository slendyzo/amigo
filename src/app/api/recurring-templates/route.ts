import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ExpenseType, RecurrenceInterval } from "@prisma/client";

// GET - List recurring templates
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace = await prisma.workspace.findFirst({
      where: { members: { some: { userId: session.user.id } } },
    });

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const templates = await prisma.recurringTemplate.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { name: "asc" },
      include: {
        category: { select: { id: true, name: true } },
        bankAccount: { select: { id: true, name: true } },
        _count: { select: { expenses: true } },
      },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Get recurring templates error:", error);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

// POST - Create recurring template
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, type, amount, currency, interval, dayOfMonth, categoryId, bankAccountId, autoGenerate } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!type || !Object.values(ExpenseType).includes(type)) {
      return NextResponse.json({ error: "Valid expense type is required" }, { status: 400 });
    }

    const workspace = await prisma.workspace.findFirst({
      where: { members: { some: { userId: session.user.id } } },
    });

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Calculate next due date (use day 1 if no specific day set)
    const now = new Date();
    const parsedDayOfMonth = dayOfMonth ? parseInt(dayOfMonth) : null;
    let nextDue = new Date(now.getFullYear(), now.getMonth(), parsedDayOfMonth || 1);
    if (nextDue <= now) {
      nextDue.setMonth(nextDue.getMonth() + 1);
    }

    const template = await prisma.recurringTemplate.create({
      data: {
        workspaceId: workspace.id,
        name,
        type: type as ExpenseType,
        amount: amount ? parseFloat(amount) : null,
        currency: currency || "EUR",
        interval: (interval as RecurrenceInterval) || RecurrenceInterval.MONTHLY,
        dayOfMonth: parsedDayOfMonth, // null = no specific day (monthly)
        categoryId: categoryId || null,
        bankAccountId: bankAccountId || null,
        autoGenerate: autoGenerate || false,
        nextDue,
        isActive: true,
      },
      include: {
        category: { select: { id: true, name: true } },
        bankAccount: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error("Create recurring template error:", error);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
