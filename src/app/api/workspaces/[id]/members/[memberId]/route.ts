import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  hasPermission,
  isValidRole,
  canManageMember,
  canSetRole,
  WorkspaceRole,
} from "@/lib/permissions";

interface RouteParams {
  params: Promise<{ id: string; memberId: string }>;
}

/**
 * PUT /api/workspaces/[id]/members/[memberId]
 * Update a member's role
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, memberId } = await params;

    // Get actor's membership
    const actorMembership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: id,
          userId: session.user.id,
        },
      },
    });

    if (!actorMembership) {
      return NextResponse.json(
        { error: "Workspace not found or no access" },
        { status: 404 }
      );
    }

    const actorRole: WorkspaceRole = isValidRole(actorMembership.role)
      ? actorMembership.role
      : "MEMBER";

    if (!hasPermission(actorRole, "member:update_role")) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // Get target membership
    const targetMembership = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
    });

    if (!targetMembership || targetMembership.workspaceId !== id) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    const targetRole: WorkspaceRole = isValidRole(targetMembership.role)
      ? targetMembership.role
      : "MEMBER";

    // Check if actor can manage this member
    if (!canManageMember(actorRole, targetRole)) {
      return NextResponse.json(
        { error: "Cannot modify this member's role" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { role: newRole } = body;

    if (!newRole || !isValidRole(newRole)) {
      return NextResponse.json(
        { error: "Invalid role. Must be ADMIN or MEMBER" },
        { status: 400 }
      );
    }

    // Check if actor can set this role
    if (!canSetRole(actorRole, newRole)) {
      return NextResponse.json(
        { error: "Cannot assign this role" },
        { status: 403 }
      );
    }

    // Prevent changing owner's role
    if (targetRole === "OWNER") {
      return NextResponse.json(
        { error: "Cannot change owner's role. Use transfer ownership instead." },
        { status: 400 }
      );
    }

    // Update role
    const updatedMembership = await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role: newRole },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
          },
        },
      },
    });

    return NextResponse.json({
      id: updatedMembership.id,
      userId: updatedMembership.userId,
      role: updatedMembership.role,
      user: updatedMembership.user,
    });
  } catch (error) {
    console.error("Error updating member:", error);
    return NextResponse.json(
      { error: "Failed to update member" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workspaces/[id]/members/[memberId]
 * Remove a member from the workspace (or leave workspace)
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, memberId } = await params;

    // Get actor's membership
    const actorMembership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: id,
          userId: session.user.id,
        },
      },
    });

    if (!actorMembership) {
      return NextResponse.json(
        { error: "Workspace not found or no access" },
        { status: 404 }
      );
    }

    // Get target membership
    const targetMembership = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
      include: {
        workspace: true,
      },
    });

    if (!targetMembership || targetMembership.workspaceId !== id) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    const actorRole: WorkspaceRole = isValidRole(actorMembership.role)
      ? actorMembership.role
      : "MEMBER";
    const targetRole: WorkspaceRole = isValidRole(targetMembership.role)
      ? targetMembership.role
      : "MEMBER";

    const isSelf = targetMembership.userId === session.user.id;

    // Self-removal (leaving workspace)
    if (isSelf) {
      // Owner cannot leave - must transfer ownership first
      if (targetRole === "OWNER") {
        return NextResponse.json(
          { error: "Owner cannot leave. Transfer ownership first." },
          { status: 400 }
        );
      }

      // Cannot leave personal workspace
      if (targetMembership.workspace.type === "PERSONAL") {
        return NextResponse.json(
          { error: "Cannot leave personal workspace" },
          { status: 400 }
        );
      }

      await prisma.workspaceMember.delete({
        where: { id: memberId },
      });

      return NextResponse.json({ success: true, action: "left" });
    }

    // Removing another member
    if (!hasPermission(actorRole, "member:remove")) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    if (!canManageMember(actorRole, targetRole)) {
      return NextResponse.json(
        { error: "Cannot remove this member" },
        { status: 403 }
      );
    }

    // Cannot remove owner
    if (targetRole === "OWNER") {
      return NextResponse.json(
        { error: "Cannot remove workspace owner" },
        { status: 400 }
      );
    }

    await prisma.workspaceMember.delete({
      where: { id: memberId },
    });

    return NextResponse.json({ success: true, action: "removed" });
  } catch (error) {
    console.error("Error removing member:", error);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}
