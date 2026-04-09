import { redirect } from "next/navigation";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import AssetDetailClient from "./asset-detail-client";

interface Props {
  params: Promise<{ assetId: string }>;
}

export default async function AssetDetailPage({ params }: Props) {
  const context = await getActiveWorkspace();
  if (!context) redirect("/signin");

  const { workspace } = context;
  const { assetId } = await params;

  const asset = await prisma.portfolioAsset.findFirst({
    where: { id: assetId },
    include: {
      exchangeConnection: {
        select: {
          id: true,
          provider: true,
          label: true,
          workspaceId: true,
          syncStatus: true,
          lastSyncAt: true,
        },
      },
    },
  });

  if (!asset || asset.exchangeConnection.workspaceId !== workspace.id) {
    redirect("/dashboard/portfolio");
  }

  const serialized = {
    id: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    assetType: asset.assetType,
    quantity: Number(asset.quantity),
    averageBuyPrice: Number(asset.averageBuyPrice),
    averageBuyPriceEur: Number(asset.averageBuyPriceEur),
    currentPrice: Number(asset.currentPrice),
    currentPriceEur: Number(asset.currentPriceEur),
    currentValue: Number(asset.currentValue),
    currentValueEur: Number(asset.currentValueEur),
    totalCost: Number(asset.totalCost),
    totalCostEur: Number(asset.totalCostEur),
    unrealizedPnl: Number(asset.unrealizedPnl),
    unrealizedPnlEur: Number(asset.unrealizedPnlEur),
    unrealizedPnlPct: Number(asset.unrealizedPnlPct),
    currency: asset.currency,
    lastUpdatedAt: asset.lastUpdatedAt.toISOString(),
    exchange: {
      id: asset.exchangeConnection.id,
      provider: asset.exchangeConnection.provider,
      label: asset.exchangeConnection.label,
      syncStatus: asset.exchangeConnection.syncStatus,
      lastSyncAt: asset.exchangeConnection.lastSyncAt?.toISOString() ?? null,
    },
  };

  return <AssetDetailClient asset={serialized} />;
}
