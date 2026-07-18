// Pure installment math, shared by plan creation and the expense generators.
// Kept dependency-free so recurring-generate.ts can import it without a
// circular reference on installments.ts.

const round2 = (n: number) => Math.round(n * 100) / 100;

export function monthlyInstallment(total: number, months: number): number {
  return round2(total / months);
}

// Amount of the n-th installment (1-based). The final installment absorbs the
// rounding remainder so the parts always sum exactly to the total
// (600/12 → 12×50.00; 100/3 → 33.33+33.33+33.34).
export function installmentAmount(total: number, months: number, n: number): number {
  const monthly = monthlyInstallment(total, months);
  if (n < months) return monthly;
  return round2(total - monthly * (months - 1));
}

export function monthIdxUtc(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}
