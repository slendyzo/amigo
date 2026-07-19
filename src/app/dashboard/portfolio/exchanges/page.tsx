import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import ExchangesClient from "./exchanges-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ExchangesPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  const workspace = await prisma.workspace.findFirst({
    where: {
      members: {
        some: { userId: session.user.id },
      },
    },
    select: { id: true },
  });

  if (!workspace) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--ink-muted)]">
          No workspace found. Please contact support.
        </p>
      </div>
    );
  }

  const connections = await prisma.exchangeConnection.findMany({
    where: { workspaceId: workspace.id },
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
      createdAt: true,
      _count: { select: { assets: true } },
    },
  });

  const connectionsForClient = connections.map((c) => ({
    id: c.id,
    provider: c.provider as string,
    label: c.label,
    syncStatus: c.syncStatus as string,
    lastSyncAt: c.lastSyncAt ? c.lastSyncAt.toISOString() : null,
    lastSyncError: c.lastSyncError ?? null,
    freeCash: c.freeCash !== null ? Number(c.freeCash) : null,
    freeCashCurrency: c.freeCashCurrency ?? null,
    isActive: c.isActive,
    assetCount: c._count.assets,
  }));

  return <ExchangesClient connections={connectionsForClient} />;
}
