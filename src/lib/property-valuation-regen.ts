// Wipe + rebuild a property's auto-generated valuation series from a new
// baseline (purchase price, purchase date, concelho). Manual valuations and
// sale events are preserved.
//
// Triggered by PUT /api/assets/[id] when one of {purchasePrice, purchaseDate,
// concelho} changes. The chart needs internal consistency: if the cost basis
// shifts, every INE-derived point shifts with it.

import { Prisma, type PrismaClient } from "@prisma/client";
import { concelhoKey } from "@/lib/property-valuation-index";

const AUTO_SOURCES = ["purchase", "heuristic", "stale"] as const;
const RATIO_CLAMP_LOW = 0.5;
const RATIO_CLAMP_HIGH = 1.5;

export type RegenInput = {
  realAssetId: string;
  baselineDate: Date;
  baselinePrice: number; // original currency amount (for the seed row's `value` field)
  baselineEur: number;
  baselineCurrency: string;
  concelho: string | null;
};

export type RegenResult = {
  pointsWritten: number;
  finalValueEur: number;
  finalSource: "heuristic" | "stale" | "purchase";
};

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export async function regeneratePropertyValuationHistory(
  tx: Tx,
  input: RegenInput,
): Promise<RegenResult> {
  const { realAssetId, baselineDate, baselinePrice, baselineEur, baselineCurrency } = input;

  // 1. Wipe auto-generated history rows. Manual valuations + sale events stay.
  await tx.valuationHistory.deleteMany({
    where: { realAssetId, source: { in: [...AUTO_SOURCES] } },
  });

  // 2. Insert the new seed row at the new baseline date/price.
  await tx.valuationHistory.create({
    data: {
      realAssetId,
      value: new Prisma.Decimal(baselinePrice),
      valueEur: new Prisma.Decimal(baselineEur),
      currency: baselineCurrency,
      source: "purchase",
      recordedAt: baselineDate,
    },
  });

  let pointsWritten = 1;
  let finalValueEur = baselineEur;
  let finalSource: RegenResult["finalSource"] = "purchase";

  // 3. If we have a concelho, rebuild the heuristic series from INE rows.
  const key = input.concelho ? concelhoKey(input.concelho) : null;
  if (!key) {
    return { pointsWritten, finalValueEur, finalSource };
  }

  const baselineYear = baselineDate.getUTCFullYear();
  const baselineQuarter = Math.floor(baselineDate.getUTCMonth() / 3) + 1;

  // Anchor index = the row at-or-before the baseline quarter. Without it we
  // can't compute ratios, so we leave the seed alone and bail.
  const anchor = await tx.propertyValuationIndex.findFirst({
    where: {
      concelhoKey: key,
      OR: [
        { year: { lt: baselineYear } },
        { year: baselineYear, quarter: { lte: baselineQuarter } },
      ],
    },
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
  });
  if (!anchor) {
    finalSource = "stale";
    return { pointsWritten, finalValueEur, finalSource };
  }
  const anchorIndex = Number(anchor.indexValue);
  if (!Number.isFinite(anchorIndex) || anchorIndex <= 0) {
    finalSource = "stale";
    return { pointsWritten, finalValueEur, finalSource };
  }

  // All later quarters with data, ascending order — these become the rebuilt
  // heuristic series. Strictly later than the anchor so we don't double up
  // on the seed row's quarter.
  const laterQuarters = await tx.propertyValuationIndex.findMany({
    where: {
      concelhoKey: key,
      OR: [
        { year: { gt: anchor.year } },
        { year: anchor.year, quarter: { gt: anchor.quarter } },
      ],
    },
    orderBy: [{ year: "asc" }, { quarter: "asc" }],
  });

  for (const row of laterQuarters) {
    const rowIndex = Number(row.indexValue);
    if (!Number.isFinite(rowIndex) || rowIndex <= 0) continue;
    const factor = rowIndex / anchorIndex;
    const clamped = Math.max(RATIO_CLAMP_LOW, Math.min(RATIO_CLAMP_HIGH, factor));
    const valueEur = round2(baselineEur * clamped);
    // Date the synthetic point at the first day of the quarter for chart sanity.
    const recordedAt = new Date(Date.UTC(row.year, (row.quarter - 1) * 3, 1));
    await tx.valuationHistory.create({
      data: {
        realAssetId,
        value: new Prisma.Decimal(valueEur),
        valueEur: new Prisma.Decimal(valueEur),
        currency: "EUR",
        source: "heuristic",
        recordedAt,
      },
    });
    pointsWritten++;
    finalValueEur = valueEur;
    finalSource = "heuristic";
  }

  return { pointsWritten, finalValueEur, finalSource };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
