import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { computeVehicleHeuristicValue } from "@/lib/asset-valuation";
import { computeLoanBalance } from "@/lib/loan-amortization";
import { convertToEur } from "@/lib/currency";

// Nightly RWA refresh:
//   1. For every ACTIVE vehicle, recompute the heuristic value and append a
//      ValuationHistory row.
//   2. For every ACTIVE liability, recompute current balance using the loan
//      amortization helper.
//
// Auth via x-cron-secret header matching CRON_SECRET env var. Failures per
// asset/liability are logged and skipped; one bad row never blocks the rest.

export const dynamic = "force-dynamic";

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

      await prisma.$transaction([
        prisma.valuationHistory.create({
          data: {
            realAssetId: asset.id,
            value: new Prisma.Decimal(result.valueEur),
            valueEur: new Prisma.Decimal(result.valueEur),
            currency: "EUR",
            source: "heuristic",
          },
        }),
        prisma.realAsset.update({
          where: { id: asset.id },
          data: {
            currentValue: new Prisma.Decimal(result.valueEur),
            currentValueEur: new Prisma.Decimal(result.valueEur),
            currentValueUpdatedAt: new Date(),
            currentValueSource: "heuristic",
          },
        }),
      ]);
      vehiclesProcessed++;
    } catch (err) {
      vehiclesFailed++;
      console.error(`[cron/refresh-valuations] vehicle ${asset.id} failed:`, err);
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
    liabilities: { processed: liabilitiesProcessed, failed: liabilitiesFailed },
  });
}
