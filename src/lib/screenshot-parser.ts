export type ScreenshotExpense = {
  name: string;
  merchant: string | null;
  amount: number;
  currency: string;
  date: string;
  time: string | null;
  dateUncertain: boolean;
  confidence: number;
  rawText: string;
};

export function localDateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const RELATIVE = /\b(yesterday|ontem|hier|today|hoje|aujourd['’]hui)\b/i;
const TIME = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/;
const FULL_DATE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.]\d{1,2}[/.]\d{4}\b/g;
const BANK_OR_CHROME = /^(?:millennium\s*bcp|millenniumbcp|wallet|carteira|notification\s+cent(?:re|er)|central\s+de\s+notifica[çc][õo]es|show\s+(?:less|more)|mostrar\s+(?:menos|mais)|nos\s+wifi|vodafone|meo|revolut|moey!?|santander|novo\s*banco|caixa\s+geral.*|banco\s+.*|bpi|mb\s*way)$/i;
const AMOUNT = /(?:[€$£]|\b(?:EUR|USD|GBP)|\bE(?=\s*\d+[,.]\d{2}\b))\s*(-?\s*\d[\d .,]*(?:[,.]\d{2}))|(-?\s*\d[\d .,]*(?:[,.]\d{2}))\s*(?:[€$£]|\b(?:EUR|USD|GBP)\b)/gi;

function amountNumber(raw: string): number {
  const value = raw.replace(/\s/g, "");
  const decimal = Math.max(value.lastIndexOf(","), value.lastIndexOf("."));
  return Number(`${value.slice(0, decimal).replace(/[.,]/g, "")}.${value.slice(decimal + 1)}`);
}

type OcrLine = { text: string; words: { text: string; confidence: number }[] };

/** Score the values being entered, excluding wallpaper and bank-logo OCR noise. */
export function screenshotExpenseConfidence(expense: ScreenshotExpense, lines: OcrLine[]): number {
  const merchantTokens = new Set((expense.merchant || "").toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []);
  const merchantWords: OcrLine["words"] = [];
  const amountWords: OcrLine["words"] = [];
  for (const line of lines) {
    if (!expense.rawText.includes(line.text.trim())) continue;
    for (const word of line.words) {
      const token = word.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      if (merchantTokens.has(token)) merchantWords.push(word);
      const numeric = word.text.match(/-?\d[\d.,]*(?:[,.]\d{2})/);
      if (numeric && amountNumber(numeric[0]) === expense.amount) amountWords.push(word);
    }
  }
  const average = (words: OcrLine["words"]) => words.length ? words.reduce((total, word) => total + word.confidence, 0) / words.length : 50;
  return Math.round(Math.min(expense.confidence, average(merchantWords), average(amountWords)));
}

function readDate(lines: string[], captureDate: string) {
  const joined = lines.join(" ");
  const timeMatch = joined.replace(FULL_DATE, "").match(TIME);
  const time = timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : null;
  const relative = joined.match(RELATIVE)?.[0].toLowerCase();
  if (relative) {
    const base = new Date(`${captureDate}T12:00:00`);
    if (/yesterday|ontem|hier/.test(relative)) base.setDate(base.getDate() - 1);
    return { date: localDateString(base), time, dateUncertain: false };
  }
  const full = joined.match(/\b(\d{4})-(\d{2})-(\d{2})\b/) || joined.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/);
  if (full) {
    const iso = full[1].length === 4 ? full[0] : `${full[3]}-${full[2].padStart(2, "0")}-${full[1].padStart(2, "0")}`;
    const parsed = new Date(`${iso}T12:00:00`);
    if (!Number.isNaN(parsed.getTime()) && localDateString(parsed) === iso) return { date: iso, time, dateUncertain: false };
  }
  // A screenshot may have been saved days ago. A time alone cannot identify its date.
  return { date: captureDate, time, dateUncertain: true };
}

function merchantLines(lines: string[]): string[] {
  return lines.map(line => line
    .replace(/^(?:J\s+M|MM|M)\s+(?=[A-Z])/g, "")
    .replace(RELATIVE, "")
    .replace(FULL_DATE, "")
    .replace(TIME, "")
    .replace(/^[\s,|•]+|[\s,|•]+$/g, "").trim())
    .filter(line => line && !BANK_OR_CHROME.test(line) && !/^(?:[A-Z]|[\d\W]+|(?:sun|mon|tue|wed|thu|fri|sat)\b.*)$/i.test(line));
}

/** Amount anchors separate notification cards without merging repeat vendors. */
export function parseScreenshotText(text: string, captureDate: string, defaultCurrency = "EUR"): ScreenshotExpense[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(captureDate) || Number.isNaN(new Date(`${captureDate}T12:00:00`).getTime()) || localDateString(new Date(`${captureDate}T12:00:00`)) !== captureDate) throw new Error("Invalid capture date");
  const normalized = text.replace(/\r/g, "").replace(/\u00a0/g, " ");
  const matches = [...normalized.matchAll(AMOUNT)];
  const result: ScreenshotExpense[] = [];
  let previousEnd = 0;
  for (const match of matches) {
    const start = match.index!;
    const end = start + match[0].length;
    const amount = amountNumber(match[1] || match[2]);
    if (!Number.isFinite(amount) || amount === 0) { previousEnd = end; continue; }
    const lines = normalized.slice(previousEnd, start).split("\n").map(line => line.trim()).filter(Boolean);
    // Trim lock-screen chrome before the most recent notification's bank header.
    let header = -1;
    for (let i = 0; i < lines.length; i++) {
      const withoutDate = lines[i].replace(RELATIVE, "").replace(FULL_DATE, "").replace(TIME, "").replace(/[,|]/g, "").trim();
      if (BANK_OR_CHROME.test(withoutDate)) header = i;
    }
    const cardLines = header >= 0 ? lines.slice(header) : lines.slice(-4);
    // Some notifications place the timestamp below the amount. Consume only a
    // immediately following metadata-only line, never the next bank/vendor.
    let cardEnd = end;
    const suffix = normalized.slice(end).match(/^[ \t]*\n([ \t]*[^\n]+)\n?/);
    if (suffix) {
      const footer = suffix[1].trim();
      const hasMetadata = RELATIVE.test(footer) || TIME.test(footer.replace(FULL_DATE, "")) || /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.]\d{1,2}[/.]\d{4}\b/.test(footer);
      const remainder = footer.replace(RELATIVE, "").replace(FULL_DATE, "").replace(TIME, "").replace(/[\s,|•]/g, "");
      if (hasMetadata && !remainder) {
        cardLines.push(footer);
        cardEnd += suffix[0].length;
      }
    }
    const rawText = normalized.slice(previousEnd, cardEnd).trim();
    const merchants = merchantLines(cardLines);
    const merchant = merchants.length ? merchants.join(" ").slice(0, 255) : null;
    const currency = /€|EUR|^E\s*\d/i.test(match[0]) ? "EUR" : /£|GBP/i.test(match[0]) ? "GBP" : /\$|USD/i.test(match[0]) ? "USD" : defaultCurrency;
    result.push({ name: merchant || "", merchant, amount, currency, ...readDate(cardLines, captureDate), confidence: merchant ? 85 : 50, rawText });
    previousEnd = cardEnd;
  }
  return result;
}

