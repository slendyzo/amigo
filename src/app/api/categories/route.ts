import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripHtmlTags } from "@/lib/utils";
import { getActiveWorkspace } from "@/lib/workspace";

// GET - List categories
export async function GET() {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const categories = await prisma.category.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      include: {
        _count: { select: { expenses: true } },
      },
    });

    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Get categories error:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

// POST - Create category
export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const body = await request.json();
    // Note: isSystem is intentionally NOT extracted from body to prevent mass assignment
    const { name, icon, color } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Sanitize inputs
    const sanitizedName = stripHtmlTags(name, 100);
    const sanitizedIcon = icon ? stripHtmlTags(icon, 50) : null;
    const sanitizedColor = color ? stripHtmlTags(color, 7) : null;

    // Check for duplicate name
    const existing = await prisma.category.findFirst({
      where: { workspaceId: workspace.id, name: { equals: sanitizedName, mode: "insensitive" } },
    });

    if (existing) {
      return NextResponse.json({ error: "Category already exists" }, { status: 400 });
    }

    const category = await prisma.category.create({
      data: {
        workspaceId: workspace.id,
        name: sanitizedName,
        icon: sanitizedIcon,
        color: sanitizedColor,
        isSystem: false, // Always false for user-created categories (cannot be overridden)
      },
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    console.error("Create category error:", error);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
