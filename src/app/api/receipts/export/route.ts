import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace";
import { serializeReceiptExpense } from "@/lib/receipt-context";
import { buildReceipt, receiptFilename, type ReceiptExtra } from "@/lib/receipt-data";
import { renderReceiptPdf } from "@/lib/receipt-pdf";
import { receiptRatesContext, verifyReceiptRates } from "@/lib/receipt-rates";

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
    let exchangeRates;
    try {
      const token = query.get("ratesToken");
      exchangeRates = token !== null ? verifyReceiptRates(token, workspaceId) : (await receiptRatesContext(workspaceId)).exchangeRates;
    } catch {
      return NextResponse.json({ error: "Exchange-rate snapshot expired or invalid. Reload the receipt.", code: "INVALID_RECEIPT_RATES_TOKEN" }, { status: 422 });
    }
    const expenses = await prisma.expense.findMany({
      where: { workspaceId, splitCount: { gte: 2, lte: 20 }, ...(projectId ? { projects: { some: { id: projectId } } } : { id: expenseId! }) },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });
    let receipt;
    try {
      const rawDiscounts = query.get("discounts") || "{}";
      if (rawDiscounts.length > 2000) throw new Error("Invalid discounts");
      const discounts: unknown = JSON.parse(rawDiscounts);
      if (!discounts || typeof discounts !== "object" || Array.isArray(discounts) || Object.values(discounts).some(value => typeof value !== "number")) throw new Error("Invalid discounts");
      const rawExtras = query.get("extras") || "{}";
      if (rawExtras.length > 4000) throw new Error("INVALID_RECEIPT_EXTRA");
      let extras: unknown;
      try { extras = JSON.parse(rawExtras); } catch { throw new Error("INVALID_RECEIPT_EXTRA"); }
      receipt = buildReceipt({ title: scope.name, people: [person], expenses: expenses.map(serializeReceiptExpense), exchangeRates }, person.id, mode as "eur" | "original", locale, discounts as Record<string, number>, extras as Record<string, ReceiptExtra>);
    }
    catch (error) { return NextResponse.json({ error: "Check expense splits and ticket adjustments before exporting", ...(error instanceof Error && error.message === "INVALID_RECEIPT_EXTRA" ? { code: "INVALID_RECEIPT_EXTRA" } : {}) }, { status: 422 }); }
    const pdf = await renderReceiptPdf(receipt);
    return new NextResponse(new Uint8Array(pdf), { headers: {
      "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${receiptFilename(receipt, "pdf")}"`, "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    console.error("Receipt export error:", error);
    return NextResponse.json({ error: "Failed to export receipt" }, { status: 500 });
  }
}
