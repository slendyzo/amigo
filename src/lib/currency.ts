// Currency conversion utility
// Uses Frankfurter API (free, no API key, ECB data) with in-memory cache
// Falls back to static rates if API fails

// Fallback rates: EUR per 1 unit of foreign currency (updated Feb 2026)
const STATIC_RATES: Record<string, number> = {
  EUR: 1,
  USD: 0.84,  // 1 USD ≈ 0.84 EUR
  GBP: 1.15,  // 1 GBP ≈ 1.15 EUR
  BRL: 0.16,  // 1 BRL ≈ 0.16 EUR
  PLN: 0.24,  // 1 PLN ≈ 0.24 EUR
  CAD: 0.62,  // 1 CAD ≈ 0.62 EUR
};

// Cache for exchange rates (refreshed every hour for more current rates)
let ratesCache: { rates: Record<string, number>; timestamp: number } | null = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export async function getExchangeRates(): Promise<Record<string, number>> {
  // Return cached rates if still valid
  if (ratesCache && Date.now() - ratesCache.timestamp < CACHE_DURATION) {
    return ratesCache.rates;
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

    const data = await response.json();

    // Convert from EUR base to "how much EUR per 1 unit of currency"
    const rates: Record<string, number> = { EUR: 1 };

    if (data.rates) {
      for (const [currency, rate] of Object.entries(data.rates)) {
        // rate is "how many units of currency per 1 EUR"
        // we want "how many EUR per 1 unit of currency"
        rates[currency] = 1 / (rate as number);
      }
    }

    ratesCache = { rates, timestamp: Date.now() };
    console.log(`[FOREX] Fetched live rates from Frankfurter (date: ${data.date})`);
    return rates;
  } catch (error) {
    console.error("[FOREX] Failed to fetch live rates, using static fallback:", error);
    return STATIC_RATES;
  }
}

export async function convertToEur(
  amount: number,
  fromCurrency: string
): Promise<{ amountEur: number; exchangeRate: number }> {
  if (fromCurrency === "EUR") {
    return { amountEur: amount, exchangeRate: 1 };
  }

  const rates = await getExchangeRates();
  const rate = rates[fromCurrency] || STATIC_RATES[fromCurrency] || 1;

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
  };

  const symbol = symbols[currency] || currency;
  return `${symbol}${amount.toFixed(2)}`;
}

// Get static rate for display (doesn't make API call)
export function getStaticRate(currency: string): number {
  return STATIC_RATES[currency] || 1;
}
