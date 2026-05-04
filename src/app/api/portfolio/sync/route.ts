import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import {
  syncExchange,
  syncAllExchanges,
  tryLockConnection,
} from "@/lib/exchanges/sync";

// POST - Trigger portfolio sync
//
// Modes:
//   ?dryRun=true   — Awaits the full pipeline, skips every DB write, returns
//                    the diff that WOULD be applied. Use for verifying a
//                    connector fix before letting it touch real data.
//
// Body (optional JSON):
//   { connectionId?: string } — Sync a single connection. Otherwise sync all
//                               active connections in the active workspace.
//
// Non-dryRun returns immediately ({ status: "started" }) and runs the actual
// work in a detached promise. The client polls /api/portfolio to watch
// syncStatus transition to SUCCESS / PARTIAL / ERROR.
//
// Concurrent-sync prevention: we acquire a row-level lock by conditionally
// updating syncStatus → SYNCING. If another sync already holds the lock and
// hasn't gone stuck (>5min old), we return 409 Conflict.
export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace } = context;

    const url = new URL(request.url);
    const dryRun = url.searchParams.get("dryRun") === "true";

    let body: { connectionId?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is fine
    }

    const { connectionId } = body;

    // ─── Single-connection mode ──────────────────────────────────────────────
    if (connectionId) {
      const connection = await prisma.exchangeConnection.findFirst({
        where: { id: connectionId, workspaceId: workspace.id },
      });

      if (!connection) {
        return NextResponse.json(
          { error: "Exchange connection not found" },
          { status: 404 }
        );
      }

      // Dry-run: synchronous, returns diff. No lock (read-only).
      if (dryRun) {
        const diff = await syncExchange(connectionId, { dryRun: true });
        return NextResponse.json({ success: true, dryRun: true, diff });
      }

      // Real sync: try to acquire the lock. If it's held, another sync is
      // already running — bounce the caller with 409.
      const locked = await tryLockConnection(connectionId);
      if (!locked) {
        return NextResponse.json(
          { error: "Sync already in progress for this connection" },
          { status: 409 }
        );
      }

      // Detach: kick off the sync without awaiting. The function writes its
      // own ERROR state to the DB on failure (see syncExchange catch block).
      void syncExchange(connectionId).catch((err) => {
        console.error(
          `[Sync] Detached sync for ${connectionId} threw:`,
          err instanceof Error ? err.message : err
        );
      });

      return NextResponse.json({ success: true, status: "started" });
    }

    // ─── All-connections mode ────────────────────────────────────────────────
    // Dry-run: synchronous, returns per-connection diffs.
    if (dryRun) {
      const results = await syncAllExchanges(workspace.id, { dryRun: true });
      return NextResponse.json({ success: true, dryRun: true, results });
    }

    // Real all-workspace sync: detach. syncAllExchanges handles per-connection
    // locking internally so any already-syncing rows are skipped.
    void syncAllExchanges(workspace.id).catch((err) => {
      console.error(
        `[Sync] Detached workspace sync threw:`,
        err instanceof Error ? err.message : err
      );
    });

    return NextResponse.json({ success: true, status: "started" });
  } catch (error) {
    console.error("Portfolio sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync portfolio" },
      { status: 500 }
    );
  }
}
