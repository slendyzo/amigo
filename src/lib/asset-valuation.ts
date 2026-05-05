// Heuristic asset valuation engines (vehicle + property).
//
// Vehicle curve: 15% year 1, 12% year 2, 10% years 3-5, 7% year 6+ (compounded).
// Vehicle mileage adjustment: ±0.5% per 5,000 km vs. a 15k km/year baseline.
// Vehicle floor: 5% of purchase price (junk value).
//
// Property: index-ratio model — currentValue = purchasePrice × (currentIndex /
// purchaseQuarterIndex). Pulls per-concelho data from PropertyValuationIndex
// (sourced from INE). When the concelho is unknown or has no index data we
// freeze at the last known value with currentValueSource: "stale".

const ANNUAL_DEPRECIATION = [0.15, 0.12, 0.10, 0.10, 0.10] as const;
const TAIL_DEPRECIATION = 0.07;
const BASELINE_KM_PER_YEAR = 15_000;
const MILEAGE_BAND_KM = 5_000;
const MILEAGE_BAND_ADJUSTMENT = 0.005;
const VALUE_FLOOR_FRACTION = 0.05;

export type HeuristicValueInput = {
  purchasePriceEur: number;
  year: number;
  mileage?: number | null;
  asOf?: Date;
};

export type HeuristicValueResult = {
  valueEur: number;
  source: "heuristic";
  ageYears: number;
  retainedFraction: number;
  mileageAdjustment: number;
};

export function computeVehicleHeuristicValue(input: HeuristicValueInput): HeuristicValueResult {
  const { purchasePriceEur, year, mileage } = input;
  const asOf = input.asOf ?? new Date();

  if (purchasePriceEur <= 0 || !Number.isFinite(purchasePriceEur)) {
    return { valueEur: 0, source: "heuristic", ageYears: 0, retainedFraction: 0, mileageAdjustment: 0 };
  }

  const currentYear = asOf.getUTCFullYear();
  const ageYears = Math.max(0, currentYear - year);

  let retained = 1;
  for (let y = 0; y < ageYears; y++) {
    const rate = ANNUAL_DEPRECIATION[y] ?? TAIL_DEPRECIATION;
    retained *= 1 - rate;
  }

  let mileageAdjustment = 0;
  if (typeof mileage === "number" && Number.isFinite(mileage) && ageYears > 0) {
    const expectedKm = BASELINE_KM_PER_YEAR * ageYears;
    const deltaKm = expectedKm - Math.max(0, mileage);
    const bands = Math.trunc(deltaKm / MILEAGE_BAND_KM);
    mileageAdjustment = bands * MILEAGE_BAND_ADJUSTMENT;
    // Cap adjustment to ±20% so an outlier mileage doesn't dominate the curve.
    if (mileageAdjustment > 0.2) mileageAdjustment = 0.2;
    if (mileageAdjustment < -0.2) mileageAdjustment = -0.2;
  }

  const adjustedRetained = retained * (1 + mileageAdjustment);
  const floor = VALUE_FLOOR_FRACTION;
  const finalRetained = Math.max(adjustedRetained, floor);

  const valueEur = round2(purchasePriceEur * finalRetained);

  return {
    valueEur,
    source: "heuristic",
    ageYears,
    retainedFraction: finalRetained,
    mileageAdjustment,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Property ───────────────────────────────────────────────────────────────

export type PropertyValueInput = {
  purchasePriceEur: number;
  purchaseDate: Date;
  currentIndex: number | null; // null = no current concelho data
  purchaseQuarterIndex: number | null; // null = no anchor data
  lastKnownValueEur?: number | null;
};

export type PropertyValueResult = {
  valueEur: number;
  source: "heuristic" | "stale";
  appreciationFactor: number; // 1.0 = flat, 1.06 = +6%, 0.95 = -5%
};

export function computePropertyHeuristicValue(
  input: PropertyValueInput,
): PropertyValueResult {
  const { purchasePriceEur, currentIndex, purchaseQuarterIndex, lastKnownValueEur } = input;

  // Insufficient data → freeze. Either we never anchored or the concelho is unknown.
  const haveAnchor = purchaseQuarterIndex != null && purchaseQuarterIndex > 0;
  const haveCurrent = currentIndex != null && currentIndex > 0;
  if (!haveAnchor || !haveCurrent) {
    const fallback = lastKnownValueEur ?? purchasePriceEur;
    return { valueEur: round2(fallback), source: "stale", appreciationFactor: 1 };
  }

  const factor = currentIndex! / purchaseQuarterIndex!;
  // Sanity-clamp the factor: real estate moves slowly, but bad data could cause
  // wild ratios. Cap at ±50% to keep outliers from poisoning the cron output.
  const clamped = Math.max(0.5, Math.min(1.5, factor));
  return {
    valueEur: round2(purchasePriceEur * clamped),
    source: "heuristic",
    appreciationFactor: clamped,
  };
}
