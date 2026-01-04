import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { IncomeType, RecurrenceInterval } from "@prisma/client";
import { convertToEur } from "@/lib/currency";

// GET /api/incomes - List all incomes
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const type = searchParams.get("type");

    // Get the user's workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id },
      include: { workspace: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }

    const workspaceId = membership.workspaceId;

    // Build where clause
    const where: {
      workspaceId: string;
      type?: IncomeType;
      date?: { gte: Date; lte: Date };
    } = { workspaceId };

    // Filter by type
    if (type && type !== "all") {
      where.type = type as IncomeType;
    }

    // Filter by month/year
    if (month && year) {
      const startDate = new Date(parseInt(year), parseInt(month), 1);
      const endDate = new Date(parseInt(year), parseInt(month) + 1, 0, 23, 59, 59);
      where.date = { gte: startDate, lte: endDate };
    } else if (year) {
      const startDate = new Date(parseInt(year), 0, 1);
      const endDate = new Date(parseInt(year), 11, 31, 23, 59, 59);
      where.date = { gte: startDate, lte: endDate };
    }

    const incomes = await prisma.income.findMany({
      where,
      include: {
        bankAccount: { select: { id: true, name: true } },
      },
      orderBy: { date: "desc" },
    });

    // Calculate totals
    const total = incomes.reduce((sum, i) => sum + Number(i.amountEur), 0);
    const recurringTotal = incomes
      .filter((i) => i.isRecurring)
      .reduce((sum, i) => sum + Number(i.amountEur), 0);

    return NextResponse.json({
      incomes,
      total,
      recurringTotal,
      count: incomes.length,
    });
  } catch (error) {
    console.error("Failed to fetch incomes:", error);
    return NextResponse.json(
      { error: "Failed to fetch incomes" },
      { status: 500 }
    );
  }
}

// POST /api/incomes - Create new income
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    if (!name || !amount) {
      return NextResponse.json(
        { error: "Name and amount are required" },
        { status: 400 }
      );
    }

    // Get the user's workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id },
      include: { workspace: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }

    const parsedAmount = parseFloat(amount);
    const incomeDate = date ? new Date(date) : new Date();
    const incomeCurrency = currency || "EUR";

    // Convert to EUR for consistent totals
    const { amountEur, exchangeRate } = await convertToEur(parsedAmount, incomeCurrency);

    const income = await prisma.income.create({
      data: {
        workspaceId: membership.workspaceId,
        name,
        description: description || null,
        type: (type as IncomeType) || IncomeType.OTHER,
        amount: parsedAmount,
        currency: incomeCurrency,
        amountEur: amountEur,
        date: incomeDate,
        bankAccountId: bankAccountId || null,
        isRecurring: isRecurring || false,
        interval: isRecurring ? ((interval as RecurrenceInterval) || RecurrenceInterval.MONTHLY) : null,
        dayOfMonth: isRecurring && dayOfMonth ? parseInt(dayOfMonth) : null,
      },
      include: {
        bankAccount: { select: { id: true, name: true } },
      },
    });

    // Return with exchange rate info
    return NextResponse.json({
      income: {
        ...income,
        exchangeRate: incomeCurrency !== "EUR" ? exchangeRate : undefined,
      }
    }, { status: 201 });
  } catch (error) {
    console.error("Failed to create income:", error);
    return NextResponse.json(
      { error: "Failed to create income" },
      { status: 500 }
    );
  }
}
