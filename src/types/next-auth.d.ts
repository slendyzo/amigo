import { DefaultSession, DefaultJWT } from "next-auth";

/**
 * Workspace membership info stored in the session
 */
export type WorkspaceMembership = {
  workspaceId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  workspace: {
    name: string;
    type: "PERSONAL" | "SHARED";
  };
};

declare module "next-auth" {
  /**
   * Extended session interface with workspace information
   */
  interface Session extends DefaultSession {
    user: {
      id: string;
      activeWorkspaceId: string | null;
      workspaces: WorkspaceMembership[];
    } & DefaultSession["user"];
  }

  /**
   * Extended user interface
   */
  interface User {
    id: string;
    activeWorkspaceId?: string | null;
  }
}

declare module "next-auth/jwt" {
  /**
   * Extended JWT interface with workspace information
   */
  interface JWT extends DefaultJWT {
    id: string;
    activeWorkspaceId: string | null;
    workspaces: WorkspaceMembership[];
  }
}
