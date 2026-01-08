import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { sendEmailVerificationCode } from "@/lib/email";

// Blocked disposable/temporary email domains
const BLOCKED_EMAIL_DOMAINS = [
  "roratu.com",
  "tempmail.com",
  "temp-mail.org",
  "guerrillamail.com",
  "guerrillamail.org",
  "mailinator.com",
  "10minutemail.com",
  "10minutemail.net",
  "throwaway.email",
  "fakeinbox.com",
  "trashmail.com",
  "trashmail.net",
  "getnada.com",
  "tempail.com",
  "mohmal.com",
  "dispostable.com",
  "mailnesia.com",
  "maildrop.cc",
  "mintemail.com",
  "yopmail.com",
  "sharklasers.com",
  "spam4.me",
  "grr.la",
  "guerrillamailblock.com",
  "pokemail.net",
  "spamgourmet.com",
  "mytrashmail.com",
  "mt2009.com",
  "thankyou2010.com",
  "trash2009.com",
  "mt2014.com",
  "tempinbox.com",
  "discard.email",
  "discardmail.com",
  "spambog.com",
  "spambog.de",
  "spambog.ru",
  "0-mail.com",
  "disposemail.com",
  "mailcatch.com",
  "mail-temporaire.fr",
  "jetable.org",
  "emailtemporario.com.br",
];

function isBlockedEmailDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return BLOCKED_EMAIL_DOMAINS.some(
    (blocked) => domain === blocked || domain.endsWith("." + blocked)
  );
}

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: Request) {
  try {
    const { name, username, email, password } = await request.json();

    if (!username || !email || !password) {
      return NextResponse.json(
        { error: "Username, email, and password are required" },
        { status: 400 }
      );
    }

    // Check for blocked email domains
    if (isBlockedEmailDomain(email)) {
      return NextResponse.json(
        { error: "Please use a valid email address. Temporary or disposable email addresses are not allowed." },
        { status: 400 }
      );
    }

    // Validate username format
    const usernameRegex = /^[a-z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return NextResponse.json(
        { error: "Username must be 3-20 characters, lowercase letters, numbers, and underscores only" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Check if user already exists (email or username)
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });

    if (existingEmail) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 }
      );
    }

    const existingUsername = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUsername) {
      return NextResponse.json(
        { error: "Username is already taken" },
        { status: 400 }
      );
    }

    // Rate limit: Check for recent verification attempts (max 3 codes per email per hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentTokens = await prisma.emailVerificationToken.count({
      where: {
        email,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentTokens >= 3) {
      return NextResponse.json(
        { error: "Too many verification attempts. Please try again later." },
        { status: 429 }
      );
    }

    // Delete any existing tokens for this email
    await prisma.emailVerificationToken.deleteMany({
      where: { email },
    });

    // Hash password before storing
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate 6-digit code
    const code = generateVerificationCode();

    // Store verification token with user data (10 minute expiry)
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.emailVerificationToken.create({
      data: {
        email,
        code,
        userData: JSON.stringify({
          name: name || null,
          username,
          email,
          hashedPassword,
        }),
        expires,
      },
    });

    // Send verification email
    const emailResult = await sendEmailVerificationCode(email, code, name);

    if (!emailResult.success) {
      // Clean up token if email failed
      await prisma.emailVerificationToken.deleteMany({
        where: { email },
      });
      return NextResponse.json(
        { error: "Failed to send verification email. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "Verification code sent", email },
      { status: 200 }
    );
  } catch (error) {
    console.error("Send verification error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
