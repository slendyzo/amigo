import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { stripHtmlTags } from "@/lib/utils";
import { effectiveEur } from "@/lib/split-utils";

// GET - List projects
export async function GET(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    // Parse query params
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("activeOnly") === "true";

    const projects = await prisma.project.findMany({
      where: {
        workspaceId: workspace.id,
        ...(activeOnly && { isActive: true }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { expenses: true } },
      },
    });

    // Calculate total spent for each project — counts the user's share on
    // split expenses instead of the full bill.
    const projectsWithTotals = await Promise.all(
      projects.map(async (project) => {
        const projectExpenses = await prisma.expense.findMany({
          where: { projects: { some: { id: project.id } } },
          select: { amount: true, amountEur: true, splitCount: true, splitData: true },
        });
        const totalSpent = projectExpenses.reduce(
          (sum, exp) => sum + effectiveEur(exp),
          0
        );
        return {
          ...project,
          totalSpent,
        };
      })
    );

    return NextResponse.json({ projects: projectsWithTotals });
  } catch (error) {
    console.error("Get projects error:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

// POST - Create project
export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const body = await request.json();
    const { name, description, budget, startDate, endDate } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Sanitize inputs
    const sanitizedName = stripHtmlTags(name, 100);
    const sanitizedDescription = description ? stripHtmlTags(description, 500) : null;

    // Check if project with same name already exists
    const existing = await prisma.project.findFirst({
      where: { workspaceId: workspace.id, name: sanitizedName },
    });

    if (existing) {
      return NextResponse.json({ error: "A project with this name already exists" }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: sanitizedName,
        description: sanitizedDescription,
        budget: budget ? parseFloat(budget) : null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Create project error:", error);
    // Handle unique constraint violation
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "A project with this name already exists" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
