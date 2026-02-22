import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { upgradeToHierarchy } from "@/lib/default-categories";

/**
 * POST /api/categories/upgrade-hierarchy
 * Upgrades existing flat categories to hierarchical structure.
 * Creates parent categories and adopts matching existing ones as children.
 * Idempotent - safe to run multiple times.
 */
export async function POST() {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const result = await upgradeToHierarchy(workspace.id);

    return NextResponse.json({
      success: true,
      ...result,
      unmatched: result.unmatched,
      message:
        result.parentsCreated + result.childrenCreated + result.adopted + result.merged > 0
          ? `Created ${result.parentsCreated} groups, ${result.childrenCreated} subcategories, organized ${result.adopted + result.merged} existing categories`
          : "Categories are already organized",
    });
  } catch (error) {
    console.error("Upgrade hierarchy error:", error);
    return NextResponse.json(
      { error: "Failed to organize categories" },
      { status: 500 }
    );
  }
}
