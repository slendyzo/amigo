import { auth } from "./auth";
import { prisma } from "./db";
import {
  hasPermission,
  Permission,
  WorkspaceRole,
  isValidRole,
} from "./permissions";

/**
 * Workspace context returned by getActiveWorkspace
 */
export interface WorkspaceContext {
  workspace: {
    id: string;
    name: string;
    type: "PERSONAL" | "SHARED";
    ownerId: string;
    monthlyBudget: number | null;
    defaultCurrency: string;
    language: string;
    onboardingCompleted: boolean;
  };
  role: WorkspaceRole;
  userId: string;
  membershipId: string;
}

/**
 * Error thrown when workspace access is denied
 */
export class WorkspaceAccessError extends Error {
  constructor(
    message: string,
    public code:
      | "UNAUTHORIZED"
      | "NO_WORKSPACE"
      | "FORBIDDEN"
      | "INVALID_WORKSPACE" = "FORBIDDEN"
  ) {
    super(message);
    this.name = "WorkspaceAccessError";
  }
}

/**
 * Get the active workspace for the current user
 *
 * Priority:
 * 1. User's activeWorkspaceId (if set and valid)
 * 2. First workspace the user is a member of
 *
 * Returns null if user is not authenticated or has no workspaces
 */
export async function getActiveWorkspace(): Promise<WorkspaceContext | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const userId = session.user.id;

  // First, try to get user's preferred active workspace
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeWorkspaceId: true },
  });

  let membership;

  if (user?.activeWorkspaceId) {
    // Verify user still has access to this workspace
    membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: user.activeWorkspaceId,
          userId,
        },
      },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            type: true,
            ownerId: true,
            monthlyBudget: true,
            defaultCurrency: true,
            language: true,
            onboardingCompleted: true,
          },
        },
      },
    });
  }

  // Fallback to first workspace if active workspace is invalid
  if (!membership) {
    membership = await prisma.workspaceMember.findFirst({
      where: { userId },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            type: true,
            ownerId: true,
            monthlyBudget: true,
            defaultCurrency: true,
            language: true,
            onboardingCompleted: true,
          },
        },
      },
      orderBy: { createdAt: "asc" }, // Oldest first (usually personal workspace)
    });

    // Update user's activeWorkspaceId if we found a workspace
    if (membership) {
      await prisma.user.update({
        where: { id: userId },
        data: { activeWorkspaceId: membership.workspaceId },
      });
    }
  }

  if (!membership) {
    return null;
  }

  const role = isValidRole(membership.role) ? membership.role : "MEMBER";

  return {
    workspace: {
      id: membership.workspace.id,
      name: membership.workspace.name,
      type: membership.workspace.type as "PERSONAL" | "SHARED",
      ownerId: membership.workspace.ownerId,
      monthlyBudget: membership.workspace.monthlyBudget
        ? Number(membership.workspace.monthlyBudget)
        : null,
      defaultCurrency: membership.workspace.defaultCurrency,
      language: membership.workspace.language,
      onboardingCompleted: membership.workspace.onboardingCompleted,
    },
    role,
    userId,
    membershipId: membership.id,
  };
}

/**
 * Get workspace context for a specific workspace ID
 * Verifies the current user has access to the workspace
 */
export async function getWorkspaceById(
  workspaceId: string
): Promise<WorkspaceContext | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const userId = session.user.id;

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    include: {
      workspace: {
        select: {
          id: true,
          name: true,
          type: true,
          ownerId: true,
          monthlyBudget: true,
          defaultCurrency: true,
          language: true,
          onboardingCompleted: true,
        },
      },
    },
  });

  if (!membership) {
    return null;
  }

  const role = isValidRole(membership.role) ? membership.role : "MEMBER";

  return {
    workspace: {
      id: membership.workspace.id,
      name: membership.workspace.name,
      type: membership.workspace.type as "PERSONAL" | "SHARED",
      ownerId: membership.workspace.ownerId,
      monthlyBudget: membership.workspace.monthlyBudget
        ? Number(membership.workspace.monthlyBudget)
        : null,
      defaultCurrency: membership.workspace.defaultCurrency,
      language: membership.workspace.language,
      onboardingCompleted: membership.workspace.onboardingCompleted,
    },
    role,
    userId,
    membershipId: membership.id,
  };
}

/**
 * Require the active workspace context
 * Throws WorkspaceAccessError if not authenticated or no workspace found
 */
export async function requireActiveWorkspace(): Promise<WorkspaceContext> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new WorkspaceAccessError("Not authenticated", "UNAUTHORIZED");
  }

  const context = await getActiveWorkspace();
  if (!context) {
    throw new WorkspaceAccessError("No workspace found", "NO_WORKSPACE");
  }

  return context;
}

/**
 * Require a specific permission for the current user's active workspace
 * Throws WorkspaceAccessError if permission is not granted
 */
export async function requirePermission(
  permission: Permission
): Promise<WorkspaceContext> {
  const context = await requireActiveWorkspace();

  if (!hasPermission(context.role, permission)) {
    throw new WorkspaceAccessError(
      `Missing permission: ${permission}`,
      "FORBIDDEN"
    );
  }

  return context;
}

/**
 * Check if current user has a specific permission
 * Returns false instead of throwing
 */
export async function checkPermission(permission: Permission): Promise<boolean> {
  try {
    const context = await getActiveWorkspace();
    if (!context) return false;
    return hasPermission(context.role, permission);
  } catch {
    return false;
  }
}

/**
 * Get all workspaces the current user is a member of
 */
export async function getUserWorkspaces() {
  const session = await auth();
  if (!session?.user?.id) {
    return [];
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
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => ({
    workspaceId: m.workspaceId,
    role: isValidRole(m.role) ? m.role : ("MEMBER" as WorkspaceRole),
    workspace: {
      id: m.workspace.id,
      name: m.workspace.name,
      type: m.workspace.type as "PERSONAL" | "SHARED",
      ownerId: m.workspace.ownerId,
      defaultCurrency: m.workspace.defaultCurrency,
    },
  }));
}

/**
 * Switch the current user's active workspace
 * Returns true if successful, false if user doesn't have access
 */
export async function switchWorkspace(workspaceId: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) {
    return false;
  }

  // Verify user has access to this workspace
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: session.user.id,
      },
    },
  });

  if (!membership) {
    return false;
  }

  // Update user's active workspace
  await prisma.user.update({
    where: { id: session.user.id },
    data: { activeWorkspaceId: workspaceId },
  });

  return true;
}
