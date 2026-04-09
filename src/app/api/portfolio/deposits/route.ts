import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";

// GET - Unlinked, undismissed deposits
export async function GET() {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace } = context;

    // Get all connection IDs for this workspace
    const connections = await prisma.exchangeConnection.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true },
    });

    const connectionIds = connections.map((c) => c.id);

    if (connectionIds.length === 0) {
      return NextResponse.json({ deposits: [] });
    }

    const deposits = await prisma.exchangeDeposit.findMany({
      where: {
        exchangeConnectionId: { in: connectionIds },
        linkedExpenseId: null,
        dismissed: false,
      },
      include: {
        exchangeConnection: {
          select: {
            id: true,
            provider: true,
            label: true,
          },
        },
      },
      orderBy: { date: "desc" },
    });

    const serialized = deposits.map((d) => ({
      id: d.id,
      exchangeConnectionId: d.exchangeConnectionId,
      exchange: {
        id: d.exchangeConnection.id,
        provider: d.exchangeConnection.provider,
        label: d.exchangeConnection.label,
      },
      externalId: d.externalId,
      amount: Number(d.amount),
      currency: d.currency,
      amountEur: Number(d.amountEur),
      date: d.date,
      linkedExpenseId: d.linkedExpenseId,
      dismissed: d.dismissed,
    }));

    return NextResponse.json({ deposits: serialized });
  } catch (error) {
    console.error("Get deposits error:", error);
    return NextResponse.json(
      { error: "Failed to fetch deposits" },
      { status: 500 }
    );
  }
}
