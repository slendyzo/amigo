import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { reconcileStuckSyncs } from "@/lib/exchanges/sync";
import { convertToEur, getExchangeRatesMeta } from "@/lib/currency";
import PortfolioClient from "./portfolio-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PortfolioPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  const workspace = await prisma.workspace.findFirst({
    where: {
      members: {
        some: {
          userId: session.user.id,
        },
      },
    },
    select: { id: true, defaultCurrency: true },
  });

  if (!workspace) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600 dark:text-slate-400">
          No workspace found. Please contact support.
        </p>
      </div>
    );
  }

  // Self-heal stuck SYNCING rows (process restart mid-sync, etc.) before reading
  await reconcileStuckSyncs(workspace.id);

  // Parallel fetch: connections (with asset counts), assets, unlinked deposits
  const [connections, assets, deposits] = await Promise.all([
    prisma.exchangeConnection.findMany({
      where: { workspaceId: workspace.id, isActive: true },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        provider: true,
        label: true,
        syncStatus: true,
        lastSyncAt: true,
        lastSyncError: true,
        freeCash: true,
        freeCashCurrency: true,
        isActive: true,
        _count: { select: { assets: true } },
      },
    }),
    prisma.portfolioAsset.findMany({
      where: {
        exchangeConnection: { workspaceId: workspace.id, isActive: true },
      },
      orderBy: { currentValueEur: "desc" },
      select: {
        id: true,
        symbol: true,
        name: true,
        assetType: true,
        quantity: true,
        averageBuyPrice: true,
        averageBuyPriceEur: true,
        currentPrice: true,
        currentPriceEur: true,
        currentValue: true,
        currentValueEur: true,
        totalCost: true,
        totalCostEur: true,
        unrealizedPnl: true,
        unrealizedPnlEur: true,
        unrealizedPnlPct: true,
        currency: true,
        exchangeConnection: {
          select: { id: true, provider: true, label: true },
        },
      },
    }),
    prisma.exchangeDeposit.findMany({
      where: {
        exchangeConnection: { workspaceId: workspace.id },
        linkedExpenseId: null,
        dismissed: false,
      },
      orderBy: { date: "desc" },
      select: {
        id: true,
        amount: true,
        currency: true,
        amountEur: true,
        date: true,
        exchangeConnection: { select: { provider: true, label: true } },
      },
    }),
  ]);

  // Compute per-connection freeCash in EUR (server-side so the client gets a
  // single trusted number to sum + display). Per-currency native breakdown is
  // also returned for the tooltip in PortfolioSummaryCard.
  const fxMeta = await getExchangeRatesMeta();

  const connectionsForClient = await Promise.all(
    connections.map(async (c) => {
      const freeCashNative = c.freeCash !== null ? Number(c.freeCash) : null;
      const freeCashCurrency = c.freeCashCurrency ?? null;

      let freeCashEur: number | null = null;
      let freeCashRateEurPerUnit: number | null = null;

      if (freeCashNative !== null && freeCashCurrency) {
        const conv = await convertToEur(freeCashNative, freeCashCurrency);
        freeCashEur = conv.amountEur;
        freeCashRateEurPerUnit = conv.exchangeRate;
      }

      return {
        id: c.id,
        provider: c.provider,
        label: c.label,
        syncStatus: c.syncStatus,
        lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
        lastSyncError: c.lastSyncError ?? null,
        freeCash: freeCashNative,
        freeCashCurrency,
        freeCashEur,
        freeCashRateEurPerUnit,
        isActive: c.isActive,
        _count: { assets: c._count.assets },
      };
    })
  );

  const assetsForClient = assets.map((a) => ({
    id: a.id,
    symbol: a.symbol,
    name: a.name,
    assetType: a.assetType,
    quantity: Number(a.quantity),
    averageBuyPrice: Number(a.averageBuyPrice),
    averageBuyPriceEur: Number(a.averageBuyPriceEur),
    currentPrice: Number(a.currentPrice),
    currentPriceEur: Number(a.currentPriceEur),
    currentValue: Number(a.currentValue),
    currentValueEur: Number(a.currentValueEur),
    totalCost: Number(a.totalCost),
    totalCostEur: Number(a.totalCostEur),
    unrealizedPnl: Number(a.unrealizedPnl),
    unrealizedPnlEur: Number(a.unrealizedPnlEur),
    unrealizedPnlPct: Number(a.unrealizedPnlPct),
    currency: a.currency,
    exchange: {
      id: a.exchangeConnection.id,
      provider: a.exchangeConnection.provider,
      label: a.exchangeConnection.label,
    },
  }));

  const depositsForClient = deposits.map((d) => ({
    id: d.id,
    amount: Number(d.amount),
    currency: d.currency,
    amountEur: Number(d.amountEur),
    date: d.date.toISOString(),
    exchange: {
      provider: d.exchangeConnection.provider,
      label: d.exchangeConnection.label,
    },
  }));

  return (
    <PortfolioClient
      connections={connectionsForClient}
      assets={assetsForClient}
      deposits={depositsForClient}
      fxMeta={fxMeta}
    />
  );
}
