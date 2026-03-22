import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely evaluate a simple math expression.
 * Supports: +, -, *, / with numbers (including decimals with comma or dot).
 * Returns null if the expression is invalid or not a math expression (plain number).
 */
export function evaluateExpression(expr: string): number | null {
  if (!expr || expr.trim() === "") return null;

  const normalized = expr.replace(/,/g, ".");
  const hasMathOps = /[+\-*/]/.test(normalized.replace(/^-/, ""));
  if (!hasMathOps) return null;
  if (!/^[\d.+\-*/\s]+$/.test(normalized)) return null;

  try {
    const tokens = normalized.split(/([+\-*/])/).filter((t) => t.trim() !== "");
    let result = 0;
    let currentOp = "+";

    for (const token of tokens) {
      const trimmed = token.trim();
      if (["+", "-", "*", "/"].includes(trimmed)) {
        currentOp = trimmed;
      } else {
        const num = parseFloat(trimmed);
        if (isNaN(num)) return null;
        switch (currentOp) {
          case "+": result += num; break;
          case "-": result -= num; break;
          case "*": result *= num; break;
          case "/": if (num === 0) return null; result /= num; break;
        }
      }
    }

    return Math.round(result * 100) / 100;
  } catch {
    return null;
  }
}

/**
 * Parses an amount string that may use comma or dot as decimal separator.
 * Also handles simple math expressions (e.g., "5+5" → 10).
 * @param amountStr - The amount string (e.g., "12,50", "12.50", or "5+5")
 * @returns The parsed number or NaN if invalid
 */
export function parseAmount(amountStr: string): number {
  if (!amountStr || typeof amountStr !== "string") return NaN;
  const normalized = amountStr.trim().replace(",", ".");

  // Try evaluating as a math expression first
  const exprResult = evaluateExpression(normalized);
  if (exprResult !== null) return exprResult;

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
 * Uses local timezone so the date matches the user's device.
 * @returns Date string in YYYY-MM-DD format
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Formats a Date object to YYYY-MM-DD string.
 * Uses local timezone so the date matches the user's device.
 * @param date - The Date object to format
 * @returns Date string in YYYY-MM-DD format
 */
export function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
