import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeKeyword, levenshteinDistance, maxFuzzyDistance } from "@/lib/fuzzy";

const LEARNING_THRESHOLD = 3; // Number of times before auto-creating mapping

// POST - Learn from categorization patterns and create mappings when threshold is met
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { expenseName, categoryId } = body;

    if (!expenseName || !categoryId) {
      return NextResponse.json(
        { error: "expenseName and categoryId are required" },
        { status: 400 }
      );
    }

    // Get user's active workspace
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { activeWorkspaceId: true },
    });

    const workspace = await prisma.workspace.findFirst({
      where: user?.activeWorkspaceId
        ? { id: user.activeWorkspaceId, members: { some: { userId: session.user.id } } }
        : { members: { some: { userId: session.user.id } } },
    });

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const keyword = normalizeKeyword(expenseName);

    // Skip very short keywords (less than 2 chars)
    if (keyword.length < 2) {
      return NextResponse.json({
        learned: false,
        reason: "Keyword too short"
      });
    }

    // Check if mapping already exists for this normalized keyword
    const existingMapping = await prisma.keywordMapping.findUnique({
      where: {
        workspaceId_keyword: {
          workspaceId: workspace.id,
          keyword,
        },
      },
    });

    if (existingMapping) {
      // Mapping already exists - check if it's pointing to a different category
      if (existingMapping.categoryId === categoryId) {
        return NextResponse.json({
          learned: false,
          reason: "Mapping already exists",
          existingMapping: true,
        });
      }
      // Different category - don't override existing mapping
      return NextResponse.json({
        learned: false,
        reason: "Different mapping exists",
        existingMapping: true,
      });
    }

    // Count how many times expenses with similar names were categorized to this category.
    // We use the normalized keyword for a broader match: "gás", "gas", "Gás" all count together.
    // Prisma insensitive mode handles case; we also check the non-accented form via raw SQL.
    const count = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) as count FROM expenses
       WHERE "workspaceId" = $1
         AND "categoryId" = $2
         AND LOWER(REGEXP_REPLACE(UNACCENT(name), '[''\\x60]', '', 'g')) = $3`,
      workspace.id,
      categoryId,
      keyword
    );

    const matchCount = Number(count[0]?.count ?? 0);

    if (matchCount >= LEARNING_THRESHOLD) {
      // Create the keyword mapping with normalized keyword
      const mapping = await prisma.keywordMapping.create({
        data: {
          workspaceId: workspace.id,
          keyword,
          categoryId,
          isSystem: false,
        },
      });

      return NextResponse.json({
        learned: true,
        mapping,
        count: matchCount,
        message: `Created mapping: "${keyword}" → category`,
      });
    }

    return NextResponse.json({
      learned: false,
      count: matchCount,
      threshold: LEARNING_THRESHOLD,
      remaining: LEARNING_THRESHOLD - matchCount,
    });
  } catch (error) {
    console.error("Learn keyword mapping error:", error);
    return NextResponse.json(
      { error: "Failed to process learning" },
      { status: 500 }
    );
  }
}

// GET - Get suggestion for an expense name based on previous categorizations
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const expenseName = searchParams.get("name");

    if (!expenseName) {
      return NextResponse.json(
        { error: "name parameter is required" },
        { status: 400 }
      );
    }

    // Get user's active workspace
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { activeWorkspaceId: true },
    });

    const workspace = await prisma.workspace.findFirst({
      where: user?.activeWorkspaceId
        ? { id: user.activeWorkspaceId, members: { some: { userId: session.user.id } } }
        : { members: { some: { userId: session.user.id } } },
    });

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const keyword = normalizeKeyword(expenseName);

    // First check if there's an existing mapping (using normalized keyword)
    const existingMapping = await prisma.keywordMapping.findUnique({
      where: {
        workspaceId_keyword: {
          workspaceId: workspace.id,
          keyword,
        },
      },
      include: {
        category: true,
      },
    });

    if (existingMapping?.category) {
      return NextResponse.json({
        suggestion: {
          categoryId: existingMapping.categoryId,
          categoryName: existingMapping.category.name,
          confidence: "high",
          source: "mapping",
        },
      });
    }

    // Try fuzzy matching against existing keyword mappings (handles typos like "aleixpress" ≈ "aliexpress")
    const maxDist = maxFuzzyDistance(keyword);
    if (maxDist > 0) {
      const allMappings = await prisma.keywordMapping.findMany({
        where: { workspaceId: workspace.id },
        include: { category: true },
      });

      let bestMatch: (typeof allMappings)[0] | null = null;
      let bestDistance = Infinity;

      for (const mapping of allMappings) {
        const dist = levenshteinDistance(keyword, mapping.keyword);
        if (dist > 0 && dist <= maxDist && dist < bestDistance) {
          bestDistance = dist;
          bestMatch = mapping;
        }
      }

      if (bestMatch?.category) {
        return NextResponse.json({
          suggestion: {
            categoryId: bestMatch.categoryId,
            categoryName: bestMatch.category.name,
            confidence: bestDistance <= 1 ? "high" : "medium",
            source: "mapping",
          },
        });
      }
    }

    // No mapping exists - check historical categorizations using normalized name matching.
    // This groups expenses by categoryId where the normalized name matches,
    // so "gás", "gas", "Gás" and "mcdonald's", "mcdonalds" all count together.
    const categorizations = await prisma.$queryRawUnsafe<
      { categoryId: string; cnt: bigint }[]
    >(
      `SELECT "categoryId", COUNT(*) as cnt FROM expenses
       WHERE "workspaceId" = $1
         AND "categoryId" IS NOT NULL
         AND LOWER(REGEXP_REPLACE(UNACCENT(name), '[''\\x60]', '', 'g')) = $2
       GROUP BY "categoryId"
       ORDER BY cnt DESC
       LIMIT 1`,
      workspace.id,
      keyword
    );

    if (categorizations.length > 0 && categorizations[0].categoryId) {
      const topCategory = await prisma.category.findUnique({
        where: { id: categorizations[0].categoryId },
      });

      if (topCategory && topCategory.name !== "Uncategorized") {
        const count = Number(categorizations[0].cnt);
        return NextResponse.json({
          suggestion: {
            categoryId: topCategory.id,
            categoryName: topCategory.name,
            confidence: count >= LEARNING_THRESHOLD ? "high" : count >= 2 ? "medium" : "low",
            count,
            source: "history",
          },
        });
      }
    }

    return NextResponse.json({ suggestion: null });
  } catch (error) {
    console.error("Get suggestion error:", error);
    return NextResponse.json(
      { error: "Failed to get suggestion" },
      { status: 500 }
    );
  }
}
