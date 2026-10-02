import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace";
import { serializeReceiptExpense } from "@/lib/receipt-context";
import { canonicalReceiptPeople } from "@/lib/receipt-people";

export async function GET(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const query = new URL(request.url).searchParams;
    const expenseId = query.get("expenseId");
    const projectId = query.get("projectId");
    if (!!expenseId === !!projectId) return NextResponse.json({ error: "Choose one receipt scope" }, { status: 400 });
    const workspaceId = context.workspace.id;
    const scope = projectId
      ? await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { name: true } })
      : await prisma.expense.findFirst({ where: { id: expenseId!, workspaceId }, select: { name: true } });
    if (!scope) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const [expenses, people] = await Promise.all([
      prisma.expense.findMany({
        where: { workspaceId, splitCount: { gte: 2, lte: 20 }, ...(projectId ? { projects: { some: { id: projectId } } } : { id: expenseId! }) },
        orderBy: [{ date: "asc" }, { id: "asc" }],
      }),
      prisma.receiptPerson.findMany({ where: { workspaceId }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    ]);
    return NextResponse.json({ title: scope.name, people: canonicalReceiptPeople(people), expenses: expenses.map(serializeReceiptExpense) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Receipt context error:", error);
    return NextResponse.json({ error: "Failed to load receipt" }, { status: 500 });
  }
}
