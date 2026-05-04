// Currency conversion utility
// Uses Frankfurter API (free, no API key, ECB data) with in-memory cache
// Falls back to static rates if API fails

// Stablecoin → fiat mapping. Stablecoins peg ~1:1 to a fiat currency, but
// FX APIs (Frankfurter/ECB) don't list them. We treat them as their underlying
// fiat for conversion so portfolio values priced in USDT/USDC don't quietly
// fall back to rate=1 (which would mean "USDT == EUR" → ~16% undervaluation).
const STABLE_TO_FIAT: Record<string, string> = {
  USDT: "USD",
  USDC: "USD",
  DAI: "USD",
  BUSD: "USD",
  FDUSD: "USD",
  TUSD: "USD",
  PYUSD: "USD",
};

// Fallback rates: EUR per 1 unit of foreign currency (updated Feb 2026)
const STATIC_RATES: Record<string, number> = {
  EUR: 1,
  USD: 0.84,  // 1 USD ≈ 0.84 EUR
  GBP: 1.15,  // 1 GBP ≈ 1.15 EUR
  BRL: 0.16,  // 1 BRL ≈ 0.16 EUR
  PLN: 0.24,  // 1 PLN ≈ 0.24 EUR
  CAD: 0.62,  // 1 CAD ≈ 0.62 EUR
  MAD: 0.092, // 1 MAD ≈ 0.092 EUR
  JPY: 0.0063, // 1 JPY ≈ 0.0063 EUR
  CHF: 1.06,  // 1 CHF ≈ 1.06 EUR
  AUD: 0.60,  // 1 AUD ≈ 0.60 EUR
  INR: 0.011, // 1 INR ≈ 0.011 EUR
  MXN: 0.048, // 1 MXN ≈ 0.048 EUR
  TRY: 0.026, // 1 TRY ≈ 0.026 EUR
  SEK: 0.088, // 1 SEK ≈ 0.088 EUR
  KRW: 0.00065, // 1 KRW ≈ 0.00065 EUR
  CNY: 0.13,  // 1 CNY ≈ 0.13 EUR
};

// Track currencies we've already warned about to avoid log spam
const warnedUnknownCurrencies = new Set<string>();

// Cache for exchange rates (refreshed every hour for more current rates)
let ratesCache: {
  rates: Record<string, number>;
  timestamp: number;
  source: "live" | "static";
  sourceDate: string | null; // ECB date from Frankfurter, e.g. "2026-04-30"
} | null = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

async function getRatesWithMeta(): Promise<{
  rates: Record<string, number>;
  source: "live" | "static";
  sourceDate: string | null;
}> {
  // Return cached rates if still valid
  if (ratesCache && Date.now() - ratesCache.timestamp < CACHE_DURATION) {
    return {
      rates: ratesCache.rates,
      source: ratesCache.source,
      sourceDate: ratesCache.sourceDate,
    };
  }

  try {
    // Frankfurter API: free, no key, no rate limits, ECB data
    const response = await fetch(
      "https://api.frankfurter.dev/v1/latest",
      { next: { revalidate: 3600 } } // Cache for 1h in Next.js
    );

    if (!response.ok) {
      throw new Error(`Frankfurter API returned ${response.status}`);
    }

    const data = (await response.json()) as {
      date?: string;
      rates?: Record<string, number>;
    };

    // Convert from EUR base to "how much EUR per 1 unit of currency"
    const rates: Record<string, number> = { EUR: 1 };

    if (data.rates) {
      for (const [currency, rate] of Object.entries(data.rates)) {
        // rate is "how many units of currency per 1 EUR"
        // we want "how many EUR per 1 unit of currency"
        rates[currency] = 1 / (rate as number);
      }
    }

    const sourceDate = data.date ?? null;
    ratesCache = {
      rates,
      timestamp: Date.now(),
      source: "live",
      sourceDate,
    };
    console.log(`[FOREX] Fetched live rates from Frankfurter (date: ${sourceDate})`);
    return { rates, source: "live", sourceDate };
  } catch (error) {
    console.error("[FOREX] Failed to fetch live rates, using static fallback:", error);
    return { rates: STATIC_RATES, source: "static", sourceDate: null };
  }
}

export async function getExchangeRates(): Promise<Record<string, number>> {
  return (await getRatesWithMeta()).rates;
}

// For UI: get the rate snapshot's source + date (when was this rate set by the ECB?)
export async function getExchangeRatesMeta(): Promise<{
  source: "live" | "static";
  sourceDate: string | null;
}> {
  const { source, sourceDate } = await getRatesWithMeta();
  return { source, sourceDate };
}

export async function convertToEur(
  amount: number,
  fromCurrency: string
): Promise<{ amountEur: number; exchangeRate: number }> {
  // Normalise stablecoins to their underlying fiat (USDT → USD, etc.)
  const normalised = STABLE_TO_FIAT[fromCurrency] ?? fromCurrency;

  if (normalised === "EUR") {
    return { amountEur: amount, exchangeRate: 1 };
  }

  const rates = await getExchangeRates();
  const rate = rates[normalised] ?? STATIC_RATES[normalised];

  if (rate === undefined) {
    // No rate found anywhere — warn once per currency, fall back to 1
    if (!warnedUnknownCurrencies.has(fromCurrency)) {
      warnedUnknownCurrencies.add(fromCurrency);
      console.warn(
        `[FOREX] Unknown currency "${fromCurrency}" (normalised: "${normalised}") — using rate=1 as fallback. Add to STABLE_TO_FIAT or STATIC_RATES if needed.`
      );
    }
    return { amountEur: amount, exchangeRate: 1 };
  }

  return {
    amountEur: Number((amount * rate).toFixed(2)),
    exchangeRate: rate,
  };
}

export function formatCurrency(
  amount: number,
  currency: string = "EUR"
): string {
  const symbols: Record<string, string> = {
    EUR: "\u20ac",
    USD: "$",
    GBP: "\u00a3",
    BRL: "R$",
    PLN: "z\u0142",
    CAD: "C$",
    MAD: "\u062f.\u0645.",
    JPY: "\u00a5",
    CHF: "CHF",
    AUD: "A$",
    INR: "\u20b9",
    MXN: "MX$",
    TRY: "\u20ba",
    SEK: "kr",
    KRW: "\u20a9",
    CNY: "\u00a5",
  };

  const symbol = symbols[currency] || currency;
  return `${symbol}${amount.toFixed(2)}`;
}

// Get static rate for display (doesn't make API call)
export function getStaticRate(currency: string): number {
  const normalised = STABLE_TO_FIAT[currency] ?? currency;
  return STATIC_RATES[normalised] ?? 1;
}
