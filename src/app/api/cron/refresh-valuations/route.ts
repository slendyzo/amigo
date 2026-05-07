import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  computeVehicleHeuristicValue,
  computePropertyHeuristicValue,
} from "@/lib/asset-valuation";
import { computeLoanBalance } from "@/lib/loan-amortization";
import { convertToEur } from "@/lib/currency";
import { getIndexAtOrBefore, getLatestIndex } from "@/lib/property-valuation-index";

// Nightly RWA refresh:
//   1. For every ACTIVE vehicle, recompute the heuristic value and append a
//      ValuationHistory row.
//   2. For every ACTIVE property, recompute via INE concelho index (or freeze
//      at last known value when the concelho has no data).
//   3. For every ACTIVE liability, recompute current balance using the loan
//      amortization helper.
//
// Currentvalue precedence: even though we always append today's heuristic row
// to history, we don't blindly use it as `currentValue`. A manual entry (any
// age) or a recent market scrape (`live_scrape` / `web_archive` within the
// asset-class freshness window) wins over the heuristic. This stops the cron
// from overwriting €300k scraped comparables with a €115k INE index that
// hasn't moved since 2004.
//
// Auth via x-cron-secret header matching CRON_SECRET env var. Failures per
// asset/liability are logged and skipped; one bad row never blocks the rest.

export const dynamic = "force-dynamic";

// Real estate moves slowly; cars don't. Tune the windows independently.
const VEHICLE_MARKET_FRESHNESS_DAYS = 30;
const PROPERTY_MARKET_FRESHNESS_DAYS = 180;

type CurrentValueWinner = {
  valueEur: number;
  source: string;
  updatedAt: Date;
};

/**
 * Pick which valuation should drive `currentValue`. Manual entries always
 * win. Recent market evidence beats today's heuristic. Otherwise the
 * heuristic wins.
 */
async function pickCurrentValue(args: {
  realAssetId: string;
  heuristicValueEur: number;
  heuristicSource: string;
  marketFreshnessDays: number;
}): Promise<CurrentValueWinner> {
  const { realAssetId, heuristicValueEur, heuristicSource, marketFreshnessDays } = args;
  const now = new Date();
  const cutoff = new Date(now.getTime() - marketFreshnessDays * 86_400_000);

  const [manual, recentMarket] = await Promise.all([
    prisma.valuationHistory.findFirst({
      where: { realAssetId, source: "manual" },
      orderBy: { recordedAt: "desc" },
    }),
    prisma.valuationHistory.findFirst({
      where: {
        realAssetId,
        source: { in: ["live_scrape", "web_archive"] },
        recordedAt: { gte: cutoff },
      },
      orderBy: { recordedAt: "desc" },
    }),
  ]);

  const candidates = [manual, recentMarket].filter(
    (r): r is NonNullable<typeof manual> => r != null,
  );
  if (candidates.length === 0) {
    return { valueEur: heuristicValueEur, source: heuristicSource, updatedAt: now };
  }
  candidates.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
  const winner = candidates[0];
  return {
    valueEur: Number(winner.valueEur),
    source: winner.source,
    updatedAt: winner.recordedAt,
  };
}

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret") ?? request.headers.get("authorization");
  if (!header) return false;
  const provided = header.startsWith("Bearer ") ? header.slice(7) : header;
  return provided === secret;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  let vehiclesProcessed = 0;
  let vehiclesFailed = 0;
  let propertiesProcessed = 0;
  let propertiesFailed = 0;
  let propertiesStale = 0;
  let liabilitiesProcessed = 0;
  let liabilitiesFailed = 0;

  // --- Vehicles -------------------------------------------------------------
  const vehicles = await prisma.realAsset.findMany({
    where: { status: "ACTIVE", type: "VEHICLE" },
    include: { vehicle: true },
  });

  for (const asset of vehicles) {
    try {
      if (!asset.vehicle) continue;
      const purchasePriceEur = Number(asset.purchasePriceEur);
      if (!Number.isFinite(purchasePriceEur) || purchasePriceEur <= 0) continue;

      const result = computeVehicleHeuristicValue({
        purchasePriceEur,
        year: asset.vehicle.year,
        mileage: asset.vehicle.mileage,
      });

      const winner = await pickCurrentValue({
        realAssetId: asset.id,
        heuristicValueEur: result.valueEur,
        heuristicSource: "heuristic",
        marketFreshnessDays: VEHICLE_MARKET_FRESHNESS_DAYS,
      });

      // Only append the heuristic row to history when it actually drives
      // currentValue. If a market scrape or manual entry won, today's heuristic
      // adds nothing useful and would just clutter the chart with a divergent
      // dot every night.
      if (winner.source === "heuristic") {
        await prisma.valuationHistory.create({
          data: {
            realAssetId: asset.id,
            value: new Prisma.Decimal(result.valueEur),
            valueEur: new Prisma.Decimal(result.valueEur),
            currency: "EUR",
            source: "heuristic",
          },
        });
      }

      await prisma.realAsset.update({
        where: { id: asset.id },
        data: {
          currentValue: new Prisma.Decimal(winner.valueEur),
          currentValueEur: new Prisma.Decimal(winner.valueEur),
          currentValueUpdatedAt: winner.updatedAt,
          currentValueSource: winner.source,
        },
      });
      vehiclesProcessed++;
    } catch (err) {
      vehiclesFailed++;
      console.error(`[cron/refresh-valuations] vehicle ${asset.id} failed:`, err);
    }
  }

  // --- Properties -----------------------------------------------------------
  const properties = await prisma.realAsset.findMany({
    where: { status: "ACTIVE", type: "PROPERTY" },
    include: { property: true },
  });

  for (const asset of properties) {
    try {
      if (!asset.property) continue;
      const purchasePriceEur = Number(asset.purchasePriceEur);
      if (!Number.isFinite(purchasePriceEur) || purchasePriceEur <= 0) continue;

      const concelho = asset.property.concelho;
      const [anchor, latest] = concelho
        ? await Promise.all([
            getIndexAtOrBefore(concelho, asset.purchaseDate),
            getLatestIndex(concelho),
          ])
        : [null, null];

      const result = computePropertyHeuristicValue({
        purchasePriceEur,
        purchaseDate: asset.purchaseDate,
        currentIndex: latest?.indexValue ?? null,
        purchaseQuarterIndex: anchor?.indexValue ?? null,
        lastKnownValueEur:
          asset.currentValueEur != null ? Number(asset.currentValueEur) : null,
      });

      const winner = await pickCurrentValue({
        realAssetId: asset.id,
        heuristicValueEur: result.valueEur,
        heuristicSource: result.source,
        marketFreshnessDays: PROPERTY_MARKET_FRESHNESS_DAYS,
      });

      // Only append the heuristic row when it actually drives currentValue.
      // Stale rebuilds never get a row (they carry no new information). When
      // a market scrape or manual entry wins, today's heuristic also adds
      // nothing useful — skipping it keeps the chart line tied to reality.
      if (winner.source === "heuristic" && result.source === "heuristic") {
        await prisma.valuationHistory.create({
          data: {
            realAssetId: asset.id,
            value: new Prisma.Decimal(result.valueEur),
            valueEur: new Prisma.Decimal(result.valueEur),
            currency: "EUR",
            source: "heuristic",
          },
        });
      } else if (result.source === "stale") {
        propertiesStale++;
      }

      await prisma.realAsset.update({
        where: { id: asset.id },
        data: {
          currentValue: new Prisma.Decimal(winner.valueEur),
          currentValueEur: new Prisma.Decimal(winner.valueEur),
          currentValueUpdatedAt: winner.updatedAt,
          currentValueSource: winner.source,
        },
      });
      propertiesProcessed++;
    } catch (err) {
      propertiesFailed++;
      console.error(`[cron/refresh-valuations] property ${asset.id} failed:`, err);
    }
  }

  // --- Liabilities ----------------------------------------------------------
  const liabilities = await prisma.liability.findMany({ where: { status: "ACTIVE" } });

  for (const l of liabilities) {
    try {
      const balance = computeLoanBalance({
        principal: Number(l.principal),
        interestRate: l.interestRate ? Number(l.interestRate) : null,
        termMonths: l.termMonths,
        monthlyPayment: l.monthlyPayment ? Number(l.monthlyPayment) : null,
        startDate: l.startDate,
      });

      const { amountEur } = await convertToEur(balance.currentBalance, l.currency);

      await prisma.liability.update({
        where: { id: l.id },
        data: {
          currentBalance: new Prisma.Decimal(balance.currentBalance),
          currentBalanceEur: new Prisma.Decimal(amountEur),
          // If the loan term has fully elapsed and balance is zero, close it.
          ...(balance.currentBalance === 0 && l.termMonths && balance.monthsElapsed >= l.termMonths
            ? { status: "PAID_OFF" as const }
            : {}),
        },
      });
      liabilitiesProcessed++;
    } catch (err) {
      liabilitiesFailed++;
      console.error(`[cron/refresh-valuations] liability ${l.id} failed:`, err);
    }
  }

  const tookMs = Date.now() - startedAt;
  return NextResponse.json({
    ok: true,
    tookMs,
    vehicles: { processed: vehiclesProcessed, failed: vehiclesFailed },
    properties: {
      processed: propertiesProcessed,
      failed: propertiesFailed,
      stale: propertiesStale,
    },
    liabilities: { processed: liabilitiesProcessed, failed: liabilitiesFailed },
  });
}
