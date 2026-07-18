import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { convertToEur } from "@/lib/currency";
import { getInstallmentProgress } from "@/lib/installments";

async function findPlan(id: string, workspaceId: string) {
  const template = await prisma.recurringTemplate.findFirst({
    where: { id, workspaceId, installmentMonths: { not: null } },
  });
  return template;
}

// GET - Progress for one installment plan (paid so far, remaining, months)
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const template = await findPlan(id, context.workspace.id);
    if (!template) {
      return NextResponse.json({ error: "Installment plan not found" }, { status: 404 });
    }

    const progress = await getInstallmentProgress(id);
    return NextResponse.json({ progress });
  } catch (error) {
    console.error("Get installment plan error:", error);
    return NextResponse.json({ error: "Failed to load installment plan" }, { status: 500 });
  }
}

// PATCH - { action: "cancel" } stops future installments;
//         { action: "settle" } logs the remaining balance as one expense today and closes the plan
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const { workspace } = context;

    const template = await findPlan(id, workspace.id);
    if (!template) {
      return NextResponse.json({ error: "Installment plan not found" }, { status: 404 });
    }
    if (!template.isActive) {
      return NextResponse.json({ error: "Installment plan is already closed" }, { status: 400 });
    }

    const body = await request.json();
    const action = body?.action;

    if (action === "cancel") {
      await prisma.recurringTemplate.update({
        where: { id },
        data: { isActive: false, autoGenerate: false },
      });
      return NextResponse.json({ success: true, action: "cancel" });
    }

    if (action === "settle") {
      const agg = await prisma.expense.aggregate({
        where: { recurringTemplateId: id },
        _sum: { amount: true },
      });
      const paid = Number(agg._sum.amount ?? 0);
      const remaining = Math.round((Number(template.installmentTotal) - paid) * 100) / 100;
      if (remaining <= 0) {
        return NextResponse.json({ error: "Nothing left to settle" }, { status: 400 });
      }

      let defaultCategory = null;
      if (!template.categoryId) {
        defaultCategory = await prisma.category.findFirst({
          where: { workspaceId: workspace.id, name: "Uncategorized" },
        });
        if (!defaultCategory) {
          defaultCategory = await prisma.category.create({
            data: { workspaceId: workspace.id, name: "Uncategorized", isSystem: true },
          });
        }
      }

      const currency = template.currency || "EUR";
      const { amountEur, exchangeRate } = await convertToEur(remaining, currency);

      const [settleExpense] = await prisma.$transaction([
        prisma.expense.create({
          data: {
            workspaceId: workspace.id,
            categoryId: template.categoryId || defaultCategory!.id,
            bankAccountId: template.bankAccountId,
            name: template.name,
            rawInput: `[Settle] ${template.name}`,
            type: template.type,
            amount: remaining,
            currency,
            amountEur,
            exchangeRate,
            date: new Date(),
            isRecurring: true,
            recurringTemplateId: id,
            description: template.description || null,
            excludeFromBudget: template.excludeFromBudget,
          },
        }),
        prisma.recurringTemplate.update({
          where: { id },
          data: { isActive: false, autoGenerate: false },
        }),
      ]);

      return NextResponse.json({ success: true, action: "settle", expense: settleExpense });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Update installment plan error:", error);
    return NextResponse.json({ error: "Failed to update installment plan" }, { status: 500 });
  }
}
