import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";

// GET - Single asset detail
export async function GET(
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

    const asset = await prisma.portfolioAsset.findFirst({
      where: { id },
      include: {
        exchangeConnection: {
          select: {
            id: true,
            provider: true,
            label: true,
            workspaceId: true,
            syncStatus: true,
            lastSyncAt: true,
          },
        },
      },
    });

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Verify workspace ownership through the exchange connection
    if (asset.exchangeConnection.workspaceId !== workspace.id) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const serialized = {
      id: asset.id,
      exchangeConnectionId: asset.exchangeConnectionId,
      exchange: {
        id: asset.exchangeConnection.id,
        provider: asset.exchangeConnection.provider,
        label: asset.exchangeConnection.label,
        syncStatus: asset.exchangeConnection.syncStatus,
        lastSyncAt: asset.exchangeConnection.lastSyncAt,
      },
      symbol: asset.symbol,
      name: asset.name,
      assetType: asset.assetType,
      quantity: Number(asset.quantity),
      averageBuyPrice: Number(asset.averageBuyPrice),
      averageBuyPriceEur: Number(asset.averageBuyPriceEur),
      currentPrice: Number(asset.currentPrice),
      currentPriceEur: Number(asset.currentPriceEur),
      currentValue: Number(asset.currentValue),
      currentValueEur: Number(asset.currentValueEur),
      totalCost: Number(asset.totalCost),
      totalCostEur: Number(asset.totalCostEur),
      unrealizedPnl: Number(asset.unrealizedPnl),
      unrealizedPnlEur: Number(asset.unrealizedPnlEur),
      unrealizedPnlPct: Number(asset.unrealizedPnlPct),
      currency: asset.currency,
      lastUpdatedAt: asset.lastUpdatedAt,
    };

    return NextResponse.json({ asset: serialized });
  } catch (error) {
    console.error("Get portfolio asset error:", error);
    return NextResponse.json(
      { error: "Failed to fetch portfolio asset" },
      { status: 500 }
    );
  }
}
