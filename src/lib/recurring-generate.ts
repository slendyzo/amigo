// Generate the due monthly expenses for a SINGLE recurring template, from a
// start month up to the current month (inclusive), honoring the template's
// endDate and skipping months that already have an expense from it.
//
// Used when a loan/installment is created so the first payment (and any past
// months, if the loan started earlier) appears immediately — instead of
// waiting for the dashboard's on-open generator. Scoped to one template by
// design: it never touches other templates (e.g. a manually-set-up mortgage).

import { prisma } from "./db";
import { convertToEur } from "./currency";

function monthIdx(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export async function generateDueForTemplate(
  templateId: string,
  opts?: { startDate?: Date; now?: Date },
): Promise<number> {
  const template = await prisma.recurringTemplate.findUnique({
    where: { id: templateId },
    include: { projects: { select: { id: true } } },
  });
  if (!template || !template.isActive || !template.autoGenerate) return 0;

  const now = opts?.now ?? new Date();
  const start = opts?.startDate ?? template.createdAt;
  const nowIdx = monthIdx(now);
  const startIdx = monthIdx(start);
  const endIdx = template.endDate ? monthIdx(template.endDate) : Infinity;

  // Default category (mirrors the dashboard generator).
  let defaultCategory = await prisma.category.findFirst({
    where: { workspaceId: template.workspaceId, name: "Uncategorized" },
  });
  if (!defaultCategory) {
    defaultCategory = await prisma.category.create({
      data: { workspaceId: template.workspaceId, name: "Uncategorized", isSystem: true },
    });
  }

  const amount = Number(template.amount) || 0;
  const currency = template.currency || "EUR";
  const { amountEur, exchangeRate } = await convertToEur(amount, currency);

  let created = 0;
  for (let idx = startIdx; idx <= nowIdx && idx < endIdx; idx++) {
    const y = Math.floor(idx / 12);
    const m = idx % 12;
    const monthStart = new Date(Date.UTC(y, m, 1));
    const monthEnd = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59));

    const existing = await prisma.expense.count({
      where: { recurringTemplateId: templateId, date: { gte: monthStart, lte: monthEnd } },
    });
    if (existing > 0) continue;

    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const day = Math.min(template.dayOfMonth || 1, lastDay);
    const date = new Date(Date.UTC(y, m, day));

    await prisma.expense.create({
      data: {
        workspaceId: template.workspaceId,
        categoryId: template.categoryId || defaultCategory.id,
        name: template.name,
        rawInput: `[Auto] ${template.name}`,
        type: template.type,
        amount,
        currency,
        amountEur,
        exchangeRate,
        date,
        isRecurring: true,
        recurringTemplateId: templateId,
        description: template.description || null,
        excludeFromBudget: template.excludeFromBudget,
        ...(template.projects.length > 0
          ? { projects: { connect: template.projects.map((p) => ({ id: p.id })) } }
          : {}),
      },
    });
    created++;
  }

  if (created > 0) {
    await prisma.recurringTemplate.update({
      where: { id: templateId },
      data: { lastGenerated: now },
    });
  }
  return created;
}
