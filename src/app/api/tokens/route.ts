import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripHtmlTags } from "@/lib/utils";
import { getActiveWorkspace } from "@/lib/workspace";
import { generateApiToken } from "@/lib/api-token";

const MAX_TOKENS_PER_USER = 10;

// GET - List current user's API tokens (never returns hashes)
export async function GET() {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tokens = await prisma.apiToken.findMany({
      where: { userId: context.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        lastUsedAt: true,
        createdAt: true,
        workspace: { select: { name: true } },
      },
    });

    return NextResponse.json({ tokens });
  } catch (error) {
    console.error("Get tokens error:", error);
    return NextResponse.json({ error: "Failed to fetch tokens" }, { status: 500 });
  }
}

// POST - Create a new API token. The raw token is returned ONCE here and never again.
export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const body = await request.json();
    const name = stripHtmlTags(body.name, 100);
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const count = await prisma.apiToken.count({ where: { userId: context.userId } });
    if (count >= MAX_TOKENS_PER_USER) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_TOKENS_PER_USER} tokens reached` },
        { status: 400 }
      );
    }

    const { raw, hash, prefix } = generateApiToken();

    const created = await prisma.apiToken.create({
      data: {
        userId: context.userId,
        workspaceId: workspace.id,
        name,
        tokenHash: hash,
        tokenPrefix: prefix,
      },
      select: { id: true, name: true, tokenPrefix: true, createdAt: true },
    });

    return NextResponse.json({ token: raw, ...created }, { status: 201 });
  } catch (error) {
    console.error("Create token error:", error);
    return NextResponse.json({ error: "Failed to create token" }, { status: 500 });
  }
}
