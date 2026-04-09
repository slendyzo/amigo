import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";

// POST - Dismiss a deposit (mark as ignored)
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

    const updated = await prisma.exchangeDeposit.update({
      where: { id },
      data: { dismissed: true },
      select: {
        id: true,
        linkedExpenseId: true,
        dismissed: true,
      },
    });

    return NextResponse.json({ deposit: updated });
  } catch (error) {
    console.error("Dismiss deposit error:", error);
    return NextResponse.json(
      { error: "Failed to dismiss deposit" },
      { status: 500 }
    );
  }
}
