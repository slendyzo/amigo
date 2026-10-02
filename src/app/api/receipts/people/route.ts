import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActiveWorkspace } from "@/lib/workspace";

export async function GET() {
  const context = await getActiveWorkspace();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const people = await prisma.receiptPerson.findMany({ where: { workspaceId: context.workspace.id }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
  return NextResponse.json({ people }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) return NextResponse.json({ error: "Invalid person name" }, { status: 400 });
    // Names are display labels, not identity keys: two people may share a name.
    const person = await prisma.receiptPerson.create({ data: { name, workspaceId: context.workspace.id }, select: { id: true, name: true } });
    return NextResponse.json(person, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    console.error("Create receipt person error:", error);
    return NextResponse.json({ error: "Failed to save person" }, { status: 500 });
  }
}
