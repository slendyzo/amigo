import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/workspace/switch
 * Switch the current user's active workspace
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId } = body;

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json(
        { error: "Workspace ID is required" },
        { status: 400 }
      );
    }

    // Verify user has access to this workspace
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: session.user.id,
        },
      },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "No access to this workspace" },
        { status: 403 }
      );
    }

    // Update user's active workspace
    await prisma.user.update({
      where: { id: session.user.id },
      data: { activeWorkspaceId: workspaceId },
    });

    return NextResponse.json({
      success: true,
      workspaceId,
      workspace: {
        id: membership.workspace.id,
        name: membership.workspace.name,
        type: membership.workspace.type,
      },
    });
  } catch (error) {
    console.error("Error switching workspace:", error);
    return NextResponse.json(
      { error: "Failed to switch workspace" },
      { status: 500 }
    );
  }
}
