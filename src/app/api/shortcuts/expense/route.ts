import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveApiToken } from "@/lib/api-token";
import { createQuickAddExpense } from "@/lib/quick-add";
import { parseQuickAdd } from "@/lib/parser";
import { formatCurrency } from "@/lib/currency";
import { stripHtmlTags } from "@/lib/utils";

// Simple in-memory rate limits (reset on redeploy, good enough for a single container)
const WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30; // authenticated requests per token per minute
const ANON_RATE_LIMIT_MAX = 60; // requests per IP per minute, applied before auth
const rateBuckets = new Map<string, { count: number; windowStart: number }>();

// How long a Wallet double-fire can lag its twin. Kept short: beyond this, an
// identical merchant + amount is far more likely to be a real second purchase.
const DUPLICATE_WINDOW_MS = 60_000;

function isRateLimited(key: string, max: number): boolean {
  const now = Date.now();

  // Sweep expired buckets so an unauthenticated caller can't grow the map forever.
  if (rateBuckets.size > 5_000) {
    for (const [k, b] of rateBuckets) {
      if (now - b.windowStart > WINDOW_MS) rateBuckets.delete(k);
    }
  }

  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    rateBuckets.set(key, { count: 1, windowStart: now });
    return false;
  }
  bucket.count++;
  return bucket.count > max;
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

/**
 * Parse a localized amount string coming from the iOS Wallet Transaction trigger.
 * Handles "23,40", "€ 23,40", "1.234,56", "12.50", and negatives (refunds), whose
 * sign sits on either end depending on locale: "-12,34" or "12,34-".
 */
function parseWalletAmount(input: unknown): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : null;
  }
  if (typeof input !== "string") return null;

  const trimmed = input.trim();
  const negative = trimmed.startsWith("-") || trimmed.endsWith("-");

  // A minus anywhere else means we misread the string — refuse rather than guess.
  if (trimmed.replace(/^-|-$/g, "").includes("-")) return null;

  let s = trimmed.replace(/[^\d.,]/g, "");
  if (!s) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  if (lastDot !== -1 && lastComma !== -1) {
    // Both present: the last one is the decimal separator
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    // Only comma: decimal comma ("23,40") unless it looks like a thousands group ("1,234")
    const decimals = s.length - lastComma - 1;
    s = decimals === 3 && s.length > 4 ? s.replace(/,/g, "") : s.replace(",", ".");
  }

  const value = parseFloat(s);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

// POST - Create an expense from an iOS Shortcut (Bearer token auth)
// Mode A: { text: "mcd 12" } - free text, same parsing as web quick-add
// Mode B: { merchant, amount, currency?, date? } - Wallet Transaction trigger
export async function POST(request: Request) {
  try {
    // Throttle before the token lookup too, so unknown tokens can't hammer the DB.
    if (isRateLimited(`ip:${clientIp(request)}`, ANON_RATE_LIMIT_MAX)) {
      return NextResponse.json(
        { success: false, message: "Too many requests, slow down" },
        { status: 429 }
      );
    }

    const context = await resolveApiToken(request);
    if (!context) {
      return NextResponse.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }

    if (isRateLimited(`token:${context.tokenId}`, RATE_LIMIT_MAX)) {
      return NextResponse.json(
        { success: false, message: "Too many requests, slow down" },
        { status: 429 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { workspace } = context;

    // Build the quick-add input string for both modes
    let input: string;
    let amount: number | null = null;

    if (typeof body.text === "string" && body.text.trim()) {
      // Mode A - free text
      input = stripHtmlTags(body.text, 500);
    } else {
      // Mode B - structured (Wallet)
      const merchant = stripHtmlTags(typeof body.merchant === "string" ? body.merchant : "", 255);
      amount = parseWalletAmount(body.amount);

      if (!merchant) {
        return NextResponse.json(
          { success: false, message: "Missing merchant name" },
          { status: 400 }
        );
      }
      if (amount === null || amount === 0) {
        return NextResponse.json(
          { success: false, message: "Could not read the amount" },
          { status: 400 }
        );
      }

      // Reuse the quick-add path so keyword mappings auto-categorize wallet merchants.
      // Amount goes in as absolute (the parser regex has no minus sign) and is
      // overridden below so refunds (negative) survive.
      input = `${merchant} ${Math.abs(amount)}`;
    }

    const currency =
      typeof body.currency === "string" && /^[A-Za-z]{3}$/.test(body.currency)
        ? body.currency.toUpperCase()
        : undefined;

    let date: Date | undefined;
    if (typeof body.date === "string" && body.date) {
      const parsedDate = new Date(body.date);
      if (!Number.isNaN(parsedDate.getTime())) date = parsedDate;
    }

    // Duplicate guard: Wallet triggers occasionally fire twice for one payment.
    // Scoped to this token's own writes and to a short window — two genuine taps
    // at the same merchant, or the same purchase logged by a workspace mate or in
    // the web UI, must still produce two expenses.
    const parsed = parseQuickAdd(input);
    const parsedName = stripHtmlTags(parsed.name, 255);
    const expectedAmount = amount ?? parsed.amount;

    const recentDuplicate = await prisma.expense.findFirst({
      where: {
        workspaceId: workspace.id,
        apiTokenId: context.tokenId,
        name: parsedName,
        amount: expectedAmount,
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
    });

    const duplicate = !!recentDuplicate;
    const expense = recentDuplicate
      ? recentDuplicate
      : await createQuickAddExpense(workspace, input, {
          date,
          currency,
          amount: amount ?? undefined,
          apiTokenId: context.tokenId,
        });

    const amountNumber = Number(expense.amount);
    const message = duplicate
      ? `Already logged ${expense.name} ${formatCurrency(amountNumber, expense.currency)}`
      : `Added ${expense.name} ${formatCurrency(amountNumber, expense.currency)}`;

    return NextResponse.json(
      {
        success: true,
        message,
        duplicate,
        expense: {
          id: expense.id,
          name: expense.name,
          amount: amountNumber,
          currency: expense.currency,
        },
      },
      { status: duplicate ? 200 : 201 }
    );
  } catch (error) {
    console.error("Shortcuts expense error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create expense" },
      { status: 500 }
    );
  }
}
