// Detect when a numeric input was likely mis-parsed by parseFloat.
//
// Backstory: in PT/EU locales users often type money like "115.000" meaning
// "one hundred fifteen thousand". HTML number inputs may accept it, but
// parseFloat("115.000") = 115 — so the asset gets persisted as €115 instead of
// €115,000. This helper computes the "digits-only" interpretation and returns
// it when it diverges from parseFloat's output, so the UI can show a
// "Did you mean €115,000?" confirmation pill.

export type AmountSuspicion =
  | { suspicious: false; parsed: number }
  | { suspicious: true; parsed: number; suggestion: number };

/**
 * Inspect a raw numeric-input string and return whether parseFloat's value
 * looks suspicious vs. the "all digits, no separators" interpretation.
 *
 * Heuristic: if the input contains thousands-style separators (dot or comma
 * followed by exactly 3 digits, no further separators acting as decimals), and
 * the all-digits interpretation is at least 100x larger than the parsed value,
 * we consider parseFloat to have eaten the thousands group.
 */
export function detectSuspiciousAmount(raw: string): AmountSuspicion {
  const trimmed = raw.trim();
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed)) {
    return { suspicious: false, parsed: NaN };
  }

  // Strip everything that isn't a digit. If the digit-only version differs
  // significantly from parseFloat's value, the user likely typed thousands
  // separators and parseFloat truncated.
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (!digitsOnly) return { suspicious: false, parsed };
  const digitsValue = Number.parseInt(digitsOnly, 10);
  if (!Number.isFinite(digitsValue)) return { suspicious: false, parsed };

  // No suspicion if both interpretations agree (no separators in input).
  if (digitsValue === parsed) return { suspicious: false, parsed };

  // Only flag when the typed input contains a thousands-style group: a
  // separator (`.` or `,`) followed by exactly three digits and no further
  // grouping. Plain decimals like "1,5" or "0.50" are honest.
  const looksLikeThousandsGroup = /[.,]\d{3}(?:\D|$)/.test(trimmed);
  if (!looksLikeThousandsGroup) return { suspicious: false, parsed };

  // The digits interpretation must be substantially larger to warrant a prompt
  // — guards against false positives on legit decimals.
  if (digitsValue / Math.max(parsed, 1) < 100) {
    return { suspicious: false, parsed };
  }

  return { suspicious: true, parsed, suggestion: digitsValue };
}

export function formatEuro(amount: number): string {
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}
