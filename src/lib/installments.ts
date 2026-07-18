// Installment plans ("pagamento em parcelas", e.g. a €600 phone in 12x).
//
// A plan is a fixed-term RecurringTemplate: installmentTotal split over
// installmentMonths, with startDate as the first-payment anchor and
// endDate = startDate + installmentMonths months so the existing generators
// stop on their own. template.amount holds the rounded monthly share; the
// FINAL installment absorbs the rounding remainder so the parts always sum
// exactly to the total (600/12 → 12×50.00; 100/3 → 33.33+33.33+33.34).

import { prisma } from "./db";
import { generateDueForTemplate } from "./recurring-generate";
import { monthlyInstallment } from "./installment-math";

export { monthlyInstallment, installmentAmount } from "./installment-math";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CreateInstallmentPlanArgs {
  workspaceId: string;
  name: string;
  totalAmount: number;
  months: number; // >= 2
  currency: string;
  startDate: Date; // first installment date; day-of-month drives later ones
  type?: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT" | "INVESTMENT";
  categoryId?: string | null;
  bankAccountId?: string | null;
  description?: string | null;
  projectIds?: string[];
  excludeFromBudget?: boolean;
}

// Creates the plan template and immediately generates every installment due
// so far (installment 1 on startDate; more if startDate is in the past).
export async function createInstallmentPlan(args: CreateInstallmentPlanArgs) {
  const start = args.startDate;
  const endDate = new Date(Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth() + args.months,
    start.getUTCDate()
  ));

  const template = await prisma.recurringTemplate.create({
    data: {
      workspaceId: args.workspaceId,
      name: args.name,
      type: args.type ?? "LIFESTYLE",
      amount: monthlyInstallment(args.totalAmount, args.months),
      currency: args.currency,
      description: args.description ?? null,
      interval: "MONTHLY",
      dayOfMonth: start.getUTCDate(),
      autoGenerate: true,
      isActive: true,
      startDate: start,
      endDate,
      installmentTotal: args.totalAmount,
      installmentMonths: args.months,
      categoryId: args.categoryId ?? null,
      bankAccountId: args.bankAccountId ?? null,
      excludeFromBudget: args.excludeFromBudget ?? false,
      ...(args.projectIds && args.projectIds.length > 0
        ? { projects: { connect: args.projectIds.map((id) => ({ id })) } }
        : {}),
    },
  });

  const generated = await generateDueForTemplate(template.id, { startDate: start });
  return { template, generated };
}

// Paid-so-far progress for a plan, in the plan's own currency.
export async function getInstallmentProgress(templateId: string) {
  const [template, agg, firstDue] = await Promise.all([
    prisma.recurringTemplate.findUnique({ where: { id: templateId } }),
    prisma.expense.aggregate({
      where: { recurringTemplateId: templateId },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.expense.count({
      where: { recurringTemplateId: templateId, installmentNumber: { not: null } },
    }),
  ]);
  if (!template || !template.installmentMonths || !template.installmentTotal) return null;

  const total = Number(template.installmentTotal);
  const paidAmount = round2(Number(agg._sum.amount ?? 0));
  return {
    templateId,
    name: template.name,
    currency: template.currency,
    months: template.installmentMonths,
    totalAmount: total,
    monthlyAmount: monthlyInstallment(total, template.installmentMonths),
    paidCount: firstDue,
    paidAmount,
    remainingAmount: round2(Math.max(0, total - paidAmount)),
    isActive: template.isActive,
    startDate: template.startDate,
    endDate: template.endDate,
  };
}
