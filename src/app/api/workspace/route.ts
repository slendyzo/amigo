import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/workspace - Get current workspace settings
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id },
      include: {
        workspace: true,
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }

    return NextResponse.json({
      workspace: {
        id: membership.workspace.id,
        name: membership.workspace.name,
        monthlyBudget: membership.workspace.monthlyBudget,
        defaultCurrency: membership.workspace.defaultCurrency,
        language: membership.workspace.language,
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
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { monthlyBudget, defaultCurrency, name, language } = body;

    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id },
      include: { workspace: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }

    const workspace = await prisma.workspace.update({
      where: { id: membership.workspaceId },
      data: {
        name: name !== undefined ? name : undefined,
        monthlyBudget: monthlyBudget !== undefined
          ? (monthlyBudget === "" || monthlyBudget === null ? null : parseFloat(monthlyBudget))
          : undefined,
        defaultCurrency: defaultCurrency || undefined,
        language: language || undefined,
      },
    });

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        monthlyBudget: workspace.monthlyBudget,
        defaultCurrency: workspace.defaultCurrency,
        language: workspace.language,
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
