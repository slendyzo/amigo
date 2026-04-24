import { NextResponse } from "next/server";
import { getActiveWorkspace } from "@/lib/workspace";
import { prisma } from "@/lib/db";
import { effectiveEur } from "@/lib/split-utils";

// GET - Get project wrapped stats
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getActiveWorkspace();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = context;
    const { id } = await params;

    // Get project
    const project = await prisma.project.findFirst({
      where: { id, workspaceId: workspace.id },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Get all expenses for this project
    const expenses = await prisma.expense.findMany({
      where: {
        projects: { some: { id } },
      },
      include: {
        category: true,
      },
      orderBy: { date: "asc" },
    });

    if (expenses.length === 0) {
      return NextResponse.json({
        wrapped: {
          projectName: project.name,
          totalSpent: 0,
          expenseCount: 0,
          budgetUsage: project.budget ? 0 : null,
          topCategories: [],
          monthlyBreakdown: [],
          dateRange: null,
          highestExpense: null,
          averageExpense: 0,
        },
      });
    }

    // All totals use the user's share on split expenses, not the full bill.
    const shares = new Map(expenses.map((exp) => [exp.id, effectiveEur(exp)]));
    const shareOf = (id: string) => shares.get(id) ?? 0;

    const totalSpent = expenses.reduce((sum, exp) => sum + shareOf(exp.id), 0);

    const budgetUsage = project.budget
      ? (totalSpent / Number(project.budget)) * 100
      : null;

    const categoryTotals: Record<string, { name: string; total: number; count: number }> = {};
    for (const expense of expenses) {
      const categoryName = expense.category?.name || "Uncategorized";
      if (!categoryTotals[categoryName]) {
        categoryTotals[categoryName] = { name: categoryName, total: 0, count: 0 };
      }
      categoryTotals[categoryName].total += shareOf(expense.id);
      categoryTotals[categoryName].count += 1;
    }
    const topCategories = Object.values(categoryTotals)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((cat) => ({
        name: cat.name,
        total: cat.total,
        count: cat.count,
        percentage: totalSpent > 0 ? (cat.total / totalSpent) * 100 : 0,
      }));

    const monthlyTotals: Record<string, { month: string; total: number; count: number }> = {};
    for (const expense of expenses) {
      const date = new Date(expense.date);
      const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const monthLabel = date.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
      if (!monthlyTotals[monthKey]) {
        monthlyTotals[monthKey] = { month: monthLabel, total: 0, count: 0 };
      }
      monthlyTotals[monthKey].total += shareOf(expense.id);
      monthlyTotals[monthKey].count += 1;
    }
    const monthlyBreakdown = Object.entries(monthlyTotals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, data]) => data);

    const firstExpense = expenses[0];
    const lastExpense = expenses[expenses.length - 1];
    const dateRange = {
      start: firstExpense.date,
      end: lastExpense.date,
    };

    const highestExpense = expenses.reduce(
      (max, exp) => (shareOf(exp.id) > shareOf(max.id) ? exp : max),
      expenses[0]
    );

    const averageExpense = totalSpent / expenses.length;

    return NextResponse.json({
      wrapped: {
        projectName: project.name,
        totalSpent,
        expenseCount: expenses.length,
        budgetUsage,
        budget: project.budget ? Number(project.budget) : null,
        topCategories,
        monthlyBreakdown,
        dateRange,
        highestExpense: {
          name: highestExpense.name,
          amount: shareOf(highestExpense.id),
          date: highestExpense.date,
        },
        averageExpense,
      },
    });
  } catch (error) {
    console.error("Get project wrapped error:", error);
    return NextResponse.json(
      { error: "Failed to fetch project wrapped stats" },
      { status: 500 }
    );
  }
}
