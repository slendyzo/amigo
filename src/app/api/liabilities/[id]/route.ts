import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { convertToEur } from "@/lib/currency";
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

    const data: Prisma.LiabilityUpdateInput = {};

    if (typeof body.name === "string") data.name = body.name.trim();
    if (typeof body.currency === "string") data.currency = body.currency;
    if (typeof body.status === "string" && VALID_STATUSES.includes(body.status as LiabilityStatus)) {
      data.status = body.status as LiabilityStatus;
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

    const liability = await prisma.liability.update({
      where: { id },
      data,
      include: {
        realAsset: { select: { id: true, name: true, type: true } },
        recurringTemplate: { select: { id: true, name: true, amount: true } },
      },
    });

    return NextResponse.json({ liability });
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
