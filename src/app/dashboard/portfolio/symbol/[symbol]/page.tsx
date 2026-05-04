import { redirect } from "next/navigation";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import SymbolDetailClient from "./symbol-detail-client";

interface Props {
  params: Promise<{ symbol: string }>;
}

export default async function SymbolDetailPage({ params }: Props) {
  const context = await getActiveWorkspace();
  if (!context) redirect("/signin");

  const { workspace } = context;
  const { symbol: symbolRaw } = await params;
  const symbol = decodeURIComponent(symbolRaw);

  const positions = await prisma.portfolioAsset.findMany({
    where: {
      symbol,
      exchangeConnection: { workspaceId: workspace.id, isActive: true },
    },
    include: {
      exchangeConnection: {
        select: {
          id: true,
          provider: true,
          label: true,
          syncStatus: true,
          lastSyncAt: true,
        },
      },
    },
  });

  if (positions.length === 0) {
    redirect("/dashboard/portfolio");
  }

  // Convert Decimals → numbers and shape as the client expects
  const serialized = positions.map((p) => ({
    id: p.id,
    quantity: Number(p.quantity),
    averageBuyPrice: Number(p.averageBuyPrice),
    averageBuyPriceEur: Number(p.averageBuyPriceEur),
    currentPrice: Number(p.currentPrice),
    currentPriceEur: Number(p.currentPriceEur),
    currentValue: Number(p.currentValue),
    currentValueEur: Number(p.currentValueEur),
    totalCost: Number(p.totalCost),
    totalCostEur: Number(p.totalCostEur),
    unrealizedPnl: Number(p.unrealizedPnl),
    unrealizedPnlEur: Number(p.unrealizedPnlEur),
    unrealizedPnlPct: Number(p.unrealizedPnlPct),
    currency: p.currency,
    lockedQuantity: p.lockedQuantity !== null ? Number(p.lockedQuantity) : null,
    realizedPnlEur: p.realizedPnlEur !== null ? Number(p.realizedPnlEur) : null,
    priceStatus: p.priceStatus,
    priceUnavailableReason: p.priceUnavailableReason,
    lastUpdatedAt: p.lastUpdatedAt.toISOString(),
    exchange: {
      id: p.exchangeConnection.id,
      provider: p.exchangeConnection.provider,
      label: p.exchangeConnection.label,
      syncStatus: p.exchangeConnection.syncStatus,
      lastSyncAt: p.exchangeConnection.lastSyncAt?.toISOString() ?? null,
    },
  }));

  return (
    <SymbolDetailClient
      symbol={symbol}
      name={positions[0].name}
      assetType={positions[0].assetType}
      positions={serialized}
    />
  );
}
