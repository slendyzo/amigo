// Loan amortization helpers.
//
// Given a Liability's stored fields (principal, interestRate, termMonths,
// monthlyPayment, startDate), compute outstanding balance as of any date.
//
// Falls back gracefully when partial data is provided:
//   - principal + monthlyPayment + interestRate → standard amortization
//   - principal + monthlyPayment (no rate)      → linear (0% APR equivalent)
//   - principal + termMonths + interestRate     → derives monthly payment
//   - principal only                            → returns principal (no decay)

export type AmortizationInput = {
  principal: number;
  interestRate?: number | null; // annual %, e.g. 6.5 for 6.5%
  termMonths?: number | null;
  monthlyPayment?: number | null;
  startDate: Date;
  asOf?: Date;
};

export type AmortizationResult = {
  currentBalance: number;
  monthsElapsed: number;
  totalMonths: number | null;
  monthlyPayment: number | null;
  totalInterestPaid: number;
};

export function computeLoanBalance(input: AmortizationInput): AmortizationResult {
  const { principal, startDate } = input;
  const asOf = input.asOf ?? new Date();
  const interestRate = input.interestRate ?? null;
  const termMonths = input.termMonths ?? null;
  let monthlyPayment = input.monthlyPayment ?? null;

  if (!Number.isFinite(principal) || principal <= 0) {
    return { currentBalance: 0, monthsElapsed: 0, totalMonths: termMonths, monthlyPayment, totalInterestPaid: 0 };
  }

  const monthsElapsed = Math.max(0, monthsBetween(startDate, asOf));

  // Loan hasn't started yet — full principal still owed.
  if (monthsElapsed === 0) {
    return {
      currentBalance: round2(principal),
      monthsElapsed: 0,
      totalMonths: termMonths,
      monthlyPayment,
      totalInterestPaid: 0,
    };
  }

  // Derive monthly payment if missing.
  if (monthlyPayment == null && termMonths && termMonths > 0) {
    monthlyPayment = computeMonthlyPayment(principal, interestRate ?? 0, termMonths);
  }

  // Can't progress — return principal unchanged.
  if (monthlyPayment == null || monthlyPayment <= 0) {
    return {
      currentBalance: round2(principal),
      monthsElapsed,
      totalMonths: termMonths,
      monthlyPayment,
      totalInterestPaid: 0,
    };
  }

  const r = interestRate != null && interestRate > 0 ? interestRate / 100 / 12 : 0;
  const cap = termMonths && termMonths > 0 ? Math.min(monthsElapsed, termMonths) : monthsElapsed;

  let balance = principal;
  let totalInterest = 0;

  if (r === 0) {
    // Linear paydown.
    const paid = Math.min(monthlyPayment * cap, principal);
    balance = principal - paid;
  } else {
    // Standard amortization: each month accrues interest then subtracts payment.
    for (let i = 0; i < cap; i++) {
      const interestThisMonth = balance * r;
      const principalThisMonth = monthlyPayment - interestThisMonth;
      totalInterest += interestThisMonth;
      balance -= principalThisMonth;
      if (balance <= 0) {
        balance = 0;
        break;
      }
    }
  }

  return {
    currentBalance: round2(Math.max(0, balance)),
    monthsElapsed,
    totalMonths: termMonths,
    monthlyPayment,
    totalInterestPaid: round2(totalInterest),
  };
}

export function computeMonthlyPayment(principal: number, annualRate: number, termMonths: number): number {
  if (termMonths <= 0) return 0;
  if (annualRate === 0) return round2(principal / termMonths);
  const r = annualRate / 100 / 12;
  const factor = Math.pow(1 + r, termMonths);
  return round2((principal * r * factor) / (factor - 1));
}

function monthsBetween(start: Date, end: Date): number {
  const years = end.getUTCFullYear() - start.getUTCFullYear();
  const months = end.getUTCMonth() - start.getUTCMonth();
  const dayAdjust = end.getUTCDate() < start.getUTCDate() ? -1 : 0;
  return years * 12 + months + dayAdjust;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
