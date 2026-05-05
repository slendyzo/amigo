import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace";
import NetworthClient from "./networth-client";

export const dynamic = "force-dynamic";

export default async function NetworthPage() {
  const ctx = await getActiveWorkspace();
  if (!ctx) redirect("/signin");
  const { workspace } = ctx;

  const [realAssets, liabilities, portfolioAssets] = await Promise.all([
    prisma.realAsset.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: { vehicle: true, property: true },
    }),
    prisma.liability.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        realAsset: { select: { id: true, name: true, type: true } },
        recurringTemplate: { select: { id: true, name: true } },
      },
    }),
    prisma.portfolioAsset.findMany({
      where: { exchangeConnection: { workspaceId: workspace.id, isActive: true } },
      select: {
        id: true,
        symbol: true,
        name: true,
        currentValueEur: true,
        totalCostEur: true,
        unrealizedPnlEur: true,
      },
    }),
  ]);

  return (
    <NetworthClient
      realAssets={realAssets.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        status: a.status,
        imageUrl: a.imageUrl,
        purchasePriceEur: Number(a.purchasePriceEur),
        currentValueEur: a.currentValueEur != null ? Number(a.currentValueEur) : null,
        salePriceEur: a.salePriceEur != null ? Number(a.salePriceEur) : null,
        soldAt: a.soldAt?.toISOString() ?? null,
        vehicle: a.vehicle
          ? { brand: a.vehicle.brand, model: a.vehicle.model, year: a.vehicle.year }
          : null,
        property: a.property
          ? {
              propertyType: a.property.propertyType,
              concelho: a.property.concelho,
              address: a.property.address,
              livableAreaM2: a.property.livableAreaM2,
              bedrooms: a.property.bedrooms,
              latitude: a.property.latitude != null ? Number(a.property.latitude) : null,
              longitude:
                a.property.longitude != null ? Number(a.property.longitude) : null,
            }
          : null,
      }))}
      liabilities={liabilities.map((l) => ({
        id: l.id,
        type: l.type,
        name: l.name,
        status: l.status,
        currentBalanceEur: Number(l.currentBalanceEur),
        principalEur: Number(l.principalEur),
        monthlyPayment: l.monthlyPayment != null ? Number(l.monthlyPayment) : null,
        currency: l.currency,
        realAsset: l.realAsset,
      }))}
      portfolioAssets={portfolioAssets.map((p) => ({
        id: p.id,
        symbol: p.symbol,
        name: p.name,
        currentValueEur: Number(p.currentValueEur),
        totalCostEur: Number(p.totalCostEur),
        unrealizedPnlEur: Number(p.unrealizedPnlEur),
      }))}
    />
  );
}
