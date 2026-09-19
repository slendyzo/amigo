import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { convertToEur } from "@/lib/currency";
import { debtSchedule } from "@/lib/debt-schedule";
import { generateDueForTemplate } from "@/lib/recurring-generate";
import { computeLoanBalance } from "@/lib/loan-amortization";
import {
  requireActiveWorkspace,
  requirePermission,
  WorkspaceAccessError,
} from "@/lib/workspace";

const VALID_STATUSES = ["ACTIVE", "PAID_OFF", "DEFAULTED"] as const;
type LiabilityStatus = (typeof VALID_STATUSES)[number];

function errorResponse(error: unknown) {
  if (error instanceof WorkspaceAccessError) {
    const status = error.code === "UNAUTHORIZED" ? 401 : 403;
    return NextResponse.json({ error: error.message }, { status });
  }
  console.error("Liability API error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspace } = await requireActiveWorkspace();
    const { id } = await params;

    const liability = await prisma.liability.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        realAsset: { select: { id: true, name: true, type: true } },
        recurringTemplate: { select: { id: true, name: true, amount: true } },
      },
    });

    if (!liability) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ liability });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspace } = await requirePermission("liability:update");
    const { id } = await params;

    const existing = await prisma.liability.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;

    for (const field of ["principal", "monthlyPayment", "interestRate", "termMonths"] as const) {
      const value = body[field];
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value)
        || (field === "interestRate" ? value < 0 : value <= 0)
        || (field === "termMonths" && (!Number.isInteger(value) || value > 1200)))) {
        return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
      }
    }
    if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (body.startDate !== undefined && (typeof body.startDate !== "string"
      || !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
      || !Number.isFinite(new Date(body.startDate).getTime())
      || new Date(body.startDate).toISOString().slice(0, 10) !== body.startDate)) {
      return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
    }

    const data: Prisma.LiabilityUpdateInput = {};

    if (typeof body.name === "string") data.name = body.name.trim();
    if (typeof body.currency === "string") data.currency = body.currency;
    if (typeof body.status === "string" && VALID_STATUSES.includes(body.status as LiabilityStatus)) {
      data.status = body.status as LiabilityStatus;
    }

    // Allow linking/unlinking a recurring template. Validates ownership and
    // that the target template isn't already attached to a different loan.
    if (body.recurringTemplateId === null) {
      data.recurringTemplate = { disconnect: true };
    } else if (typeof body.recurringTemplateId === "string") {
      const tmpl = await prisma.recurringTemplate.findFirst({
        where: { id: body.recurringTemplateId, workspaceId: workspace.id },
        select: { id: true, liabilities: { select: { id: true }, take: 1 } },
      });
      if (!tmpl) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }
      const linkedToOther = tmpl.liabilities[0] && tmpl.liabilities[0].id !== id;
      if (linkedToOther) {
        return NextResponse.json(
          { error: "Template already linked to another liability" },
          { status: 409 },
        );
      }
      data.recurringTemplate = { connect: { id: body.recurringTemplateId } };
    }

    if (typeof body.interestRate === "number") data.interestRate = new Prisma.Decimal(body.interestRate);
    if (typeof body.termMonths === "number") data.termMonths = body.termMonths;
    if (typeof body.monthlyPayment === "number")
      data.monthlyPayment = new Prisma.Decimal(body.monthlyPayment);
    if (typeof body.startDate === "string") data.startDate = new Date(body.startDate);

    if (typeof body.principal === "number" && body.principal > 0) {
      const currency = (typeof body.currency === "string" ? body.currency : existing.currency) ?? "EUR";
      const { amountEur } = await convertToEur(body.principal, currency);
      data.principal = new Prisma.Decimal(body.principal);
      data.principalEur = new Prisma.Decimal(amountEur);
    }

    // Recompute current balance with whatever ends up being effective.
    const merged = {
      firstPaymentAtStart: existing.type === "INSTALLMENT",
      principal: typeof body.principal === "number" ? body.principal : Number(existing.principal),
      interestRate:
        typeof body.interestRate === "number" ? body.interestRate : existing.interestRate ? Number(existing.interestRate) : null,
      termMonths: typeof body.termMonths === "number" ? body.termMonths : existing.termMonths,
      monthlyPayment:
        typeof body.monthlyPayment === "number"
          ? body.monthlyPayment
          : existing.monthlyPayment
            ? Number(existing.monthlyPayment)
            : null,
      startDate: typeof body.startDate === "string" ? new Date(body.startDate) : existing.startDate,
    };

    const balance = computeLoanBalance(merged);
    const currency = (typeof body.currency === "string" ? body.currency : existing.currency) ?? "EUR";
    const { amountEur: balanceEur } = await convertToEur(balance.currentBalance, currency);
    data.currentBalance = new Prisma.Decimal(balance.currentBalance);
    data.currentBalanceEur = new Prisma.Decimal(balanceEur);

    // Commit the debt, its future schedule and any missing payments together.
    // Existing payment dates and amounts remain available for individual edits.
    const result = await prisma.$transaction(async (tx) => {
      const liability = await tx.liability.update({
        where: { id }, data,
        include: {
          realAsset: { select: { id: true, name: true, type: true } },
          recurringTemplate: { select: { id: true, name: true, amount: true } },
        },
      });
      let generatedExpenses = 0;
      if (liability.recurringTemplateId) {
        const scheduleChanged = body.startDate !== undefined || body.termMonths !== undefined;
        const updates: Prisma.RecurringTemplateUpdateInput = {};
        if (typeof body.name === "string") updates.name = body.name.trim();
        if (typeof body.monthlyPayment === "number") updates.amount = body.monthlyPayment;
        if (scheduleChanged) Object.assign(updates, debtSchedule(liability.startDate, liability.termMonths));
        if (Object.keys(updates).length) {
          await tx.recurringTemplate.update({ where: { id: liability.recurringTemplateId }, data: updates });
        }
        if (scheduleChanged && liability.status === "ACTIVE") {
          generatedExpenses = await generateDueForTemplate(liability.recurringTemplateId,
            { startDate: liability.startDate }, tx);
        }
      }
      return { liability, generatedExpenses };
    }, { timeout: 30000 });

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { workspace } = await requirePermission("liability:delete");
    const { id } = await params;

    const existing = await prisma.liability.findFirst({
      where: { id, workspaceId: workspace.id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.liability.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
