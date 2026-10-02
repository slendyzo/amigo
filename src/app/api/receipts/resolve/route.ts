import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace";
import { parseSplitData } from "@/lib/split-utils";
import { findOrCreateReceiptPerson, lockReceiptPeople } from "@/lib/receipt-people";
import { isPlaceholderReceiptName, normalizeReceiptPersonName } from "@/lib/receipt-person-name";

export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const expenseId = typeof body?.expenseId === "string" ? body.expenseId : null;
    const projectId = typeof body?.projectId === "string" ? body.projectId : null;
    if (!!expenseId === !!projectId) return NextResponse.json({ error: "Choose one receipt scope" }, { status: 400 });
    const workspaceId = context.workspace.id;
    const result = await prisma.$transaction(async tx => {
      await lockReceiptPeople(tx, workspaceId);
      const scope = projectId
        ? await tx.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })
        : await tx.expense.findFirst({ where: { id: expenseId!, workspaceId }, select: { id: true } });
      if (!scope) throw new Error("RECEIPT_SCOPE_NOT_FOUND");
      const people = await tx.receiptPerson.findMany({ where: { workspaceId }, select: { id: true, name: true } });
      const expenses = await tx.expense.findMany({
        where: { workspaceId, splitCount: { gte: 2, lte: 20 }, ...(projectId ? { projects: { some: { id: projectId } } } : { id: expenseId! }) },
        orderBy: { id: "asc" },
      });
      let resolved = 0;
      for (const expense of expenses) {
        // An equal split without names still needs the wizard; do not fabricate identities.
        if (!expense.splitData) continue;
        const rows = parseSplitData(expense.splitData);
        if (!rows || rows.length !== expense.splitCount) throw new Error("INVALID_RECEIPT_SPLIT");
        const seen = new Set<string>();
        let changed = false;
        for (let index = 1; index < rows.length; index++) {
          const row = rows[index];
          const linked = row.personId ? people.find(person => person.id === row.personId) : undefined;
          if (row.personId && !linked) throw new Error("INVALID_RECEIPT_PERSON");
          const name = linked?.name ?? row.label;
          if (!linked && isPlaceholderReceiptName(name)) continue;
          const normalized = normalizeReceiptPersonName(name);
          if (!normalized || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error("INVALID_RECEIPT_PERSON");
          if (seen.has(normalized)) throw new Error("AMBIGUOUS_RECEIPT_PEOPLE");
          seen.add(normalized);
          const { person } = await findOrCreateReceiptPerson(tx, workspaceId, name, people);
          if (row.personId !== person.id || row.label !== person.name) {
            // Exact-name identity repair is safe for paid rows: all monetary and
            // repayment metadata remain untouched; no participants are combined.
            rows[index] = { ...row, personId: person.id, label: person.name };
            changed = true;
            resolved++;
          }
        }
        if (changed) await tx.expense.update({
          where: { id: expense.id, workspaceId, updatedAt: expense.updatedAt },
          data: { splitData: JSON.stringify(rows) },
        });
      }
      return { resolved };
    }, { timeout: 30000 });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    const code = (error as Error).message;
    if (code === "RECEIPT_SCOPE_NOT_FOUND") return NextResponse.json({ error: code, code }, { status: 404 });
    if (["AMBIGUOUS_RECEIPT_PEOPLE", "INVALID_RECEIPT_SPLIT", "INVALID_RECEIPT_PERSON"].includes(code)) return NextResponse.json({ error: code, code }, { status: 409 });
    if ((error as { code?: string }).code === "P2025") return NextResponse.json({ error: "Conflict", code: "RECEIPT_CONFLICT" }, { status: 409 });
    console.error("Resolve receipt people error:", error);
    return NextResponse.json({ error: "Failed to resolve receipt people" }, { status: 500 });
  }
}
