import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { stripHtmlTags } from "@/lib/utils";

// PUT - Update category
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const { id } = await params;
    const body = await request.json();
    // Note: isSystem is intentionally NOT extracted to prevent mass assignment
    const { name, icon, color, parentId } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Sanitize inputs
    const sanitizedName = stripHtmlTags(name, 100);

    // Verify category exists and belongs to workspace
    const existing = await prisma.category.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // Only block editing the "Uncategorized" category (check all language variants)
    const uncategorizedNames = ["uncategorized", "sem categoria", "non catégorisé"];
    if (uncategorizedNames.includes(existing.name.toLowerCase())) {
      return NextResponse.json({ error: "Cannot modify Uncategorized category" }, { status: 400 });
    }

    // Check for duplicate name
    const duplicate = await prisma.category.findFirst({
      where: {
        workspaceId: workspace.id,
        name: { equals: sanitizedName, mode: "insensitive" },
        id: { not: id },
      },
    });

    if (duplicate) {
      return NextResponse.json({ error: "Category with this name already exists" }, { status: 400 });
    }

    // Validate parentId if provided
    if (parentId !== undefined && parentId !== null) {
      if (parentId === id) {
        return NextResponse.json({ error: "Category cannot be its own parent" }, { status: 400 });
      }
      const parent = await prisma.category.findFirst({
        where: { id: parentId, workspaceId: workspace.id },
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent category not found" }, { status: 400 });
      }
      if (parent.parentId) {
        return NextResponse.json({ error: "Cannot nest more than one level" }, { status: 400 });
      }
    }

    // Build update data - only include provided fields, never isSystem
    const updateData: { name: string; icon?: string | null; color?: string | null; parentId?: string | null } = {
      name: sanitizedName,
    };
    if (icon !== undefined) {
      updateData.icon = icon ? stripHtmlTags(icon, 50) : null;
    }
    if (color !== undefined) {
      updateData.color = color ? stripHtmlTags(color, 7) : null;
    }
    if (parentId !== undefined) {
      updateData.parentId = parentId;
    }

    const category = await prisma.category.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ category });
  } catch (error) {
    console.error("Update category error:", error);
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
  }
}

// DELETE - Delete category
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const { id } = await params;

    // Verify category exists and belongs to workspace
    const existing = await prisma.category.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // Only block deleting the "Uncategorized" category (check all language variants)
    const uncategorizedNames = ["uncategorized", "sem categoria", "non catégorisé"];
    if (uncategorizedNames.includes(existing.name.toLowerCase())) {
      return NextResponse.json({ error: "Cannot delete Uncategorized category" }, { status: 400 });
    }

    // Get or create Uncategorized category
    let uncategorized = await prisma.category.findFirst({
      where: { workspaceId: workspace.id, name: "Uncategorized" },
    });

    if (!uncategorized) {
      uncategorized = await prisma.category.create({
        data: { workspaceId: workspace.id, name: "Uncategorized", isSystem: true },
      });
    }

    // If this is a parent category, handle children first
    const children = await prisma.category.findMany({
      where: { parentId: id },
      select: { id: true },
    });

    if (children.length > 0) {
      const childIds = children.map((c) => c.id);
      // Move all expenses from children to Uncategorized
      await prisma.expense.updateMany({
        where: { categoryId: { in: childIds } },
        data: { categoryId: uncategorized.id },
      });
      // Delete all children
      await prisma.category.deleteMany({
        where: { id: { in: childIds } },
      });
    }

    // Move expenses from this category to Uncategorized
    await prisma.expense.updateMany({
      where: { categoryId: id },
      data: { categoryId: uncategorized.id },
    });

    // Delete the category
    await prisma.category.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete category error:", error);
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}
