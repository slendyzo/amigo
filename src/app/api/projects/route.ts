import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET - List projects
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace = await prisma.workspace.findFirst({
      where: { members: { some: { userId: session.user.id } } },
    });

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const projects = await prisma.project.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { expenses: true } },
      },
    });

    // Calculate total spent for each project (many-to-many)
    const projectsWithTotals = await Promise.all(
      projects.map(async (project) => {
        const result = await prisma.expense.aggregate({
          where: { projects: { some: { id: project.id } } },
          _sum: { amountEur: true },
        });
        return {
          ...project,
          totalSpent: result._sum.amountEur || 0,
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, budget, startDate, endDate } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const workspace = await prisma.workspace.findFirst({
      where: { members: { some: { userId: session.user.id } } },
    });

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Check if project with same name already exists
    const existing = await prisma.project.findFirst({
      where: { workspaceId: workspace.id, name },
    });

    if (existing) {
      return NextResponse.json({ error: "A project with this name already exists" }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name,
        description: description || null,
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
