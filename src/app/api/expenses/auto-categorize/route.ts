import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace";
import { normalizeKeyword, levenshteinDistance, maxFuzzyDistance } from "@/lib/fuzzy";

// POST - Auto-categorize uncategorized expenses using keyword mappings
export async function POST() {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace } = context;

    // Fetch all keyword mappings for this workspace
    const mappings = await prisma.keywordMapping.findMany({
      where: { workspaceId: workspace.id, categoryId: { not: null } },
    });

    if (mappings.length === 0) {
      return NextResponse.json({ assigned: 0, total: 0 });
    }

    // Find the "Uncategorized" category to also match those expenses
    const uncategorizedCategory = await prisma.category.findFirst({
      where: { workspaceId: workspace.id, name: "Uncategorized" },
    });

    // Fetch all uncategorized expenses
    const uncategorized = await prisma.expense.findMany({
      where: {
        workspaceId: workspace.id,
        OR: [
          { categoryId: null },
          ...(uncategorizedCategory ? [{ categoryId: uncategorizedCategory.id }] : []),
        ],
      },
      select: { id: true, name: true },
    });

    if (uncategorized.length === 0) {
      return NextResponse.json({ assigned: 0, total: 0 });
    }

    // Match each uncategorized expense against keyword mappings
    const updates: { id: string; categoryId: string }[] = [];

    for (const expense of uncategorized) {
      const normalized = normalizeKeyword(expense.name);

      // Exact match first
      const exactMatch = mappings.find((m) => m.keyword === normalized);
      if (exactMatch?.categoryId) {
        updates.push({ id: expense.id, categoryId: exactMatch.categoryId });
        continue;
      }

      // Fuzzy match (only high-confidence: distance <= 1)
      const maxDist = maxFuzzyDistance(normalized);
      if (maxDist > 0) {
        let bestMapping: (typeof mappings)[0] | null = null;
        let bestDist = Infinity;
        for (const m of mappings) {
          if (!m.categoryId) continue;
          const dist = levenshteinDistance(normalized, m.keyword);
          if (dist > 0 && dist <= 1 && dist < bestDist) {
            bestDist = dist;
            bestMapping = m;
          }
        }
        if (bestMapping?.categoryId) {
          updates.push({ id: expense.id, categoryId: bestMapping.categoryId });
        }
      }
    }

    // Batch update
    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.expense.update({
            where: { id: u.id },
            data: { categoryId: u.categoryId },
          })
        )
      );
    }

    return NextResponse.json({
      assigned: updates.length,
      total: uncategorized.length,
    });
  } catch (error) {
    console.error("Auto-categorize error:", error);
    return NextResponse.json(
      { error: "Failed to auto-categorize" },
      { status: 500 }
    );
  }
}
