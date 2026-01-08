import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get user's workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId },
      include: { workspace: true },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const workspaceId = membership.workspaceId;
    const body = await request.json();

    // If user just wants to skip onboarding
    if (body.skipOnboarding) {
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { onboardingCompleted: true },
      });
      return NextResponse.json({ success: true });
    }

    const { monthlySalary, monthlyBudget, fixedExpenses } = body;

    // Update workspace with salary and budget (only if provided)
    const workspaceUpdate: Record<string, unknown> = {
      onboardingCompleted: true,
    };

    if (monthlySalary !== null && monthlySalary !== undefined) {
      workspaceUpdate.monthlySalary = monthlySalary;
    }
    if (monthlyBudget !== null && monthlyBudget !== undefined) {
      workspaceUpdate.monthlyBudget = monthlyBudget;
    }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: workspaceUpdate,
    });

    // Create recurring templates for fixed expenses (if provided)
    if (fixedExpenses && fixedExpenses.length > 0) {
      for (const expense of fixedExpenses) {
        if (expense.name && expense.amount > 0) {
          // Check if template with same name already exists
          const existing = await prisma.recurringTemplate.findFirst({
            where: {
              workspaceId,
              name: expense.name,
            },
          });

          if (!existing) {
            await prisma.recurringTemplate.create({
              data: {
                workspaceId,
                name: expense.name,
                type: "SURVIVAL_FIXED",
                amount: expense.amount,
                currency: "EUR",
                interval: "MONTHLY",
                autoGenerate: true,
                isActive: true,
              },
            });
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save onboarding data:", error);
    return NextResponse.json(
      { error: "Failed to save onboarding data" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get user's workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId },
      include: { workspace: true },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const workspace = membership.workspace;

    return NextResponse.json({
      onboardingCompleted: workspace.onboardingCompleted,
      monthlySalary: workspace.monthlySalary
        ? parseFloat(workspace.monthlySalary.toString())
        : null,
      monthlyBudget: workspace.monthlyBudget
        ? parseFloat(workspace.monthlyBudget.toString())
        : null,
    });
  } catch (error) {
    console.error("Failed to get onboarding status:", error);
    return NextResponse.json(
      { error: "Failed to get onboarding status" },
      { status: 500 }
    );
  }
}
