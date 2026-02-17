// Currency conversion utility
// Uses exchangerate-api.com free tier (1500 requests/month)
// Falls back to static rates if API fails

const STATIC_RATES: Record<string, number> = {
  EUR: 1,
  USD: 0.92, // 1 USD = 0.92 EUR (approximate)
  GBP: 1.17, // 1 GBP = 1.17 EUR (approximate)
  BRL: 0.18, // 1 BRL = 0.18 EUR (approximate)
  PLN: 0.23, // 1 PLN = 0.23 EUR (approximate)
  CAD: 0.65, // 1 CAD = 0.65 EUR (approximate)
};

// Cache for exchange rates (refreshed every 24h)
let ratesCache: { rates: Record<string, number>; timestamp: number } | null = null;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export async function getExchangeRates(): Promise<Record<string, number>> {
  // Return cached rates if still valid
  if (ratesCache && Date.now() - ratesCache.timestamp < CACHE_DURATION) {
    return ratesCache.rates;
  }

  try {
    // Using exchangerate-api.com free tier
    const response = await fetch(
      "https://api.exchangerate-api.com/v4/latest/EUR",
      { next: { revalidate: 86400 } } // Cache for 24h in Next.js
    );

    if (!response.ok) {
      throw new Error("Failed to fetch exchange rates");
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
    return rates;
  } catch (error) {
    console.error("Failed to fetch exchange rates, using static rates:", error);
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
