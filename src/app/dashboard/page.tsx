import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import DashboardOverview from "./overview-client";

// Disable caching to ensure fresh data on every request
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ skipUsername?: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/signin");
  }

  const params = await searchParams;

  // Check if user needs to set up username (email-only users)
  // Only prompt once - skip if they already dismissed it this session
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, name: true, seenAnnouncements: true },
  });

  if (!user?.username && params.skipUsername !== "true") {
    redirect("/auth/setup-username");
  }

  // Get user's workspace first (needed for all other queries)
  const workspace = await prisma.workspace.findFirst({
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
    },
  });

  if (!workspace) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600">No workspace found. Please contact support.</p>
      </div>
    );
  }

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
    // Current month expenses
    prisma.expense.findMany({
      where: {
        workspaceId: workspace.id,
        date: { gte: startOfMonth, lte: endOfMonth },
      },
      orderBy: { date: "desc" },
      include: {
        category: true,
        projects: true,
      },
    }),
    // Previous month expenses (for burn chart - server-side now!)
    prisma.expense.findMany({
      where: {
        workspaceId: workspace.id,
        date: { gte: startOfPrevMonth, lte: endOfPrevMonth },
      },
      orderBy: { date: "desc" },
      include: {
        category: true,
        projects: true,
      },
    }),
    // Current month income
    prisma.income.findMany({
      where: {
        workspaceId: workspace.id,
        date: { gte: startOfMonth, lte: endOfMonth },
      },
      select: { amountEur: true },
    }),
    // Recurring income for expected monthly
    prisma.income.findMany({
      where: {
        workspaceId: workspace.id,
        isRecurring: true,
      },
      select: { amountEur: true },
    }),
  ]);

  const monthlyIncome = monthlyIncomes.reduce((sum, i) => sum + Number(i.amountEur), 0);
  const expectedMonthlyIncome = recurringIncomes.reduce((sum, i) => sum + Number(i.amountEur), 0);

  // Transform expenses for client component
  const transformExpense = (e: typeof expenses[0]) => ({
    id: e.id,
    name: e.name,
    date: e.date.toISOString(),
    type: e.type,
    amountEur: Number(e.amountEur),
    categoryName: e.category?.name || "Uncategorized",
    projects: e.projects.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
    excludeFromBudget: e.excludeFromBudget,
  });

  // Use username (nickname) if set, otherwise fall back to name or "User"
  const displayName = user?.username || user?.name || session.user.name || "User";

  return (
    <DashboardOverview
      workspaceId={workspace.id}
      userName={displayName}
      initialExpenses={expenses.map(transformExpense)}
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
    />
  );
}
