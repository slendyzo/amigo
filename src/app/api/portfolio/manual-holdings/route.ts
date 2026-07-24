import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { getTokenPrices } from "@/lib/exchanges/coingecko";

/**
 * Manual holdings — positions no API reports.
 *
 * Staking, vesting and locked tokens leave your wallet: a balance scan asks
 * "what does this address hold" and the answer is genuinely zero. These rows
 * let the user close that gap by hand.
 *
 * A manual holding is stored as a normal PortfolioAsset under an
 * ExchangeConnection with provider MANUAL. Modelling it that way means
 * aggregation, allocation, symbol detail and snapshots all work unchanged.
 *
 * Cost basis is deliberately zero — these positions carry value but no P&L.
 */

// GET - List manual holdings for the workspace, grouped by source
export async function GET() {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connections = await prisma.exchangeConnection.findMany({
      where: { workspaceId: context.workspace.id, provider: "MANUAL" },
      include: { assets: true },
      orderBy: { createdAt: "asc" },
    });

    const sources = connections.map((c) => ({
      id: c.id,
      label: c.label,
      createdAt: c.createdAt,
      holdings: c.assets.map((a) => ({
        id: a.id,
        symbol: a.symbol,
        name: a.name,
        coingeckoId: a.coingeckoId,
        quantity: Number(a.quantity),
        isLocked: a.lockedQuantity !== null,
        currentPriceEur: Number(a.currentPriceEur),
        currentValueEur: Number(a.currentValueEur),
        trackingStartedAt: a.trackingStartedAt,
        lastUpdatedAt: a.lastUpdatedAt,
      })),
    }));

    return NextResponse.json({ sources });
  } catch (error) {
    console.error("Get manual holdings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch manual holdings" },
      { status: 500 }
    );
  }
}

// POST - Create (or replace) a manual holding
export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { coingeckoId, symbol, name, quantity, label, isLocked } = body;

    if (!coingeckoId || !symbol || !label) {
      return NextResponse.json(
        { error: "coingeckoId, symbol and label are required" },
        { status: 400 }
      );
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json(
        { error: "quantity must be a positive number" },
        { status: 400 }
      );
    }

    const trimmedLabel = String(label).trim().slice(0, 100);
    if (trimmedLabel.length === 0) {
      return NextResponse.json({ error: "label cannot be empty" }, { status: 400 });
    }

    // Price it now so the holding lands in the portfolio already valued.
    // A price failure isn't fatal — sync will fill it in on the next pass.
    const prices = await getTokenPrices([coingeckoId]);
    const priceEur = prices[coingeckoId]?.eur ?? 0;
    const valueEur = qty * priceEur;

    // One source per label. Two holdings "held at" the same place share it.
    const connection = await prisma.exchangeConnection.upsert({
      where: {
        workspaceId_provider_label: {
          workspaceId: context.workspace.id,
          provider: "MANUAL",
          label: trimmedLabel,
        },
      },
      create: {
        workspaceId: context.workspace.id,
        provider: "MANUAL",
        label: trimmedLabel,
        syncStatus: "SUCCESS",
        isActive: true,
      },
      update: {},
    });

    // Unique on (connection, symbol) — re-adding the same symbol at the same
    // source updates it rather than erroring, which is what the user means.
    const asset = await prisma.portfolioAsset.upsert({
      where: {
        exchangeConnectionId_symbol: {
          exchangeConnectionId: connection.id,
          symbol: String(symbol).toUpperCase(),
        },
      },
      create: {
        exchangeConnectionId: connection.id,
        symbol: String(symbol).toUpperCase(),
        name: String(name || symbol).slice(0, 200),
        assetType: "CRYPTO",
        quantity: qty,
        averageBuyPrice: 0,
        averageBuyPriceEur: 0,
        currentPrice: priceEur,
        currentPriceEur: priceEur,
        currentValue: valueEur,
        currentValueEur: valueEur,
        totalCost: 0,
        totalCostEur: 0,
        unrealizedPnl: 0,
        unrealizedPnlEur: 0,
        unrealizedPnlPct: 0,
        currency: "EUR",
        lockedQuantity: isLocked ? qty : null,
        coingeckoId,
        trackingStartedAt: new Date(),
        priceStatus: priceEur > 0 ? "OK" : "UNAVAILABLE",
        priceUnavailableReason:
          priceEur > 0 ? null : "No price returned for this coin yet",
      },
      update: {
        name: String(name || symbol).slice(0, 200),
        quantity: qty,
        currentPrice: priceEur,
        currentPriceEur: priceEur,
        currentValue: valueEur,
        currentValueEur: valueEur,
        lockedQuantity: isLocked ? qty : null,
        coingeckoId,
        priceStatus: priceEur > 0 ? "OK" : "UNAVAILABLE",
        priceUnavailableReason:
          priceEur > 0 ? null : "No price returned for this coin yet",
      },
    });

    return NextResponse.json(
      {
        holding: {
          id: asset.id,
          sourceId: connection.id,
          label: connection.label,
          symbol: asset.symbol,
          name: asset.name,
          quantity: Number(asset.quantity),
          isLocked: asset.lockedQuantity !== null,
          currentValueEur: Number(asset.currentValueEur),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create manual holding error:", error);
    return NextResponse.json(
      { error: "Failed to create manual holding" },
      { status: 500 }
    );
  }
}
