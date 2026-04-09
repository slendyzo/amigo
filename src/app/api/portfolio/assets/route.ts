import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";

// GET - All assets across all exchanges, sorted by value descending
export async function GET() {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace } = context;

    // Fetch all active connections for this workspace, then their assets
    const connections = await prisma.exchangeConnection.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true },
    });

    const connectionIds = connections.map((c) => c.id);

    if (connectionIds.length === 0) {
      return NextResponse.json({ assets: [] });
    }

    const assets = await prisma.portfolioAsset.findMany({
      where: {
        exchangeConnectionId: { in: connectionIds },
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
      orderBy: { currentValueEur: "desc" },
    });

    // Convert all Decimal fields to numbers
    const serialized = assets.map((a) => ({
      id: a.id,
      exchangeConnectionId: a.exchangeConnectionId,
      exchange: {
        id: a.exchangeConnection.id,
        provider: a.exchangeConnection.provider,
        label: a.exchangeConnection.label,
      },
      symbol: a.symbol,
      name: a.name,
      assetType: a.assetType,
      quantity: Number(a.quantity),
      averageBuyPrice: Number(a.averageBuyPrice),
      averageBuyPriceEur: Number(a.averageBuyPriceEur),
      currentPrice: Number(a.currentPrice),
      currentPriceEur: Number(a.currentPriceEur),
      currentValue: Number(a.currentValue),
      currentValueEur: Number(a.currentValueEur),
      totalCost: Number(a.totalCost),
      totalCostEur: Number(a.totalCostEur),
      unrealizedPnl: Number(a.unrealizedPnl),
      unrealizedPnlEur: Number(a.unrealizedPnlEur),
      unrealizedPnlPct: Number(a.unrealizedPnlPct),
      currency: a.currency,
      lastUpdatedAt: a.lastUpdatedAt,
    }));

    return NextResponse.json({ assets: serialized });
  } catch (error) {
    console.error("Get portfolio assets error:", error);
    return NextResponse.json(
      { error: "Failed to fetch portfolio assets" },
      { status: 500 }
    );
  }
}
