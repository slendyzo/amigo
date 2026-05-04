// Heuristic vehicle valuation engine.
//
// Curve: 15% year 1, 12% year 2, 10% years 3-5, 7% year 6+ (compounded).
// Mileage adjustment: ±0.5% per 5,000 km vs. a 15k km/year baseline.
// Floor: 5% of purchase price (junk value).

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
