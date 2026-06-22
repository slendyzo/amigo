import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { reconcileStuckSyncs, syncAllExchanges } from "@/lib/exchanges/sync";

// Scheduled portfolio sync.
//
// Without this, exchange prices only refresh when a user opens
// /dashboard/portfolio while data is stale — so daily snapshots have gaps on
// every day nobody looked, and the performance chart is timed by "whenever the
// user happened to glance." This cron syncs every active connection across all
// workspaces on a fixed cadence so snapshots land consistently.
//
// Unlike the user-triggered /api/portfolio/sync (which detaches into a
// fire-and-forget promise), this AWAITS syncAllExchanges per workspace — the
// curl that triggers the cron holds the request open until the work is done,
// which is the robust execution model (no container recycle mid-flight).
//
// Auth via x-cron-secret header matching CRON_SECRET. Per-workspace failures
// are logged and skipped; one bad workspace never blocks the rest.

export const dynamic = "force-dynamic";
// Allow a long run — a first Bybit trade backfill can take a while.
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret") ?? request.headers.get("authorization");
  if (!header) return false;
  const provided = header.startsWith("Bearer ") ? header.slice(7) : header;
  return provided === secret;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  // Distinct workspaces that actually have an active connection — avoids
  // iterating every workspace in the DB.
  const active = await prisma.exchangeConnection.findMany({
    where: { isActive: true },
    select: { workspaceId: true },
    distinct: ["workspaceId"],
  });
  const workspaceIds = active.map((c) => c.workspaceId);

  let workspacesProcessed = 0;
  let connectionsSynced = 0;
  let connectionsFailed = 0;
  let connectionsSkipped = 0;

  for (const workspaceId of workspaceIds) {
    try {
      // Clear any connection wedged in SYNCING past the stuck threshold before
      // we try to lock it, otherwise this run would skip it as "already syncing."
      await reconcileStuckSyncs(workspaceId);
      const results = await syncAllExchanges(workspaceId);
      workspacesProcessed += 1;
      for (const r of results) {
        if (r.skipped) connectionsSkipped += 1;
        else if (r.success) connectionsSynced += 1;
        else connectionsFailed += 1;
      }
    } catch (error) {
      console.error(
        `[cron:sync-portfolio] Workspace ${workspaceId} failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    tookMs: Date.now() - startedAt,
    workspaces: { total: workspaceIds.length, processed: workspacesProcessed },
    connections: {
      synced: connectionsSynced,
      failed: connectionsFailed,
      skipped: connectionsSkipped,
    },
  });
}
