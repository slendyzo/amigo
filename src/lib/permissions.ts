/**
 * Role-based permission system for workspace access control
 *
 * Roles:
 * - OWNER: Full control over workspace (delete workspace, manage all members, transfer ownership)
 * - ADMIN: Can invite/remove members (except owner), full data CRUD
 * - MEMBER: Can view all data, CRUD own expenses only
 */

export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER";

export type Permission =
  // Workspace permissions
  | "workspace:read"
  | "workspace:update"
  | "workspace:delete"
  | "workspace:transfer_ownership"
  // Member management
  | "workspace:invite"
  | "member:view"
  | "member:remove"
  | "member:update_role"
  // Data permissions (all data in workspace)
  | "expense:create"
  | "expense:read"
  | "expense:update"
  | "expense:delete"
  // Own data permissions (for MEMBER role)
  | "expense:create_own"
  | "expense:update_own"
  | "expense:delete_own"
  // Category/Project/etc management
  | "category:manage"
  | "project:manage"
  | "bank_account:manage"
  | "recurring:manage"
  | "import:execute";

/**
 * Permission matrix for each role
 */
const ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  OWNER: [
    // Full workspace control
    "workspace:read",
    "workspace:update",
    "workspace:delete",
    "workspace:transfer_ownership",
    // Full member management
    "workspace:invite",
    "member:view",
    "member:remove",
    "member:update_role",
    // Full data access
    "expense:create",
    "expense:read",
    "expense:update",
    "expense:delete",
    "expense:create_own",
    "expense:update_own",
    "expense:delete_own",
    // Full management
    "category:manage",
    "project:manage",
    "bank_account:manage",
    "recurring:manage",
    "import:execute",
  ],
  ADMIN: [
    // Limited workspace control
    "workspace:read",
    "workspace:update",
    // Member management (except owner)
    "workspace:invite",
    "member:view",
    "member:remove",
    // Full data access
    "expense:create",
    "expense:read",
    "expense:update",
    "expense:delete",
    "expense:create_own",
    "expense:update_own",
    "expense:delete_own",
    // Full management
    "category:manage",
    "project:manage",
    "bank_account:manage",
    "recurring:manage",
    "import:execute",
  ],
  MEMBER: [
    // View only for workspace
    "workspace:read",
    "member:view",
    // Read all data, but only manage own expenses
    "expense:read",
    "expense:create_own",
    "expense:update_own",
    "expense:delete_own",
    // Can create expenses (as their own)
    "expense:create",
  ],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(
  role: WorkspaceRole,
  permission: Permission
): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Check if an actor can manage a target member
 * - OWNER can manage anyone
 * - ADMIN can manage MEMBERs only
 * - MEMBER cannot manage anyone
 */
export function canManageMember(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole
): boolean {
  if (actorRole === "OWNER") return true;
  if (actorRole === "ADMIN" && targetRole === "MEMBER") return true;
  return false;
}

/**
 * Check if an actor can change a member's role to a specific role
 * - OWNER can set any role except OWNER (ownership transfer is separate)
 * - ADMIN can only set MEMBER role
 */
export function canSetRole(
  actorRole: WorkspaceRole,
  newRole: WorkspaceRole
): boolean {
  if (actorRole === "OWNER" && newRole !== "OWNER") return true;
  if (actorRole === "ADMIN" && newRole === "MEMBER") return true;
  return false;
}

/**
 * Get all permissions for a role
 */
export function getPermissionsForRole(role: WorkspaceRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

/**
 * Validate if a string is a valid workspace role
 */
export function isValidRole(role: string): role is WorkspaceRole {
  return ["OWNER", "ADMIN", "MEMBER"].includes(role);
}

/**
 * Role hierarchy for comparison
 * Higher number = more permissions
 */
const ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  MEMBER: 1,
};

/**
 * Check if roleA is higher or equal to roleB in the hierarchy
 */
export function isRoleHigherOrEqual(
  roleA: WorkspaceRole,
  roleB: WorkspaceRole
): boolean {
  return ROLE_HIERARCHY[roleA] >= ROLE_HIERARCHY[roleB];
}

/**
 * Check if roleA is strictly higher than roleB
 */
export function isRoleHigher(
  roleA: WorkspaceRole,
  roleB: WorkspaceRole
): boolean {
  return ROLE_HIERARCHY[roleA] > ROLE_HIERARCHY[roleB];
}
