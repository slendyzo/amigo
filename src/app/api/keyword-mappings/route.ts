import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";

// GET - List keyword mappings
export async function GET() {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const mappings = await prisma.keywordMapping.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { keyword: "asc" },
      include: {
        category: true,
      },
    });

    return NextResponse.json({ mappings });
  } catch (error) {
    console.error("Get keyword mappings error:", error);
    return NextResponse.json({ error: "Failed to fetch keyword mappings" }, { status: 500 });
  }
}

// POST - Create keyword mapping
export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const body = await request.json();
    const { keyword, categoryId, expenseType } = body;

    if (!keyword) {
      return NextResponse.json({ error: "Keyword is required" }, { status: 400 });
    }

    if (!categoryId && !expenseType) {
      return NextResponse.json({ error: "Either category or expense type is required" }, { status: 400 });
    }

    // Normalize keyword (lowercase, trimmed)
    const normalizedKeyword = keyword.toLowerCase().trim();

    // Check for duplicate
    const existing = await prisma.keywordMapping.findFirst({
      where: { workspaceId: workspace.id, keyword: normalizedKeyword },
    });

    if (existing) {
      return NextResponse.json({ error: "Keyword mapping already exists" }, { status: 400 });
    }

    const mapping = await prisma.keywordMapping.create({
      data: {
        workspaceId: workspace.id,
        keyword: normalizedKeyword,
        categoryId: categoryId || null,
        expenseType: expenseType || null,
      },
      include: {
        category: true,
      },
    });

    return NextResponse.json({ mapping }, { status: 201 });
  } catch (error) {
    console.error("Create keyword mapping error:", error);
    return NextResponse.json({ error: "Failed to create keyword mapping" }, { status: 500 });
  }
}
