import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueBackfill } from "@/lib/asset-backfill";
import {
  requirePermission,
  WorkspaceAccessError,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

// POST /api/assets/[id]/backfill
//
// Idempotent. If the asset's backfill is already running or queued, we
// return its current status without re-firing. If it's done or no_data,
// we accept this as a forced re-run (e.g. after spec edit) and re-enqueue.
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { workspace } = await requirePermission("real_asset:update");
    const { id } = await context.params;

    const asset = await prisma.realAsset.findFirst({
      where: { id, workspaceId: workspace.id },
      select: {
        id: true,
        backfillStatus: true,
        backfillProgress: true,
        backfillStartedAt: true,
        backfillFinishedAt: true,
      },
    });
    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    if (asset.backfillStatus === "running" || asset.backfillStatus === "queued") {
      return NextResponse.json({
        status: asset.backfillStatus,
        progress: asset.backfillProgress ?? 0,
        startedAt: asset.backfillStartedAt,
        finishedAt: asset.backfillFinishedAt,
        message: "Backfill already in progress",
      });
    }

    await enqueueBackfill(asset.id);

    const updated = await prisma.realAsset.findUnique({
      where: { id: asset.id },
      select: {
        backfillStatus: true,
        backfillProgress: true,
        backfillStartedAt: true,
        backfillFinishedAt: true,
      },
    });

    return NextResponse.json({
      status: updated?.backfillStatus ?? "queued",
      progress: updated?.backfillProgress ?? 0,
      startedAt: updated?.backfillStartedAt,
      finishedAt: updated?.backfillFinishedAt,
    });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) {
      const status = error.code === "UNAUTHORIZED" ? 401 : 403;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("[/api/assets/:id/backfill]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
