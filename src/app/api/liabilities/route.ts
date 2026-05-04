import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { convertToEur } from "@/lib/currency";
import { computeLoanBalance } from "@/lib/loan-amortization";
import {
  createMonthlyTemplateForLoan,
  findCandidateTemplates,
  type AutoLinkResult,
} from "@/lib/loan-template-sync";
import {
  requireActiveWorkspace,
  requirePermission,
  WorkspaceAccessError,
} from "@/lib/workspace";

const VALID_TYPES = [
  "VEHICLE_LOAN",
  "MORTGAGE",
  "CREDIT_CARD",
  "PERSONAL_LOAN",
  "STUDENT_LOAN",
  "OTHER",
] as const;
type LiabilityType = (typeof VALID_TYPES)[number];

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

export async function GET(request: Request) {
  try {
    const { workspace } = await requireActiveWorkspace();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as LiabilityType | null;
    const status = searchParams.get("status") as LiabilityStatus | null;
    const realAssetId = searchParams.get("realAssetId");

    const where: Prisma.LiabilityWhereInput = { workspaceId: workspace.id };
    if (type && VALID_TYPES.includes(type)) where.type = type;
    if (status && VALID_STATUSES.includes(status)) where.status = status;
    if (realAssetId) where.realAssetId = realAssetId;

    const liabilities = await prisma.liability.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        realAsset: { select: { id: true, name: true, type: true } },
        recurringTemplate: { select: { id: true, name: true, amount: true } },
      },
    });

    return NextResponse.json({ liabilities });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { workspace } = await requirePermission("liability:create");

    const body = await request.json();
    const {
      type,
      name,
      currency = workspace.defaultCurrency || "EUR",
      principal,
      interestRate,
      termMonths,
      monthlyPayment,
      startDate,
      realAssetId,
      recurringTemplateId,
    } = body as Record<string, unknown>;

    if (!type || !VALID_TYPES.includes(type as LiabilityType)) {
      return NextResponse.json({ error: "Invalid liability type" }, { status: 400 });
    }
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (typeof principal !== "number" || principal <= 0) {
      return NextResponse.json({ error: "Principal must be a positive number" }, { status: 400 });
    }
    if (!startDate) {
      return NextResponse.json({ error: "Start date is required" }, { status: 400 });
    }

    // Verify ownership of optional linked asset / template.
    let linkedAsset: { id: string; name: string; vehicle: { brand: string; model: string } | null } | null = null;
    if (realAssetId && typeof realAssetId === "string") {
      linkedAsset = await prisma.realAsset.findFirst({
        where: { id: realAssetId, workspaceId: workspace.id },
        select: { id: true, name: true, vehicle: { select: { brand: true, model: true } } },
      });
      if (!linkedAsset) return NextResponse.json({ error: "Linked asset not found" }, { status: 404 });
    }
    if (recurringTemplateId && typeof recurringTemplateId === "string") {
      const owns = await prisma.recurringTemplate.findFirst({
        where: { id: recurringTemplateId, workspaceId: workspace.id },
        select: { id: true },
      });
      if (!owns) return NextResponse.json({ error: "Linked template not found" }, { status: 404 });
    }

    const { amountEur: principalEur } = await convertToEur(principal, String(currency));

    const start = new Date(String(startDate));
    const balance = computeLoanBalance({
      principal,
      interestRate: typeof interestRate === "number" ? interestRate : null,
      termMonths: typeof termMonths === "number" ? termMonths : null,
      monthlyPayment: typeof monthlyPayment === "number" ? monthlyPayment : null,
      startDate: start,
    });

    const { amountEur: currentBalanceEur } = await convertToEur(balance.currentBalance, String(currency));

    let resolvedTemplateId: string | null =
      typeof recurringTemplateId === "string" ? recurringTemplateId : null;
    let autoLink: AutoLinkResult = { mode: "none" };

    // Smart loan↔template integration only fires when the liability is asset-linked
    // AND the user didn't already pick a template themselves AND there's a payment to track.
    if (
      !resolvedTemplateId &&
      linkedAsset &&
      typeof monthlyPayment === "number" &&
      monthlyPayment > 0
    ) {
      const candidates = await findCandidateTemplates(prisma, {
        workspaceId: workspace.id,
        monthlyPayment,
        vehicleHints: {
          brand: linkedAsset.vehicle?.brand ?? null,
          model: linkedAsset.vehicle?.model ?? null,
          name: linkedAsset.name,
        },
      });

      if (candidates.length === 0) {
        const tmpl = await createMonthlyTemplateForLoan(prisma, {
          workspaceId: workspace.id,
          name: `${linkedAsset.name} loan`,
          monthlyPayment,
          currency: String(currency),
          startDate: start,
        });
        resolvedTemplateId = tmpl.id;
        autoLink = { mode: "linked", templateId: tmpl.id };
      } else {
        autoLink = { mode: "candidates", candidates };
      }
    }

    const liability = await prisma.liability.create({
      data: {
        workspaceId: workspace.id,
        type: type as LiabilityType,
        name: name.trim(),
        currency: String(currency),
        status: "ACTIVE",
        principal: new Prisma.Decimal(principal),
        principalEur: new Prisma.Decimal(principalEur),
        interestRate: typeof interestRate === "number" ? new Prisma.Decimal(interestRate) : null,
        termMonths: typeof termMonths === "number" ? termMonths : null,
        monthlyPayment: typeof monthlyPayment === "number" ? new Prisma.Decimal(monthlyPayment) : null,
        startDate: start,
        currentBalance: new Prisma.Decimal(balance.currentBalance),
        currentBalanceEur: new Prisma.Decimal(currentBalanceEur),
        realAssetId: linkedAsset ? linkedAsset.id : null,
        recurringTemplateId: resolvedTemplateId,
      },
      include: {
        realAsset: { select: { id: true, name: true, type: true } },
        recurringTemplate: { select: { id: true, name: true, amount: true } },
      },
    });

    return NextResponse.json({ liability, autoLink }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
