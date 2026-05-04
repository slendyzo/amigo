import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireActiveWorkspace, WorkspaceAccessError } from "@/lib/workspace";

function errorResponse(error: unknown) {
  if (error instanceof WorkspaceAccessError) {
    const status = error.code === "UNAUTHORIZED" ? 401 : 403;
    return NextResponse.json({ error: error.message }, { status });
  }
  console.error("Valuations API error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspace } = await requireActiveWorkspace();
    const { id } = await params;

    const owns = await prisma.realAsset.findFirst({
      where: { id, workspaceId: workspace.id },
      select: { id: true },
    });
    if (!owns) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const since = searchParams.get("since");
    const limit = Math.min(500, parseInt(searchParams.get("limit") ?? "90", 10) || 90);

    const where: Prisma.ValuationHistoryWhereInput = { realAssetId: id };
    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) where.recordedAt = { gte: sinceDate };
    }

    const valuations = await prisma.valuationHistory.findMany({
      where,
      orderBy: { recordedAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ valuations });
  } catch (error) {
    return errorResponse(error);
  }
}
