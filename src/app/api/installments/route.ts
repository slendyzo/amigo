import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { createInstallmentPlan, monthlyInstallment } from "@/lib/installments";
import { stripHtmlTags } from "@/lib/utils";

const VALID_TYPES = ["SURVIVAL_FIXED", "SURVIVAL_VARIABLE", "LIFESTYLE", "PROJECT", "INVESTMENT"] as const;
type PlanType = (typeof VALID_TYPES)[number];

// POST - Create an installment plan ("12x") and generate every installment due so far
export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const body = await request.json();
    const {
      name,
      totalAmount,
      months,
      startDate,
      type,
      categoryId,
      bankAccountId,
      currency,
      description,
      projectIds,
      excludeFromBudget,
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const total = Number(totalAmount);
    if (!Number.isFinite(total) || total <= 0) {
      return NextResponse.json({ error: "Total amount must be a positive number" }, { status: 400 });
    }
    const numMonths = Number(months);
    if (!Number.isInteger(numMonths) || numMonths < 2 || numMonths > 120) {
      return NextResponse.json({ error: "Months must be between 2 and 120" }, { status: 400 });
    }
    const start = startDate ? new Date(startDate) : new Date();
    if (isNaN(start.getTime())) {
      return NextResponse.json({ error: "Invalid start date" }, { status: 400 });
    }
    const planType: PlanType = VALID_TYPES.includes(type) ? type : "LIFESTYLE";

    const { template, generated } = await createInstallmentPlan({
      workspaceId: workspace.id,
      name: stripHtmlTags(name.trim(), 255),
      totalAmount: total,
      months: numMonths,
      currency: currency || workspace.defaultCurrency || "EUR",
      startDate: start,
      type: planType,
      categoryId: categoryId || null,
      bankAccountId: bankAccountId || null,
      description: description ? stripHtmlTags(description, 500) : null,
      projectIds: Array.isArray(projectIds) ? projectIds : [],
      excludeFromBudget: Boolean(excludeFromBudget),
    });

    return NextResponse.json(
      {
        plan: template,
        generated,
        monthlyAmount: monthlyInstallment(total, numMonths),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create installment plan error:", error);
    return NextResponse.json({ error: "Failed to create installment plan" }, { status: 500 });
  }
}
