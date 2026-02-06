import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";

// GET - List bank accounts
export async function GET() {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const bankAccounts = await prisma.bankAccount.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { expenses: true } },
      },
    });

    return NextResponse.json({ bankAccounts });
  } catch (error) {
    console.error("Get bank accounts error:", error);
    return NextResponse.json({ error: "Failed to fetch bank accounts" }, { status: 500 });
  }
}

// POST - Create bank account
export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const body = await request.json();
    const { name, currency } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const bankAccount = await prisma.bankAccount.create({
      data: {
        workspaceId: workspace.id,
        name,
        currency: currency || "EUR",
      },
    });

    return NextResponse.json({ bankAccount }, { status: 201 });
  } catch (error) {
    console.error("Create bank account error:", error);
    return NextResponse.json({ error: "Failed to create bank account" }, { status: 500 });
  }
}
