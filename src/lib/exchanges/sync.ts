import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { convertToEur } from "@/lib/currency";
import { createExchangeClient } from "./factory";

// ─── syncExchange ────────────────────────────────────────────────────────────

export async function syncExchange(connectionId: string): Promise<void> {
  // 1. Fetch connection (include workspace for defaultCurrency)
  const connection = await prisma.exchangeConnection.findUniqueOrThrow({
    where: { id: connectionId },
    include: { workspace: true },
  });

  console.log(
    `[Sync] Starting sync for connection ${connectionId} (${connection.provider} — ${connection.label})`
  );

  // 2. Mark as SYNCING immediately
  await prisma.exchangeConnection.update({
    where: { id: connectionId },
    data: { syncStatus: "SYNCING" },
  });

  try {
    // 3. Decrypt API credentials (stored as JSON payload in encryptedApiKey)
    const decrypted = decrypt(
      connection.encryptedApiKey,
      connection.encryptionIV,
      connection.encryptionTag
    );
    const { apiKey, apiSecret } = JSON.parse(decrypted) as {
      apiKey: string;
      apiSecret: string;
    };

    // 4. Create exchange client
    const client = createExchangeClient(connection.provider, apiKey, apiSecret);

    // 5. Fetch data from exchange in parallel where safe
    const sinceCutoff = connection.lastSyncAt
      ? connection.lastSyncAt
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days fallback

    const [positions, summary, rawDeposits] = await Promise.all([
      client.getPositions(),
      client.getAccountSummary(),
      client.getDeposits(sinceCutoff).catch((err) => {
        console.warn(`[Sync] Deposit fetch failed (non-fatal):`, err);
        return [];
      }),
    ]);

    console.log(
      `[Sync] Fetched ${positions.length} positions, ${rawDeposits.length} deposits`
    );

    // 6. Upsert PortfolioAsset records
    const incomingSymbols: string[] = [];

    for (const pos of positions) {
      const { amountEur: currentPriceEur, exchangeRate } = await convertToEur(
        pos.currentPrice,
        pos.currency
      );
      const { amountEur: averageBuyPriceEur } = await convertToEur(
        pos.averageBuyPrice,
        pos.currency
      );
      const { amountEur: currentValueEur } = await convertToEur(
        pos.currentValue,
        pos.currency
      );
      const { amountEur: totalCostEur } = await convertToEur(
        pos.totalCost,
        pos.currency
      );
      const { amountEur: unrealizedPnlEur } = await convertToEur(
        pos.unrealizedPnl,
        pos.currency
      );

      incomingSymbols.push(pos.symbol);

      await prisma.portfolioAsset.upsert({
        where: {
          exchangeConnectionId_symbol: {
            exchangeConnectionId: connectionId,
            symbol: pos.symbol,
          },
        },
        create: {
          exchangeConnectionId: connectionId,
          symbol: pos.symbol,
          name: pos.name,
          assetType: pos.assetType,
          quantity: pos.quantity,
          averageBuyPrice: pos.averageBuyPrice,
          averageBuyPriceEur,
          currentPrice: pos.currentPrice,
          currentPriceEur,
          currentValue: pos.currentValue,
          currentValueEur,
          totalCost: pos.totalCost,
          totalCostEur,
          unrealizedPnl: pos.unrealizedPnl,
          unrealizedPnlEur,
          unrealizedPnlPct: pos.unrealizedPnlPct,
          currency: pos.currency,
          lastUpdatedAt: new Date(),
        },
        update: {
          name: pos.name,
          assetType: pos.assetType,
          quantity: pos.quantity,
          averageBuyPrice: pos.averageBuyPrice,
          averageBuyPriceEur,
          currentPrice: pos.currentPrice,
          currentPriceEur,
          currentValue: pos.currentValue,
          currentValueEur,
          totalCost: pos.totalCost,
          totalCostEur,
          unrealizedPnl: pos.unrealizedPnl,
          unrealizedPnlEur,
          unrealizedPnlPct: pos.unrealizedPnlPct,
          currency: pos.currency,
          lastUpdatedAt: new Date(),
        },
      });
    }

    // 7. Delete assets that no longer exist (fully sold)
    const deleted = await prisma.portfolioAsset.deleteMany({
      where: {
        exchangeConnectionId: connectionId,
        symbol: { notIn: incomingSymbols },
      },
    });
    if (deleted.count > 0) {
      console.log(`[Sync] Removed ${deleted.count} fully-sold asset(s)`);
    }

    // 8. Insert new ExchangeDeposit records (skip already-known externalIds)
    let newDepositCount = 0;
    for (const dep of rawDeposits) {
      const { amountEur } = await convertToEur(dep.amount, dep.currency);

      await prisma.exchangeDeposit.upsert({
        where: {
          exchangeConnectionId_externalId: {
            exchangeConnectionId: connectionId,
            externalId: dep.externalId,
          },
        },
        create: {
          exchangeConnectionId: connectionId,
          externalId: dep.externalId,
          amount: dep.amount,
          currency: dep.currency,
          amountEur,
          date: dep.date,
        },
        // If it already exists, leave it untouched (user may have linked/dismissed it)
        update: {},
      });
      newDepositCount++;
    }
    console.log(`[Sync] Processed ${newDepositCount} deposit record(s)`);

    // 9. Update freeCash on the connection
    const { amountEur: freeCashEur } = await convertToEur(
      summary.freeCash,
      summary.currency
    );

    await prisma.exchangeConnection.update({
      where: { id: connectionId },
      data: {
        freeCash: summary.freeCash,
        freeCashCurrency: summary.currency,
      },
    });

    // 10. Build today's snapshot
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Aggregate totals from the freshly-upserted assets
    const assets = await prisma.portfolioAsset.findMany({
      where: { exchangeConnectionId: connectionId },
    });

    const totalValueEur = assets.reduce(
      (sum, a) => sum + Number(a.currentValueEur),
      0
    );
    const totalCostEur = assets.reduce(
      (sum, a) => sum + Number(a.totalCostEur),
      0
    );
    const unrealizedPnlEur = totalValueEur - totalCostEur;

    const assetBreakdown = assets.map((a) => ({
      symbol: a.symbol,
      name: a.name,
      assetType: a.assetType,
      currentValueEur: Number(a.currentValueEur),
      quantity: Number(a.quantity),
      unrealizedPnlEur: Number(a.unrealizedPnlEur),
    }));

    await prisma.portfolioSnapshot.upsert({
      where: {
        exchangeConnectionId_date: {
          exchangeConnectionId: connectionId,
          date: today,
        },
      },
      create: {
        exchangeConnectionId: connectionId,
        date: today,
        totalValueEur,
        totalCostEur,
        unrealizedPnlEur,
        freeCashEur,
        assetBreakdown: JSON.stringify(assetBreakdown),
      },
      update: {
        totalValueEur,
        totalCostEur,
        unrealizedPnlEur,
        freeCashEur,
        assetBreakdown: JSON.stringify(assetBreakdown),
      },
    });

    console.log(
      `[Sync] Snapshot saved — totalValueEur: €${totalValueEur.toFixed(2)}, P&L: €${unrealizedPnlEur.toFixed(2)}`
    );

    // 11. Mark SUCCESS
    await prisma.exchangeConnection.update({
      where: { id: connectionId },
      data: {
        syncStatus: "SUCCESS",
        lastSyncAt: new Date(),
        lastSyncError: null,
      },
    });

    console.log(`[Sync] Connection ${connectionId} synced successfully`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown sync error";

    console.error(`[Sync] Connection ${connectionId} failed:`, error);

    await prisma.exchangeConnection.update({
      where: { id: connectionId },
      data: {
        syncStatus: "ERROR",
        lastSyncError: message.slice(0, 500),
      },
    });

    throw error;
  }
}

// ─── syncAllExchanges ────────────────────────────────────────────────────────

export type SyncResult = {
  connectionId: string;
  success: boolean;
  error?: string;
};

export async function syncAllExchanges(
  workspaceId: string
): Promise<SyncResult[]> {
  const connections = await prisma.exchangeConnection.findMany({
    where: { workspaceId, isActive: true },
    select: { id: true, provider: true, label: true },
  });

  console.log(
    `[Sync] Starting sync for workspace ${workspaceId} — ${connections.length} active connection(s)`
  );

  const results: SyncResult[] = [];

  // Sequential to avoid hammering exchange APIs across multiple connections
  for (const conn of connections) {
    console.log(
      `[Sync] Processing connection ${conn.id} (${conn.provider} — ${conn.label})`
    );
    try {
      await syncExchange(conn.id);
      results.push({ connectionId: conn.id, success: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown sync error";
      console.error(
        `[Sync] Connection ${conn.id} failed during workspace sync:`,
        message
      );
      results.push({ connectionId: conn.id, success: false, error: message });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  console.log(
    `[Sync] Workspace ${workspaceId} done — ${successCount}/${connections.length} succeeded`
  );

  return results;
}
