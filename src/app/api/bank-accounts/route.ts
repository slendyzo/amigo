import { spendingWhere } from "@/lib/expense-spending";
import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { convertToEur } from "@/lib/currency";
import { trackedAccountBalance } from "@/lib/account-balance";
import { prisma } from "@/lib/db";

// GET - List bank accounts
export async function GET() {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const bankAccounts = await prisma.bankAccount.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { expenses: true } },
      },
    });

    const now = new Date();
    const [incomes, expenses] = await Promise.all([
      prisma.income.groupBy({ by: ["bankAccountId", "currency"],
        where: { workspaceId: workspace.id, bankAccountId: { not: null }, date: { lte: now } },
        _sum: { amount: true, amountEur: true } }),
      prisma.expense.groupBy({ by: ["bankAccountId", "currency"],
        where: { workspaceId: workspace.id, bankAccountId: { not: null }, status: "PAID", ...spendingWhere, date: { lte: now } },
        _sum: { amount: true, amountEur: true } }),
    ]);
    const accountsWithBalances = await Promise.all(bankAccounts.map(async account => {
      const movements = (rows: typeof incomes) => rows.filter(row => row.bankAccountId === account.id)
        .map(row => ({ currency: row.currency, amount: Number(row._sum.amount ?? 0), amountEur: Number(row._sum.amountEur ?? 0) }));
      const incoming = movements(incomes);
      const outgoing = movements(expenses);
      const hasForeign = [...incoming, ...outgoing].some(row => row.currency !== account.currency);
      const rate = hasForeign ? (await convertToEur(1, account.currency)).exchangeRate : 1;
      return { ...account, trackedBalance: trackedAccountBalance(Number(account.balance), account.currency, rate, incoming, outgoing) };
    }));
    return NextResponse.json({ bankAccounts: accountsWithBalances });
  } catch (error) {
    console.error("Get bank accounts error:", error);
    return NextResponse.json({ error: "Failed to fetch bank accounts" }, { status: 500 });
  }
}

// POST - Create bank account
export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const body = await request.json();
    const { name, currency, balance } = body;
    if (balance !== undefined && (typeof balance !== "number" || !Number.isFinite(balance) || Math.abs(balance) >= 1e10)) {
      return NextResponse.json({ error: "Invalid opening balance" }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const bankAccount = await prisma.bankAccount.create({
      data: {
        workspaceId: workspace.id,
        name,
        ...(balance !== undefined ? { balance } : {}),
        currency: currency || "EUR",
      },
    });

    return NextResponse.json({ bankAccount }, { status: 201 });
  } catch (error) {
    console.error("Create bank account error:", error);
    return NextResponse.json({ error: "Failed to create bank account" }, { status: 500 });
  }
}
