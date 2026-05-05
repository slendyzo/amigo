import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace";
import { concelhoKey } from "@/lib/property-valuation-index";
import PropertyDetailClient from "./property-detail-client";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function PropertyDetailPage({ params }: PageProps) {
  const ctx = await getActiveWorkspace();
  if (!ctx) redirect("/signin");
  const { workspace } = ctx;
  const { id } = await params;

  const asset = await prisma.realAsset.findFirst({
    where: { id, workspaceId: workspace.id, type: "PROPERTY" },
    include: {
      property: true,
      liabilities: true,
      valuationHistory: { orderBy: { recordedAt: "asc" }, take: 1000 },
      expenses: {
        select: {
          id: true,
          name: true,
          amount: true,
          amountEur: true,
          currency: true,
          date: true,
          category: { select: { id: true, name: true } },
        },
        orderBy: { date: "desc" },
        take: 50,
      },
    },
  });

  if (!asset || !asset.property) notFound();

  // Build the INE reference series — quarterly index, scaled by purchase
  // price ÷ purchase-quarter index (so the line passes through the user's
  // own purchase value at the purchase quarter).
  let referenceLine: { date: string; value: number }[] = [];
  const concelho = asset.property.concelho;
  if (concelho) {
    const indexRows = await prisma.propertyValuationIndex.findMany({
      where: { concelhoKey: concelhoKey(concelho) },
      orderBy: [{ year: "asc" }, { quarter: "asc" }],
    });
    if (indexRows.length > 0) {
      const purchaseY = asset.purchaseDate.getUTCFullYear();
      const purchaseQ = Math.floor(asset.purchaseDate.getUTCMonth() / 3) + 1;
      const anchor =
        indexRows.find((r) => r.year === purchaseY && r.quarter === purchaseQ) ??
        indexRows.reduce<typeof indexRows[number] | null>((best, r) => {
          if (r.year > purchaseY || (r.year === purchaseY && r.quarter > purchaseQ)) return best;
          if (!best) return r;
          return r.year > best.year || (r.year === best.year && r.quarter > best.quarter) ? r : best;
        }, null);
      if (anchor && Number(anchor.indexValue) > 0) {
        const purchaseEur = Number(asset.purchasePriceEur);
        const anchorVal = Number(anchor.indexValue);
        referenceLine = indexRows.map((r) => {
          // ISO date for first day of the quarter.
          const month = (r.quarter - 1) * 3 + 1;
          const date = `${r.year}-${String(month).padStart(2, "0")}-01`;
          return { date, value: (purchaseEur * Number(r.indexValue)) / anchorVal };
        });
      }
    }
  }

  return (
    <PropertyDetailClient
      asset={{
        id: asset.id,
        name: asset.name,
        status: asset.status,
        imageUrl: asset.imageUrl,
        notes: asset.notes,
        purchasePrice: Number(asset.purchasePrice),
        purchasePriceEur: Number(asset.purchasePriceEur),
        purchaseCurrency: asset.purchaseCurrency,
        purchaseDate: asset.purchaseDate.toISOString(),
        currentValueEur:
          asset.currentValueEur != null ? Number(asset.currentValueEur) : null,
        currentValueSource: asset.currentValueSource,
        soldAt: asset.soldAt?.toISOString() ?? null,
        salePriceEur: asset.salePriceEur != null ? Number(asset.salePriceEur) : null,
        backfillStatus: asset.backfillStatus,
        backfillProgress: asset.backfillProgress,
      }}
      referenceLine={referenceLine}
      property={{
        propertyType: asset.property.propertyType,
        address: asset.property.address,
        postalCode: asset.property.postalCode,
        distrito: asset.property.distrito,
        concelho: asset.property.concelho,
        freguesia: asset.property.freguesia,
        country: asset.property.country,
        livableAreaM2: asset.property.livableAreaM2,
        totalAreaM2: asset.property.totalAreaM2,
        bedrooms: asset.property.bedrooms,
        bathrooms: asset.property.bathrooms,
        yearBuilt: asset.property.yearBuilt,
        floor: asset.property.floor,
        parkingSpaces: asset.property.parkingSpaces,
        energyRating: asset.property.energyRating,
        condominiumFeeMonthly:
          asset.property.condominiumFeeMonthly != null
            ? Number(asset.property.condominiumFeeMonthly)
            : null,
        latitude: asset.property.latitude != null ? Number(asset.property.latitude) : null,
        longitude:
          asset.property.longitude != null ? Number(asset.property.longitude) : null,
      }}
      liabilities={asset.liabilities.map((l) => ({
        id: l.id,
        name: l.name,
        type: l.type,
        status: l.status,
        currency: l.currency,
        principalEur: Number(l.principalEur),
        currentBalanceEur: Number(l.currentBalanceEur),
        monthlyPayment: l.monthlyPayment != null ? Number(l.monthlyPayment) : null,
        termMonths: l.termMonths,
        interestRate: l.interestRate != null ? Number(l.interestRate) : null,
        startDate: l.startDate.toISOString(),
      }))}
      valuationHistory={asset.valuationHistory.map((v) => ({
        id: v.id,
        valueEur: Number(v.valueEur),
        source: v.source,
        sampleSize: v.sampleSize,
        metadata: v.metadata as Record<string, unknown> | null,
        recordedAt: v.recordedAt.toISOString(),
      }))}
      expenses={asset.expenses.map((e) => ({
        id: e.id,
        name: e.name,
        amount: Number(e.amount),
        amountEur: Number(e.amountEur),
        currency: e.currency,
        date: e.date.toISOString(),
        categoryName: e.category?.name ?? null,
      }))}
    />
  );
}
