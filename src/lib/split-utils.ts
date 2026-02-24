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
 */
export function initializeSplit(total: number, count: number): SplitPerson[] {
  const amounts = calculateEqualSplit(total, count);
  return amounts.map((amt, i) => ({
    label: `Person ${i + 1}`,
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
