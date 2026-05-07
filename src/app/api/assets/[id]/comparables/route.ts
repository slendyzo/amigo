import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveWorkspace, WorkspaceAccessError } from "@/lib/workspace";
import { getComparablesForAsset } from "@/lib/comparables";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspace } = await requireActiveWorkspace();
    const { id } = await params;

    const asset = await prisma.realAsset.findFirst({
      where: { id, workspaceId: workspace.id },
      include: { vehicle: true, property: true },
    });
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const payload = await getComparablesForAsset(asset);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof WorkspaceAccessError) {
      const status = error.code === "UNAUTHORIZED" ? 401 : 403;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("Comparables API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
