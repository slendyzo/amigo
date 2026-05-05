import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { aggregateNudgeCandidates } from "@/lib/insight-aggregator";
import { prisma } from "@/lib/db";

// GET /api/insights/nudges/keyword
// Returns up to 10 repeated-categorization candidates not already covered by a mapping.
export async function GET() {
  const ctx = await getActiveWorkspace();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { repeatedCategorizations } = await aggregateNudgeCandidates(
    ctx.workspace.id
  );

  return NextResponse.json({
    candidates: repeatedCategorizations.slice(0, 10),
  });
}

// POST /api/insights/nudges/keyword
// Body: { merchantKey: string, categoryId: string }
// Creates a KeywordMapping. Idempotent — returns 200 if the mapping already exists.
export async function POST(request: Request) {
  const ctx = await getActiveWorkspace();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).merchantKey !== "string" ||
    typeof (body as Record<string, unknown>).categoryId !== "string"
  ) {
    return NextResponse.json(
      { error: "merchantKey and categoryId are required strings" },
      { status: 400 }
    );
  }

  const { merchantKey, categoryId } = body as {
    merchantKey: string;
    categoryId: string;
  };

  if (!merchantKey.trim() || !categoryId.trim()) {
    return NextResponse.json(
      { error: "merchantKey and categoryId must not be empty" },
      { status: 400 }
    );
  }

  // Verify category belongs to this workspace
  const category = await prisma.category.findFirst({
    where: { id: categoryId, workspaceId: ctx.workspace.id },
    select: { id: true },
  });
  if (!category) {
    return NextResponse.json(
      { error: "Category not found in this workspace" },
      { status: 400 }
    );
  }

  // Idempotent upsert — if (workspaceId, keyword) already exists, return 200
  const existing = await prisma.keywordMapping.findUnique({
    where: {
      workspaceId_keyword: {
        workspaceId: ctx.workspace.id,
        keyword: merchantKey,
      },
    },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({ id: existing.id, created: false }, { status: 200 });
  }

  const mapping = await prisma.keywordMapping.create({
    data: {
      workspaceId: ctx.workspace.id,
      keyword: merchantKey,
      categoryId,
      expenseType: null,
      isSystem: false,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: mapping.id, created: true }, { status: 201 });
}
