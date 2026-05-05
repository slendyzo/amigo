import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { aggregateNudgeCandidates } from "@/lib/insight-aggregator";
import { getActiveWorkspace } from "@/lib/workspace";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ctx = await getActiveWorkspace();
    if (!ctx) {
      return NextResponse.json({ error: "No active workspace" }, { status: 401 });
    }

    const { recurringCandidates } = await aggregateNudgeCandidates(ctx.workspace.id);

    const candidates = recurringCandidates.slice(0, 8).map(({ name, amount, dayOfMonth, monthsObserved, sampleExpenseIds }) => ({
      name,
      amount,
      dayOfMonth,
      monthsObserved,
      sampleExpenseIds,
    }));

    return NextResponse.json({ candidates });
  } catch (error) {
    console.error("Error fetching recurring nudge candidates:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ctx = await getActiveWorkspace();
    if (!ctx) {
      return NextResponse.json({ error: "No active workspace" }, { status: 401 });
    }

    const body = await request.json();
    const { name, amount, dayOfMonth, sampleExpenseIds } = body;

    // Sanity checks
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    if (typeof dayOfMonth !== "number" || dayOfMonth < 1 || dayOfMonth > 31) {
      return NextResponse.json({ error: "Invalid dayOfMonth" }, { status: 400 });
    }
    if (!Array.isArray(sampleExpenseIds) || sampleExpenseIds.length === 0) {
      return NextResponse.json({ error: "Invalid sampleExpenseIds" }, { status: 400 });
    }

    // Verify all sampleExpenseIds belong to the active workspace
    const matchCount = await prisma.expense.count({
      where: {
        id: { in: sampleExpenseIds },
        workspaceId: ctx.workspace.id,
      },
    });

    if (matchCount !== sampleExpenseIds.length) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const template = await prisma.recurringTemplate.create({
      data: {
        workspaceId: ctx.workspace.id,
        name: name.trim(),
        amount,
        currency: "EUR",
        interval: "MONTHLY",
        dayOfMonth,
        type: "SURVIVAL_FIXED",
        autoGenerate: false,
        isActive: true,
      },
      select: { id: true },
    });

    return NextResponse.json({ id: template.id }, { status: 201 });
  } catch (error) {
    console.error("Error creating recurring template from nudge:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
