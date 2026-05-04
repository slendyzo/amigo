import { prisma } from "@/lib/db";
import type { PriceStatus as DbPriceStatus, TradeSide } from "@prisma/client";
import { decrypt } from "@/lib/encryption";
import { convertToEur } from "@/lib/currency";
import { createExchangeClient, createWalletClient, isWalletProvider } from "./factory";
import type { ExchangeClient, ExchangePosition } from "./types";

// EUR threshold below which a position is considered dust (and hidden by
// default in the UI). Per-position; a position with trade history is exempt.
const DUST_THRESHOLD_EUR = 5;

// ─── Sync lock ────────────────────────────────────────────────────────────────

// A SYNCING connection is considered stuck (and reclaimable) after this many ms.
// Detached-promise sync means a process restart mid-sync would leave the row at
// SYNCING forever; this lets the next caller take over.
export const STUCK_SYNC_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Atomically transition a connection into SYNCING.
 * Returns true if we acquired the lock, false if it's currently held by
 * another in-flight sync. Stuck SYNCING rows (older than threshold) are
 * reclaimable.
 */
export async function tryLockConnection(connectionId: string): Promise<boolean> {
  const stuckCutoff = new Date(Date.now() - STUCK_SYNC_THRESHOLD_MS);
  const result = await prisma.exchangeConnection.updateMany({
    where: {
      id: connectionId,
      OR: [
        { syncStatus: { in: ["IDLE", "SUCCESS", "PARTIAL", "ERROR"] } },
        { syncStatus: "SYNCING", syncStartedAt: { lt: stuckCutoff } },
        { syncStatus: "SYNCING", syncStartedAt: null }, // legacy rows
      ],
    },
    data: {
      syncStatus: "SYNCING",
      syncStartedAt: new Date(),
    },
  });
  return result.count > 0;
}

/**
 * Reconcile any stuck SYNCING rows in a workspace by flipping them to ERROR
 * with a "Sync interrupted" message. Called from the read endpoint so the UI
 * never sees a forever-spinning row. Idempotent.
 */
export async function reconcileStuckSyncs(workspaceId: string): Promise<number> {
  const stuckCutoff = new Date(Date.now() - STUCK_SYNC_THRESHOLD_MS);
  const result = await prisma.exchangeConnection.updateMany({
    where: {
      workspaceId,
      syncStatus: "SYNCING",
      OR: [
        { syncStartedAt: { lt: stuckCutoff } },
        { syncStartedAt: null },
      ],
    },
    data: {
      syncStatus: "ERROR",
      lastSyncError: "Sync interrupted (process exited or timed out)",
    },
  });
  return result.count;
}

// ─── Diff types (returned to callers; used by dry-run preview) ────────────────

export type AssetDiffAction = "create" | "update" | "delete" | "unchanged";

export type AssetDiff = {
  symbol: string;
  action: AssetDiffAction;
  before: {
    quantity: number;
    currentValueEur: number;
    totalCostEur: number;
    unrealizedPnlEur: number;
  } | null;
  after: {
    quantity: number;
    currency: string;
    currentPrice: number;
    currentValueEur: number;
    totalCostEur: number;
    unrealizedPnlEur: number;
  } | null;
};

export type SyncDiff = {
  connectionId: string;
  provider: string;
  label: string;
  dryRun: boolean;
  assets: AssetDiff[];
  deposits: {
    fetched: number;
    newOnExchange: number; // not previously known to us
  };
  freeCash: {
    before: number | null;
    after: number | null;
    currency: string | null;
  };
  summary: {
    totalValueEurBefore: number;
    totalValueEurAfter: number;
    totalCostEurBefore: number;
    totalCostEurAfter: number;
    unrealizedPnlEurBefore: number;
    unrealizedPnlEurAfter: number;
  };
};

// Internal: the EUR-converted shape we'd persist for an asset
type ComputedAssetRow = {
  symbol: string;
  name: string;
  assetType: ExchangePosition["assetType"];
  quantity: number;
  averageBuyPrice: number;
  averageBuyPriceEur: number;
  currentPrice: number;
  currentPriceEur: number;
  currentValue: number;
  currentValueEur: number;
  totalCost: number;
  totalCostEur: number;
  unrealizedPnl: number;
  unrealizedPnlEur: number;
  unrealizedPnlPct: number;
  currency: string;
  priceStatus: DbPriceStatus;
  priceUnavailableReason: string | null;
  lockedQuantity: number | null;
  isDust: boolean;
};

// ─── syncExchange ────────────────────────────────────────────────────────────

export async function syncExchange(
  connectionId: string,
  options: { dryRun?: boolean } = {}
): Promise<SyncDiff> {
  const { dryRun = false } = options;
  const tag = dryRun ? "[Sync:dryRun]" : "[Sync]";

  // 1. Fetch connection (include workspace for defaultCurrency)
  const connection = await prisma.exchangeConnection.findUniqueOrThrow({
    where: { id: connectionId },
    include: { workspace: true },
  });

  console.log(
    `${tag} Starting sync for connection ${connectionId} (${connection.provider} — ${connection.label})`
  );

  // NOTE: We do NOT flip syncStatus to SYNCING here. The caller (route or
  // syncAllExchanges) is responsible for acquiring the lock via
  // tryLockConnection() before invoking us. This keeps the lock atomic with
  // the "is anyone else already running?" check.

  // 2. Snapshot the "before" state (existing assets in our DB)
  const existingAssets = await prisma.portfolioAsset.findMany({
    where: { exchangeConnectionId: connectionId },
  });
  const existingBySymbol = new Map(existingAssets.map((a) => [a.symbol, a]));

  const totalValueEurBefore = existingAssets.reduce(
    (s, a) => s + Number(a.currentValueEur),
    0
  );
  const totalCostEurBefore = existingAssets.reduce(
    (s, a) => s + Number(a.totalCostEur),
    0
  );
  const unrealizedPnlEurBefore = totalValueEurBefore - totalCostEurBefore;

  const freeCashBefore = connection.freeCash ? Number(connection.freeCash) : null;

  try {
    // 4. Create client — wallet providers use address, exchanges use encrypted keys
    let client: ExchangeClient;

    if (isWalletProvider(connection.provider)) {
      if (!connection.walletAddress) {
        throw new Error("Wallet connection is missing walletAddress");
      }
      client = createWalletClient(connection.provider, connection.walletAddress);
    } else {
      if (!connection.encryptedApiKey || !connection.encryptionIV || !connection.encryptionTag) {
        throw new Error("Exchange connection is missing encrypted credentials");
      }
      const decrypted = decrypt(
        connection.encryptedApiKey,
        connection.encryptionIV,
        connection.encryptionTag
      );
      const { apiKey, apiSecret } = JSON.parse(decrypted) as {
        apiKey: string;
        apiSecret: string;
      };
      client = createExchangeClient(connection.provider, apiKey, apiSecret);
    }

    // 5. Fetch data from exchange in parallel where safe
    const sinceCutoff = connection.lastSyncAt
      ? connection.lastSyncAt
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days fallback

    // Trade history scope: full backfill if we've never completed pagination
    // for this connection; otherwise just incremental since lastSyncAt.
    const wantFullTradeHistory = !connection.tradeHistoryComplete;
    const tradeSince = wantFullTradeHistory ? undefined : sinceCutoff;

    const [positions, summary, rawDeposits, rawTrades] = await Promise.all([
      client.getPositions(),
      client.getAccountSummary().catch((err) => {
        console.warn(`${tag} Account summary failed (non-fatal):`, err);
        return null;
      }),
      client.getDeposits(sinceCutoff).catch((err) => {
        console.warn(`${tag} Deposit fetch failed (non-fatal):`, err);
        return [];
      }),
      client.getTradeHistory(tradeSince).catch((err) => {
        console.warn(`${tag} Trade history fetch failed (non-fatal):`, err);
        return [];
      }),
    ]);

    console.log(
      `${tag} Fetched ${positions.length} positions, ${rawDeposits.length} deposits, ${rawTrades.length} trades (full=${wantFullTradeHistory})`
    );

    // Persist new trades into the shared Trade table.
    // We upsert by (connectionId, externalId) so re-fetched trades are idempotent.
    let newTradesPersisted = 0;
    if (!dryRun && rawTrades.length > 0) {
      for (const t of rawTrades) {
        const existing = await prisma.trade.findUnique({
          where: {
            exchangeConnectionId_externalId: {
              exchangeConnectionId: connectionId,
              externalId: t.externalId,
            },
          },
          select: { id: true },
        });
        if (existing) continue;

        await prisma.trade.create({
          data: {
            exchangeConnectionId: connectionId,
            externalId: t.externalId,
            symbol: t.symbol,
            side: (t.side === "buy" ? "BUY" : "SELL") as TradeSide,
            quantity: t.quantity,
            price: t.price,
            currency: t.currency,
            fee: t.fee,
            feeCurrency: t.feeCurrency,
            date: t.date,
          },
        });
        newTradesPersisted++;
      }
      console.log(`${tag} Persisted ${newTradesPersisted} new trade(s)`);
    }

    // Flip tradeHistoryComplete after the first successful full backfill.
    // We only flip if we actually got SOMETHING back — defends against silent
    // API failures making us flip on an empty response.
    if (!dryRun && wantFullTradeHistory && rawTrades.length > 0) {
      await prisma.exchangeConnection.update({
        where: { id: connectionId },
        data: { tradeHistoryComplete: true },
      });
      console.log(`${tag} Marked tradeHistoryComplete=true after full backfill`);
    }

    // Symbols with any trade history (used for the dust-exemption check below).
    // After the optional persist above, the DB reflects current truth.
    const tradedSymbolsRows = await prisma.trade.findMany({
      where: { exchangeConnectionId: connectionId },
      select: { symbol: true },
      distinct: ["symbol"],
    });
    // In dry-run we haven't persisted, but include the just-fetched trades too
    // so dust assignment isn't biased by the missing writes.
    const tradedSymbols = new Set([
      ...tradedSymbolsRows.map((r) => r.symbol),
      ...rawTrades.map((t) => t.symbol),
    ]);

    // 6. Compute EUR-converted asset rows + diff entries
    const computedAssets: ComputedAssetRow[] = [];
    const assetDiffs: AssetDiff[] = [];

    for (const pos of positions) {
      const { amountEur: currentPriceEur } = await convertToEur(
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

      const priceStatus: DbPriceStatus = (pos.priceStatus ?? "OK") as DbPriceStatus;
      const isDust =
        priceStatus === "OK" &&
        currentValueEur < DUST_THRESHOLD_EUR &&
        !tradedSymbols.has(pos.symbol);

      const computed: ComputedAssetRow = {
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
        priceStatus,
        priceUnavailableReason: pos.priceUnavailableReason ?? null,
        lockedQuantity: pos.lockedQuantity ?? null,
        isDust,
      };
      computedAssets.push(computed);

      const existing = existingBySymbol.get(pos.symbol);
      const before = existing
        ? {
            quantity: Number(existing.quantity),
            currentValueEur: Number(existing.currentValueEur),
            totalCostEur: Number(existing.totalCostEur),
            unrealizedPnlEur: Number(existing.unrealizedPnlEur),
          }
        : null;

      const after = {
        quantity: pos.quantity,
        currency: pos.currency,
        currentPrice: pos.currentPrice,
        currentValueEur,
        totalCostEur,
        unrealizedPnlEur,
      };

      let action: AssetDiffAction;
      if (!existing) {
        action = "create";
      } else if (
        before &&
        before.quantity === after.quantity &&
        before.currentValueEur === after.currentValueEur &&
        before.totalCostEur === after.totalCostEur
      ) {
        action = "unchanged";
      } else {
        action = "update";
      }

      assetDiffs.push({ symbol: pos.symbol, action, before, after });

      // Persist (skip in dry-run)
      if (!dryRun) {
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
            priceStatus: computed.priceStatus,
            priceUnavailableReason: computed.priceUnavailableReason,
            lockedQuantity: computed.lockedQuantity,
            isDust: computed.isDust,
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
            priceStatus: computed.priceStatus,
            priceUnavailableReason: computed.priceUnavailableReason,
            lockedQuantity: computed.lockedQuantity,
            isDust: computed.isDust,
            lastUpdatedAt: new Date(),
          },
        });
      }
    }

    // 7. Detect deletions: existing symbols not in incoming list
    const incomingSymbols = new Set(computedAssets.map((c) => c.symbol));
    for (const existing of existingAssets) {
      if (!incomingSymbols.has(existing.symbol)) {
        assetDiffs.push({
          symbol: existing.symbol,
          action: "delete",
          before: {
            quantity: Number(existing.quantity),
            currentValueEur: Number(existing.currentValueEur),
            totalCostEur: Number(existing.totalCostEur),
            unrealizedPnlEur: Number(existing.unrealizedPnlEur),
          },
          after: null,
        });
      }
    }

    if (!dryRun) {
      const deleted = await prisma.portfolioAsset.deleteMany({
        where: {
          exchangeConnectionId: connectionId,
          symbol: { notIn: Array.from(incomingSymbols) },
        },
      });
      if (deleted.count > 0) {
        console.log(`${tag} Removed ${deleted.count} fully-sold asset(s)`);
      }
    }

    // 8. Insert new ExchangeDeposit records (count would-be inserts in dry-run)
    let newDepositCount = 0;
    if (rawDeposits.length > 0) {
      const knownExternalIds = await prisma.exchangeDeposit.findMany({
        where: {
          exchangeConnectionId: connectionId,
          externalId: { in: rawDeposits.map((d) => d.externalId) },
        },
        select: { externalId: true },
      });
      const knownSet = new Set(knownExternalIds.map((d) => d.externalId));

      for (const dep of rawDeposits) {
        if (knownSet.has(dep.externalId)) continue;
        newDepositCount++;

        if (!dryRun) {
          const { amountEur } = await convertToEur(dep.amount, dep.currency);
          await prisma.exchangeDeposit.create({
            data: {
              exchangeConnectionId: connectionId,
              externalId: dep.externalId,
              amount: dep.amount,
              currency: dep.currency,
              amountEur,
              date: dep.date,
            },
          });
        }
      }
    }
    console.log(
      `${tag} Deposits: fetched=${rawDeposits.length}, new=${newDepositCount}`
    );

    // 9. Update freeCash on the connection (skip in dry-run)
    let freeCashEur = 0;
    if (summary) {
      ({ amountEur: freeCashEur } = await convertToEur(
        summary.freeCash,
        summary.currency
      ));

      if (!dryRun) {
        await prisma.exchangeConnection.update({
          where: { id: connectionId },
          data: {
            freeCash: summary.freeCash,
            freeCashCurrency: summary.currency,
          },
        });
      }
    }

    // 10. Compute "after" snapshot totals from the freshly computed assets
    const totalValueEurAfter = computedAssets.reduce(
      (s, a) => s + a.currentValueEur,
      0
    );
    const totalCostEurAfter = computedAssets.reduce(
      (s, a) => s + a.totalCostEur,
      0
    );
    const unrealizedPnlEurAfter = totalValueEurAfter - totalCostEurAfter;

    if (!dryRun) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const assetBreakdown = computedAssets.map((a) => ({
        symbol: a.symbol,
        name: a.name,
        assetType: a.assetType,
        currentValueEur: a.currentValueEur,
        quantity: a.quantity,
        unrealizedPnlEur: a.unrealizedPnlEur,
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
          totalValueEur: totalValueEurAfter,
          totalCostEur: totalCostEurAfter,
          unrealizedPnlEur: unrealizedPnlEurAfter,
          freeCashEur,
          assetBreakdown: JSON.stringify(assetBreakdown),
        },
        update: {
          totalValueEur: totalValueEurAfter,
          totalCostEur: totalCostEurAfter,
          unrealizedPnlEur: unrealizedPnlEurAfter,
          freeCashEur,
          assetBreakdown: JSON.stringify(assetBreakdown),
        },
      });

      console.log(
        `${tag} Snapshot saved — totalValueEur: €${totalValueEurAfter.toFixed(2)}, P&L: €${unrealizedPnlEurAfter.toFixed(2)}`
      );
    } else {
      console.log(
        `${tag} Would save snapshot — totalValueEur: €${totalValueEurAfter.toFixed(2)}, P&L: €${unrealizedPnlEurAfter.toFixed(2)}`
      );
    }

    // 11. Mark SUCCESS (skip in dry-run)
    if (!dryRun) {
      await prisma.exchangeConnection.update({
        where: { id: connectionId },
        data: {
          syncStatus: "SUCCESS",
          lastSyncAt: new Date(),
          lastSyncError: null,
        },
      });
      console.log(`${tag} Connection ${connectionId} synced successfully`);
    }

    return {
      connectionId,
      provider: connection.provider,
      label: connection.label,
      dryRun,
      assets: assetDiffs,
      deposits: {
        fetched: rawDeposits.length,
        newOnExchange: newDepositCount,
      },
      freeCash: {
        before: freeCashBefore,
        after: summary ? Number(summary.freeCash) : freeCashBefore,
        currency: summary ? summary.currency : connection.freeCashCurrency,
      },
      summary: {
        totalValueEurBefore,
        totalValueEurAfter,
        totalCostEurBefore,
        totalCostEurAfter,
        unrealizedPnlEurBefore,
        unrealizedPnlEurAfter,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown sync error";

    console.error(`${tag} Connection ${connectionId} failed:`, error);

    if (!dryRun) {
      await prisma.exchangeConnection.update({
        where: { id: connectionId },
        data: {
          syncStatus: "ERROR",
          lastSyncError: message.slice(0, 500),
        },
      });
    }

    throw error;
  }
}

// ─── syncAllExchanges ────────────────────────────────────────────────────────

export type SyncResult = {
  connectionId: string;
  success: boolean;
  skipped?: boolean; // True if we couldn't acquire the lock (already syncing)
  error?: string;
  diff?: SyncDiff; // Present on successful sync (dry-run or real)
};

export async function syncAllExchanges(
  workspaceId: string,
  options: { dryRun?: boolean } = {}
): Promise<SyncResult[]> {
  const { dryRun = false } = options;
  const tag = dryRun ? "[Sync:dryRun]" : "[Sync]";

  const connections = await prisma.exchangeConnection.findMany({
    where: { workspaceId, isActive: true },
    select: { id: true, provider: true, label: true },
  });

  console.log(
    `${tag} Starting sync for workspace ${workspaceId} — ${connections.length} active connection(s)`
  );

  const results: SyncResult[] = [];

  // Sequential to avoid hammering exchange APIs across multiple connections
  for (const conn of connections) {
    console.log(
      `${tag} Processing connection ${conn.id} (${conn.provider} — ${conn.label})`
    );

    // Real syncs need the lock; dry-runs are read-only and skip it.
    if (!dryRun) {
      const locked = await tryLockConnection(conn.id);
      if (!locked) {
        console.log(`${tag} Connection ${conn.id} already syncing — skipping`);
        results.push({
          connectionId: conn.id,
          success: false,
          skipped: true,
          error: "Already syncing",
        });
        continue;
      }
    }

    try {
      const diff = await syncExchange(conn.id, { dryRun });
      results.push({ connectionId: conn.id, success: true, diff });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown sync error";
      console.error(
        `${tag} Connection ${conn.id} failed during workspace sync:`,
        message
      );
      results.push({ connectionId: conn.id, success: false, error: message });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  console.log(
    `${tag} Workspace ${workspaceId} done — ${successCount}/${connections.length} succeeded`
  );

  return results;
}
