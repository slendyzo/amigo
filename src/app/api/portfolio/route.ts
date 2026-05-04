import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { reconcileStuckSyncs } from "@/lib/exchanges/sync";

// GET - Aggregated portfolio summary across all exchanges
export async function GET() {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace } = context;

    // Self-heal: any connection stuck in SYNCING > 5min (e.g., from a process
    // restart mid-sync) gets flipped to ERROR so the UI doesn't spin forever.
    const reconciled = await reconcileStuckSyncs(workspace.id);
    if (reconciled > 0) {
      console.log(`[Portfolio] Reconciled ${reconciled} stuck SYNCING row(s)`);
    }

    const connections = await prisma.exchangeConnection.findMany({
      where: { workspaceId: workspace.id, isActive: true },
      select: {
        id: true,
        provider: true,
        label: true,
        syncStatus: true,
        lastSyncAt: true,
        freeCash: true,
        freeCashCurrency: true,
        assets: {
          select: {
            id: true,
            symbol: true,
            name: true,
            assetType: true,
            quantity: true,
            currentValueEur: true,
            totalCostEur: true,
            unrealizedPnlEur: true,
            unrealizedPnlPct: true,
          },
        },
      },
    });

    // Aggregate totals across all connections
    let totalValueEur = 0;
    let totalCostEur = 0;
    let unrealizedPnlEur = 0;
    let freeCash = 0;

    const exchanges = connections.map((conn) => {
      const connValueEur = conn.assets.reduce(
        (sum, a) => sum + Number(a.currentValueEur),
        0
      );
      const connCostEur = conn.assets.reduce(
        (sum, a) => sum + Number(a.totalCostEur),
        0
      );
      const connPnlEur = conn.assets.reduce(
        (sum, a) => sum + Number(a.unrealizedPnlEur),
        0
      );
      const connFreeCash = conn.freeCash ? Number(conn.freeCash) : 0;

      totalValueEur += connValueEur;
      totalCostEur += connCostEur;
      unrealizedPnlEur += connPnlEur;
      freeCash += connFreeCash;

      return {
        id: conn.id,
        provider: conn.provider,
        label: conn.label,
        syncStatus: conn.syncStatus,
        lastSyncAt: conn.lastSyncAt,
        freeCash: connFreeCash,
        freeCashCurrency: conn.freeCashCurrency,
        totalValueEur: connValueEur,
        totalCostEur: connCostEur,
        unrealizedPnlEur: connPnlEur,
        unrealizedPnlPct:
          connCostEur > 0
            ? ((connPnlEur / connCostEur) * 100)
            : 0,
        assetCount: conn.assets.length,
      };
    });

    const unrealizedPnlPct =
      totalCostEur > 0 ? ((unrealizedPnlEur / totalCostEur) * 100) : 0;

    return NextResponse.json({
      totalValue: totalValueEur,
      totalCost: totalCostEur,
      unrealizedPnl: unrealizedPnlEur,
      unrealizedPnlPct,
      freeCash,
      exchanges,
    });
  } catch (error) {
    console.error("Get portfolio summary error:", error);
    return NextResponse.json(
      { error: "Failed to fetch portfolio summary" },
      { status: 500 }
    );
  }
}
