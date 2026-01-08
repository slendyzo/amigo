import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// DELETE /api/expenses/bulk - Delete expenses by IDs or all expenses
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the user's workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id },
      include: { workspace: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }

    const workspaceId = membership.workspaceId;

    // Get request body
    const body = await request.json().catch(() => ({}));
    const { confirmText, ids } = body;

    // If IDs array is provided, delete specific expenses
    if (ids && Array.isArray(ids) && ids.length > 0) {
      // Verify all expenses belong to this workspace
      const expenses = await prisma.expense.findMany({
        where: {
          id: { in: ids },
          workspaceId,
        },
        select: { id: true },
      });

      const validIds = expenses.map((e) => e.id);

      if (validIds.length === 0) {
        return NextResponse.json(
          { error: "No valid expenses found" },
          { status: 404 }
        );
      }

      // Delete the selected expenses
      await prisma.expense.deleteMany({
        where: {
          id: { in: validIds },
          workspaceId,
        },
      });

      return NextResponse.json({
        success: true,
        deleted: validIds.length,
        message: `Deleted ${validIds.length} expenses`,
      });
    }

    // Otherwise, require confirmation text for deleting ALL expenses
    if (confirmText !== "DELETE ALL") {
      return NextResponse.json(
        { error: "Please type 'DELETE ALL' to confirm" },
        { status: 400 }
      );
    }

    // Count expenses before deletion
    const count = await prisma.expense.count({
      where: { workspaceId },
    });

    // Delete all expenses for this workspace
    await prisma.expense.deleteMany({
      where: { workspaceId },
    });

    return NextResponse.json({
      success: true,
      deleted: count,
      message: `Deleted ${count} expenses`,
    });
  } catch (error) {
    console.error("Failed to delete expenses:", error);
    return NextResponse.json(
      { error: "Failed to delete expenses" },
      { status: 500 }
    );
  }
}
