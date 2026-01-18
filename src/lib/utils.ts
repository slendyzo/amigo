import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parses an amount string that may use comma or dot as decimal separator.
 * @param amountStr - The amount string (e.g., "12,50" or "12.50")
 * @returns The parsed number or NaN if invalid
 */
export function parseAmount(amountStr: string): number {
  if (!amountStr || typeof amountStr !== "string") return NaN;
  const normalized = amountStr.trim().replace(",", ".");
  return parseFloat(normalized);
}

/**
 * Validates and parses an amount, returning null if invalid.
 * @param amountStr - The amount string to parse
 * @returns The parsed number or null if invalid
 */
export function parseAmountSafe(amountStr: string): number | null {
  const amount = parseAmount(amountStr);
  return isNaN(amount) ? null : amount;
}

/**
 * Returns today's date in YYYY-MM-DD format for date inputs.
 * @returns Date string in ISO format (YYYY-MM-DD)
 */
export function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Formats a Date object to YYYY-MM-DD string.
 * @param date - The Date object to format
 * @returns Date string in ISO format (YYYY-MM-DD)
 */
export function formatDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Sanitize text input to prevent XSS attacks
 * - Strips HTML tags
 * - Encodes special HTML characters
 * - Trims whitespace
 */
export function sanitizeText(input: string | null | undefined, maxLength?: number): string {
  if (!input) return "";

  // Convert to string and trim
  let sanitized = String(input).trim();

  // Strip HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, "");

  // Encode HTML special characters
  sanitized = sanitized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

  // Apply max length if specified
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}

/**
 * Sanitize text but preserve original characters (no HTML encoding)
 * Use when data will be stored in DB and properly escaped on output
 * - Strips HTML tags only
 * - Trims whitespace
 */
export function stripHtmlTags(input: string | null | undefined, maxLength?: number): string {
  if (!input) return "";

  // Convert to string and trim
  let sanitized = String(input).trim();

  // Strip HTML tags (including script, style, and event handlers)
  sanitized = sanitized.replace(/<[^>]*>/g, "");

  // Apply max length if specified
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}
