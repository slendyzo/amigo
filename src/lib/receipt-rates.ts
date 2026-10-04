import { createHmac, timingSafeEqual } from "node:crypto";
import { getExchangeRatesSnapshot } from "./currency";
import { validReceiptExchangeRates, type ReceiptExchangeRates } from "./receipt-data";

const TOKEN_LIFETIME = 24 * 60 * 60 * 1000;
type Payload = { version: 1; workspaceId: string; expiresAt: number; snapshot: ReceiptExchangeRates | null };

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(`amigo-receipt-rates-v1:${payload}`).digest("base64url");
}

export function signReceiptRates(workspaceId: string, snapshot: ReceiptExchangeRates | undefined, now = Date.now()): string {
  const secret = process.env.AUTH_SECRET;
  // No unsigned rates reach a preview; this sentinel keeps exports equally unavailable.
  if (!secret) return "unavailable";
  if (snapshot && !validReceiptExchangeRates(snapshot)) throw new Error("INVALID_RECEIPT_RATES");
  const data: Payload = { version: 1, workspaceId, expiresAt: now + TOKEN_LIFETIME, snapshot: snapshot || null };
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyReceiptRates(token: string, workspaceId: string, now = Date.now()): ReceiptExchangeRates | undefined {
  if (token === "unavailable") return undefined;
  const secret = process.env.AUTH_SECRET;
  if (!secret || token.length > 20000) throw new Error("INVALID_RECEIPT_RATES_TOKEN");
  const parts = token.split(".");
  if (parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) throw new Error("INVALID_RECEIPT_RATES_TOKEN");
  const expected = Buffer.from(signature(parts[0], secret));
  const received = Buffer.from(parts[1]);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error("INVALID_RECEIPT_RATES_TOKEN");
  let data: Payload;
  try { data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); }
  catch { throw new Error("INVALID_RECEIPT_RATES_TOKEN"); }
  if (!data || data.version !== 1 || data.workspaceId !== workspaceId || !Number.isFinite(data.expiresAt) || data.expiresAt <= now || data.expiresAt > now + TOKEN_LIFETIME ||
    (data.snapshot !== null && !validReceiptExchangeRates(data.snapshot))) throw new Error("INVALID_RECEIPT_RATES_TOKEN");
  return data.snapshot || undefined;
}

export async function receiptRatesContext(workspaceId: string) {
  const fetched = await getExchangeRatesSnapshot();
  const snapshot = validReceiptExchangeRates(fetched) ? fetched : undefined;
  const ratesToken = signReceiptRates(workspaceId, snapshot);
  return { exchangeRates: ratesToken === "unavailable" ? undefined : snapshot, ratesToken };
}
