// Find historical expenses that look like they should be linked to a RealAsset.
//
// Heuristic:
//   - Amount within ±€5 of monthlyPayment (when monthlyPayment is known)
//   - Name contains a vehicle keyword (brand, model, generic loan terms)
//   - Already linked to a RecurringTemplate that's now loan-linked
// Returns ranked candidates; UI prompts user to bulk-link.

import { Prisma, type PrismaClient } from "@prisma/client";

const AMOUNT_TOLERANCE_EUR = 5;
const GENERIC_KEYWORDS = ["loan", "lease", "finance", "auto", "car", "vehicle", "fuel", "gas", "petrol", "diesel"];

export type ExpenseMatchInput = {
  workspaceId: string;
  realAssetId: string;
  monthlyPayment?: number | null;
  vehicleHints: { brand?: string | null; model?: string | null; name?: string | null };
  recurringTemplateId?: string | null;
};

export type ExpenseCandidate = {
  id: string;
  name: string;
  amountEur: number;
  date: string;
  matchScore: number;
  matchReasons: string[];
};

export async function findCandidateExpenses(
  prisma: PrismaClient,
  input: ExpenseMatchInput
): Promise<ExpenseCandidate[]> {
  const { workspaceId, realAssetId, monthlyPayment, vehicleHints, recurringTemplateId } = input;
  const keywords = collectKeywords(vehicleHints);

  // Build OR conditions for the SQL query: amount-window OR template-link OR keyword.
  const orClauses: Prisma.ExpenseWhereInput[] = [];
  if (monthlyPayment != null && monthlyPayment > 0) {
    orClauses.push({
      amountEur: {
        gte: monthlyPayment - AMOUNT_TOLERANCE_EUR,
        lte: monthlyPayment + AMOUNT_TOLERANCE_EUR,
      },
    });
  }
  if (recurringTemplateId) orClauses.push({ recurringTemplateId });
  for (const kw of keywords) {
    orClauses.push({ name: { contains: kw, mode: "insensitive" } });
  }

  if (orClauses.length === 0) return [];

  const expenses = await prisma.expense.findMany({
    where: {
      workspaceId,
      // Don't suggest expenses already linked to this or another asset.
      OR: [{ realAssetId: null }, { realAssetId }],
      AND: { OR: orClauses },
    },
    select: {
      id: true,
      name: true,
      amountEur: true,
      date: true,
      recurringTemplateId: true,
    },
    orderBy: { date: "desc" },
    take: 200,
  });

  return expenses
    .map<ExpenseCandidate>((e) => {
      const reasons: string[] = [];
      let score = 0;

      if (monthlyPayment != null) {
        const delta = Math.abs(Number(e.amountEur) - monthlyPayment);
        if (delta <= AMOUNT_TOLERANCE_EUR) {
          score += 10 - delta;
          reasons.push("amount");
        }
      }
      if (recurringTemplateId && e.recurringTemplateId === recurringTemplateId) {
        score += 8;
        reasons.push("template");
      }
      const lower = e.name.toLowerCase();
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          const generic = GENERIC_KEYWORDS.includes(kw);
          score += generic ? 1 : 4;
          reasons.push(generic ? "keyword" : "model");
          break; // one keyword match is enough to count
        }
      }

      return {
        id: e.id,
        name: e.name,
        amountEur: Number(e.amountEur),
        date: e.date.toISOString(),
        matchScore: score,
        matchReasons: Array.from(new Set(reasons)),
      };
    })
    .filter((c) => c.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 50);
}

function collectKeywords(hints: ExpenseMatchInput["vehicleHints"]): string[] {
  return Array.from(
    new Set(
      [...GENERIC_KEYWORDS, hints.brand, hints.model, hints.name]
        .filter((s): s is string => typeof s === "string" && s.length > 2)
        .map((s) => s.toLowerCase())
    )
  );
}
