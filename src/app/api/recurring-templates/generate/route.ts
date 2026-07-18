import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { convertToEur } from "@/lib/currency";
import { installmentAmount } from "@/lib/installment-math";

// GET - Auto-generate expenses for templates with autoGenerate=true for current month
export async function GET() {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const now = new Date();
    const targetMonth = now.getMonth();
    const targetYear = now.getFullYear();

    // Get templates with autoGenerate enabled
    const templates = await prisma.recurringTemplate.findMany({
      where: {
        workspaceId: workspace.id,
        isActive: true,
        autoGenerate: true,
      },
      include: {
        projects: { select: { id: true } },
      },
    });

    if (templates.length === 0) {
      return NextResponse.json({
        success: true,
        generated: 0,
        message: "No auto-generate templates found",
      });
    }

    // Check for existing expenses from these templates in the current month
    const startOfMonth = new Date(targetYear, targetMonth, 1);
    const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

    const existingExpenses = await prisma.expense.findMany({
      where: {
        workspaceId: workspace.id,
        recurringTemplateId: { in: templates.map((t) => t.id) },
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      select: {
        recurringTemplateId: true,
      },
    });

    const existingTemplateIds = new Set(
      existingExpenses.map((e) => e.recurringTemplateId)
    );

    // Get default category
    let defaultCategory = await prisma.category.findFirst({
      where: { workspaceId: workspace.id, name: "Uncategorized" },
    });

    if (!defaultCategory) {
      defaultCategory = await prisma.category.create({
        data: { workspaceId: workspace.id, name: "Uncategorized", isSystem: true },
      });
    }

    // Generate expenses for templates that don't have one for this month
    const expensesToCreate = [];

    for (const template of templates) {
      if (existingTemplateIds.has(template.id)) {
        continue;
      }

      // Fixed-term plans (e.g. 6× installments) stop generating once the target
      // month reaches the template's endDate month. endDate = startDate +
      // termMonths, so payments span exactly termMonths months.
      if (template.endDate && monthIndexReached(targetYear, targetMonth, template.endDate)) {
        continue;
      }

      // Future-start plans wait for their first month.
      if (template.startDate && monthIndexNotStarted(targetYear, targetMonth, template.startDate)) {
        continue;
      }

      // Use day 1 for auto-generated expenses (they get created at month start)
      const dayOfMonth = template.dayOfMonth || 1;
      const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
      const expenseDay = Math.min(dayOfMonth, lastDayOfMonth);
      const expenseDate = new Date(targetYear, targetMonth, expenseDay);

      // Convert template amount to EUR
      const { installmentNumber, amount: installmentMonthAmount } = installmentForMonth(template, targetYear, targetMonth);
      const templateAmount = installmentMonthAmount ?? (Number(template.amount) || 0);
      const templateCurrency = template.currency || "EUR";
      const { amountEur, exchangeRate } = await convertToEur(templateAmount, templateCurrency);

      expensesToCreate.push({
        installmentNumber,
        workspaceId: workspace.id,
        categoryId: template.categoryId || defaultCategory.id,
        name: template.name,
        rawInput: `[Auto] ${template.name}`,
        type: template.type,
        amount: templateAmount,
        currency: templateCurrency,
        amountEur,
        exchangeRate,
        date: expenseDate,
        isRecurring: true,
        recurringTemplateId: template.id,
        description: template.description || null,
        excludeFromBudget: template.excludeFromBudget,
        projectIds: template.projects.map((p) => p.id),
      });
    }

    let generated = 0;

    if (expensesToCreate.length > 0) {
      // Use individual creates within a transaction to support project connections
      const createdExpenses = await prisma.$transaction(
        expensesToCreate.map((expense) => {
          const { projectIds, ...expenseData } = expense;
          return prisma.expense.create({
            data: {
              ...expenseData,
              ...(projectIds.length > 0
                ? { projects: { connect: projectIds.map((id: string) => ({ id })) } }
                : {}),
            },
          });
        })
      );
      generated = createdExpenses.length;

      // Update lastGenerated for templates
      const generatedTemplateIds = expensesToCreate.map((e) => e.recurringTemplateId);
      await prisma.recurringTemplate.updateMany({
        where: { id: { in: generatedTemplateIds.filter((id): id is string => id !== null) } },
        data: { lastGenerated: new Date() },
      });
    }

    return NextResponse.json({
      success: true,
      generated,
      message: generated > 0
        ? `Auto-generated ${generated} expense(s) for this month`
        : "All auto-generate templates already have expenses for this month",
    });
  } catch (error) {
    console.error("Auto-generate expenses error:", error);
    return NextResponse.json({ error: "Failed to auto-generate expenses" }, { status: 500 });
  }
}

// True once the target month is at or past the template's endDate month —
// i.e. the fixed-term plan has finished. Compared as year*12+month so it's
// independent of day-of-month and timezone drift.
function monthIndexReached(targetYear: number, targetMonth: number, endDate: Date): boolean {
  const end = new Date(endDate);
  const endIdx = end.getFullYear() * 12 + end.getMonth();
  const targetIdx = targetYear * 12 + targetMonth;
  return targetIdx >= endIdx;
}

// True while the target month is before the template's startDate month —
// future-start plans (e.g. installments beginning next month) must not
// generate early.
function monthIndexNotStarted(targetYear: number, targetMonth: number, startDate: Date): boolean {
  const start = new Date(startDate);
  const startIdx = start.getUTCFullYear() * 12 + start.getUTCMonth();
  return targetYear * 12 + targetMonth < startIdx;
}

// Installment plans: 1-based position of the target month in the plan, and the
// amount for that position (final installment absorbs the rounding remainder).
function installmentForMonth(
  template: { installmentTotal: unknown; installmentMonths: number | null; startDate: Date | null },
  targetYear: number,
  targetMonth: number
): { installmentNumber: number | null; amount: number | null } {
  if (!template.installmentMonths || !template.installmentTotal || !template.startDate) {
    return { installmentNumber: null, amount: null };
  }
  const start = new Date(template.startDate);
  const startIdx = start.getUTCFullYear() * 12 + start.getUTCMonth();
  const n = targetYear * 12 + targetMonth - startIdx + 1;
  if (n < 1 || n > template.installmentMonths) return { installmentNumber: null, amount: null };
  return {
    installmentNumber: n,
    amount: installmentAmount(Number(template.installmentTotal), template.installmentMonths, n),
  };
}

// POST - Generate expenses from templates for a given month
export async function POST(request: Request) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;

    const body = await request.json();
    const { month, year, templateIds, templateOverrides } = body;

    // Default to current month if not specified
    const targetMonth = month !== undefined ? month : new Date().getMonth();
    const targetYear = year !== undefined ? year : new Date().getFullYear();

    // Build a map of day overrides if provided
    const dayOverrideMap = new Map<string, number | null>();
    if (templateOverrides && Array.isArray(templateOverrides)) {
      for (const override of templateOverrides) {
        dayOverrideMap.set(override.id, override.dayOverride);
      }
    }

    // Get templates to generate from
    const whereClause: {
      workspaceId: string;
      isActive: boolean;
      id?: { in: string[] };
    } = {
      workspaceId: workspace.id,
      isActive: true,
    };

    // If template overrides provided, only use those template IDs
    if (templateOverrides && templateOverrides.length > 0) {
      whereClause.id = { in: templateOverrides.map((o: { id: string }) => o.id) };
    } else if (templateIds && templateIds.length > 0) {
      // Legacy: If specific template IDs provided, only use those
      whereClause.id = { in: templateIds };
    }

    const templates = await prisma.recurringTemplate.findMany({
      where: whereClause,
      include: {
        category: true,
        projects: { select: { id: true } },
      },
    });

    if (templates.length === 0) {
      return NextResponse.json({
        success: true,
        generated: 0,
        skipped: 0,
        message: "No active templates found",
      });
    }

    // Get default category
    let defaultCategory = await prisma.category.findFirst({
      where: { workspaceId: workspace.id, name: "Uncategorized" },
    });

    if (!defaultCategory) {
      defaultCategory = await prisma.category.create({
        data: { workspaceId: workspace.id, name: "Uncategorized", isSystem: true },
      });
    }

    // Check for existing expenses from these templates in the target month
    const startOfMonth = new Date(targetYear, targetMonth, 1);
    const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

    const existingExpenses = await prisma.expense.findMany({
      where: {
        workspaceId: workspace.id,
        recurringTemplateId: { in: templates.map((t) => t.id) },
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      select: {
        recurringTemplateId: true,
      },
    });

    const existingTemplateIds = new Set(
      existingExpenses.map((e) => e.recurringTemplateId)
    );

    // Generate expenses for templates that don't have one for this month
    const expensesToCreate = [];
    let skipped = 0;

    for (const template of templates) {
      if (existingTemplateIds.has(template.id)) {
        skipped++;
        continue;
      }

      // Fixed-term plans stop once the target month reaches the endDate month.
      if (template.endDate && monthIndexReached(targetYear, targetMonth, template.endDate)) {
        skipped++;
        continue;
      }

      // Future-start plans wait for their first month.
      if (template.startDate && monthIndexNotStarted(targetYear, targetMonth, template.startDate)) {
        skipped++;
        continue;
      }

      // Calculate the expense date (using override, template dayOfMonth, or 1st of month)
      let dayOfMonth = template.dayOfMonth || 1;

      // Check if there's an override for this template
      if (dayOverrideMap.has(template.id)) {
        const override = dayOverrideMap.get(template.id);
        if (override !== null && override !== undefined) {
          dayOfMonth = override;
        }
        // If override is null/undefined, use template default (already set above)
      }

      const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
      const expenseDay = Math.min(dayOfMonth, lastDayOfMonth);
      const expenseDate = new Date(targetYear, targetMonth, expenseDay);

      // Convert template amount to EUR
      const { installmentNumber, amount: installmentMonthAmount } = installmentForMonth(template, targetYear, targetMonth);
      const templateAmount = installmentMonthAmount ?? (Number(template.amount) || 0);
      const templateCurrency = template.currency || "EUR";
      const { amountEur, exchangeRate } = await convertToEur(templateAmount, templateCurrency);

      expensesToCreate.push({
        installmentNumber,
        workspaceId: workspace.id,
        categoryId: template.categoryId || defaultCategory.id,
        name: template.name,
        rawInput: `[Recurring] ${template.name}`,
        type: template.type,
        amount: templateAmount,
        currency: templateCurrency,
        amountEur,
        exchangeRate,
        date: expenseDate,
        isRecurring: true,
        recurringTemplateId: template.id,
        description: template.description || null,
        excludeFromBudget: template.excludeFromBudget,
        projectIds: template.projects.map((p) => p.id),
      });
    }

    let generated = 0;

    if (expensesToCreate.length > 0) {
      // Use individual creates within a transaction to support project connections
      const createdExpenses = await prisma.$transaction(
        expensesToCreate.map((expense) => {
          const { projectIds, ...expenseData } = expense;
          return prisma.expense.create({
            data: {
              ...expenseData,
              ...(projectIds.length > 0
                ? { projects: { connect: projectIds.map((id: string) => ({ id })) } }
                : {}),
            },
          });
        })
      );
      generated = createdExpenses.length;

      // Update lastGenerated for templates
      const generatedTemplateIds = expensesToCreate.map((e) => e.recurringTemplateId);
      await prisma.recurringTemplate.updateMany({
        where: { id: { in: generatedTemplateIds.filter((id): id is string => id !== null) } },
        data: { lastGenerated: new Date() },
      });
    }

    const monthName = new Date(targetYear, targetMonth, 1).toLocaleString("default", {
      month: "long",
      year: "numeric",
    });

    return NextResponse.json({
      success: true,
      generated,
      skipped,
      month: monthName,
      message:
        generated > 0
          ? `Generated ${generated} expense(s) for ${monthName}`
          : skipped > 0
          ? `All templates already have expenses for ${monthName}`
          : "No expenses to generate",
    });
  } catch (error) {
    console.error("Generate expenses error:", error);
    return NextResponse.json({ error: "Failed to generate expenses" }, { status: 500 });
  }
}
