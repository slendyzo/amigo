import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { seedDefaultCategories } from "@/lib/default-categories";

/**
 * POST /api/categories/seed
 * Seeds default categories for the current workspace.
 * Safe to run multiple times - skips categories that already exist.
 * Accepts optional `language` in body to override workspace language.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse optional language from request body
    let requestedLanguage: string | undefined;
    try {
      const body = await request.json();
      requestedLanguage = body.language;
    } catch {
      // No body or invalid JSON - that's fine, we'll use workspace language
    }

    // Get user's active workspace
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { activeWorkspaceId: true },
    });

    const workspace = await prisma.workspace.findFirst({
      where: user?.activeWorkspaceId
        ? { id: user.activeWorkspaceId, members: { some: { userId: session.user.id } } }
        : { members: { some: { userId: session.user.id } } },
    });

    if (!workspace) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Use requested language if provided and valid, otherwise fall back to workspace language
    const validLanguages = ["en", "pt-PT", "fr-FR"];
    const languageToUse = requestedLanguage && validLanguages.includes(requestedLanguage)
      ? requestedLanguage
      : undefined;

    const result = await seedDefaultCategories(workspace.id, languageToUse);

    return NextResponse.json({
      success: true,
      created: result.created,
      skipped: result.skipped,
      categories: result.categories,
      message:
        result.created > 0
          ? `Added ${result.created} default categories`
          : "All default categories already exist",
    });
  } catch (error) {
    console.error("Seed categories error:", error);
    return NextResponse.json(
      { error: "Failed to seed categories" },
      { status: 500 }
    );
  }
}
