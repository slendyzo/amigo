import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";

// POST - Link a deposit to an expense
export async function POST(
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
    const { expenseId } = body;

    if (!expenseId) {
      return NextResponse.json(
        { error: "expenseId is required" },
        { status: 400 }
      );
    }

    // Verify deposit belongs to this workspace (via exchange connection)
    const deposit = await prisma.exchangeDeposit.findFirst({
      where: { id },
      include: {
        exchangeConnection: {
          select: { workspaceId: true },
        },
      },
    });

    if (!deposit) {
      return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
    }

    if (deposit.exchangeConnection.workspaceId !== workspace.id) {
      return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
    }

    // Verify the expense also belongs to this workspace
    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, workspaceId: workspace.id },
    });

    if (!expense) {
      return NextResponse.json(
        { error: "Expense not found" },
        { status: 404 }
      );
    }

    const updated = await prisma.exchangeDeposit.update({
      where: { id },
      data: { linkedExpenseId: expenseId },
      select: {
        id: true,
        linkedExpenseId: true,
        dismissed: true,
      },
    });

    return NextResponse.json({ deposit: updated });
  } catch (error) {
    console.error("Link deposit error:", error);
    return NextResponse.json(
      { error: "Failed to link deposit to expense" },
      { status: 500 }
    );
  }
}
