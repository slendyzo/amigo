import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { WorkspaceMembership } from "@/types/next-auth";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // Update session every 24 hours
  },
  trustHost: true,
  // Use default cookie settings - Auth.js handles secure flag automatically based on request protocol
  // This fixes issues with Chrome on macOS where custom cookie config can cause session loss
  pages: {
    signIn: "/signin",
    error: "/auth-error",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        identifier: { label: "Email or Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.identifier || !credentials?.password) {
          return null;
        }

        const identifier = credentials.identifier as string;
        const password = credentials.password as string;

        // Check if identifier is an email or username
        const isEmail = identifier.includes("@");

        const user = await prisma.user.findFirst({
          where: isEmail
            ? { email: identifier }
            : { username: identifier },
        });

        if (!user || !user.password) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, trigger, session }) {
      // Initial sign in - load user data and workspaces
      if (user) {
        token.id = user.id;

        // Fetch user's workspaces
        const memberships = await prisma.workspaceMember.findMany({
          where: { userId: user.id },
          include: {
            workspace: {
              select: {
                name: true,
                type: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        });

        token.workspaces = memberships.map((m) => ({
          workspaceId: m.workspaceId,
          role: m.role as "OWNER" | "ADMIN" | "MEMBER",
          workspace: {
            name: m.workspace.name,
            type: m.workspace.type as "PERSONAL" | "SHARED",
          },
        })) as WorkspaceMembership[];

        // Get user's active workspace preference
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { activeWorkspaceId: true },
        });

        token.activeWorkspaceId =
          dbUser?.activeWorkspaceId || memberships[0]?.workspaceId || null;
      }

      // Handle workspace switch via session update
      if (trigger === "update" && session?.activeWorkspaceId) {
        // Verify user has access to this workspace
        const hasAccess = (token.workspaces as WorkspaceMembership[])?.some(
          (w) => w.workspaceId === session.activeWorkspaceId
        );
        if (hasAccess) {
          token.activeWorkspaceId = session.activeWorkspaceId;
        }
      }

      // Pass provider info to session for debugging
      if (account) {
        token.provider = account.provider;
      }

      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.activeWorkspaceId =
          (token.activeWorkspaceId as string) || null;
        session.user.workspaces =
          (token.workspaces as WorkspaceMembership[]) || [];
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      // Auto-create workspace for new OAuth users
      if (user.id && user.email) {
        const existingMembership = await prisma.workspaceMember.findFirst({
          where: { userId: user.id },
        });

        if (!existingMembership) {
          const workspace = await prisma.workspace.create({
            data: {
              name: "Personal",
              type: "PERSONAL",
              ownerId: user.id,
              members: {
                create: {
                  userId: user.id,
                  role: "OWNER",
                },
              },
            },
          });

          // Create default "Uncategorized" category
          await prisma.category.create({
            data: {
              workspaceId: workspace.id,
              name: "Uncategorized",
              isSystem: true,
            },
          });
        }
      }
    },
  },
});
