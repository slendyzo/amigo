import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace";
import { serializeReceiptExpense } from "@/lib/receipt-context";
import { buildReceipt, receiptFilename } from "@/lib/receipt-data";
import { renderReceiptPdf } from "@/lib/receipt-pdf";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const query = new URL(request.url).searchParams;
    const expenseId = query.get("expenseId");
    const projectId = query.get("projectId");
    const personId = query.get("personId");
    const mode = query.get("mode") || "eur";
    const locale = query.get("locale") || "en";
    if (!!expenseId === !!projectId || !personId || !["eur", "original"].includes(mode) || !["en", "pt-PT", "fr-FR"].includes(locale)) {
      return NextResponse.json({ error: "Invalid receipt request" }, { status: 400 });
    }
    const workspaceId = context.workspace.id;
    const [scope, person] = await Promise.all([
      projectId
        ? prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { name: true } })
        : prisma.expense.findFirst({ where: { id: expenseId!, workspaceId }, select: { name: true } }),
      prisma.receiptPerson.findFirst({ where: { id: personId, workspaceId }, select: { id: true, name: true } }),
    ]);
    if (!scope || !person) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const expenses = await prisma.expense.findMany({
      where: { workspaceId, splitCount: { gte: 2, lte: 20 }, ...(projectId ? { projects: { some: { id: projectId } } } : { id: expenseId! }) },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });
    let receipt;
    try { receipt = buildReceipt({ title: scope.name, people: [person], expenses: expenses.map(serializeReceiptExpense) }, person.id, mode as "eur" | "original", locale); }
    catch { return NextResponse.json({ error: "Check expense splits before exporting" }, { status: 422 }); }
    const pdf = await renderReceiptPdf(receipt);
    return new NextResponse(new Uint8Array(pdf), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${receiptFilename(receipt, "pdf")}"`, "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    console.error("Receipt export error:", error);
    return NextResponse.json({ error: "Failed to export receipt" }, { status: 500 });
  }
}
