/**
 * Currency constants and utilities for the Amigo application.
 * Centralizes all currency-related code to avoid duplication across components.
 */

export const CURRENCIES = ["EUR", "USD", "GBP", "BRL", "PLN"] as const;

export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  BRL: "R$",
  PLN: "zł",
};

/**
 * Reverse mapping from symbol to currency code.
 * Used for OCR parsing to detect currency from receipt text.
 */
export const SYMBOL_TO_CURRENCY: Record<string, Currency> = {
  "€": "EUR",
  "$": "USD",
  "£": "GBP",
  "R$": "BRL",
  "zł": "PLN",
};

/**
 * Currency options for select dropdowns with labels and symbols.
 */
export const CURRENCY_OPTIONS = CURRENCIES.map((currency) => ({
  value: currency,
  label: currency,
  symbol: CURRENCY_SYMBOLS[currency],
}));

/**
 * Gets the symbol for a currency code.
 * @param currency - The currency code (e.g., "EUR", "USD")
 * @returns The currency symbol (e.g., "€", "$")
 */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency as Currency] || currency;
}

/**
 * Formats an amount with its currency symbol.
 * @param amount - The numeric amount
 * @param currency - The currency code (defaults to "EUR")
 * @returns Formatted string like "€12.50" or "(€12.50)" for negative
 */
export function formatCurrency(amount: number, currency: string = "EUR"): string {
  const symbol = getCurrencySymbol(currency);
  const absAmount = Math.abs(amount);
  if (amount < 0) {
    return `(${symbol}${absAmount.toFixed(2)})`;
  }
  return `${symbol}${amount.toFixed(2)}`;
}

/**
 * Formats an amount without negative parentheses.
 * @param amount - The numeric amount
 * @param currency - The currency code (defaults to "EUR")
 * @returns Formatted string like "€12.50"
 */
export function formatCurrencySimple(amount: number, currency: string = "EUR"): string {
  const symbol = getCurrencySymbol(currency);
  return `${symbol}${Math.abs(amount).toFixed(2)}`;
}
