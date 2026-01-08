import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

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

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        username,
        email,
        password: hashedPassword,
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

    return NextResponse.json(
      { message: "User created successfully" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
