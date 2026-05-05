/**
 * GET  /api/insights/nudges/categorize
 *      ?countOnly=1  → { count: number }
 *      (full)        → { rows, totalUntagged, categories }
 *
 * POST /api/insights/nudges/categorize
 *      body: { assignments: Array<{ expenseId, categoryId }> }
 *      → { updated: number }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace";
import { generateInsight, InsightParseError } from "@/lib/glm";
import { buildCategorizePrompt } from "@/lib/prompts/nudge-categorize";

const LOCALE_MAP: Record<string, "en-GB" | "pt-PT" | "fr-FR"> = {
  en: "en-GB",
  "pt-PT": "pt-PT",
  "fr-FR": "fr-FR",
};

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const ctx = await getActiveWorkspace();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const countOnly = searchParams.get("countOnly") === "1";

  const untaggedCount = await prisma.expense.count({
    where: { workspaceId: ctx.workspace.id, categoryId: null },
  });

  if (countOnly) {
    return NextResponse.json({ count: untaggedCount });
  }

  // Fetch up to 30 uncategorized expenses
  const expenses = await prisma.expense.findMany({
    where: { workspaceId: ctx.workspace.id, categoryId: null },
    orderBy: { date: "desc" },
    take: 30,
    select: { id: true, name: true, merchant: true, amount: true, amountEur: true, date: true },
  });

  // Fetch categories
  const categories = await prisma.category.findMany({
    where: { workspaceId: ctx.workspace.id },
    select: { id: true, name: true },
  });

  // Fetch keyword mappings (workspace + global)
  const keywordMappings = await prisma.keywordMapping.findMany({
    where: {
      OR: [
        { workspaceId: ctx.workspace.id },
        { workspaceId: null },
      ],
      categoryId: { not: null },
    },
    select: { keyword: true, categoryId: true },
  });

  // Keyword match pass
  const keywordRows: Array<{
    expenseId: string;
    expenseName: string;
    expenseAmount: number;
    expenseDate: string;
    suggestedCategoryId: string;
    suggestedCategoryName: string;
    confidence: "high";
    origin: "keyword";
  }> = [];

  const unmatchedExpenses: typeof expenses = [];

  for (const exp of expenses) {
    const haystack = (exp.merchant ?? exp.name).toLowerCase();
    const match = keywordMappings.find((km) =>
      haystack.includes(km.keyword.toLowerCase())
    );
    if (match && match.categoryId) {
      const cat = categories.find((c) => c.id === match.categoryId);
      if (cat) {
        keywordRows.push({
          expenseId: exp.id,
          expenseName: exp.name,
          expenseAmount: Number(exp.amountEur ?? exp.amount),
          expenseDate: exp.date.toISOString(),
          suggestedCategoryId: cat.id,
          suggestedCategoryName: cat.name,
          confidence: "high",
          origin: "keyword",
        });
        continue;
      }
    }
    unmatchedExpenses.push(exp);
  }

  // AI pass for unmatched
  const aiRows: Array<{
    expenseId: string;
    expenseName: string;
    expenseAmount: number;
    expenseDate: string;
    suggestedCategoryId: string | null;
    suggestedCategoryName: string | null;
    confidence: "high" | "medium" | "low";
    origin: "ai";
  }> = [];

  if (unmatchedExpenses.length > 0 && categories.length > 0) {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { aiProcessingEnabled: true },
    });

    if (user?.aiProcessingEnabled) {
      try {
        const locale = LOCALE_MAP[ctx.workspace.language] ?? "en-GB";
        const prompt = buildCategorizePrompt({
          expenses: unmatchedExpenses.map((e) => ({
            id: e.id,
            name: e.name,
            amount: Number(e.amountEur ?? e.amount),
          })),
          categories,
        });

        const result = await generateInsight({
          userId: ctx.userId,
          bucket: "live",
          promptType: "nudge-categorize",
          locale,
          ...prompt,
          maxTokens: 1024,
        });

        if (result) {
          for (const guess of result.guesses) {
            const exp = unmatchedExpenses.find((e) => e.id === guess.id);
            if (!exp) continue;
            const cat = guess.categoryId
              ? categories.find((c) => c.id === guess.categoryId)
              : null;
            aiRows.push({
              expenseId: exp.id,
              expenseName: exp.name,
              expenseAmount: Number(exp.amountEur ?? exp.amount),
              expenseDate: exp.date.toISOString(),
              suggestedCategoryId: guess.categoryId,
              suggestedCategoryName: cat?.name ?? null,
              confidence: guess.confidence,
              origin: "ai",
            });
          }
        }
      } catch (err) {
        if (err instanceof InsightParseError) {
          console.error("[nudge-categorize] Parse error:", err.message);
        } else {
          console.error("[nudge-categorize] GLM error:", err);
        }
        // Graceful degrade: aiRows stays empty, keyword rows still returned
      }
    }
  }

  // For unmatched expenses that got no AI row (GLM returned null/threw), include them as no-suggestion
  const coveredIds = new Set([
    ...keywordRows.map((r) => r.expenseId),
    ...aiRows.map((r) => r.expenseId),
  ]);
  for (const exp of unmatchedExpenses) {
    if (!coveredIds.has(exp.id)) {
      aiRows.push({
        expenseId: exp.id,
        expenseName: exp.name,
        expenseAmount: Number(exp.amountEur ?? exp.amount),
        expenseDate: exp.date.toISOString(),
        suggestedCategoryId: null,
        suggestedCategoryName: null,
        confidence: "low",
        origin: "ai",
      });
    }
  }

  const rows = [...keywordRows, ...aiRows];

  return NextResponse.json({ rows, totalUntagged: untaggedCount, categories });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ctx = await getActiveWorkspace();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !Array.isArray((body as Record<string, unknown>).assignments)
  ) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const assignments = (body as { assignments: unknown[] }).assignments;

  // Validate shape
  for (const a of assignments) {
    if (
      typeof a !== "object" ||
      a === null ||
      typeof (a as Record<string, unknown>).expenseId !== "string" ||
      typeof (a as Record<string, unknown>).categoryId !== "string"
    ) {
      return NextResponse.json({ error: "Invalid assignment shape" }, { status: 400 });
    }
  }

  const typedAssignments = assignments as Array<{ expenseId: string; categoryId: string }>;
  const expenseIds = typedAssignments.map((a) => a.expenseId);

  // Verify all expenses belong to this workspace
  const ownedExpenses = await prisma.expense.findMany({
    where: { id: { in: expenseIds }, workspaceId: ctx.workspace.id },
    select: { id: true },
  });
  const ownedIds = new Set(ownedExpenses.map((e) => e.id));

  const validAssignments = typedAssignments.filter((a) => ownedIds.has(a.expenseId));

  if (validAssignments.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  await prisma.$transaction(
    validAssignments.map((a) =>
      prisma.expense.update({
        where: { id: a.expenseId },
        data: { categoryId: a.categoryId, categorizedAt: new Date() },
      })
    )
  );

  return NextResponse.json({ updated: validAssignments.length });
}
