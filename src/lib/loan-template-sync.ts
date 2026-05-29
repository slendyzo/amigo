// Glue between Liability (loans) and RecurringTemplate (monthly auto-payments).
//
// When a financed asset is added we want:
//   - either link the loan to an existing recurring template the user already has
//     (don't create duplicates),
//   - or auto-create a new template for the monthly payment.
//
// We do this by surfacing candidate matches from the workspace, with light fuzzy
// matching on amount + keyword. The actual link decision happens in the UI.

import type { Prisma, PrismaClient, RecurringTemplate } from "@prisma/client";

const AMOUNT_TOLERANCE_EUR = 5;
const GENERIC_KEYWORDS = ["loan", "lease", "finance", "auto", "car", "vehicle", "credito", "credit"];

export type TemplateMatchInput = {
  workspaceId: string;
  monthlyPayment: number;
  vehicleHints?: { brand?: string | null; model?: string | null; name?: string | null };
};

export type TemplateMatchCandidate = {
  id: string;
  name: string;
  amount: number | null;
  matchScore: number;
};

export type AutoLinkResult =
  | { mode: "none" }
  | { mode: "linked"; templateId: string }
  | { mode: "candidates"; candidates: TemplateMatchCandidate[] };

export async function findCandidateTemplates(
  tx: Pick<PrismaClient, "recurringTemplate">,
  input: TemplateMatchInput
): Promise<TemplateMatchCandidate[]> {
  const candidates = await tx.recurringTemplate.findMany({
    where: {
      workspaceId: input.workspaceId,
      isActive: true,
      // Templates already linked to another loan are excluded.
      liabilities: { none: {} },
      // Amount filter (when amount is set on the template).
      OR: [
        { amount: null },
        {
          amount: {
            gte: input.monthlyPayment - AMOUNT_TOLERANCE_EUR,
            lte: input.monthlyPayment + AMOUNT_TOLERANCE_EUR,
          },
        },
      ],
    },
    select: { id: true, name: true, amount: true },
  });

  const keywords = collectKeywords(input.vehicleHints);
  return candidates
    .map((c) => ({
      id: c.id,
      name: c.name,
      amount: c.amount ? Number(c.amount) : null,
      matchScore: scoreCandidate(c, input.monthlyPayment, keywords),
    }))
    .filter((c) => c.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);
}

export async function createMonthlyTemplateForLoan(
  tx: Pick<PrismaClient, "recurringTemplate">,
  args: {
    workspaceId: string;
    name: string;
    monthlyPayment: number;
    currency: string;
    startDate: Date;
    bankAccountId?: string | null;
    // Fixed-term plans (e.g. 6× installments) stop generating after this date.
    endDate?: Date | null;
  }
): Promise<RecurringTemplate> {
  const dayOfMonth = args.startDate.getUTCDate();
  const nextDue = nextMonthlyDue(args.startDate);

  const data: Prisma.RecurringTemplateUncheckedCreateInput = {
    workspaceId: args.workspaceId,
    name: args.name,
    type: "SURVIVAL_FIXED",
    amount: args.monthlyPayment,
    currency: args.currency,
    interval: "MONTHLY",
    dayOfMonth,
    bankAccountId: args.bankAccountId ?? null,
    autoGenerate: true,
    isActive: true,
    nextDue,
    endDate: args.endDate ?? null,
  };

  return tx.recurringTemplate.create({ data });
}

function collectKeywords(hints: TemplateMatchInput["vehicleHints"]): string[] {
  const words = [
    ...GENERIC_KEYWORDS,
    hints?.brand,
    hints?.model,
    hints?.name,
  ]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .map((s) => s.toLowerCase());
  return Array.from(new Set(words));
}

function scoreCandidate(
  template: { name: string; amount: Prisma.Decimal | null },
  monthlyPayment: number,
  keywords: string[]
): number {
  let score = 0;
  const name = template.name.toLowerCase();

  if (template.amount != null) {
    const delta = Math.abs(Number(template.amount) - monthlyPayment);
    if (delta <= AMOUNT_TOLERANCE_EUR) score += 10 - delta; // tighter match = higher score
  }

  for (const kw of keywords) {
    if (name.includes(kw)) {
      // Brand/model/asset-name matches are stronger signal than generic words.
      const generic = GENERIC_KEYWORDS.includes(kw);
      score += generic ? 1 : 4;
    }
  }

  return score;
}

function nextMonthlyDue(startDate: Date): Date {
  const now = new Date();
  const day = startDate.getUTCDate();
  let next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
  if (next <= now) {
    next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, day));
  }
  return next;
}
