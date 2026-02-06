import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";

// PUT - Update bank account
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const { id } = await params;
    const body = await request.json();
    const { name, currency } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Verify account exists and belongs to workspace
    const existing = await prisma.bankAccount.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Bank account not found" }, { status: 404 });
    }

    const bankAccount = await prisma.bankAccount.update({
      where: { id },
      data: {
        name,
        currency: currency || existing.currency,
      },
    });

    return NextResponse.json({ bankAccount });
  } catch (error) {
    console.error("Update bank account error:", error);
    return NextResponse.json({ error: "Failed to update bank account" }, { status: 500 });
  }
}

// DELETE - Delete bank account
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const { id } = await params;

    // Verify account exists and belongs to workspace
    const existing = await prisma.bankAccount.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Bank account not found" }, { status: 404 });
    }

    // Unlink expenses from this account
    await prisma.expense.updateMany({
      where: { bankAccountId: id },
      data: { bankAccountId: null },
    });

    // Delete the account
    await prisma.bankAccount.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete bank account error:", error);
    return NextResponse.json({ error: "Failed to delete bank account" }, { status: 500 });
  }
}
