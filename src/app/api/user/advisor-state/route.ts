import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        aiProcessingEnabled: true,
        aiConsentAt: true,
        activeWorkspaceId: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const activeWorkspaceId = user.activeWorkspaceId;

    if (!activeWorkspaceId) {
      return NextResponse.json({
        aiProcessingEnabled: user.aiProcessingEnabled ?? false,
        aiConsentAt: user.aiConsentAt?.toISOString() ?? null,
        expenseCount: 0,
        monthsTracked: 0,
        isColdstart: true,
      });
    }

    // Count total expenses in workspace
    const expenseCount = await prisma.expense.count({
      where: { workspaceId: activeWorkspaceId },
    });

    // Count distinct calendar months using raw SQL
    const result = await prisma.$queryRaw<[{ month_count: bigint }]>`
      SELECT COUNT(DISTINCT date_trunc('month', date)) AS month_count
      FROM expenses
      WHERE "workspaceId" = ${activeWorkspaceId}
    `;

    const monthsTracked = Number(result[0]?.month_count ?? 0);
    const isColdstart = expenseCount < 30 || monthsTracked < 2;

    return NextResponse.json({
      aiProcessingEnabled: user.aiProcessingEnabled ?? false,
      aiConsentAt: user.aiConsentAt?.toISOString() ?? null,
      expenseCount,
      monthsTracked,
      isColdstart,
    });
  } catch (error) {
    console.error("Error fetching advisor state:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
