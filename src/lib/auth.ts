import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

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
    signIn: "/auth/signin",
    error: "/auth/error",
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
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
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
