import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { upgradeToHierarchy } from "@/lib/default-categories";
import DashboardOverview from "./overview-client";

// Disable caching to ensure fresh data on every request
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ skipUsername?: string }>;
}) {
  const t0 = performance.now();

  const session = await auth();
  const tAuth = performance.now();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  const params = await searchParams;

  // Fetch user + workspace in parallel instead of sequentially
  const [user, workspace] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { username: true, name: true, seenAnnouncements: true },
    }),
    prisma.workspace.findFirst({
      where: {
        members: {
          some: {
            userId: session.user.id,
          },
        },
      },
      select: {
        id: true,
        monthlyBudget: true,
        monthlySalary: true,
        onboardingCompleted: true,
        currencyDisplayMode: true,
        defaultCurrency: true,
      },
    }),
  ]);

  const tUserWorkspace = performance.now();

  if (!user?.username && params.skipUsername !== "true") {
    redirect("/auth/setup-username");
  }

  if (!workspace) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600">No workspace found. Please contact support.</p>
      </div>
    );
  }

  // Silently sync any new system categories the developer has added
  try { await upgradeToHierarchy(workspace.id); } catch {}

  // Calculate date ranges
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Previous month for burn chart (fetch server-side to eliminate client waterfall)
  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const startOfPrevMonth = new Date(prevYear, prevMonth, 1);
  const endOfPrevMonth = new Date(prevYear, prevMonth + 1, 0, 23, 59, 59);

  // Run ALL queries in parallel for maximum performance
  const [
    projects,
    categories,
    bankAccounts,
    expenses,
    previousMonthExpenses,
    monthlyIncomes,
    recurringIncomes,
  ] = await Promise.all([
    // Projects for filter dropdown
    prisma.project.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Categories for add modal
    prisma.category.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Bank accounts for add modal
    prisma.bankAccount.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Current month expenses — select only needed fields
    prisma.expense.findMany({
      where: {
        workspaceId: workspace.id,
        date: { gte: startOfMonth, lte: endOfMonth },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        date: true,
        type: true,
        amount: true,
        currency: true,
        amountEur: true,
        excludeFromBudget: true,
        splitCount: true,
        createdAt: true,
        category: { select: { id: true, name: true, parentId: true, parent: { select: { id: true, name: true } } } },
        projects: { select: { id: true, name: true } },
      },
    }),
    // Previous month expenses (for burn chart) — select only needed fields
    prisma.expense.findMany({
      where: {
        workspaceId: workspace.id,
        date: { gte: startOfPrevMonth, lte: endOfPrevMonth },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        date: true,
        type: true,
        amount: true,
        currency: true,
        amountEur: true,
        excludeFromBudget: true,
        splitCount: true,
        createdAt: true,
        category: { select: { id: true, name: true, parentId: true, parent: { select: { id: true, name: true } } } },
        projects: { select: { id: true, name: true } },
      },
    }),
    // Current month income (with full details for transaction list)
    prisma.income.findMany({
      where: {
        workspaceId: workspace.id,
        date: { gte: startOfMonth, lte: endOfMonth },
      },
      select: {
        id: true,
        name: true,
        type: true,
        amount: true,
        currency: true,
        amountEur: true,
        date: true,
        isRecurring: true,
        dayOfMonth: true,
        createdAt: true,
      },
    }),
    // Recurring income for expected monthly (also used to find recurring from previous months)
    prisma.income.findMany({
      where: {
        workspaceId: workspace.id,
        isRecurring: true,
      },
      select: {
        id: true,
        name: true,
        type: true,
        amount: true,
        currency: true,
        amountEur: true,
        date: true,
        isRecurring: true,
        dayOfMonth: true,
        createdAt: true,
      },
    }),
  ]);

  const tQueries = performance.now();

  console.log(
    `[PERF] Dashboard: auth=${(tAuth - t0).toFixed(0)}ms | user+workspace=${(tUserWorkspace - tAuth).toFixed(0)}ms | 7 queries=${(tQueries - tUserWorkspace).toFixed(0)}ms | total=${(tQueries - t0).toFixed(0)}ms | expenses=${expenses.length} | prevExpenses=${previousMonthExpenses.length}`
  );

  // Include recurring incomes from previous months that should apply to current month
  // Late-month threshold: if paid on day >= 25, that salary funds NEXT month's budget
  const LATE_MONTH_THRESHOLD = 25;
  const currentMonthIncomeIds = new Set(monthlyIncomes.map((i) => i.id));
  const virtualRecurringIncomes = recurringIncomes
    .filter((i) => !currentMonthIncomeIds.has(i.id) && i.date < startOfMonth)
    .map((i) => {
      const dayOfMonth = i.dayOfMonth || 1;
      const isLateMonthPay = dayOfMonth >= LATE_MONTH_THRESHOLD;

      // For late-month pay (day >= 25), show PREVIOUS month's payday as this month's income
      // e.g., February's budget comes from January 29th salary
      let sourceMonth = now.getMonth();
      let sourceYear = now.getFullYear();

      if (isLateMonthPay) {
        sourceMonth = now.getMonth() - 1;
        if (sourceMonth < 0) {
          sourceMonth = 11;
          sourceYear = now.getFullYear() - 1;
        }
      }

      // Cap dayOfMonth to the last day of the source month
      const lastDayOfSourceMonth = new Date(sourceYear, sourceMonth + 1, 0).getDate();
      const safeDay = Math.min(dayOfMonth, lastDayOfSourceMonth);

      return {
        ...i,
        date: new Date(sourceYear, sourceMonth, safeDay),
      };
    });

  // Merge actual incomes with virtual recurring entries
  const allMonthlyIncomes = [...monthlyIncomes, ...virtualRecurringIncomes];

  const monthlyIncome = allMonthlyIncomes.reduce((sum, i) => sum + Number(i.amountEur), 0);
  const expectedMonthlyIncome = recurringIncomes.reduce((sum, i) => sum + Number(i.amountEur), 0);

  // Transform expenses for client component
  const transformExpense = (e: typeof expenses[0]) => ({
    id: e.id,
    name: e.name,
    date: e.date.toISOString(),
    type: e.type,
    amount: Number(e.amount),
    currency: e.currency,
    amountEur: Number(e.amountEur),
    categoryName: e.category?.name || "Uncategorized",
    projects: e.projects.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
    excludeFromBudget: e.excludeFromBudget,
    splitCount: e.splitCount,
    createdAt: e.createdAt.toISOString(),
  });

  // Transform incomes for client component (unified transaction format)
  const transformIncome = (i: typeof allMonthlyIncomes[0]) => ({
    id: i.id,
    name: i.name,
    date: i.date.toISOString(),
    type: "INCOME" as const,
    incomeType: i.type,
    amount: Number(i.amount),
    currency: i.currency,
    amountEur: Number(i.amountEur),
    categoryName: i.type, // Use income type as category for display
    projects: [] as { id: string; name: string }[],
    excludeFromBudget: false,
    isIncome: true as const,
    createdAt: i.createdAt.toISOString(),
  });

  // Use username (nickname) if set, otherwise fall back to name or "User"
  const displayName = user?.username || user?.name || session.user.name || "User";

  return (
    <DashboardOverview
      workspaceId={workspace.id}
      userName={displayName}
      initialExpenses={expenses.map(transformExpense)}
      initialIncomes={allMonthlyIncomes.map(transformIncome)}
      initialPreviousMonthExpenses={previousMonthExpenses.map(transformExpense)}
      projects={projects}
      categories={categories}
      bankAccounts={bankAccounts}
      initialMonth={now.getMonth()}
      initialYear={now.getFullYear()}
      monthlyBudget={workspace.monthlyBudget ? Number(workspace.monthlyBudget) : null}
      monthlySalary={workspace.monthlySalary ? Number(workspace.monthlySalary) : null}
      monthlyIncome={monthlyIncome}
      expectedMonthlyIncome={expectedMonthlyIncome}
      onboardingCompleted={workspace.onboardingCompleted}
      seenAnnouncements={user?.seenAnnouncements || []}
      currencyDisplayMode={workspace.currencyDisplayMode ?? "converted"}
      defaultCurrency={workspace.defaultCurrency ?? "EUR"}
    />
  );
}
