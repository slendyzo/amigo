import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
