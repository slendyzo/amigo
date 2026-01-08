import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/workspaces
 * List all workspaces the current user is a member of
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: session.user.id },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            type: true,
            ownerId: true,
            defaultCurrency: true,
            monthlyBudget: true,
            _count: {
              select: {
                members: true,
                expenses: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Get active workspace ID
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { activeWorkspaceId: true },
    });

    const workspaces = memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      type: m.workspace.type,
      role: m.role,
      isOwner: m.workspace.ownerId === session.user.id,
      isActive: m.workspace.id === user?.activeWorkspaceId,
      defaultCurrency: m.workspace.defaultCurrency,
      monthlyBudget: m.workspace.monthlyBudget
        ? Number(m.workspace.monthlyBudget)
        : null,
      memberCount: m.workspace._count.members,
      expenseCount: m.workspace._count.expenses,
    }));

    return NextResponse.json(workspaces);
  } catch (error) {
    console.error("Error fetching workspaces:", error);
    return NextResponse.json(
      { error: "Failed to fetch workspaces" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces
 * Create a new shared workspace
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Workspace name is required" },
        { status: 400 }
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        { error: "Workspace name must be 100 characters or less" },
        { status: 400 }
      );
    }

    // Create workspace with user as owner
    const workspace = await prisma.workspace.create({
      data: {
        name: name.trim(),
        type: "SHARED",
        ownerId: session.user.id,
        members: {
          create: {
            userId: session.user.id,
            role: "OWNER",
          },
        },
      },
      include: {
        _count: {
          select: { members: true },
        },
      },
    });

    // Create default "Uncategorized" category for new workspace
    await prisma.category.create({
      data: {
        workspaceId: workspace.id,
        name: "Uncategorized",
        isSystem: true,
      },
    });

    return NextResponse.json({
      id: workspace.id,
      name: workspace.name,
      type: workspace.type,
      role: "OWNER",
      isOwner: true,
      isActive: false,
      defaultCurrency: workspace.defaultCurrency,
      monthlyBudget: null,
      memberCount: workspace._count.members,
      expenseCount: 0,
    });
  } catch (error) {
    console.error("Error creating workspace:", error);
    return NextResponse.json(
      { error: "Failed to create workspace" },
      { status: 500 }
    );
  }
}
