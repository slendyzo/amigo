import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { convertToEur } from "@/lib/currency";
import { requirePermission, WorkspaceAccessError } from "@/lib/workspace";

function errorResponse(error: unknown) {
  if (error instanceof WorkspaceAccessError) {
    const status = error.code === "UNAUTHORIZED" ? 401 : 403;
    return NextResponse.json({ error: error.message }, { status });
  }
  console.error("Sell asset error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspace } = await requirePermission("real_asset:update");
    const { id } = await params;

    const existing = await prisma.realAsset.findFirst({
      where: { id, workspaceId: workspace.id },
      include: { liabilities: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.status === "SOLD") {
      return NextResponse.json({ error: "Asset is already sold" }, { status: 400 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const salePrice = typeof body.salePrice === "number" ? body.salePrice : NaN;
    if (!Number.isFinite(salePrice) || salePrice < 0) {
      return NextResponse.json({ error: "salePrice must be a non-negative number" }, { status: 400 });
    }
    const saleCurrency =
      typeof body.salePriceCurrency === "string" ? body.salePriceCurrency : existing.purchaseCurrency;
    const soldAt =
      typeof body.soldAt === "string" || body.soldAt instanceof Date ? new Date(body.soldAt as string) : new Date();

    const { amountEur: salePriceEur } = await convertToEur(salePrice, saleCurrency);

    // Auto-close any active linked loan whose outstanding balance fits inside the sale.
    const loansToClose = existing.liabilities.filter(
      (l) => l.status === "ACTIVE" && Number(l.currentBalanceEur) <= salePriceEur
    );

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.realAsset.update({
        where: { id },
        data: {
          status: "SOLD",
          soldAt,
          salePrice: new Prisma.Decimal(salePrice),
          salePriceEur: new Prisma.Decimal(salePriceEur),
          saleCurrency,
        },
      });

      await tx.valuationHistory.create({
        data: {
          realAssetId: id,
          value: new Prisma.Decimal(salePrice),
          valueEur: new Prisma.Decimal(salePriceEur),
          currency: saleCurrency,
          source: "sale",
          recordedAt: soldAt,
        },
      });

      if (loansToClose.length > 0) {
        await tx.liability.updateMany({
          where: { id: { in: loansToClose.map((l) => l.id) } },
          data: {
            status: "PAID_OFF",
            currentBalance: new Prisma.Decimal(0),
            currentBalanceEur: new Prisma.Decimal(0),
          },
        });
        // Deactivate the linked recurring templates so the auto-payment stops.
        const templateIds = loansToClose.map((l) => l.recurringTemplateId).filter((x): x is string => !!x);
        if (templateIds.length > 0) {
          await tx.recurringTemplate.updateMany({
            where: { id: { in: templateIds } },
            data: { isActive: false, autoGenerate: false },
          });
        }
      }

      return updated;
    });

    const realizedPnLEur = salePriceEur - Number(existing.purchasePriceEur);

    return NextResponse.json({
      asset: result,
      realizedPnLEur: Math.round(realizedPnLEur * 100) / 100,
      closedLoanIds: loansToClose.map((l) => l.id),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
