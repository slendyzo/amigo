import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueBackfill } from "@/lib/asset-backfill";

// Admin-style cron endpoint: enqueues a Web Archive backfill for every
// active asset whose `backfillStatus` is null or terminally failed.
//
// Idempotent. Already-running/queued assets are skipped by enqueueBackfill
// itself. Used to bootstrap historical data for assets that pre-date the
// AMIGO-191 schema migration (no backfillStatus tracking before then).
//
// Auth: x-cron-secret header (same pattern as the other cron routes).

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

  const candidates = await prisma.realAsset.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { backfillStatus: null },
        { backfillStatus: "no_data" },
      ],
    },
    select: { id: true, type: true, name: true, backfillStatus: true },
  });

  // Fire each enqueue without awaiting — the orchestrator runs async.
  // We do await the enqueue's status-flip write so the caller sees the
  // queued count right after the response.
  const enqueued: Array<{ id: string; type: string; name: string }> = [];
  for (const a of candidates) {
    await enqueueBackfill(a.id);
    enqueued.push({ id: a.id, type: a.type, name: a.name });
  }

  return NextResponse.json({
    ok: true,
    enqueued: enqueued.length,
    assets: enqueued,
  });
}
