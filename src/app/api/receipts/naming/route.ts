import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace";
import { initializeSplit, parseSplitData } from "@/lib/split-utils";
import { serializeReceiptExpense } from "@/lib/receipt-context";

type Assignment = { index: number; personId: string };

export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    if (!body || typeof body.expenseId !== "string" || typeof body.updatedAt !== "string" || !Number.isFinite(Date.parse(body.updatedAt)) ||
      !Array.isArray(body.assignments) || body.assignments.length < 1 || body.assignments.length > 19 ||
      !body.assignments.every((a: Assignment) => a && Number.isInteger(a.index) && a.index >= 1 && typeof a.personId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(a.personId))) {
      return NextResponse.json({ error: "Invalid assignments" }, { status: 400 });
    }
    const assignments: Assignment[] = body.assignments;
    if (new Set(assignments.map(a => a.index)).size !== assignments.length || new Set(assignments.map(a => a.personId)).size !== assignments.length) {
      return NextResponse.json({ error: "Duplicate person assignment" }, { status: 400 });
    }
    const workspaceId = context.workspace.id;
    const existing = await prisma.expense.findFirst({ where: { id: body.expenseId, workspaceId } });
    if (!existing) return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    if (existing.updatedAt.getTime() !== Date.parse(body.updatedAt)) return NextResponse.json({ error: "Conflict" }, { status: 409 });
    if (!existing.splitCount || existing.splitCount < 2 || existing.splitCount > 20 || assignments.length !== existing.splitCount - 1 || assignments.some(a => a.index >= existing.splitCount!)) {
      return NextResponse.json({ error: "Assign every split participant" }, { status: 400 });
    }
    const parsed = parseSplitData(existing.splitData);
    if (existing.splitData && (!parsed || parsed.length !== existing.splitCount)) return NextResponse.json({ error: "Invalid split data" }, { status: 400 });
    if (assignments.some(assignment => {
      const prior = parsed?.[assignment.index];
      return prior?.repayment?.paid && prior.personId && prior.personId !== assignment.personId;
    })) return NextResponse.json({ error: "REPAYMENT_PROTECTED" }, { status: 400 });
    const saved = await prisma.receiptPerson.findMany({ where: { workspaceId, id: { in: assignments.map(a => a.personId) } }, select: { id: true, name: true } });
    if (saved.length !== assignments.length) return NextResponse.json({ error: "Person not found" }, { status: 400 });
    const people = parsed || initializeSplit(Number(existing.amount), existing.splitCount);
    people.forEach(person => { person.id ||= crypto.randomUUID(); });
    for (const assignment of assignments) {
      const person = saved.find(p => p.id === assignment.personId)!;
      // Naming is deliberately independent of amount/repayment editing, including paid legacy rows.
      people[assignment.index] = { ...people[assignment.index], personId: person.id, label: person.name };
    }
    const expense = await prisma.expense.update({
      where: { id: existing.id, workspaceId, updatedAt: existing.updatedAt },
      data: { splitData: JSON.stringify(people) },
    });
    return NextResponse.json({ expense: serializeReceiptExpense(expense) });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    if ((error as { code?: string }).code === "P2025") return NextResponse.json({ error: "Conflict" }, { status: 409 });
    console.error("Receipt naming error:", error);
    return NextResponse.json({ error: "Failed to name split participants" }, { status: 500 });
  }
}
