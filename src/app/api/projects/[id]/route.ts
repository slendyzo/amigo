import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { projectContributionEur } from "@/lib/project-expense-totals";
import { prisma } from "@/lib/db";

// GET - Get single project
export async function GET(
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

    const project = await prisma.project.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        _count: { select: { expenses: true } },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Calculate total spent (many-to-many)
    const result = await prisma.expense.findMany({
      where: { workspaceId: workspace.id, projects: { some: { id: project.id } } },
      select: { amount: true, amountEur: true, splitCount: true, splitData: true, fullyReimbursed: true, projectTotalMode: true },
    });

    return NextResponse.json({
      project: {
        ...project,
        totalSpent: result.reduce((sum, expense) => sum + projectContributionEur(expense), 0),
      },
    });
  } catch (error) {
    console.error("Get project error:", error);
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }
}

// PUT - Update project
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
    const { name, description, budget, startDate, endDate, isActive } = body;

    // Allow partial updates (e.g. toggling isActive only)
    if (name !== undefined && !name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Verify project exists and belongs to workspace
    const existing = await prisma.project.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const project = await prisma.project.update({
      where: { id },
      data: {
        name: name !== undefined ? name : existing.name,
        description: description !== undefined ? (description || null) : existing.description,
        budget: budget !== undefined ? (budget ? parseFloat(budget) : null) : existing.budget,
        startDate: startDate !== undefined ? (startDate ? new Date(startDate) : null) : existing.startDate,
        endDate: endDate !== undefined ? (endDate ? new Date(endDate) : null) : existing.endDate,
        isActive: isActive !== undefined ? isActive : existing.isActive,
      },
    });

    return NextResponse.json({ project });
  } catch (error) {
    console.error("Update project error:", error);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}

// DELETE - Delete project
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

    // Verify project exists and belongs to workspace
    const existing = await prisma.project.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Delete the project (many-to-many relations are automatically cleaned up)
    await prisma.project.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete project error:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
