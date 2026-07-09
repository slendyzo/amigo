import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";

const TOKEN_PREFIX = "amigo_";

/** Workspace context resolved from a Bearer token (subset of WorkspaceContext) */
export interface ApiTokenContext {
  userId: string;
  tokenId: string;
  workspace: {
    id: string;
    name: string;
    defaultCurrency: string;
    defaultBankAccountId: string | null;
  };
}

/**
 * Generate a new personal access token.
 * Raw token: "amigo_" + 40 hex chars (160 bits of entropy).
 * Only the sha256 hash is persisted - the raw value is shown once.
 */
export function generateApiToken(): { raw: string; hash: string; prefix: string } {
  const raw = TOKEN_PREFIX + randomBytes(20).toString("hex");
  return { raw, hash: hashApiToken(raw), prefix: raw.slice(0, 12) };
}

export function hashApiToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Resolve the Authorization: Bearer header of an incoming request
 * into a workspace context. Returns null when missing/invalid/unknown,
 * or when the token's owner is no longer a member of its workspace.
 */
export async function resolveApiToken(request: Request): Promise<ApiTokenContext | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const raw = header.slice(7).trim();
  if (!raw.startsWith(TOKEN_PREFIX)) return null;

  const token = await prisma.apiToken.findUnique({
    where: { tokenHash: hashApiToken(raw) },
    select: { id: true, userId: true, workspaceId: true },
  });
  if (!token) return null;

  // The token is only as good as the membership behind it. ApiToken cascades on
  // User and Workspace deletion but not on WorkspaceMember deletion, so resolve
  // through the membership — the same gate getActiveWorkspace() applies to the
  // session path. Otherwise a removed member keeps writing into the workspace.
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId: token.workspaceId, userId: token.userId },
    },
    select: {
      workspace: {
        select: {
          id: true,
          name: true,
          defaultCurrency: true,
          defaultBankAccountId: true,
        },
      },
    },
  });
  if (!membership) return null;

  // Fire-and-forget usage timestamp (don't block the request)
  prisma.apiToken
    .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { userId: token.userId, tokenId: token.id, workspace: membership.workspace };
}
