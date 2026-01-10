import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { seedDefaultCategories } from "@/lib/default-categories";

/**
 * POST /api/categories/seed
 * Seeds default categories for the current workspace.
 * Safe to run multiple times - skips categories that already exist.
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const result = await seedDefaultCategories(workspace.id);

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
