// Bicycle market valuation (AMIGO-258).
//
// Bikes have no clean pan-EU scrape source (buycycle is an auth-walled SPA),
// so the live resale feed is OLX.pt. This refreshes one bike's value from OLX:
//
//   scrape OLX bikes → keep only listings whose make+model match the asset
//   (vehicleListingMatches) → median → reject if implausible vs purchase price
//   (scrapeMedianIsPlausible). On success: write a SpecMarketSnapshot + a
//   live_scrape ValuationHistory row + bump currentValue. On failure (too few
//   comps / clamped): leave the heuristic value untouched.
//
// Shared by the scrape-comparables cron (bicycle pass) and the asset-create
// route (so a freshly-added bike isn't stale until the next cron).

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { scrapeOlxBikes } from "./scrapers/olx-bikes";
import { vehicleListingMatches } from "./listing-html-parser";
import { scrapeMedianIsPlausible } from "./asset-valuation";

const MIN_MEDIAN_SAMPLES = 3;

function median(prices: number[]): number {
  return prices.slice().sort((a, b) => a - b)[Math.floor(prices.length / 2)];
}

// Must match comparables.ts vehicleSpecHash (no prefix) so the comparables
// modal can resolve the snapshot for a bike. A bike spec (e.g. 2024|Canyon|
// Endurace) never collides with a real car spec.
function specHashOf(year: number, make: string, model: string, trim: string | null): string {
  return createHash("sha256").update(`${year}|${make}|${model}|${trim ?? ""}`).digest("hex");
}

export type BikeValuationResult =
  | { status: "updated"; medianEur: number; sampleSize: number }
  | { status: "no_data" }
  | { status: "clamped"; medianEur: number }
  | { status: "skipped" };

/**
 * Refresh a single bicycle's market value from OLX.pt. Safe to call fire-and-
 * forget; never throws. No-op for non-bicycle assets.
 */
export async function refreshBikeValuation(realAssetId: string): Promise<BikeValuationResult> {
  try {
    const asset = await prisma.realAsset.findUnique({
      where: { id: realAssetId },
      include: { vehicle: true },
    });
    if (!asset || asset.status !== "ACTIVE" || asset.vehicle?.vehicleClass !== "BICYCLE") {
      return { status: "skipped" };
    }
    const v = asset.vehicle;
    const purchaseEur = Number(asset.purchasePriceEur);

    const listings = await scrapeOlxBikes({
      make: v.brand,
      model: v.model,
      year: v.year,
      trim: v.trim,
    });

    // Only count listings that actually match this bike's make + model.
    const matched = listings.filter(
      (l) => l.price > 0 && vehicleListingMatches(l, { make: v.brand, model: v.model }),
    );
    if (matched.length < MIN_MEDIAN_SAMPLES) return { status: "no_data" };

    const med = median(matched.map((l) => l.price));
    if (!scrapeMedianIsPlausible(med, purchaseEur)) {
      // Implausible vs purchase price → pollution. Leave the heuristic value.
      return { status: "clamped", medianEur: med };
    }

    const snapshot = await prisma.specMarketSnapshot.create({
      data: {
        specHash: specHashOf(v.year, v.brand, v.model, v.trim),
        year: v.year,
        make: v.brand,
        model: v.model,
        trim: v.trim,
        // Reuse "olx_live" so the comparables modal (VEHICLE_LIVE_SOURCES)
        // resolves it; the metadata tag below records it came from the bike feed.
        source: "olx_live",
        listings: matched as unknown as Prisma.InputJsonValue,
        sampleSize: matched.length,
      },
    });

    await prisma.$transaction([
      prisma.valuationHistory.create({
        data: {
          realAssetId: asset.id,
          value: new Prisma.Decimal(med),
          valueEur: new Prisma.Decimal(med),
          currency: "EUR",
          source: "live_scrape",
          sampleSize: matched.length,
          metadata: { source: "olx_bikes_live" } satisfies Prisma.InputJsonValue,
          snapshotId: snapshot.id,
        },
      }),
      prisma.realAsset.update({
        where: { id: asset.id },
        data: {
          currentValue: new Prisma.Decimal(med),
          currentValueEur: new Prisma.Decimal(med),
          currentValueUpdatedAt: new Date(),
          currentValueSource: "live_scrape",
          backfillStatus: "done",
          backfillProgress: 100,
        },
      }),
    ]);

    return { status: "updated", medianEur: med, sampleSize: matched.length };
  } catch (err) {
    console.error(`[bike-valuation] ${realAssetId} failed:`, err);
    return { status: "skipped" };
  }
}
