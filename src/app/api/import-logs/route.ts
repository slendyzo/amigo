import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/import-logs - List all import batches
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the user's workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id },
      include: { workspace: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }

    const workspaceId = membership.workspaceId;

    // Get import logs with expense count
    const importLogs = await prisma.importLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { expenses: true },
        },
      },
    });

    // Map to include expense count
    const logsWithCount = importLogs.map((log: {
      id: string;
      fileName: string;
      fileType: string;
      rowsTotal: number;
      rowsSuccess: number;
      rowsFailed: number;
      createdAt: Date;
      _count: { expenses: number };
    }) => ({
      id: log.id,
      fileName: log.fileName,
      fileType: log.fileType,
      rowsTotal: log.rowsTotal,
      rowsSuccess: log.rowsSuccess,
      rowsFailed: log.rowsFailed,
      expenseCount: log._count.expenses,
      createdAt: log.createdAt,
    }));

    return NextResponse.json({
      importLogs: logsWithCount,
      count: logsWithCount.length,
    });
  } catch (error) {
    console.error("Failed to fetch import logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch import logs" },
      { status: 500 }
    );
  }
}
