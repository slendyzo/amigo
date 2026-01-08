import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, isValidRole, WorkspaceRole } from "@/lib/permissions";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/workspaces/[id]
 * Get workspace details
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check membership
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: id,
          userId: session.user.id,
        },
      },
      include: {
        workspace: {
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            _count: {
              select: {
                members: true,
                expenses: true,
                projects: true,
                categories: true,
              },
            },
          },
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Workspace not found or no access" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: membership.workspace.id,
      name: membership.workspace.name,
      type: membership.workspace.type,
      role: membership.role,
      isOwner: membership.workspace.ownerId === session.user.id,
      defaultCurrency: membership.workspace.defaultCurrency,
      language: membership.workspace.language,
      monthlyBudget: membership.workspace.monthlyBudget
        ? Number(membership.workspace.monthlyBudget)
        : null,
      monthlySalary: membership.workspace.monthlySalary
        ? Number(membership.workspace.monthlySalary)
        : null,
      onboardingCompleted: membership.workspace.onboardingCompleted,
      owner: membership.workspace.owner,
      stats: {
        members: membership.workspace._count.members,
        expenses: membership.workspace._count.expenses,
        projects: membership.workspace._count.projects,
        categories: membership.workspace._count.categories,
      },
      createdAt: membership.workspace.createdAt,
    });
  } catch (error) {
    console.error("Error fetching workspace:", error);
    return NextResponse.json(
      { error: "Failed to fetch workspace" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/workspaces/[id]
 * Update workspace settings
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check membership and permission
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: id,
          userId: session.user.id,
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Workspace not found or no access" },
        { status: 404 }
      );
    }

    const role: WorkspaceRole = isValidRole(membership.role)
      ? membership.role
      : "MEMBER";

    if (!hasPermission(role, "workspace:update")) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, defaultCurrency, language, monthlyBudget } = body;

    const updateData: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "Invalid workspace name" },
          { status: 400 }
        );
      }
      if (name.length > 100) {
        return NextResponse.json(
          { error: "Workspace name must be 100 characters or less" },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }

    if (defaultCurrency !== undefined) {
      const validCurrencies = ["EUR", "USD", "GBP", "BRL", "PLN"];
      if (!validCurrencies.includes(defaultCurrency)) {
        return NextResponse.json(
          { error: "Invalid currency" },
          { status: 400 }
        );
      }
      updateData.defaultCurrency = defaultCurrency;
    }

    if (language !== undefined) {
      const validLanguages = ["en", "pt-PT", "fr-FR"];
      if (!validLanguages.includes(language)) {
        return NextResponse.json(
          { error: "Invalid language" },
          { status: 400 }
        );
      }
      updateData.language = language;
    }

    if (monthlyBudget !== undefined) {
      if (monthlyBudget !== null && (typeof monthlyBudget !== "number" || monthlyBudget < 0)) {
        return NextResponse.json(
          { error: "Invalid monthly budget" },
          { status: 400 }
        );
      }
      updateData.monthlyBudget = monthlyBudget;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const workspace = await prisma.workspace.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      id: workspace.id,
      name: workspace.name,
      type: workspace.type,
      defaultCurrency: workspace.defaultCurrency,
      language: workspace.language,
      monthlyBudget: workspace.monthlyBudget
        ? Number(workspace.monthlyBudget)
        : null,
    });
  } catch (error) {
    console.error("Error updating workspace:", error);
    return NextResponse.json(
      { error: "Failed to update workspace" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workspaces/[id]
 * Delete a workspace (owner only)
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check membership and permission
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: id,
          userId: session.user.id,
        },
      },
      include: {
        workspace: true,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Workspace not found or no access" },
        { status: 404 }
      );
    }

    const role: WorkspaceRole = isValidRole(membership.role)
      ? membership.role
      : "MEMBER";

    if (!hasPermission(role, "workspace:delete")) {
      return NextResponse.json(
        { error: "Only the workspace owner can delete the workspace" },
        { status: 403 }
      );
    }

    // Prevent deleting the user's last/personal workspace
    if (membership.workspace.type === "PERSONAL") {
      return NextResponse.json(
        { error: "Cannot delete your personal workspace" },
        { status: 400 }
      );
    }

    // Delete workspace (cascades to all related data)
    await prisma.workspace.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting workspace:", error);
    return NextResponse.json(
      { error: "Failed to delete workspace" },
      { status: 500 }
    );
  }
}
