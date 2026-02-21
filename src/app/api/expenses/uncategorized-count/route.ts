import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace";

// GET - Return count of uncategorized expenses
export async function GET() {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace } = context;

    // Find the "Uncategorized" category to also match those expenses
    const uncategorizedCategory = await prisma.category.findFirst({
      where: { workspaceId: workspace.id, name: "Uncategorized" },
    });

    const count = await prisma.expense.count({
      where: {
        workspaceId: workspace.id,
        OR: [
          { categoryId: null },
          ...(uncategorizedCategory ? [{ categoryId: uncategorizedCategory.id }] : []),
        ],
      },
    });

    return NextResponse.json({ count });
  } catch (error) {
    console.error("Uncategorized count error:", error);
    return NextResponse.json({ error: "Failed to fetch count" }, { status: 500 });
  }
}
