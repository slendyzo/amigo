import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const MAX_ATTEMPTS = 5;

export async function POST(request: Request) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json(
        { error: "Email and verification code are required" },
        { status: 400 }
      );
    }

    // Find the verification token
    const token = await prisma.emailVerificationToken.findFirst({
      where: { email },
    });

    if (!token) {
      return NextResponse.json(
        { error: "No verification code found. Please request a new one." },
        { status: 400 }
      );
    }

    // Check if expired
    if (token.expires < new Date()) {
      await prisma.emailVerificationToken.delete({ where: { id: token.id } });
      return NextResponse.json(
        { error: "Verification code has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // Check attempts
    if (token.attempts >= MAX_ATTEMPTS) {
      await prisma.emailVerificationToken.delete({ where: { id: token.id } });
      return NextResponse.json(
        { error: "Too many failed attempts. Please request a new code." },
        { status: 400 }
      );
    }

    // Validate code
    if (token.code !== code) {
      // Increment attempts
      await prisma.emailVerificationToken.update({
        where: { id: token.id },
        data: { attempts: token.attempts + 1 },
      });

      const remainingAttempts = MAX_ATTEMPTS - token.attempts - 1;
      return NextResponse.json(
        {
          error: `Invalid verification code. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`
        },
        { status: 400 }
      );
    }

    // Parse stored user data
    const userData = JSON.parse(token.userData) as {
      name: string | null;
      username: string;
      email: string;
      hashedPassword: string;
    };

    // Double-check user doesn't exist (race condition protection)
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: userData.email },
          { username: userData.username },
        ],
      },
    });

    if (existingUser) {
      await prisma.emailVerificationToken.delete({ where: { id: token.id } });
      return NextResponse.json(
        { error: "An account with this email or username already exists." },
        { status: 400 }
      );
    }

    // Create user with email verified
    const user = await prisma.user.create({
      data: {
        name: userData.name,
        username: userData.username,
        email: userData.email,
        password: userData.hashedPassword,
        emailVerified: new Date(),
      },
    });

    // Create default personal workspace for the user
    await prisma.workspace.create({
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

    // Delete the verification token
    await prisma.emailVerificationToken.delete({ where: { id: token.id } });

    return NextResponse.json(
      { message: "Email verified successfully. You can now sign in." },
      { status: 201 }
    );
  } catch (error) {
    console.error("Email verification error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
