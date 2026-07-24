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
        exchangeConnectionId: true,
        date: true,
        totalValueEur: true,
        totalCostEur: true,
        unrealizedPnlEur: true,
        freeCashEur: true,
      },
    });

    type Vals = {
      totalValueEur: number;
      totalCostEur: number;
      unrealizedPnlEur: number;
      freeCashEur: number;
    };
    const toVals = (snap: {
      totalValueEur: unknown;
      totalCostEur: unknown;
      unrealizedPnlEur: unknown;
      freeCashEur: unknown;
    }): Vals => ({
      totalValueEur: Number(snap.totalValueEur),
      totalCostEur: Number(snap.totalCostEur),
      unrealizedPnlEur: Number(snap.unrealizedPnlEur),
      freeCashEur: snap.freeCashEur ? Number(snap.freeCashEur) : 0,
    });

    // Forward-fill each connection's last-known value across the date ladder.
    // Naively summing per-date rows means a day where only connection A synced
    // omits B entirely → a phantom dip/spike that's a sync-timing artifact, not
    // a real value change. Carry each connection's prior value forward instead.
    const lastByConn = new Map<string, Vals>();

    // Seed from the most recent snapshot per connection *before* the window, so
    // carry-forward into the window starts from the right baseline (not zero).
    if (startDate) {
      const seeds = await prisma.portfolioSnapshot.findMany({
        where: { exchangeConnectionId: { in: connectionIds }, date: { lt: startDate } },
        orderBy: [{ exchangeConnectionId: "asc" }, { date: "desc" }],
        distinct: ["exchangeConnectionId"],
        select: {
          exchangeConnectionId: true,
          totalValueEur: true,
          totalCostEur: true,
          unrealizedPnlEur: true,
          freeCashEur: true,
        },
      });
      for (const s of seeds) lastByConn.set(s.exchangeConnectionId, toVals(s));
    }

    // Group in-window snapshots by date (one row per connection per date).
    const byDate = new Map<string, Array<{ connId: string; vals: Vals }>>();
    for (const snap of snapshots) {
      const dateKey = snap.date.toISOString().slice(0, 10); // YYYY-MM-DD
      const arr = byDate.get(dateKey) ?? [];
      arr.push({ connId: snap.exchangeConnectionId, vals: toVals(snap) });
      byDate.set(dateKey, arr);
    }

    const dateKeys = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));

    const aggregated = dateKeys.map((dateKey) => {
      // Apply this date's updates to the running per-connection state…
      for (const { connId, vals } of byDate.get(dateKey)!) {
        lastByConn.set(connId, vals);
      }
      // …then sum across every connection seen so far (forward-filled).
      let totalValueEur = 0;
      let totalCostEur = 0;
      let unrealizedPnlEur = 0;
      let freeCashEur = 0;
      for (const v of lastByConn.values()) {
        totalValueEur += v.totalValueEur;
        totalCostEur += v.totalCostEur;
        unrealizedPnlEur += v.unrealizedPnlEur;
        freeCashEur += v.freeCashEur;
      }
      return { date: dateKey, totalValueEur, totalCostEur, unrealizedPnlEur, freeCashEur };
    });

    // Tracking-start markers.
    //
    // A manual holding entering the portfolio steps the line up on the day it
    // was added. That's a real change in tracked net worth, but it is NOT a
    // gain — so we mark the day rather than backfilling history (which would
    // invent value the user never recorded) or hiding the step.
    //
    // No euro figure: we don't persist what the position was worth on the day
    // it started, and quoting today's value against an old date would be wrong.
    const manualAssets = await prisma.portfolioAsset.findMany({
      where: {
        exchangeConnectionId: { in: connectionIds },
        trackingStartedAt: startDate ? { gte: startDate } : { not: null },
        exchangeConnection: { provider: "MANUAL" },
      },
      select: {
        symbol: true,
        trackingStartedAt: true,
        exchangeConnection: { select: { label: true } },
      },
    });

    // Several holdings added the same day collapse into one marker.
    const markersByDate = new Map<string, { symbols: Set<string>; sources: Set<string> }>();
    for (const asset of manualAssets) {
      if (!asset.trackingStartedAt) continue;
      const dateKey = asset.trackingStartedAt.toISOString().slice(0, 10);
      const entry = markersByDate.get(dateKey) ?? {
        symbols: new Set<string>(),
        sources: new Set<string>(),
      };
      entry.symbols.add(asset.symbol);
      entry.sources.add(asset.exchangeConnection.label);
      markersByDate.set(dateKey, entry);
    }

    const trackingMarkers = Array.from(markersByDate.entries())
      .map(([date, e]) => ({
        date,
        symbols: Array.from(e.symbols),
        sources: Array.from(e.sources),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ snapshots: aggregated, trackingMarkers });
  } catch (error) {
    console.error("Get portfolio snapshots error:", error);
    return NextResponse.json(
      { error: "Failed to fetch portfolio snapshots" },
      { status: 500 }
    );
  }
}
