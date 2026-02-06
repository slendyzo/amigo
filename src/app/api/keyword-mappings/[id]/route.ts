import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";

// PUT - Update keyword mapping
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
    const { keyword, categoryId, expenseType } = body;

    // Verify mapping exists and belongs to workspace
    const existing = await prisma.keywordMapping.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Keyword mapping not found" }, { status: 404 });
    }

    const updateData: {
      keyword?: string;
      categoryId?: string | null;
      expenseType?: string | null;
    } = {};

    if (keyword !== undefined) {
      const normalizedKeyword = keyword.toLowerCase().trim();

      // Check for duplicate
      const duplicate = await prisma.keywordMapping.findFirst({
        where: {
          workspaceId: workspace.id,
          keyword: normalizedKeyword,
          id: { not: id },
        },
      });

      if (duplicate) {
        return NextResponse.json({ error: "Keyword mapping already exists" }, { status: 400 });
      }

      updateData.keyword = normalizedKeyword;
    }

    if (categoryId !== undefined) updateData.categoryId = categoryId || null;
    if (expenseType !== undefined) updateData.expenseType = expenseType || null;

    const mapping = await prisma.keywordMapping.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
      },
    });

    return NextResponse.json({ mapping });
  } catch (error) {
    console.error("Update keyword mapping error:", error);
    return NextResponse.json({ error: "Failed to update keyword mapping" }, { status: 500 });
  }
}

// DELETE - Delete keyword mapping
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

    // Verify mapping exists and belongs to workspace
    const existing = await prisma.keywordMapping.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Keyword mapping not found" }, { status: 404 });
    }

    await prisma.keywordMapping.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete keyword mapping error:", error);
    return NextResponse.json({ error: "Failed to delete keyword mapping" }, { status: 500 });
  }
}
