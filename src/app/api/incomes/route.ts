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

    // Filter by month/year (explicit null check - "0" is valid for January)
    if (month !== null && year !== null) {
      const startDate = new Date(parseInt(year), parseInt(month), 1);
      const endDate = new Date(parseInt(year), parseInt(month) + 1, 0, 23, 59, 59);
      where.date = { gte: startDate, lte: endDate };
    } else if (year !== null) {
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

    // For month/year queries, also include recurring incomes that should apply to this month
    // even if they were created in a previous month
    let virtualRecurringIncomes: typeof incomes = [];

    // Late-month threshold: if paid on day >= 25, that salary funds NEXT month's budget
    const LATE_MONTH_THRESHOLD = 25;

    if (month && year) {
      const requestedMonth = parseInt(month);
      const requestedYear = parseInt(year);
      const requestedDate = new Date(requestedYear, requestedMonth, 1);

      // Find recurring incomes created BEFORE the requested month that aren't already in results
      const existingIds = new Set(incomes.map((i) => i.id));

      const recurringIncomes = await prisma.income.findMany({
        where: {
          workspaceId,
          isRecurring: true,
          date: { lt: requestedDate }, // Created before the requested month
        },
        include: {
          bankAccount: { select: { id: true, name: true } },
        },
      });

      // Create "virtual" entries for recurring incomes that apply to the requested month
      for (const recurring of recurringIncomes) {
        if (!existingIds.has(recurring.id)) {
          const dayOfMonth = recurring.dayOfMonth || 1;

          // For late-month pay (day >= 25), the income from PREVIOUS month funds THIS month
          // So for February's budget, we show January 29th's salary
          const isLateMonthPay = dayOfMonth >= LATE_MONTH_THRESHOLD;

          let sourceMonth = requestedMonth;
          let sourceYear = requestedYear;

          if (isLateMonthPay) {
            // Show previous month's payday as this month's income
            sourceMonth = requestedMonth - 1;
            if (sourceMonth < 0) {
              sourceMonth = 11;
              sourceYear = requestedYear - 1;
            }
          }

          // Cap dayOfMonth to the last day of the source month
          const lastDayOfSourceMonth = new Date(sourceYear, sourceMonth + 1, 0).getDate();
          const safeDay = Math.min(dayOfMonth, lastDayOfSourceMonth);
          const virtualDate = new Date(sourceYear, sourceMonth, safeDay);

          virtualRecurringIncomes.push({
            ...recurring,
            date: virtualDate,
            // Mark as virtual (won't affect DB, just for display)
          });
        }
      }
    }

    // Combine actual incomes with virtual recurring entries
    const allIncomes = [...incomes, ...virtualRecurringIncomes];

    // Sort by date descending
    allIncomes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Calculate totals
    const total = allIncomes.reduce((sum, i) => sum + Number(i.amountEur), 0);
    const recurringTotal = allIncomes
      .filter((i) => i.isRecurring)
      .reduce((sum, i) => sum + Number(i.amountEur), 0);

    return NextResponse.json({
      incomes: allIncomes,
      total,
      recurringTotal,
      count: allIncomes.length,
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
        name: name.slice(0, 255), // Enforce max length
        description: description ? description.slice(0, 1000) : null,
        type: (type as IncomeType) || IncomeType.OTHER,
        amount: parsedAmount,
        currency: incomeCurrency,
        amountEur: amountEur,
        exchangeRate: exchangeRate, // Store exchange rate in database
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

    return NextResponse.json({ income }, { status: 201 });
  } catch (error) {
    console.error("Failed to create income:", error);
    return NextResponse.json(
      { error: "Failed to create income" },
      { status: 500 }
    );
  }
}
