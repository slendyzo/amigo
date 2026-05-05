import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findCandidateExpenses } from "@/lib/expense-asset-match";
import {
  requireActiveWorkspace,
  requirePermission,
  WorkspaceAccessError,
} from "@/lib/workspace";

function errorResponse(error: unknown) {
  if (error instanceof WorkspaceAccessError) {
    const status = error.code === "UNAUTHORIZED" ? 401 : 403;
    return NextResponse.json({ error: error.message }, { status });
  }
  console.error("match-expenses error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspace } = await requireActiveWorkspace();
    const { id } = await params;

    const asset = await prisma.realAsset.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        vehicle: true,
        property: true,
        liabilities: { where: { status: "ACTIVE" }, take: 1 },
      },
    });
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const loan = asset.liabilities[0];

    const candidates = await findCandidateExpenses(prisma, {
      workspaceId: workspace.id,
      realAssetId: asset.id,
      assetType: asset.type,
      monthlyPayment: loan?.monthlyPayment ? Number(loan.monthlyPayment) : null,
      hints: {
        name: asset.name,
        // Vehicle hints
        brand: asset.vehicle?.brand ?? null,
        model: asset.vehicle?.model ?? null,
        // Property hints
        address: asset.property?.address ?? null,
        concelho: asset.property?.concelho ?? null,
        freguesia: asset.property?.freguesia ?? null,
      },
      recurringTemplateId: loan?.recurringTemplateId ?? null,
    });

    return NextResponse.json({ candidates });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspace } = await requirePermission("real_asset:update");
    const { id } = await params;

    const owns = await prisma.realAsset.findFirst({
      where: { id, workspaceId: workspace.id },
      select: { id: true },
    });
    if (!owns) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = (await request.json()) as { expenseIds?: unknown };
    if (!Array.isArray(body.expenseIds)) {
      return NextResponse.json({ error: "expenseIds array required" }, { status: 400 });
    }
    const ids = body.expenseIds.filter((x): x is string => typeof x === "string");
    if (ids.length === 0) {
      return NextResponse.json({ linked: 0 });
    }

    const result = await prisma.expense.updateMany({
      where: { id: { in: ids }, workspaceId: workspace.id },
      data: { realAssetId: id },
    });

    return NextResponse.json({ linked: result.count });
  } catch (error) {
    return errorResponse(error);
  }
}
