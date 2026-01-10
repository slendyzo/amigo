import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

    // Normalize expense name for keyword (lowercase, trimmed)
    const keyword = expenseName.toLowerCase().trim();

    // Skip very short keywords (less than 3 chars) or generic ones
    if (keyword.length < 3) {
      return NextResponse.json({
        learned: false,
        reason: "Keyword too short"
      });
    }

    // Check if mapping already exists for this keyword
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

    // Count how many times this expense name was categorized to this category
    const count = await prisma.expense.count({
      where: {
        workspaceId: workspace.id,
        categoryId,
        name: {
          equals: expenseName,
          mode: "insensitive",
        },
      },
    });

    if (count >= LEARNING_THRESHOLD) {
      // Create the keyword mapping
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
        count,
        message: `Created mapping: "${keyword}" → category`,
      });
    }

    return NextResponse.json({
      learned: false,
      count,
      threshold: LEARNING_THRESHOLD,
      remaining: LEARNING_THRESHOLD - count,
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

    const keyword = expenseName.toLowerCase().trim();

    // First check if there's an existing mapping
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

    // No mapping exists - check historical categorizations
    const categorizations = await prisma.expense.groupBy({
      by: ["categoryId"],
      where: {
        workspaceId: workspace.id,
        categoryId: { not: null },
        name: {
          equals: expenseName,
          mode: "insensitive",
        },
      },
      _count: {
        categoryId: true,
      },
      orderBy: {
        _count: {
          categoryId: "desc",
        },
      },
      take: 1,
    });

    if (categorizations.length > 0 && categorizations[0].categoryId) {
      const topCategory = await prisma.category.findUnique({
        where: { id: categorizations[0].categoryId },
      });

      if (topCategory && topCategory.name !== "Uncategorized") {
        const count = categorizations[0]._count.categoryId;
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
