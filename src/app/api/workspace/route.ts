import { NextRequest, NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";

// GET /api/workspace - Get current workspace settings
export async function GET() {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        monthlyBudget: workspace.monthlyBudget,
        defaultCurrency: workspace.defaultCurrency,
        defaultBankAccountId: workspace.defaultBankAccountId,
        language: workspace.language,
      },
    });
  } catch (error) {
    console.error("Failed to fetch workspace:", error);
    return NextResponse.json(
      { error: "Failed to fetch workspace" },
      { status: 500 }
    );
  }
}

// PUT /api/workspace - Update workspace settings
export async function PUT(request: NextRequest) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const body = await request.json();
    const { monthlyBudget, defaultCurrency, defaultBankAccountId, name, language, resetOnboarding } = body;

    // Build update object
    const updateData: Record<string, unknown> = {};

    if (name !== undefined) updateData.name = name;
    if (monthlyBudget !== undefined) {
      updateData.monthlyBudget = monthlyBudget === "" || monthlyBudget === null ? null : parseFloat(monthlyBudget);
    }
    if (defaultCurrency) updateData.defaultCurrency = defaultCurrency;
    if (defaultBankAccountId !== undefined) {
      updateData.defaultBankAccountId = defaultBankAccountId || null;
    }
    if (language) updateData.language = language;

    // Reset onboarding flag if requested
    if (resetOnboarding) {
      updateData.onboardingCompleted = false;
    }

    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspace.id },
      data: updateData,
    });

    return NextResponse.json({
      workspace: {
        id: updatedWorkspace.id,
        name: updatedWorkspace.name,
        monthlyBudget: updatedWorkspace.monthlyBudget,
        defaultCurrency: updatedWorkspace.defaultCurrency,
        defaultBankAccountId: updatedWorkspace.defaultBankAccountId,
        language: updatedWorkspace.language,
      },
    });
  } catch (error) {
    console.error("Failed to update workspace:", error);
    return NextResponse.json(
      { error: "Failed to update workspace" },
      { status: 500 }
    );
  }
}
