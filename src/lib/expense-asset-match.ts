// Find historical expenses that look like they should be linked to a RealAsset.
//
// Heuristic (per asset type):
//   - Amount within ±€5 of monthlyPayment (when monthlyPayment is known)
//   - Name contains a type-specific keyword (vehicle: brand/model/fuel/loan;
//     property: condo/IMI/utilities/water/electricity/gas etc.)
//   - Already linked to a RecurringTemplate that's now loan-linked
// Returns ranked candidates; UI prompts user to bulk-link.

import { Prisma, type PrismaClient } from "@prisma/client";

const AMOUNT_TOLERANCE_EUR = 5;

const VEHICLE_GENERIC_KEYWORDS = [
  "loan",
  "lease",
  "finance",
  "auto",
  "car",
  "vehicle",
  "fuel",
  "gas",
  "petrol",
  "diesel",
  "iuc",
];

const PROPERTY_GENERIC_KEYWORDS = [
  // EN
  "rent",
  "mortgage",
  "condo",
  "condominium",
  "utilities",
  "water",
  "electricity",
  "gas",
  "internet",
  "broadband",
  "property tax",
  "imi",
  // PT
  "renda",
  "credito habitacao",
  "crédito habitação",
  "condominio",
  "condomínio",
  "agua",
  "água",
  "luz",
  "edp",
  "galp gas",
  "natural gas",
  "gas natural",
  "gás natural",
];

export type AssetType = "VEHICLE" | "PROPERTY";

export type ExpenseMatchInput = {
  workspaceId: string;
  realAssetId: string;
  assetType: AssetType;
  monthlyPayment?: number | null;
  hints: {
    name?: string | null;
    // Vehicle
    brand?: string | null;
    model?: string | null;
    // Property
    address?: string | null;
    concelho?: string | null;
    freguesia?: string | null;
  };
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
  input: ExpenseMatchInput,
): Promise<ExpenseCandidate[]> {
  const { workspaceId, realAssetId, assetType, monthlyPayment, hints, recurringTemplateId } = input;

  const genericKeywords =
    assetType === "PROPERTY" ? PROPERTY_GENERIC_KEYWORDS : VEHICLE_GENERIC_KEYWORDS;
  const specificKeywords = collectSpecificKeywords(assetType, hints);
  const allKeywords = Array.from(new Set([...genericKeywords, ...specificKeywords]));

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
  for (const kw of allKeywords) {
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
      const specificSet = new Set(specificKeywords);
      for (const kw of allKeywords) {
        if (lower.includes(kw)) {
          const isSpecific = specificSet.has(kw);
          score += isSpecific ? 4 : 1;
          reasons.push(isSpecific ? "name" : "keyword");
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

function collectSpecificKeywords(
  assetType: AssetType,
  hints: ExpenseMatchInput["hints"],
): string[] {
  const candidates: (string | null | undefined)[] =
    assetType === "PROPERTY"
      ? [hints.name, hints.concelho, hints.freguesia, hints.address]
      : [hints.brand, hints.model, hints.name];

  return Array.from(
    new Set(
      candidates
        .filter((s): s is string => typeof s === "string" && s.length > 2)
        .map((s) => s.toLowerCase()),
    ),
  );
}
