export type SplitPerson = {
  label: string;
  amount: number;
  locked: boolean;
};

/**
 * Calculate equal split amounts for N people.
 * Last person absorbs rounding remainder.
 */
export function calculateEqualSplit(total: number, count: number): number[] {
  const perPerson = Math.floor((total / count) * 100) / 100;
  const amounts = Array(count).fill(perPerson) as number[];
  const remainder = Math.round((total - perPerson * count) * 100) / 100;
  amounts[count - 1] = Math.round((perPerson + remainder) * 100) / 100;
  return amounts;
}

/**
 * Initialize a people array from count and total with equal split.
 * First person is always "Me" (the current user).
 */
export function initializeSplit(total: number, count: number, meLabel: string = "Me"): SplitPerson[] {
  const amounts = calculateEqualSplit(total, count);
  return amounts.map((amt, i) => ({
    label: i === 0 ? meLabel : `Person ${i + 1}`,
    amount: amt,
    locked: false,
  }));
}

/**
 * Recalculate unlocked shares after a locked amount changes.
 * Returns null if locked amounts exceed total.
 */
export function recalculateSplit(
  total: number,
  people: SplitPerson[]
): SplitPerson[] | null {
  const lockedTotal = people
    .filter((p) => p.locked)
    .reduce((sum, p) => sum + p.amount, 0);

  if (Math.round(lockedTotal * 100) > Math.round(total * 100)) return null;

  const remaining = Math.round((total - lockedTotal) * 100) / 100;
  const unlockedCount = people.filter((p) => !p.locked).length;

  if (unlockedCount === 0) {
    // All locked — valid only if they sum to total
    return Math.abs(remaining) < 0.01 ? [...people] : null;
  }

  const perUnlocked = Math.floor((remaining / unlockedCount) * 100) / 100;
  const unlockedRemainder = Math.round((remaining - perUnlocked * unlockedCount) * 100) / 100;

  let lastUnlockedIndex = -1;
  const result = people.map((p, i) => {
    if (!p.locked) {
      lastUnlockedIndex = i;
      return { ...p, amount: perUnlocked };
    }
    return { ...p };
  });

  // Last unlocked person absorbs rounding
  if (lastUnlockedIndex >= 0) {
    result[lastUnlockedIndex].amount = Math.round((perUnlocked + unlockedRemainder) * 100) / 100;
  }

  return result;
}

/**
 * Parse stored splitData JSON string back to array.
 */
export function parseSplitData(json: string | null | undefined): SplitPerson[] | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Get the user's share from a split expense.
 * The user is always the first person (index 0).
 * Returns null if not a split expense or data is missing.
 */
export function getUserShare(splitCount: number | null | undefined, splitData: string | null | undefined): number | null {
  if (!splitCount || splitCount <= 1) return null;
  const people = parseSplitData(splitData);
  if (people && people.length > 0) {
    return people[0].amount;
  }
  // Fallback: if no splitData, assume equal split (shouldn't happen normally)
  return null;
}

/**
 * Resolve an expense's effective EUR amount — the user's share when split,
 * otherwise the full amount. Use this in any aggregation (totals, monthly
 * breakdowns, project sums) so split expenses don't count the full bill.
 */
// Accepts both plain JSON numbers (frontend) and Prisma Decimal (backend) —
// Number() coerces both to a primitive number.
export function effectiveEur(expense: {
  splitCount?: number | null;
  splitData?: string | null;
  amount: unknown;
  amountEur: unknown;
}): number {
  const amountEur = Number(expense.amountEur);
  const amount = Number(expense.amount);
  if (!expense.splitCount || expense.splitCount <= 1) return amountEur;
  const share = getUserShare(expense.splitCount, expense.splitData);
  if (share !== null && amount !== 0) {
    return amountEur * (share / amount);
  }
  return amountEur / expense.splitCount;
}
