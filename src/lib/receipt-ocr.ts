// Receipt OCR Processing with Tesseract.js
// Fully local, free OCR solution

import Tesseract from "tesseract.js";
import { KEYWORD_MAP } from "./parser";

export type ExtractedReceiptData = {
  merchantName: string | null;
  totalAmount: number | null;
  date: string | null;
  currency: string;
  items: Array<{ name: string; amount: number }>;
  rawText: string;
  confidence: number;
};

// Currency symbols and their codes
const CURRENCY_SYMBOLS: Record<string, string> = {
  "€": "EUR",
  "$": "USD",
  "£": "GBP",
  "R$": "BRL",
  "zł": "PLN",
};

/**
 * Extract receipt data from an image using Tesseract.js OCR
 */
export async function extractReceiptData(
  imageSource: string | File | Blob,
  onProgress?: (progress: number) => void
): Promise<ExtractedReceiptData> {
  // Run OCR with Tesseract.js
  const result = await Tesseract.recognize(imageSource, "eng+por", {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  const rawText = result.data.text;
  const confidence = result.data.confidence;

  // Parse the OCR text to extract structured data
  const parsed = parseReceiptText(rawText);

  return {
    ...parsed,
    rawText,
    confidence,
  };
}

/**
 * Parse raw OCR text to extract receipt data using heuristics
 */
function parseReceiptText(text: string): Omit<ExtractedReceiptData, "rawText" | "confidence"> {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Extract merchant name (usually first non-empty lines)
  const merchantName = extractMerchantName(lines);

  // Extract total amount
  const totalAmount = extractTotalAmount(text);

  // Extract date
  const date = extractDate(text);

  // Detect currency
  const currency = detectCurrency(text);

  // Extract line items
  const items = extractLineItems(lines);

  return {
    merchantName,
    totalAmount,
    date,
    currency,
    items,
  };
}

/**
 * Extract merchant name from first few lines
 */
function extractMerchantName(lines: string[]): string | null {
  // Check first 5 lines for known merchants from KEYWORD_MAP
  const firstLines = lines.slice(0, 5).join(" ").toLowerCase();

  for (const [keyword, mapping] of Object.entries(KEYWORD_MAP)) {
    if (firstLines.includes(keyword)) {
      return mapping.merchant;
    }
  }

  // Return first line that looks like a name (not numbers, not too short)
  for (const line of lines.slice(0, 3)) {
    const cleaned = line.replace(/[^a-zA-ZÀ-ÿ\s]/g, "").trim();
    if (cleaned.length > 3 && !/^\d+$/.test(cleaned)) {
      // Capitalize first letter of each word
      return cleaned
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
    }
  }

  return null;
}

/**
 * Extract total amount using regex patterns
 */
function extractTotalAmount(text: string): number | null {
  // Normalize text for easier matching
  const normalized = text.toLowerCase();

  // Patterns for total in different languages/formats
  const totalPatterns = [
    /total[:\s]*[€$£]?\s*([\d.,]+)/i,
    /total\s+a\s+pagar[:\s]*[€$£]?\s*([\d.,]+)/i,
    /montante[:\s]*[€$£]?\s*([\d.,]+)/i,
    /valor[:\s]*[€$£]?\s*([\d.,]+)/i,
    /amount[:\s]*[€$£]?\s*([\d.,]+)/i,
    /grand\s*total[:\s]*[€$£]?\s*([\d.,]+)/i,
    /sub\s*total[:\s]*[€$£]?\s*([\d.,]+)/i,
    /[€$£]\s*([\d.,]+)\s*$/m, // Currency at end of line
  ];

  for (const pattern of totalPatterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      const amount = parseAmount(match[1]);
      if (amount !== null && amount > 0) {
        return amount;
      }
    }
  }

  // Fallback: find the largest amount in the text (likely the total)
  const allAmounts = extractAllAmounts(text);
  if (allAmounts.length > 0) {
    return Math.max(...allAmounts);
  }

  return null;
}

/**
 * Extract all monetary amounts from text
 */
function extractAllAmounts(text: string): number[] {
  const amounts: number[] = [];

  // Match amounts with various formats: 12.50, 12,50, €12.50, 12.50€
  const amountPattern = /[€$£]?\s*(\d{1,6}[.,]\d{2})\s*[€$£]?/g;

  let match;
  while ((match = amountPattern.exec(text)) !== null) {
    const amount = parseAmount(match[1]);
    if (amount !== null) {
      amounts.push(amount);
    }
  }

  return amounts;
}

/**
 * Parse amount string to number
 */
function parseAmount(amountStr: string): number | null {
  if (!amountStr) return null;

  // Handle European format (1.234,56) vs US format (1,234.56)
  let normalized = amountStr.trim();

  // If has both . and , determine format
  if (normalized.includes(".") && normalized.includes(",")) {
    // European: 1.234,56 -> 1234.56
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      // US: 1,234.56 -> 1234.56
      normalized = normalized.replace(/,/g, "");
    }
  } else if (normalized.includes(",")) {
    // Could be either 1234,56 (European decimal) or 1,234 (US thousands)
    // If comma is followed by exactly 2 digits at end, it's decimal
    if (/,\d{2}$/.test(normalized)) {
      normalized = normalized.replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  }

  const amount = parseFloat(normalized);
  return isNaN(amount) ? null : amount;
}

/**
 * Extract date from receipt text
 */
function extractDate(text: string): string | null {
  // Common date formats
  const datePatterns = [
    // DD/MM/YYYY or DD-MM-YYYY
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
    // DD/MM/YY or DD-MM-YY
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})/,
    // YYYY-MM-DD
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
    // DD MMM YYYY (e.g., 15 Jan 2024)
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)[a-z]*\s+(\d{4})/i,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        // Try to construct a valid date
        let day: number, month: number, year: number;

        if (pattern.source.startsWith("(\\d{4})")) {
          // YYYY-MM-DD format
          year = parseInt(match[1]);
          month = parseInt(match[2]);
          day = parseInt(match[3]);
        } else if (typeof match[2] === "string" && isNaN(parseInt(match[2]))) {
          // DD MMM YYYY format
          day = parseInt(match[1]);
          month = parseMonthName(match[2]);
          year = parseInt(match[3]);
        } else {
          // DD/MM/YYYY or DD/MM/YY
          day = parseInt(match[1]);
          month = parseInt(match[2]);
          year = parseInt(match[3]);
          if (year < 100) {
            year += 2000;
          }
        }

        // Validate date
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          return dateStr;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Parse month name to number
 */
function parseMonthName(monthStr: string): number {
  const months: Record<string, number> = {
    jan: 1, january: 1, janeiro: 1,
    feb: 2, february: 2, fevereiro: 2,
    mar: 3, march: 3, março: 3,
    apr: 4, april: 4, abril: 4,
    may: 5, maio: 5,
    jun: 6, june: 6, junho: 6,
    jul: 7, july: 7, julho: 7,
    aug: 8, august: 8, agosto: 8,
    sep: 9, september: 9, setembro: 9,
    oct: 10, october: 10, outubro: 10,
    nov: 11, november: 11, novembro: 11,
    dec: 12, december: 12, dezembro: 12,
  };

  const lower = monthStr.toLowerCase().slice(0, 3);
  return months[lower] || 1;
}

/**
 * Detect currency from text
 */
function detectCurrency(text: string): string {
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (text.includes(symbol)) {
      return code;
    }
  }

  // Check for currency codes
  if (/\bEUR\b/i.test(text)) return "EUR";
  if (/\bUSD\b/i.test(text)) return "USD";
  if (/\bGBP\b/i.test(text)) return "GBP";
  if (/\bBRL\b/i.test(text)) return "BRL";
  if (/\bPLN\b/i.test(text)) return "PLN";

  // Default to EUR
  return "EUR";
}

/**
 * Extract individual line items from receipt
 */
function extractLineItems(lines: string[]): Array<{ name: string; amount: number }> {
  const items: Array<{ name: string; amount: number }> = [];

  for (const line of lines) {
    // Skip lines that are likely headers or totals
    if (/total|subtotal|tax|iva|desconto|discount|troco|change/i.test(line)) {
      continue;
    }

    // Look for pattern: "Item name... price"
    const match = line.match(/^(.+?)\s+[€$£]?\s*(\d{1,4}[.,]\d{2})\s*[€$£]?$/);
    if (match) {
      const name = match[1].replace(/[.…]+$/, "").trim();
      const amount = parseAmount(match[2]);

      if (name.length > 1 && amount !== null && amount > 0 && amount < 10000) {
        items.push({ name, amount });
      }
    }
  }

  return items;
}

/**
 * Preprocess image for better OCR results (client-side)
 * Returns a canvas with enhanced image
 */
export function preprocessImageForOCR(
  image: HTMLImageElement,
  canvas: HTMLCanvasElement
): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Set canvas size to match image
  canvas.width = image.width;
  canvas.height = image.height;

  // Draw original image
  ctx.drawImage(image, 0, 0);

  // Get image data for processing
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Convert to grayscale and increase contrast
  for (let i = 0; i < data.length; i += 4) {
    // Grayscale using luminosity method
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

    // Increase contrast
    const contrast = 1.5;
    const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));
    const newValue = Math.max(0, Math.min(255, factor * (gray - 128) + 128));

    // Apply threshold for binarization (makes text clearer)
    const threshold = 128;
    const finalValue = newValue > threshold ? 255 : 0;

    data[i] = finalValue;
    data[i + 1] = finalValue;
    data[i + 2] = finalValue;
  }

  ctx.putImageData(imageData, 0, 0);

  return canvas;
}
