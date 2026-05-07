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
        <p className="text-ink-soft">No workspace found. Please contact support.</p>
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

  // 12 months ago (start of) — for the Painel B income/expense bars
  const startOf12mAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  // Same month, previous year — for YoY delta on the saldo do mês
  const startOfYearAgoSameMonth = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const endOfYearAgoSameMonth = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0, 23, 59, 59);

  // Run ALL queries in parallel for maximum performance
  const [
    projects,
    categories,
    bankAccounts,
    expenses,
    previousMonthExpenses,
    monthlyIncomes,
    recurringIncomes,
    exchangeConnections,
    portfolioAssets,
    // Painel B — net-worth right column: property + vehicle + liabilities totals
    realAssets,
    liabilities,
    // Painel B — 12-month bars: aggregated income + expense for the last 12 months
    last12mExpenses,
    last12mIncomes,
    // Painel B — YoY delta: same-calendar-month one year ago
    yearAgoSameMonthExpenses,
    yearAgoSameMonthIncomes,
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
        amountExpression: true,
        excludeFromBudget: true,
        splitCount: true,
        splitData: true,
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
        amountExpression: true,
        excludeFromBudget: true,
        splitCount: true,
        splitData: true,
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
    // Exchange connections (for portfolio conditional display)
    prisma.exchangeConnection.findMany({
      where: { workspaceId: workspace.id, isActive: true },
      select: {
        id: true,
        provider: true,
        label: true,
        freeCash: true,
        freeCashCurrency: true,
        _count: { select: { assets: true } },
      },
    }),
    // Portfolio assets (top 5 by value for dashboard)
    prisma.portfolioAsset.findMany({
      where: {
        exchangeConnection: { workspaceId: workspace.id, isActive: true },
      },
      orderBy: { currentValueEur: "desc" },
      take: 5,
      select: {
        id: true,
        symbol: true,
        name: true,
        assetType: true,
        quantity: true,
        averageBuyPriceEur: true,
        currentPriceEur: true,
        currentValueEur: true,
        totalCostEur: true,
        unrealizedPnlEur: true,
        unrealizedPnlPct: true,
        currency: true,
        exchangeConnection: {
          select: { provider: true, label: true },
        },
      },
    }),
    // Real-world assets (active, with current value) — split into property + vehicle on the client side
    prisma.realAsset.findMany({
      where: { workspaceId: workspace.id, status: "ACTIVE" },
      select: { type: true, currentValueEur: true, purchasePriceEur: true },
    }),
    // Active liabilities for net-worth offset
    prisma.liability.findMany({
      where: { workspaceId: workspace.id, status: "ACTIVE" },
      select: { currentBalanceEur: true },
    }),
    // 12-month expenses aggregation (raw — group in JS to avoid raw SQL)
    prisma.expense.findMany({
      where: {
        workspaceId: workspace.id,
        date: { gte: startOf12mAgo, lte: endOfMonth },
      },
      select: { date: true, amountEur: true, excludeFromBudget: true },
    }),
    // 12-month incomes aggregation
    prisma.income.findMany({
      where: {
        workspaceId: workspace.id,
        date: { gte: startOf12mAgo, lte: endOfMonth },
      },
      select: { date: true, amountEur: true },
    }),
    // YoY: same calendar month one year ago — expenses
    prisma.expense.findMany({
      where: {
        workspaceId: workspace.id,
        date: { gte: startOfYearAgoSameMonth, lte: endOfYearAgoSameMonth },
      },
      select: { amountEur: true, excludeFromBudget: true },
    }),
    // YoY: same calendar month one year ago — incomes
    prisma.income.findMany({
      where: {
        workspaceId: workspace.id,
        date: { gte: startOfYearAgoSameMonth, lte: endOfYearAgoSameMonth },
      },
      select: { amountEur: true },
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
    amountExpression: e.amountExpression || null,
    categoryName: e.category?.name || "Uncategorized",
    projects: e.projects.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
    excludeFromBudget: e.excludeFromBudget,
    splitCount: e.splitCount,
    splitData: e.splitData,
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

  // Transform portfolio data for client (Decimal → number)
  const connectionsForDashboard = exchangeConnections.map((c) => ({
    id: c.id,
    provider: c.provider,
    label: c.label,
    freeCash: c.freeCash !== null ? Number(c.freeCash) : 0,
    freeCashCurrency: c.freeCashCurrency ?? "EUR",
    assetCount: c._count.assets,
  }));

  const assetsForDashboard = portfolioAssets.map((a) => ({
    id: a.id,
    symbol: a.symbol,
    name: a.name,
    assetType: a.assetType,
    quantity: Number(a.quantity),
    averageBuyPriceEur: Number(a.averageBuyPriceEur),
    currentPriceEur: Number(a.currentPriceEur),
    currentValueEur: Number(a.currentValueEur),
    totalCostEur: Number(a.totalCostEur),
    unrealizedPnlEur: Number(a.unrealizedPnlEur),
    unrealizedPnlPct: Number(a.unrealizedPnlPct),
    currency: a.currency,
    exchange: {
      provider: a.exchangeConnection.provider,
      label: a.exchangeConnection.label,
    },
  }));

  // ---- Painel B: net-worth right column totals ----
  const propertyTotalEur = realAssets
    .filter((a) => a.type === "PROPERTY")
    .reduce((s, a) => s + Number(a.currentValueEur ?? a.purchasePriceEur), 0);
  const vehiclesTotalEur = realAssets
    .filter((a) => a.type === "VEHICLE")
    .reduce((s, a) => s + Number(a.currentValueEur ?? a.purchasePriceEur), 0);
  const liabilitiesTotalEur = liabilities.reduce(
    (s, l) => s + Number(l.currentBalanceEur),
    0,
  );

  // ---- Painel B: 12-month income/expense aggregation ----
  // Build a map keyed by "YYYY-MM" from the raw rows, then materialize the
  // last 12 months in order so the client doesn't have to know the calendar.
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
  const monthlyMap = new Map<string, { income: number; expense: number }>();
  const ensure = (key: string) => {
    if (!monthlyMap.has(key)) monthlyMap.set(key, { income: 0, expense: 0 });
    return monthlyMap.get(key)!;
  };
  for (const e of last12mExpenses) {
    if (e.excludeFromBudget) continue;
    ensure(monthKey(e.date)).expense += Number(e.amountEur);
  }
  for (const i of last12mIncomes) {
    ensure(monthKey(i.date)).income += Number(i.amountEur);
  }
  const monthlyAggregates: { year: number; month: number; income: number; expense: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const y = new Date(now.getFullYear(), now.getMonth() - i, 1).getFullYear();
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1).getMonth();
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const cell = monthlyMap.get(key) ?? { income: 0, expense: 0 };
    monthlyAggregates.push({
      year: y,
      month: m,
      income: Math.round(cell.income * 100) / 100,
      expense: Math.round(cell.expense * 100) / 100,
    });
  }

  // ---- Painel B: YoY delta (same calendar month, previous year) ----
  const yearAgoExpensesTotal = yearAgoSameMonthExpenses
    .filter((e) => !e.excludeFromBudget)
    .reduce((s, e) => s + Number(e.amountEur), 0);
  const yearAgoIncomesTotal = yearAgoSameMonthIncomes.reduce(
    (s, i) => s + Number(i.amountEur),
    0,
  );

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
      exchangeConnections={connectionsForDashboard}
      portfolioAssets={assetsForDashboard}
      propertyTotalEur={propertyTotalEur}
      vehiclesTotalEur={vehiclesTotalEur}
      liabilitiesTotalEur={liabilitiesTotalEur}
      monthlyAggregates={monthlyAggregates}
      yearAgoExpensesTotal={yearAgoExpensesTotal}
      yearAgoIncomesTotal={yearAgoIncomesTotal}
    />
  );
}
