import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission, isValidRole, WorkspaceRole } from "@/lib/permissions";
import { randomBytes } from "crypto";
import { sendWorkspaceInvitationEmail } from "@/lib/email";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/workspaces/[id]/invitations
 * List pending invitations for a workspace
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

    if (!hasPermission(role, "workspace:invite")) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // Get pending invitations (not accepted, not expired)
    const invitations = await prisma.workspaceInvitation.findMany({
      where: {
        workspaceId: id,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      invitations.map((i) => ({
        id: i.id,
        email: i.invitedEmail,
        role: i.role,
        invitedBy: i.invitedBy,
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
      }))
    );
  } catch (error) {
    console.error("Error fetching invitations:", error);
    return NextResponse.json(
      { error: "Failed to fetch invitations" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces/[id]/invitations
 * Invite a user to the workspace
 *
 * Body:
 * - identifier: username or email
 * - role: "ADMIN" or "MEMBER" (default: "MEMBER")
 * - sendEmail: boolean (default: true) - if user not found, send invite email
 */
export async function POST(request: Request, { params }: RouteParams) {
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
        workspace: true,
        user: {
          select: {
            name: true,
            email: true,
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

    const actorRole: WorkspaceRole = isValidRole(membership.role)
      ? membership.role
      : "MEMBER";

    if (!hasPermission(actorRole, "workspace:invite")) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { identifier, role = "MEMBER", sendEmail = true } = body;

    if (!identifier || typeof identifier !== "string") {
      return NextResponse.json(
        { error: "Username or email is required" },
        { status: 400 }
      );
    }

    // Validate role
    const inviteRole = role === "ADMIN" ? "ADMIN" : "MEMBER";

    // Can't invite as OWNER
    if (role === "OWNER") {
      return NextResponse.json(
        { error: "Cannot invite as owner" },
        { status: 400 }
      );
    }

    // Admins can only invite as MEMBER
    if (actorRole === "ADMIN" && inviteRole === "ADMIN") {
      return NextResponse.json(
        { error: "Only owners can invite admins" },
        { status: 403 }
      );
    }

    const trimmedIdentifier = identifier.trim().toLowerCase();
    const isEmail = trimmedIdentifier.includes("@");

    // Try to find existing user
    let targetUser = null;

    if (isEmail) {
      // Search by email
      targetUser = await prisma.user.findUnique({
        where: { email: trimmedIdentifier },
        select: { id: true, email: true, name: true, username: true },
      });
    } else {
      // Search by username first
      targetUser = await prisma.user.findUnique({
        where: { username: trimmedIdentifier },
        select: { id: true, email: true, name: true, username: true },
      });
    }

    // If user found
    if (targetUser) {
      // Check if already a member
      const existingMember = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: id,
            userId: targetUser.id,
          },
        },
      });

      if (existingMember) {
        return NextResponse.json(
          { error: "User is already a member of this workspace" },
          { status: 400 }
        );
      }

      // Check for pending invitation
      const existingInvite = await prisma.workspaceInvitation.findFirst({
        where: {
          workspaceId: id,
          invitedEmail: targetUser.email,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      if (existingInvite) {
        return NextResponse.json(
          { error: "User already has a pending invitation" },
          { status: 400 }
        );
      }

      // Create invitation for existing user
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const invitation = await prisma.workspaceInvitation.create({
        data: {
          workspaceId: id,
          invitedEmail: targetUser.email,
          invitedById: session.user.id,
          role: inviteRole,
          token,
          expiresAt,
        },
      });

      // Send email notification
      if (sendEmail) {
        await sendWorkspaceInvitationEmail(
          targetUser.email,
          membership.user.name || membership.user.email,
          membership.workspace.name,
          token,
          false // Not a new user
        );
      }

      return NextResponse.json({
        success: true,
        type: "existing_user",
        invitation: {
          id: invitation.id,
          email: targetUser.email,
          role: inviteRole,
          expiresAt,
        },
        user: {
          name: targetUser.name,
          username: targetUser.username,
        },
      });
    }

    // User not found - create invitation for email (if it's an email)
    if (!isEmail) {
      return NextResponse.json(
        { error: "User not found. Try using their email address instead." },
        { status: 404 }
      );
    }

    // Check for pending invitation to this email
    const existingInvite = await prisma.workspaceInvitation.findFirst({
      where: {
        workspaceId: id,
        invitedEmail: trimmedIdentifier,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvite) {
      return NextResponse.json(
        { error: "Invitation already sent to this email" },
        { status: 400 }
      );
    }

    // Create invitation for new user
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await prisma.workspaceInvitation.create({
      data: {
        workspaceId: id,
        invitedEmail: trimmedIdentifier,
        invitedById: session.user.id,
        role: inviteRole,
        token,
        expiresAt,
      },
    });

    // Send invite email
    if (sendEmail) {
      await sendWorkspaceInvitationEmail(
        trimmedIdentifier,
        membership.user.name || membership.user.email,
        membership.workspace.name,
        token,
        true // New user
      );
    }

    return NextResponse.json({
      success: true,
      type: "email_invite",
      invitation: {
        id: invitation.id,
        email: trimmedIdentifier,
        role: inviteRole,
        expiresAt,
      },
    });
  } catch (error) {
    console.error("Error creating invitation:", error);
    return NextResponse.json(
      { error: "Failed to create invitation" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/workspaces/[id]/invitations
 * Cancel an invitation (by invitation ID in query params)
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const invitationId = searchParams.get("invitationId");

    if (!invitationId) {
      return NextResponse.json(
        { error: "Invitation ID is required" },
        { status: 400 }
      );
    }

    // Check membership
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

    if (!hasPermission(role, "workspace:invite")) {
      return NextResponse.json(
        { error: "Permission denied" },
        { status: 403 }
      );
    }

    // Get invitation
    const invitation = await prisma.workspaceInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation || invitation.workspaceId !== id) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 }
      );
    }

    if (invitation.acceptedAt) {
      return NextResponse.json(
        { error: "Invitation already accepted" },
        { status: 400 }
      );
    }

    await prisma.workspaceInvitation.delete({
      where: { id: invitationId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error canceling invitation:", error);
    return NextResponse.json(
      { error: "Failed to cancel invitation" },
      { status: 500 }
    );
  }
}
