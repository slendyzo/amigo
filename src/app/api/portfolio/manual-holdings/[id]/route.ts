import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { getTokenPrices } from "@/lib/exchanges/coingecko";

/**
 * Load a manual holding and prove it belongs to the caller's workspace.
 * Returns null for "not found" and "not yours" alike — no existence leak.
 */
async function loadOwnedHolding(id: string, workspaceId: string) {
  const asset = await prisma.portfolioAsset.findUnique({
    where: { id },
    include: { exchangeConnection: true },
  });

  if (!asset) return null;
  if (asset.exchangeConnection.workspaceId !== workspaceId) return null;
  if (asset.exchangeConnection.provider !== "MANUAL") return null;

  return asset;
}

// PATCH - Update quantity or locked status of a manual holding
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const asset = await loadOwnedHolding(id, context.workspace.id);
    if (!asset) {
      return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    }

    const body = await request.json();
    const { quantity, isLocked } = body;

    const qty = quantity !== undefined ? Number(quantity) : Number(asset.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json(
        { error: "quantity must be a positive number" },
        { status: 400 }
      );
    }

    const locked = isLocked !== undefined ? Boolean(isLocked) : asset.lockedQuantity !== null;

    // Re-price on edit so the value the user sees reflects the new quantity
    // immediately rather than waiting for the next sync.
    let priceEur = Number(asset.currentPriceEur);
    if (asset.coingeckoId) {
      const prices = await getTokenPrices([asset.coingeckoId]);
      const fresh = prices[asset.coingeckoId]?.eur;
      if (fresh && fresh > 0) priceEur = fresh;
    }

    const valueEur = qty * priceEur;

    const updated = await prisma.portfolioAsset.update({
      where: { id },
      data: {
        quantity: qty,
        lockedQuantity: locked ? qty : null,
        currentPrice: priceEur,
        currentPriceEur: priceEur,
        currentValue: valueEur,
        currentValueEur: valueEur,
        lastUpdatedAt: new Date(),
      },
    });

    return NextResponse.json({
      holding: {
        id: updated.id,
        symbol: updated.symbol,
        name: updated.name,
        quantity: Number(updated.quantity),
        isLocked: updated.lockedQuantity !== null,
        currentValueEur: Number(updated.currentValueEur),
      },
    });
  } catch (error) {
    console.error("Update manual holding error:", error);
    return NextResponse.json(
      { error: "Failed to update manual holding" },
      { status: 500 }
    );
  }
}

// DELETE - Remove a manual holding, and its source once it's empty
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const asset = await loadOwnedHolding(id, context.workspace.id);
    if (!asset) {
      return NextResponse.json({ error: "Holding not found" }, { status: 404 });
    }

    const connectionId = asset.exchangeConnectionId;

    await prisma.portfolioAsset.delete({ where: { id } });

    // Don't leave an empty source sitting on the Exchanges page.
    const remaining = await prisma.portfolioAsset.count({
      where: { exchangeConnectionId: connectionId },
    });

    if (remaining === 0) {
      await prisma.exchangeConnection.delete({ where: { id: connectionId } });
    }

    return NextResponse.json({ success: true, sourceRemoved: remaining === 0 });
  } catch (error) {
    console.error("Delete manual holding error:", error);
    return NextResponse.json(
      { error: "Failed to delete manual holding" },
      { status: 500 }
    );
  }
}
