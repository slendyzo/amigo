import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { convertToEur } from "@/lib/currency";
import { installmentAmount } from "@/lib/installment-math";
import { parseRecurringMonths, recurringDate, recurringMonthAllowed, recurringMonthIndex, recurringMonthKey } from "@/lib/recurring-months";

type Selection = { ids?: string[]; days: Map<string, number | null> };
function parseSelection(body: Record<string, unknown>, required: boolean): Selection {
  const days = new Map<string, number | null>();
  let ids: string[] | undefined;
  if (body.templateOverrides !== undefined) {
    if (!Array.isArray(body.templateOverrides)) throw new Error("Invalid template selection");
    ids = body.templateOverrides.map((override: unknown) => {
      if (!override || typeof override !== "object" || !("id" in override) || typeof override.id !== "string" || !override.id.trim()) throw new Error("Invalid template selection");
      const day = "dayOverride" in override ? override.dayOverride : null;
      if (day !== null && day !== undefined && (typeof day !== "number" || !Number.isInteger(day) || day < 1 || day > 31)) throw new Error("Payment day must be between 1 and 31");
      days.set(override.id, day == null ? null : day as number);
      return override.id;
    });
  } else if (body.templateIds !== undefined) {
    if (!Array.isArray(body.templateIds) || body.templateIds.some((id) => typeof id !== "string" || !id.trim())) throw new Error("Invalid template selection");
    ids = body.templateIds as string[];
  }
  if ((required && !ids?.length) || (ids && ids.length === 0)) throw new Error("Select at least one recurring payment");
  return { ids: ids ? [...new Set(ids)] : undefined, days };
}

async function generate(workspaceId: string, months: string[], selection: Selection, automatic: boolean) {
  const where = { workspaceId, isActive: true, ...(automatic ? { autoGenerate: true } : {}), ...(selection.ids ? { id: { in: selection.ids } } : {}) };
  const templates = await prisma.recurringTemplate.findMany({ where, include: { projects: { select: { id: true } } } });
  // Resolve FX before holding a write transaction. Historical entries retain the
  // existing generator's current-rate conversion behavior.
  const rates = new Map<string, number>();
  await Promise.all([...new Set(templates.map((t) => t.currency || "EUR"))].map(async (currency) => {
    rates.set(currency, (await convertToEur(1, currency)).exchangeRate);
  }));
  return prisma.$transaction(async (tx) => {
    // Shared by GET and POST, across app instances; released on commit or rollback.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`recurring:${workspaceId}`}))::text`;
    if (!templates.length) return { generated: 0, skipped: 0 };
    const first = recurringDate(months[0], 1);
    const last = recurringDate(months[months.length - 1], 1);
    const afterLast = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1));
    const existing = await tx.expense.findMany({
      where: { workspaceId, recurringTemplateId: { in: templates.map((t) => t.id) }, date: { gte: first, lt: afterLast } },
      select: { recurringTemplateId: true, date: true },
    });
    const occupied = new Set(existing.map((expense) => `${expense.recurringTemplateId}:${recurringMonthKey(expense.date)}`));
    let defaultCategoryId: string | null = null;
    let generated = 0;
    let skipped = 0;
    const generatedIds = new Set<string>();
    for (const template of templates) {
      for (const month of months) {
        if (occupied.has(`${template.id}:${month}`) || !recurringMonthAllowed(month, template.startDate, template.endDate)) { skipped++; continue; }
        let installmentNumber: number | null = null;
        let amount = Number(template.amount) || 0;
        if (template.installmentMonths) {
          if (!template.startDate || template.installmentTotal == null) { skipped++; continue; }
          installmentNumber = recurringMonthIndex(month) - recurringMonthIndex(recurringMonthKey(template.startDate)) + 1;
          if (installmentNumber < 1 || installmentNumber > template.installmentMonths) { skipped++; continue; }
          amount = installmentAmount(Number(template.installmentTotal), template.installmentMonths, installmentNumber);
        }
        if (!template.categoryId && !defaultCategoryId) {
          const category = await tx.category.findFirst({ where: { workspaceId, name: "Uncategorized" } }) ?? await tx.category.create({ data: { workspaceId, name: "Uncategorized", isSystem: true } });
          defaultCategoryId = category.id;
        }
        const currency = template.currency || "EUR";
        const exchangeRate = rates.get(currency)!;
        await tx.expense.create({ data: {
          workspaceId, categoryId: template.categoryId || defaultCategoryId, bankAccountId: template.bankAccountId,
          name: template.name, rawInput: `[${automatic ? "Auto" : "Recurring"}] ${template.name}`,
          type: template.type, amount, currency, amountEur: Number((amount * exchangeRate).toFixed(2)), exchangeRate,
          date: recurringDate(month, selection.days.get(template.id) ?? template.dayOfMonth ?? 1),
          isRecurring: true, recurringTemplateId: template.id, installmentNumber,
          description: template.description || null, excludeFromBudget: template.excludeFromBudget,
          ...(template.projects.length ? { projects: { connect: template.projects.map((p) => ({ id: p.id })) } } : {}),
        } });
        generated++;
        generatedIds.add(template.id);
      }
    }
    if (generatedIds.size) await tx.recurringTemplate.updateMany({ where: { workspaceId, id: { in: [...generatedIds] } }, data: { lastGenerated: new Date() } });
    return { generated, skipped };
  }, { maxWait: 10000, timeout: 60000 });
}

export async function GET() {
  try {
    const context = await getActiveWorkspace();
    if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const months = [recurringMonthKey(new Date())];
    const result = await generate(context.workspace.id, months, { days: new Map() }, true);
    return NextResponse.json({ success: true, ...result, months, message: result.generated ? `Auto-generated ${result.generated} expense(s) for this month` : "No missing automatic payments for this month" });
  } catch (error) {
    console.error("Auto-generate expenses error:", error);
    return NextResponse.json({ error: "Failed to auto-generate expenses" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    let months: string[];
    let selection: Selection;
    try {
      const body: unknown = await request.json();
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request");
      const parsed = parseRecurringMonths(body as Record<string, unknown>);
      months = parsed.months;
      selection = parseSelection(body as Record<string, unknown>, parsed.backfill);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
    }
    const result = await generate(context.workspace.id, months, selection, false);
    const month = months.length === 1 ? recurringDate(months[0], 1).toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" }) : undefined;
    return NextResponse.json({ success: true, ...result, months, month, message: result.generated ? `Generated ${result.generated} expense(s) across ${months.length} month(s)` : "No missing eligible payments for the selected months" });
  } catch (error) {
    console.error("Generate expenses error:", error);
    return NextResponse.json({ error: "Failed to generate expenses" }, { status: 500 });
  }
}
