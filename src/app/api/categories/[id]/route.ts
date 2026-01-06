import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { stripHtmlTags } from "@/lib/utils";

// PUT - Update category
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    // Note: isSystem is intentionally NOT extracted to prevent mass assignment
    const { name, icon, color } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Sanitize inputs
    const sanitizedName = stripHtmlTags(name, 100);

    const workspace = await prisma.workspace.findFirst({
      where: { members: { some: { userId: session.user.id } } },
    });

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Verify category exists and belongs to workspace
    const existing = await prisma.category.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    if (existing.isSystem) {
      return NextResponse.json({ error: "Cannot modify system category" }, { status: 400 });
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

    // Build update data - only include provided fields, never isSystem
    const updateData: { name: string; icon?: string | null; color?: string | null } = {
      name: sanitizedName,
    };
    if (icon !== undefined) {
      updateData.icon = icon ? stripHtmlTags(icon, 50) : null;
    }
    if (color !== undefined) {
      updateData.color = color ? stripHtmlTags(color, 7) : null;
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const workspace = await prisma.workspace.findFirst({
      where: { members: { some: { userId: session.user.id } } },
    });

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Verify category exists and belongs to workspace
    const existing = await prisma.category.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    if (existing.isSystem) {
      return NextResponse.json({ error: "Cannot delete system category" }, { status: 400 });
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

    // Move expenses to Uncategorized
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
