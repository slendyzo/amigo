import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { initializeSplit, parseSplitData, validRepayment } from "@/lib/split-utils";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getActiveWorkspace();
    if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const body = await request.json();
    if (!body || !Number.isInteger(body.index) || body.index < 1 || !validRepayment(body.repayment) ||
      !(body.expectedSplitData === null || typeof body.expectedSplitData === "string")) {
      return NextResponse.json({ error: "Invalid repayment" }, { status: 400 });
    }
    const existing = await prisma.expense.findFirst({ where: { id, workspaceId: context.workspace.id } });
    if (!existing) return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    if (!existing.splitCount || existing.splitCount < 2 || existing.splitCount > 20 || body.index >= existing.splitCount) {
      return NextResponse.json({ error: "Invalid split person" }, { status: 400 });
    }
    if (existing.splitData !== body.expectedSplitData) return NextResponse.json({ error: "Conflict" }, { status: 409 });
    const parsed = parseSplitData(existing.splitData);
    if (existing.splitData && (!parsed || parsed.length !== existing.splitCount)) return NextResponse.json({ error: "Invalid split data" }, { status: 400 });
    const people = parsed || initializeSplit(Number(existing.amount), existing.splitCount);
    people.forEach(p => { p.id ||= crypto.randomUUID(); });
    people[body.index].repayment = body.repayment;
    const expense = await prisma.expense.update({
      where: { id, workspaceId: context.workspace.id, updatedAt: existing.updatedAt },
      data: { splitData: JSON.stringify(people) },
      include: { category: { include: { parent: true } }, bankAccount: true, projects: true },
    });
    return NextResponse.json({ expense });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    if ((error as { code?: string }).code === "P2025") return NextResponse.json({ error: "Conflict" }, { status: 409 });
    console.error("Save repayment error:", error);
    return NextResponse.json({ error: "Failed to save repayment" }, { status: 500 });
  }
}
