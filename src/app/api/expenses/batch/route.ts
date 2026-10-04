import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace";
import { convertToEur } from "@/lib/currency";
import { assertExpenseBatchWorkspace, ExpenseBatchError, saveExpenseBatch, validateExpenseBatch } from "@/lib/expense-batch";

export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // No images or raw OCR are accepted by this endpoint.
    if (Number(request.headers.get("content-length")) > 131072) return NextResponse.json({ error: "Import is too large", code: "INVALID_BATCH" }, { status: 413 });
    let body: unknown;
    try {
      const reader = request.body?.getReader();
      if (!reader) throw new Error("Missing body");
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 131072) {
          await reader.cancel();
          return NextResponse.json({ error: "Import is too large", code: "INVALID_BATCH" }, { status: 413 });
        }
        chunks.push(chunk.value);
      }
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
    catch { return NextResponse.json({ error: "Invalid JSON", code: "INVALID_BATCH" }, { status: 400 }); }
    assertExpenseBatchWorkspace(body, context.workspace.id);
    const expenses = validateExpenseBatch(body);
    const result = await saveExpenseBatch(prisma, context.workspace, expenses, convertToEur);
    return NextResponse.json({ expenses: result.expenses }, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof ExpenseBatchError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("Screenshot expense batch error:", error);
    return NextResponse.json({ error: "Failed to save expenses" }, { status: 500 });
  }
}
