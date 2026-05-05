/**
 * GET  /api/insights/retrospective          → latest unread RETROSPECTIVE for active workspace (or null)
 * GET  /api/insights/retrospective?mode=list → last 24 retrospectives for active workspace
 * PATCH /api/insights/retrospective          → mark a retrospective as read { id: string }
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { InsightType } from "@prisma/client";

const SHARED_SELECT = {
  id: true,
  periodYear: true,
  periodMonth: true,
  content: true,
  readAt: true,
  generatedAt: true,
} as const;

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { activeWorkspaceId: true },
    });

    if (!user?.activeWorkspaceId) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode");

    if (mode === "list") {
      const insights = await prisma.insight.findMany({
        where: {
          workspaceId: user.activeWorkspaceId,
          type: InsightType.RETROSPECTIVE,
        },
        orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
        take: 24,
        select: SHARED_SELECT,
      });
      return NextResponse.json(insights);
    }

    // Default: latest unread
    const insight = await prisma.insight.findFirst({
      where: {
        workspaceId: user.activeWorkspaceId,
        type: InsightType.RETROSPECTIVE,
        readAt: null,
      },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
      select: SHARED_SELECT,
    });

    return NextResponse.json(insight ?? null);
  } catch (error) {
    console.error("[insights/retrospective] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { activeWorkspaceId: true },
    });

    if (!user?.activeWorkspaceId) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    const body = await request.json();
    const { id } = body as { id: string };

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // Verify ownership before updating
    const insight = await prisma.insight.findFirst({
      where: { id, workspaceId: user.activeWorkspaceId, type: InsightType.RETROSPECTIVE },
      select: { id: true },
    });

    if (!insight) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.insight.update({
      where: { id },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[insights/retrospective] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
