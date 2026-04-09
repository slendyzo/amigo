import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";

type RangeKey = "1w" | "1m" | "3m" | "6m" | "1y" | "all";

function getStartDate(range: RangeKey): Date | null {
  const now = new Date();
  switch (range) {
    case "1w":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "1m":
      return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case "3m":
      return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    case "6m":
      return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    case "1y":
      return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    case "all":
      return null;
    default:
      return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  }
}

// GET - Portfolio value history for charts
export async function GET(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace } = context;

    const { searchParams } = new URL(request.url);
    const range = (searchParams.get("range") || "1m") as RangeKey;
    const validRanges: RangeKey[] = ["1w", "1m", "3m", "6m", "1y", "all"];
    if (!validRanges.includes(range)) {
      return NextResponse.json(
        { error: `Invalid range. Must be one of: ${validRanges.join(", ")}` },
        { status: 400 }
      );
    }

    // Get all connection IDs for this workspace
    const connections = await prisma.exchangeConnection.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true },
    });

    const connectionIds = connections.map((c) => c.id);

    if (connectionIds.length === 0) {
      return NextResponse.json({ snapshots: [] });
    }

    const startDate = getStartDate(range);

    const whereClause = {
      exchangeConnectionId: { in: connectionIds },
      ...(startDate ? { date: { gte: startDate } } : {}),
    };

    const snapshots = await prisma.portfolioSnapshot.findMany({
      where: whereClause,
      orderBy: { date: "asc" },
      select: {
        date: true,
        totalValueEur: true,
        totalCostEur: true,
        unrealizedPnlEur: true,
        freeCashEur: true,
      },
    });

    // Aggregate across connections per date
    const dateMap = new Map<
      string,
      {
        totalValueEur: number;
        totalCostEur: number;
        unrealizedPnlEur: number;
        freeCashEur: number;
      }
    >();

    for (const snap of snapshots) {
      const dateKey = snap.date.toISOString().slice(0, 10); // YYYY-MM-DD
      const existing = dateMap.get(dateKey);
      const freeCash = snap.freeCashEur ? Number(snap.freeCashEur) : 0;

      if (existing) {
        existing.totalValueEur += Number(snap.totalValueEur);
        existing.totalCostEur += Number(snap.totalCostEur);
        existing.unrealizedPnlEur += Number(snap.unrealizedPnlEur);
        existing.freeCashEur += freeCash;
      } else {
        dateMap.set(dateKey, {
          totalValueEur: Number(snap.totalValueEur),
          totalCostEur: Number(snap.totalCostEur),
          unrealizedPnlEur: Number(snap.unrealizedPnlEur),
          freeCashEur: freeCash,
        });
      }
    }

    const aggregated = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({
        date,
        totalValueEur: values.totalValueEur,
        totalCostEur: values.totalCostEur,
        unrealizedPnlEur: values.unrealizedPnlEur,
        freeCashEur: values.freeCashEur,
      }));

    return NextResponse.json({ snapshots: aggregated });
  } catch (error) {
    console.error("Get portfolio snapshots error:", error);
    return NextResponse.json(
      { error: "Failed to fetch portfolio snapshots" },
      { status: 500 }
    );
  }
}
