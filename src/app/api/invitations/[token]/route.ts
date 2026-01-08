import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface RouteParams {
  params: Promise<{ token: string }>;
}

/**
 * GET /api/invitations/[token]
 * Get invitation details (for displaying on accept page)
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { token } = await params;

    const invitation = await prisma.workspaceInvitation.findUnique({
      where: { token },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        invitedBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    if (invitation.acceptedAt) {
      return NextResponse.json(
        { error: "Invitation already accepted", code: "ALREADY_ACCEPTED" },
        { status: 400 }
      );
    }

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Invitation has expired", code: "EXPIRED" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      id: invitation.id,
      email: invitation.invitedEmail,
      role: invitation.role,
      workspace: invitation.workspace,
      invitedBy: invitation.invitedBy,
      expiresAt: invitation.expiresAt,
    });
  } catch (error) {
    console.error("Error fetching invitation:", error);
    return NextResponse.json(
      { error: "Failed to fetch invitation" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/invitations/[token]
 * Accept an invitation
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Please sign in to accept this invitation", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const { token } = await params;

    const invitation = await prisma.workspaceInvitation.findUnique({
      where: { token },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    if (invitation.acceptedAt) {
      return NextResponse.json(
        { error: "Invitation already accepted", code: "ALREADY_ACCEPTED" },
        { status: 400 }
      );
    }

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Invitation has expired", code: "EXPIRED" },
        { status: 400 }
      );
    }

    // Get current user's email
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true },
    });

    // Verify the invitation is for this user's email
    if (user?.email.toLowerCase() !== invitation.invitedEmail.toLowerCase()) {
      return NextResponse.json(
        {
          error: "This invitation was sent to a different email address",
          code: "EMAIL_MISMATCH",
          invitedEmail: invitation.invitedEmail,
        },
        { status: 403 }
      );
    }

    // Check if already a member
    const existingMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: invitation.workspaceId,
          userId: session.user.id,
        },
      },
    });

    if (existingMember) {
      // Mark invitation as accepted anyway
      await prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      return NextResponse.json({
        success: true,
        alreadyMember: true,
        workspace: invitation.workspace,
      });
    }

    // Create membership and mark invitation as accepted
    await prisma.$transaction([
      prisma.workspaceMember.create({
        data: {
          workspaceId: invitation.workspaceId,
          userId: session.user.id,
          role: invitation.role,
        },
      }),
      prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    return NextResponse.json({
      success: true,
      workspace: invitation.workspace,
      role: invitation.role,
    });
  } catch (error) {
    console.error("Error accepting invitation:", error);
    return NextResponse.json(
      { error: "Failed to accept invitation" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/invitations/[token]
 * Decline an invitation
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Please sign in to decline this invitation", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const { token } = await params;

    const invitation = await prisma.workspaceInvitation.findUnique({
      where: { token },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Get current user's email
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true },
    });

    // Only the invited user can decline
    if (user?.email.toLowerCase() !== invitation.invitedEmail.toLowerCase()) {
      return NextResponse.json(
        { error: "This invitation was sent to a different email address" },
        { status: 403 }
      );
    }

    // Delete the invitation
    await prisma.workspaceInvitation.delete({
      where: { id: invitation.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error declining invitation:", error);
    return NextResponse.json(
      { error: "Failed to decline invitation" },
      { status: 500 }
    );
  }
}
