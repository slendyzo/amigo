/**
 * Fuzzy string matching utilities for keyword auto-categorization.
 * Used by the keyword mapping learning system and auto-categorize batch endpoint.
 */

/**
 * Normalize a keyword for matching: lowercase, strip diacritics, punctuation, whitespace.
 */
export function normalizeKeyword(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics (á→a, ç→c)
    .replace(/[''`]/g, "") // strip apostrophes
    .replace(/[^\w\s-]/g, "") // strip other punctuation
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();
}

/**
 * Calculate Levenshtein distance between two strings.
 * Used for fuzzy keyword matching (e.g., "aleixpress" ≈ "aliexpress").
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Get the maximum allowed Levenshtein distance based on keyword length.
 * Shorter words need exact matches; longer words tolerate more typos.
 */
export function maxFuzzyDistance(keyword: string): number {
  if (keyword.length <= 3) return 0; // no fuzzy for very short words
  if (keyword.length <= 6) return 1; // 1 typo for short words
  if (keyword.length <= 10) return 2; // 2 typos for medium words
  return 3; // 3 typos for long words
}

/**
 * Check if a normalized expense name contains a keyword as a whole word or word-prefix.
 * Uses word boundary matching to avoid false positives (e.g., "gas" shouldn't match "gastronomia").
 * Returns the matched keyword or null.
 */
export function findContainedKeyword(
  normalizedName: string,
  keywords: string[]
): string | null {
  // Sort keywords longest-first so we match the most specific keyword
  const sorted = [...keywords].sort((a, b) => b.length - a.length);
  for (const kw of sorted) {
    if (kw.length < 2) continue;
    // Match keyword as a whole word (surrounded by word boundaries)
    const regex = new RegExp(`(?:^|\\s|-)${escapeRegex(kw)}(?:\\s|-|$)`, "i");
    if (regex.test(normalizedName)) {
      return kw;
    }
  }
  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
