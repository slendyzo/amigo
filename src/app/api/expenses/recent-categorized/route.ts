import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace";

// GET - Fetch recently categorized expenses (for tidy-up sidebar)
export async function GET() {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspace } = context;

    const expenses = await prisma.expense.findMany({
      where: {
        workspaceId: workspace.id,
        categorizedAt: { not: null },
      },
      orderBy: { categorizedAt: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        amount: true,
        currency: true,
        type: true,
        date: true,
        categoryId: true,
        category: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ expenses });
  } catch (error) {
    console.error("Failed to fetch recent categorized:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
