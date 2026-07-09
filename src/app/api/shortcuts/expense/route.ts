import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveApiToken } from "@/lib/api-token";
import { createQuickAddExpense } from "@/lib/quick-add";
import { parseQuickAdd } from "@/lib/parser";
import { formatCurrency } from "@/lib/currency";
import { stripHtmlTags } from "@/lib/utils";

// Simple in-memory rate limit per token (resets on redeploy, good enough here)
const RATE_LIMIT_MAX = 30; // requests per token per minute
const rateBuckets = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(tokenId: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(tokenId);
  if (!bucket || now - bucket.windowStart > 60_000) {
    rateBuckets.set(tokenId, { count: 1, windowStart: now });
    return false;
  }
  bucket.count++;
  return bucket.count > RATE_LIMIT_MAX;
}

/**
 * Parse a localized amount string coming from the iOS Wallet Transaction trigger.
 * Handles "23,40", "€ 23,40", "1.234,56", "12.50", negatives (refunds).
 */
function parseWalletAmount(input: unknown): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : null;
  }
  if (typeof input !== "string") return null;

  // Keep digits, separators and minus sign only
  let s = input.replace(/[^\d.,-]/g, "");
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
  return Number.isFinite(value) ? value : null;
}

// POST - Create an expense from an iOS Shortcut (Bearer token auth)
// Mode A: { text: "mcd 12" } - free text, same parsing as web quick-add
// Mode B: { merchant, amount, currency?, date? } - Wallet Transaction trigger
export async function POST(request: Request) {
  try {
    const context = await resolveApiToken(request);
    if (!context) {
      return NextResponse.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }

    if (isRateLimited(context.tokenId)) {
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
    // Compare against the same parsed name/amount the quick-add path would produce.
    const parsed = parseQuickAdd(input);
    const parsedName = stripHtmlTags(parsed.name, 255);
    const expectedAmount = amount ?? parsed.amount;

    const recentDuplicate = await prisma.expense.findFirst({
      where: {
        workspaceId: workspace.id,
        name: parsedName,
        amount: expectedAmount,
        createdAt: { gte: new Date(Date.now() - 3 * 60_000) },
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
