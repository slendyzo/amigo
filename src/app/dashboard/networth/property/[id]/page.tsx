import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace";
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
      valuationHistory: { orderBy: { recordedAt: "desc" }, take: 90 },
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

  return (
    <PropertyDetailClient
      asset={{
        id: asset.id,
        name: asset.name,
        status: asset.status,
        imageUrl: asset.imageUrl,
        notes: asset.notes,
        purchasePriceEur: Number(asset.purchasePriceEur),
        purchaseCurrency: asset.purchaseCurrency,
        purchaseDate: asset.purchaseDate.toISOString(),
        currentValueEur:
          asset.currentValueEur != null ? Number(asset.currentValueEur) : null,
        currentValueSource: asset.currentValueSource,
        soldAt: asset.soldAt?.toISOString() ?? null,
        salePriceEur: asset.salePriceEur != null ? Number(asset.salePriceEur) : null,
      }}
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
