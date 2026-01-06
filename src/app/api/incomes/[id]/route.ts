import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { IncomeType, RecurrenceInterval } from "@prisma/client";
import { convertToEur } from "@/lib/currency";

// GET /api/incomes/[id] - Get single income
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

    const income = await prisma.income.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        bankAccount: { select: { id: true, name: true } },
      },
    });

    if (!income) {
      return NextResponse.json({ error: "Income not found" }, { status: 404 });
    }

    return NextResponse.json({ income });
  } catch (error) {
    console.error("Get income error:", error);
    return NextResponse.json({ error: "Failed to fetch income" }, { status: 500 });
  }
}

// PUT /api/incomes/[id] - Update income
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
    const {
      name,
      description,
      type,
      amount,
      currency,
      date,
      bankAccountId,
      isRecurring,
      interval,
      dayOfMonth,
    } = body;

    const workspace = await prisma.workspace.findFirst({
      where: { members: { some: { userId: session.user.id } } },
    });

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const existing = await prisma.income.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Income not found" }, { status: 404 });
    }

    const parsedAmount = amount !== undefined ? parseFloat(amount) : Number(existing.amount);
    const incomeCurrency = currency || existing.currency;

    // Convert to EUR for consistent totals
    const { amountEur, exchangeRate } = await convertToEur(parsedAmount, incomeCurrency);

    const income = await prisma.income.update({
      where: { id },
      data: {
        name: name !== undefined ? String(name).slice(0, 255) : existing.name,
        description: description !== undefined ? (description ? String(description).slice(0, 1000) : null) : existing.description,
        type: type ? (type as IncomeType) : existing.type,
        amount: parsedAmount,
        currency: incomeCurrency,
        amountEur: amountEur,
        exchangeRate: exchangeRate, // Store exchange rate in database
        date: date ? new Date(date) : existing.date,
        bankAccountId: bankAccountId !== undefined ? (bankAccountId || null) : existing.bankAccountId,
        isRecurring: isRecurring !== undefined ? isRecurring : existing.isRecurring,
        interval: isRecurring ? ((interval as RecurrenceInterval) || existing.interval) : null,
        dayOfMonth: isRecurring && dayOfMonth !== undefined ? (dayOfMonth ? parseInt(dayOfMonth) : null) : existing.dayOfMonth,
      },
      include: {
        bankAccount: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ income });
  } catch (error) {
    console.error("Update income error:", error);
    return NextResponse.json({ error: "Failed to update income" }, { status: 500 });
  }
}

// DELETE /api/incomes/[id] - Delete income
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

    const existing = await prisma.income.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Income not found" }, { status: 404 });
    }

    await prisma.income.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete income error:", error);
    return NextResponse.json({ error: "Failed to delete income" }, { status: 500 });
  }
}
