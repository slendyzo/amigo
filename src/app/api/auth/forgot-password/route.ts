import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Always return success to prevent email enumeration attacks
    // But only send email if user exists and has a password (not OAuth-only)
    if (user && user.password) {
      // Generate secure token
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Delete any existing tokens for this user
      await prisma.verificationToken.deleteMany({
        where: { identifier: email.toLowerCase() },
      });

      // Create new token
      await prisma.verificationToken.create({
        data: {
          identifier: email.toLowerCase(),
          token,
          expires,
        },
      });

      // Send email
      const result = await sendPasswordResetEmail(
        email,
        token,
        user.name || undefined
      );

      if (!result.success) {
        console.error("Failed to send reset email:", result.error);
        // Still return success to prevent enumeration
      }
    } else if (user && !user.password) {
      // User exists but uses OAuth - don't expose this info
      console.log(`Password reset requested for OAuth user: ${email}`);
    }

    // Always return success message
    return NextResponse.json({
      message: "If an account with that email exists, we've sent a password reset link.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
