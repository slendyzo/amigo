"use client";

import { useState, useEffect, useMemo, lazy, Suspense, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import type { Expense as FullExpense } from "@/types/models";
import { getUserShare } from "@/lib/split-utils";

// Lazy load heavy modals to keep the bundle small
const AddTypeSelector = lazy(() => import("@/components/add-type-selector"));
const EditExpenseModal = lazy(() => import("@/components/edit-expense-modal"));
const ExpenseDetailModal = lazy(() => import("@/components/expense-detail-modal"));
const OnboardingModal = lazy(() => import("@/components/onboarding-modal"));
const AnnouncementModal = lazy(() => import("@/components/announcement-modal"));
const AdvisorColdstartCard = lazy(() => import("@/components/advisor-coldstart-card"));
const RetrospectiveModal = lazy(() => import("@/components/retrospective-modal"));

type Expense = {
  id: string;
  name: string;
  date: string;
  type: string;
  amount: number;
  currency: string;
  amountEur: number;
  amountExpression?: string | null;
  categoryName: string;
  parentCategoryName?: string;
  projects: { id: string; name: string }[];
  excludeFromBudget?: boolean;
  status?: "PAID" | "PENDING";
  splitCount?: number | null;
  splitData?: string | null;
  createdAt: string;
};

type Income = {
  id: string;
  name: string;
  date: string;
  type: "INCOME";
  incomeType: string;
  amount: number;
  currency: string;
  amountEur: number;
  categoryName: string;
  projects: { id: string; name: string }[];
  excludeFromBudget: boolean;
  isIncome: true;
  createdAt: string;
};

type DashboardExchangeConnection = {
  id: string;
  provider: string;
  label: string;
  freeCash: number;
  freeCashCurrency: string;
  assetCount: number;
};

type DashboardPortfolioAsset = {
  id: string;
  symbol: string;
  name: string;
  assetType: string;
  quantity: number;
  averageBuyPriceEur: number;
  currentPriceEur: number;
  currentValueEur: number;
  totalCostEur: number;
  unrealizedPnlEur: number;
  unrealizedPnlPct: number;
  currency: string;
  exchange: { provider: string; label: string };
};

type Project = { id: string; name: string };
type Category = { id: string; name: string };
type BankAccount = { id: string; name: string };

type Props = {
  workspaceId: string;
  userName: string;
  initialExpenses: Expense[];
  initialIncomes: Income[];
  initialPreviousMonthExpenses: Expense[];
  projects: Project[];
  categories: Category[];
  bankAccounts: BankAccount[];
  initialMonth: number;
  initialYear: number;
  monthlyBudget: number | null;
  monthlySalary: number | null;
  monthlyIncome: number;
  expectedMonthlyIncome: number;
  onboardingCompleted: boolean;
  seenAnnouncements: string[];
  currencyDisplayMode: string;
  defaultCurrency: string;
  exchangeConnections: DashboardExchangeConnection[];
  portfolioAssets: DashboardPortfolioAsset[];
  // Painel B — net-worth right column
  propertyTotalEur: number;
  vehiclesTotalEur: number;
  liabilitiesTotalEur: number;
  // Painel B — 12-month income/expense bars (oldest → newest, current month last)
  monthlyAggregates: { year: number; month: number; income: number; expense: number }[];
  // Painel B — YoY delta (same calendar month, previous year)
  yearAgoExpensesTotal: number;
  yearAgoIncomesTotal: number;
};

// Current announcement IDs
const CURRENT_ANNOUNCEMENTS = ["unified-transactions-v1", "workspaces-v1", "scheduled-expenses-v1", "category-groups-v1"];

const MONTH_KEYS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
] as const;

const MONTH_SHORT_PT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

type ViewMode = "month" | "quarter" | "year" | "all";

// Forest & Bracket category palette (CSS vars)
const CATEGORY_PALETTE = [
  "var(--cat-forest)",
  "var(--cat-ochre)",
  "var(--cat-clay)",
  "var(--cat-bronze)",
  "var(--cat-sage)",
  "var(--cat-plum)",
  "var(--cat-rust)",
  "var(--cat-fog)",
  "var(--cat-moss-d)",
  "var(--cat-stone)",
];

// PT-style currency: "1.842,30" (period thousands, comma decimal)
function formatPT(value: number, decimals = 2): { whole: string; cents: string } {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return { whole: sign + withThousands, cents: decPart || "00" };
}

// PT short currency line e.g. "€1.842,30"
function fmtMoney(value: number, decimals = 2): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimals > 0 ? `${sign}€${withThousands},${decPart}` : `${sign}€${withThousands}`;
}

const isIncomeTransaction = (t: Expense | Income): t is Income => {
  return "isIncome" in t && t.isIncome === true;
};

export default function DashboardOverview({
  userName,
  initialExpenses,
  initialIncomes,
  initialPreviousMonthExpenses,
  projects,
  categories,
  bankAccounts,
  initialMonth,
  initialYear,
  monthlyBudget,
  monthlySalary,
  monthlyIncome: _monthlyIncomeProp,
  expectedMonthlyIncome,
  onboardingCompleted,
  seenAnnouncements,
  currencyDisplayMode: _currencyDisplayMode,
  defaultCurrency: _defaultCurrency,
  exchangeConnections,
  portfolioAssets,
  propertyTotalEur,
  vehiclesTotalEur,
  liabilitiesTotalEur,
  monthlyAggregates,
  yearAgoExpensesTotal,
  yearAgoIncomesTotal,
}: Props) {
  const router = useRouter();
  const t = useTranslations("dashboard");
  const tPainel = useTranslations("painel");
  const tTime = useTranslations("time");
  const { translateCategory } = useCategoryTranslation();

  // Modal state
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<{
    id: string;
    name: string;
    amount: number;
    currency?: string;
    type: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT" | "INVESTMENT";
    date: string;
    category: { id: string; name: string } | null;
    bankAccount: { id: string; name: string } | null;
    projects: { id: string; name: string }[];
    excludeFromBudget?: boolean;
    status?: "PAID" | "PENDING";
    splitCount?: number | null;
    splitData?: string | null;
    description?: string;
  } | null>(null);
  const [viewingExpense, setViewingExpense] = useState<FullExpense | null>(null);

  // Data
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [incomes, setIncomes] = useState<Income[]>(initialIncomes);
  const [previousMonthExpenses, setPreviousMonthExpenses] = useState<Expense[]>(initialPreviousMonthExpenses);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Filters
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(initialMonth / 3) + 1);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [hasFilterChanged, setHasFilterChanged] = useState(false);

  // Advisor + retrospective
  const [advisorState, setAdvisorState] = useState<{
    aiProcessingEnabled: boolean;
    isColdstart: boolean;
    expenseCount: number;
    monthsTracked: number;
  } | null>(null);
  type UnreadInsight = {
    id: string;
    periodYear: number;
    periodMonth: number;
    content: { headline: string; observations: [string, string, string]; momHighlights: Array<{ category: string; currentTotal: number; prevTotal: number; pctChange: number }> };
    readAt: string | null;
  };
  const [unreadRetro, setUnreadRetro] = useState<UnreadInsight | null>(null);
  const [showRetro, setShowRetro] = useState(false);

  // Onboarding + announcements
  const [showOnboarding, setShowOnboarding] = useState(!onboardingCompleted);
  const unseenAnnouncement = CURRENT_ANNOUNCEMENTS.find((id) => !seenAnnouncements.includes(id));
  const [showAnnouncement, setShowAnnouncement] = useState(onboardingCompleted && !!unseenAnnouncement);
  const [currentAnnouncementId, setCurrentAnnouncementId] = useState<string | null>(
    onboardingCompleted && unseenAnnouncement ? unseenAnnouncement : null
  );

  const handleOnboardingClose = () => {
    setShowOnboarding(false);
    if (unseenAnnouncement) {
      setCurrentAnnouncementId(unseenAnnouncement);
      setShowAnnouncement(true);
    }
  };

  const livingBudget = monthlyBudget || expectedMonthlyIncome || 2000;

  // Sync server data on refresh
  useEffect(() => {
    if (!hasFilterChanged) {
      setExpenses(initialExpenses);
      setIncomes(initialIncomes);
      setPreviousMonthExpenses(initialPreviousMonthExpenses);
    }
  }, [initialExpenses, initialIncomes, initialPreviousMonthExpenses, hasFilterChanged]);

  // Quick-add bridge (from sidebar / FAB / shortcut)
  useEffect(() => {
    const handleQuickAdd = (e: Event) => {
      e.stopImmediatePropagation();
      setIsSelectorOpen(true);
    };
    window.addEventListener("openQuickAdd", handleQuickAdd);
    return () => window.removeEventListener("openQuickAdd", handleQuickAdd);
  }, []);

  // Initial side-effects: recurring autogen + advisor state + retrospective
  useEffect(() => {
    const autoGenerateRecurring = async () => {
      try {
        const response = await fetch("/api/recurring-templates/generate");
        const data = await response.json();
        if (data.generated > 0) router.refresh();
      } catch (err) {
        console.error("Auto-generate recurring expenses failed:", err);
      }
    };
    autoGenerateRecurring();

    const fetchAdvisorState = async () => {
      try {
        const [stateRes, retroRes] = await Promise.all([
          fetch("/api/user/advisor-state"),
          fetch("/api/insights/retrospective"),
        ]);
        if (stateRes.ok) {
          const data = await stateRes.json();
          setAdvisorState(data);
        }
        if (retroRes.ok) {
          const retro = await retroRes.json();
          if (retro && retro.id) {
            setUnreadRetro(retro);
            const timer = setTimeout(() => setShowRetro(true), 600);
            return () => clearTimeout(timer);
          }
        }
      } catch { /* non-critical */ }
    };
    fetchAdvisorState();
  }, [router]);

  // Re-fetch on filter change
  useEffect(() => {
    if (!hasFilterChanged) return;
    if (viewMode === "month") {
      fetchBothMonths();
    } else {
      fetchExpenses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, selectedMonth, selectedYear, selectedQuarter, selectedProjectId, hasFilterChanged]);

  const transformExpense = (e: {
    id: string;
    name: string;
    date: string;
    type: string;
    amountEur?: number;
    amount?: number;
    currency?: string;
    amountExpression?: string | null;
    category?: { name: string; parent?: { name: string } | null } | null;
    projects?: { id: string; name: string }[];
    excludeFromBudget?: boolean;
    status?: "PAID" | "PENDING";
    splitCount?: number | null;
    splitData?: string | null;
    createdAt?: string;
  }): Expense => ({
    id: e.id,
    name: e.name,
    date: e.date,
    type: e.type,
    amount: Number(e.amount ?? 0),
    currency: e.currency || "EUR",
    amountEur: Number(e.amountEur ?? e.amount ?? 0),
    amountExpression: e.amountExpression || null,
    categoryName: e.category?.name || "Uncategorized",
    parentCategoryName: e.category?.parent?.name || e.category?.name || "Uncategorized",
    projects: e.projects || [],
    excludeFromBudget: e.excludeFromBudget ?? false,
    status: e.status || "PAID",
    splitCount: e.splitCount || null,
    splitData: e.splitData || null,
    createdAt: e.createdAt || e.date,
  });

  const fetchExpenses = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      let startDate: Date;
      let endDate: Date;
      switch (viewMode) {
        case "month":
          startDate = new Date(selectedYear, selectedMonth, 1);
          endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
          break;
        case "quarter": {
          const quarterStartMonth = (selectedQuarter - 1) * 3;
          startDate = new Date(selectedYear, quarterStartMonth, 1);
          endDate = new Date(selectedYear, quarterStartMonth + 3, 0, 23, 59, 59);
          break;
        }
        case "year":
          startDate = new Date(selectedYear, 0, 1);
          endDate = new Date(selectedYear, 11, 31, 23, 59, 59);
          break;
        case "all":
        default:
          startDate = new Date(2000, 0, 1);
          endDate = new Date(2100, 11, 31);
      }
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: "500",
      });
      if (selectedProjectId) params.set("projectId", selectedProjectId);

      const [expensesRes, incomesRes] = await Promise.all([
        fetch(`/api/expenses?${params}`),
        fetch(`/api/incomes?month=${startDate.getMonth()}&year=${startDate.getFullYear()}`),
      ]);
      const [expensesData, incomesData] = await Promise.all([expensesRes.json(), incomesRes.json()]);
      if (expensesData.expenses) setExpenses(expensesData.expenses.map(transformExpense));
      if (incomesData.incomes) {
        setIncomes(incomesData.incomes.map((i: {
          id: string; name: string; date: string; type: string;
          amountEur?: number; amount?: number; currency?: string; createdAt?: string;
        }) => ({
          id: i.id, name: i.name, date: i.date,
          type: "INCOME" as const, incomeType: i.type,
          amount: Number(i.amount ?? 0),
          currency: i.currency || "EUR",
          amountEur: Number(i.amountEur ?? i.amount ?? 0),
          categoryName: i.type, projects: [], excludeFromBudget: false,
          isIncome: true as const, createdAt: i.createdAt || i.date,
        })));
      } else {
        setIncomes([]);
      }
    } catch (err) {
      console.error("Failed to fetch expenses:", err);
      setLoadError(tPainel("error.body"));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBothMonths = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      let prevMonth = selectedMonth - 1;
      let prevYear = selectedYear;
      if (prevMonth < 0) { prevMonth = 11; prevYear -= 1; }
      const currentStartDate = new Date(selectedYear, selectedMonth, 1);
      const currentEndDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
      const prevStartDate = new Date(prevYear, prevMonth, 1);
      const prevEndDate = new Date(prevYear, prevMonth + 1, 0, 23, 59, 59);

      const currentParams = new URLSearchParams({
        startDate: currentStartDate.toISOString(),
        endDate: currentEndDate.toISOString(),
        limit: "500",
      });
      const prevParams = new URLSearchParams({
        startDate: prevStartDate.toISOString(),
        endDate: prevEndDate.toISOString(),
        limit: "500",
      });
      if (selectedProjectId) currentParams.set("projectId", selectedProjectId);

      const [currentRes, prevRes, incomesRes] = await Promise.all([
        fetch(`/api/expenses?${currentParams}`),
        fetch(`/api/expenses?${prevParams}`),
        fetch(`/api/incomes?month=${selectedMonth}&year=${selectedYear}`),
      ]);
      const [currentData, prevData, incomesData] = await Promise.all([
        currentRes.json(), prevRes.json(), incomesRes.json(),
      ]);
      if (currentData.expenses) setExpenses(currentData.expenses.map(transformExpense));
      if (prevData.expenses) setPreviousMonthExpenses(prevData.expenses.map(transformExpense));
      if (incomesData.incomes) {
        setIncomes(incomesData.incomes.map((i: {
          id: string; name: string; date: string; type: string;
          amountEur?: number; amount?: number; currency?: string; createdAt?: string;
        }) => ({
          id: i.id, name: i.name, date: i.date,
          type: "INCOME" as const, incomeType: i.type,
          amount: Number(i.amount ?? 0),
          currency: i.currency || "EUR",
          amountEur: Number(i.amountEur ?? i.amount ?? 0),
          categoryName: i.type, projects: [], excludeFromBudget: false,
          isIncome: true as const, createdAt: i.createdAt || i.date,
        })));
      } else {
        setIncomes([]);
      }
    } catch (err) {
      console.error("Failed to fetch expenses:", err);
      setLoadError(tPainel("error.body"));
    } finally {
      setIsLoading(false);
    }
  };

  // EUR per expense, accounting for splits
  const effectiveEur = useCallback((e: Expense) => {
    if (e.splitCount && e.splitCount > 1) {
      const share = getUserShare(e.splitCount, e.splitData);
      if (share !== null && e.amount !== 0) {
        return e.amountEur * (share / e.amount);
      }
      return e.amountEur / e.splitCount;
    }
    return e.amountEur;
  }, []);

  // Aggregates
  const currentMonthIncome = useMemo(() => incomes.reduce((sum, i) => sum + i.amountEur, 0), [incomes]);

  const expenseStats = useMemo(() => {
    const totalExpenses = expenses
      .filter((e) => !e.excludeFromBudget)
      .reduce((sum, e) => sum + effectiveEur(e), 0);
    const pending = expenses
      .filter((e) => e.status === "PENDING")
      .reduce((sum, e) => sum + effectiveEur(e), 0);
    const balance = currentMonthIncome - totalExpenses;
    return { totalExpenses, pending, balance };
  }, [expenses, effectiveEur, currentMonthIncome]);

  // Net worth roll-up (cash + assets + property + vehicles - liabilities)
  // We currently have portfolio data from props; cash/property/vehicles/liabs not in dashboard payload.
  // Render only what we have so the panel still feels grounded.
  const portfolioTotalValue = portfolioAssets.reduce((sum, a) => sum + a.currentValueEur, 0);
  const portfolioFreeCash = exchangeConnections.reduce((sum, c) => sum + c.freeCash, 0);
  // Cash + Portfolio + Property + Vehicles − Liabilities
  const netWorthApprox =
    portfolioTotalValue +
    portfolioFreeCash +
    propertyTotalEur +
    vehiclesTotalEur -
    liabilitiesTotalEur;

  // Category donut data (top 10)
  const categoryDonut = useMemo(() => {
    const map = new Map<string, number>();
    expenses
      .filter((e) => !e.excludeFromBudget && e.amountEur >= 0)
      .forEach((e) => {
        const raw = e.parentCategoryName || e.categoryName;
        const name = raw ? translateCategory(raw) : t("uncategorized");
        map.set(name, (map.get(name) || 0) + effectiveEur(e));
      });
    const sorted = Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
    const total = sorted.reduce((s, c) => s + c.amount, 0);
    return sorted.slice(0, 10).map((c, i) => ({
      ...c,
      percentage: total > 0 ? (c.amount / total) * 100 : 0,
      color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
      total,
    }));
  }, [expenses, t, translateCategory, effectiveEur]);

  const donutTotal = categoryDonut.reduce((s, c) => s + c.amount, 0);

  // 30-day cashflow series (cumulative net per day, current view month or last 30 days)
  const cashflow30 = useMemo(() => {
    const now = new Date();
    const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
    const start = new Date(selectedYear, selectedMonth, 1);
    const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const todayDay = isCurrentMonth ? now.getDate() : lastDay;

    // Build daily net (income - expenses), then cumulative
    const dailyNet: number[] = Array(lastDay).fill(0);
    expenses.forEach((e) => {
      if (e.excludeFromBudget) return;
      const d = new Date(e.date);
      if (d.getMonth() !== selectedMonth || d.getFullYear() !== selectedYear) return;
      const idx = d.getDate() - 1;
      if (idx >= 0 && idx < lastDay) dailyNet[idx] -= effectiveEur(e);
    });
    incomes.forEach((i) => {
      const d = new Date(i.date);
      if (d.getMonth() !== selectedMonth || d.getFullYear() !== selectedYear) return;
      const idx = d.getDate() - 1;
      if (idx >= 0 && idx < lastDay) dailyNet[idx] += i.amountEur;
    });

    let running = 0;
    const points = dailyNet.map((v, i) => {
      running += v;
      const day = i + 1;
      return { day, label: `${String(day).padStart(2, "0")} ${MONTH_SHORT_PT[selectedMonth]}`, value: running, isFuture: isCurrentMonth && day > todayDay };
    });
    return { points, todayDay, lastDay, start, monthLabel: MONTH_SHORT_PT[selectedMonth] };
  }, [expenses, incomes, selectedMonth, selectedYear, effectiveEur]);

  // 12-month rolling income vs expense bars (need to reconstruct from current data only)
  // The server doesn't pass us 12 months of data, so we approximate: only show this/prev month real,
  // others zero. The mock has fake demo data — we keep the bar grid but only fill the months we know.
  const months12 = useMemo(() => {
    // monthlyAggregates is server-provided, oldest → newest. The last entry is
    // the current month, which we override with the live client-side totals so
    // the bar updates as the user adds/removes expenses without a re-fetch.
    return monthlyAggregates.map((cell, i) => {
      const isCurrent = i === monthlyAggregates.length - 1;
      const income = isCurrent ? currentMonthIncome : cell.income;
      const expense = isCurrent ? expenseStats.totalExpenses : cell.expense;
      return {
        key: `${cell.year}-${cell.month}`,
        label: MONTH_SHORT_PT[cell.month],
        income,
        expense,
        isCurrent,
      };
    });
  }, [monthlyAggregates, currentMonthIncome, expenseStats.totalExpenses]);

  const max12 = useMemo(() => {
    const m = Math.max(
      ...months12.map((b) => Math.max(b.income, b.expense)),
      livingBudget,
      1,
    );
    return Math.ceil(m / 500) * 500;
  }, [months12, livingBudget]);

  // Recent transactions (8)
  const recentTransactions = useMemo(() => {
    const all: (Expense | Income)[] = [...expenses, ...incomes];
    return all
      .sort((a, b) => {
        const d = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (d !== 0) return d;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .slice(0, 8);
  }, [expenses, incomes]);

  // Saldo do mês YoY delta — this month's saldo vs same calendar month one year ago.
  // isUp = saldo grew (more money this year, paint moss).
  // isUp = false = saldo shrank (less money, paint crimson).
  const balanceDelta = useMemo(() => {
    const yearAgoSaldo = yearAgoIncomesTotal - yearAgoExpensesTotal;
    if (yearAgoSaldo === 0 && yearAgoIncomesTotal === 0 && yearAgoExpensesTotal === 0) {
      return null; // No prior-year data → no comparison possible.
    }
    const thisSaldo = expenseStats.balance;
    const denom = Math.abs(yearAgoSaldo) || 1;
    const diff = thisSaldo - yearAgoSaldo;
    const pct = (diff / denom) * 100;
    return { pct, isUp: diff >= 0 };
  }, [expenseStats.balance, yearAgoIncomesTotal, yearAgoExpensesTotal]);

  // Expense actions
  const handleExpenseCreated = useCallback((expense: {
    id: string; name: string; date: string; type: string;
    amount: number; currency: string; amountEur: number;
    categoryName: string;
    projects: { id: string; name: string }[];
    excludeFromBudget: boolean;
    splitCount: number | null; splitData: string | null;
    status: string; createdAt: string;
  }) => {
    setExpenses((prev) => [
      {
        id: expense.id,
        name: expense.name,
        date: expense.date,
        type: expense.type,
        amount: expense.amount,
        currency: expense.currency,
        amountEur: expense.amountEur,
        categoryName: expense.categoryName,
        projects: expense.projects,
        excludeFromBudget: expense.excludeFromBudget,
        splitCount: expense.splitCount,
        splitData: expense.splitData,
        status: expense.status as "PAID" | "PENDING",
        createdAt: expense.createdAt,
      },
      ...prev,
    ]);
  }, []);

  const handleViewExpense = async (expenseId: string) => {
    try {
      const response = await fetch(`/api/expenses/${expenseId}`);
      if (response.ok) {
        const data = await response.json();
        setViewingExpense(data.expense);
      }
    } catch (err) {
      console.error("Failed to fetch expense:", err);
    }
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setHasFilterChanged(true);
    setViewMode(mode);
  };

  const goToPreviousMonth = useCallback(() => {
    setHasFilterChanged(true);
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  }, [selectedMonth]);

  const goToNextMonth = useCallback(() => {
    const now = new Date();
    const atCurrent = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
    if (atCurrent) return;
    setHasFilterChanged(true);
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  }, [selectedMonth, selectedYear]);

  const now = new Date();
  const isAtCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
  const monthName = tTime(`months.${MONTH_KEYS[selectedMonth]}`);

  // ---------- Donut maths ----------
  const donutSize = 180;
  const donutRadius = 76;
  const donutThickness = 18;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const donutSlices = useMemo(() => {
    if (donutTotal <= 0) return [];
    const gap = 1.5;
    let offset = 0;
    return categoryDonut.map((c) => {
      const len = (c.amount / donutTotal) * donutCircumference;
      const slice = { ...c, len, offset };
      offset += len + gap;
      return slice;
    });
  }, [categoryDonut, donutTotal, donutCircumference]);

  // ---------- Cashflow path maths ----------
  const cashflowPath = useMemo(() => {
    const w = 720;
    const h = 180;
    const padL = 50;
    const padR = 10;
    const padT = 10;
    const padB = 30;
    const usableW = w - padL - padR;
    const usableH = h - padT - padB;

    const points = cashflow30.points;
    if (points.length === 0) {
      return { w, h, padL, padR, padT, padB, usableW, usableH, line: "", area: "", todayX: padL, zeroY: h - padB };
    }
    const max = Math.max(...points.map((p) => p.value), 0);
    const min = Math.min(...points.map((p) => p.value), 0);
    const range = max - min || 1;
    const zeroY = padT + (max / range) * usableH;
    const stepX = usableW / Math.max(points.length - 1, 1);
    const todayIdx = Math.max(cashflow30.todayDay - 1, 0);
    const todayX = padL + todayIdx * stepX;

    const visiblePoints = points.filter((p) => !p.isFuture);
    if (visiblePoints.length === 0) {
      return { w, h, padL, padR, padT, padB, usableW, usableH, line: "", area: "", todayX, zeroY };
    }
    const linePts = visiblePoints.map((p, i) => {
      const x = padL + i * stepX;
      const y = padT + ((max - p.value) / range) * usableH;
      return { x, y };
    });
    const line = linePts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area =
      `M ${linePts[0].x.toFixed(1)} ${zeroY.toFixed(1)} ` +
      linePts.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") +
      ` L ${linePts[linePts.length - 1].x.toFixed(1)} ${zeroY.toFixed(1)} Z`;

    return { w, h, padL, padR, padT, padB, usableW, usableH, line, area, todayX, zeroY };
  }, [cashflow30]);

  // ---------- Loading / empty / error early branches ----------
  const isEmpty = !isLoading && !loadError && expenses.length === 0 && incomes.length === 0;

  return (
    <div>
      {/* ==================== PAGE HEAD ==================== */}
      <header className="flex flex-col gap-4 border-b border-rule pb-5 mb-6 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-gilt-deep">
            {tPainel("eyebrow", { month: monthName.toUpperCase(), year: selectedYear }).toUpperCase()}
          </span>
          <h1 className="font-display font-light text-[32px] md:text-[36px] leading-[1.05] tracking-[-0.02em] text-ink m-0">
            {tPainel("greeting", { name: userName })}
          </h1>
          <p className="text-[13px] text-ink-mute max-w-[540px]">{tPainel("sub")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* View toggle */}
          <div className="flex gap-1 p-1 bg-paper-deep border border-rule rounded-full">
            {(["month", "quarter", "year"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleViewModeChange(mode)}
                className={`px-3 py-1 text-[11px] font-mono tracking-[0.06em] uppercase rounded-full transition-colors duration-200 ${
                  viewMode === mode
                    ? "bg-forest text-paper"
                    : "text-ink-mute hover:text-ink"
                }`}
              >
                {t(`viewModes.${mode}`)}
              </button>
            ))}
          </div>

          {/* Month nav (only in month view) */}
          {viewMode === "month" && (
            <div className="flex items-center gap-1.5 bg-paper-deep border border-rule rounded-full px-2 py-1">
              <button
                type="button"
                onClick={goToPreviousMonth}
                className="p-1 text-ink-mute hover:text-ink transition-colors"
                aria-label={t("transactions.count", { count: 0 }) /* placeholder, prev */}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <span className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-ink-mute min-w-[80px] text-center">
                {monthName.slice(0, 3).toUpperCase()} {selectedYear}
              </span>
              <button
                type="button"
                onClick={goToNextMonth}
                disabled={isAtCurrentMonth}
                className="p-1 text-ink-mute hover:text-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>
          )}

          {/* Project filter */}
          {projects.length > 0 && (
            <select
              value={selectedProjectId || ""}
              onChange={(e) => {
                setHasFilterChanged(true);
                setSelectedProjectId(e.target.value || null);
              }}
              className="bg-paper border border-rule rounded-md px-3 py-1.5 text-[12px] text-ink-soft font-sans focus:border-forest focus:outline-none"
            >
              <option value="">{t("filters.allProjects")}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setIsSelectorOpen(true)}
            className="inline-flex items-center gap-1.5 bg-forest text-paper hover:bg-forest-deep transition-colors duration-200 rounded-md px-4 py-2 text-[13px] font-medium"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {tPainel("addExpense")}
          </button>
        </div>
      </header>

      {/* ==================== HERO BAND ==================== */}
      {isLoading && expenses.length === 0 ? (
        <HeroSkeleton />
      ) : (
        <section className="bg-paper-deep border border-rule rounded-md grid grid-cols-1 md:grid-cols-[1.4fr_1fr] overflow-hidden mb-6">
          {/* LEFT: Saldo do mês */}
          <div className="p-7 md:p-8 flex flex-col gap-3.5 border-b md:border-b-0 md:border-r border-rule">
            <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-gilt-deep">
              {tPainel("hero.balanceEyebrow", { month: monthName.toUpperCase(), year: selectedYear })}
            </span>

            <div className="flex items-baseline gap-4 flex-wrap">
              <HeroAmount value={expenseStats.balance} />
              {balanceDelta !== null && (
                <span
                  className={`inline-flex items-center gap-1 font-mono text-[11px] tracking-[0.04em] uppercase ${
                    balanceDelta.isUp ? "text-moss" : "text-crimson"
                  }`}
                >
                  <span className="text-[9px]">{balanceDelta.isUp ? "▲" : "▼"}</span>
                  {balanceDelta.isUp ? "+" : ""}{balanceDelta.pct.toFixed(1).replace(".", ",")}% {tPainel("hero.vsYearAgo")}
                </span>
              )}
            </div>

            {/* gilt rule with dot */}
            <div className="relative h-px bg-gilt my-1.5">
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-gilt" />
            </div>

            <div className="flex flex-wrap gap-7 mt-1.5">
              <StatCell label={tPainel("hero.income")} value={currentMonthIncome} color="moss" />
              <div className="w-px bg-rule self-stretch" />
              <StatCell label={tPainel("hero.expenses")} value={expenseStats.totalExpenses} color="ink" />
              <div className="w-px bg-rule self-stretch" />
              <StatCell label={tPainel("hero.pending")} value={expenseStats.pending} color="ink-mute" />
            </div>
          </div>

          {/* RIGHT: Património líquido */}
          <div className="p-7 md:p-8 flex flex-col gap-3.5">
            <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-mute">
              {tPainel("hero.netWorthEyebrow")}
            </span>

            <div className="flex items-baseline gap-3 flex-wrap">
              <NetWorthAmount value={netWorthApprox} />
            </div>

            <div className="flex flex-col mt-1">
              <NetWorthRow label={tPainel("hero.cash")} swatch="var(--cat-forest)" amount={portfolioFreeCash} />
              <NetWorthRow label={tPainel("hero.assets")} swatch="var(--cat-ochre)" amount={portfolioTotalValue} />
              <NetWorthRow label={tPainel("hero.property")} swatch="var(--cat-clay)" amount={propertyTotalEur} dim={propertyTotalEur === 0} />
              <NetWorthRow label={tPainel("hero.vehicles")} swatch="var(--cat-bronze)" amount={vehiclesTotalEur} dim={vehiclesTotalEur === 0} />
              <NetWorthRow label={tPainel("hero.liabilities")} swatch="var(--cat-rust)" amount={liabilitiesTotalEur} negative dim={liabilitiesTotalEur === 0} />
            </div>
          </div>
        </section>
      )}

      {/* ==================== ERROR BANNER ==================== */}
      {loadError && (
        <div className="bg-crimson-tint border border-crimson rounded-md p-5 mb-6">
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-crimson-deep">
            {tPainel("error.eyebrow")}
          </span>
          <p className="text-[15px] font-medium text-crimson-deep mt-2">{tPainel("error.headline")}</p>
          <p className="text-[13px] text-crimson-deep mt-1">{loadError}</p>
        </div>
      )}

      {/* ==================== EMPTY STATE ==================== */}
      {isEmpty && (
        <div className="bg-paper-deep border border-rule rounded-md p-10 text-center mb-6">
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint">
            {tPainel("empty.eyebrow")}
          </span>
          <p className="text-[15px] font-medium text-ink mt-2">{tPainel("empty.headline")}</p>
          <p className="text-[13px] text-ink-mute mt-1.5 max-w-md mx-auto">{tPainel("empty.body")}</p>
          <button
            type="button"
            onClick={() => setIsSelectorOpen(true)}
            className="mt-5 inline-flex items-center gap-1.5 bg-forest text-paper hover:bg-forest-deep transition-colors rounded-md px-4 py-2 text-[13px] font-medium"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {tPainel("empty.cta")}
          </button>
        </div>
      )}

      {/* ==================== MID ROW — donut + cashflow ==================== */}
      {!isEmpty && (
        <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 mb-6">
          {/* 30-day cashflow */}
          <article className="bg-paper-deep border border-rule rounded-md p-6">
            <div className="flex items-end justify-between gap-4 mb-4">
              <div>
                <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-mute">
                  {tPainel("cashflow.eyebrow")}
                </span>
                <h3 className="font-display font-normal text-[22px] tracking-[-0.01em] text-ink mt-1.5">
                  {tPainel("cashflow.title", { month: monthName })}
                </h3>
              </div>
              {isAtCurrentMonth && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-mute font-mono tracking-[0.04em]">
                  <span className="w-1.5 h-1.5 rounded-full bg-gilt inline-block" />
                  {tPainel("cashflow.today", { day: now.getDate(), month: MONTH_SHORT_PT[selectedMonth] })}
                </span>
              )}
            </div>
            <CashflowChart path={cashflowPath} cashflow={cashflow30} isCurrentMonth={isAtCurrentMonth} />
          </article>

          {/* Category donut */}
          <article className="bg-paper-deep border border-rule rounded-md p-6">
            <div className="mb-4">
              <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-mute">
                {tPainel("donut.eyebrow")}
              </span>
              <h3 className="font-display font-normal text-[22px] tracking-[-0.01em] text-ink mt-1.5">
                {tPainel("donut.title")}
              </h3>
            </div>

            {donutTotal <= 0 ? (
              <p className="text-[13px] text-ink-mute py-6 text-center">{t("noExpenses")}</p>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="relative" style={{ width: donutSize, height: donutSize }}>
                  <svg
                    width={donutSize}
                    height={donutSize}
                    viewBox={`0 0 ${donutSize} ${donutSize}`}
                    style={{ transform: "rotate(-90deg)" }}
                  >
                    <circle cx={donutSize / 2} cy={donutSize / 2} r={donutRadius} fill="none" stroke="var(--paper-soft)" strokeWidth={donutThickness} />
                    {donutSlices.map((s) => (
                      <circle
                        key={s.name}
                        cx={donutSize / 2}
                        cy={donutSize / 2}
                        r={donutRadius}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={donutThickness}
                        strokeDasharray={`${s.len.toFixed(2)} ${(donutCircumference - s.len).toFixed(2)}`}
                        strokeDashoffset={(-s.offset).toFixed(2)}
                      />
                    ))}
                    <circle cx={donutSize / 2} cy={donutSize / 2} r={89} fill="none" stroke="var(--gilt)" strokeWidth="0.5" opacity="0.55" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-ink-faint">
                      {tPainel("donut.total")}
                    </span>
                    <span className="font-display text-[22px] text-ink tabular-nums">
                      <span className="text-[0.6em] text-ink-mute mr-[0.1em]">€</span>
                      {formatPT(donutTotal, 0).whole}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 w-full">
                  {categoryDonut.map((c) => (
                    <div key={c.name} className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: c.color }} />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="font-mono text-[10.5px] text-ink-mute">{c.percentage.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        </section>
      )}

      {/* ==================== 12-MONTH BARS ==================== */}
      {!isEmpty && (
        <article className="bg-paper-deep border border-rule rounded-md p-6 mb-6">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-mute">
                {tPainel("bars.eyebrow")}
              </span>
              <h3 className="font-display font-normal text-[22px] tracking-[-0.01em] text-ink mt-1.5">
                {tPainel("bars.title")}
              </h3>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono tracking-[0.04em] text-ink-mute bg-paper border border-rule rounded-sm">
              EUR · {tPainel("bars.net")}
            </span>
          </div>
          <MonthBars months={months12} max={max12} />
          <div className="flex flex-wrap gap-6 mt-3 pt-3 border-t border-dotted border-rule items-center">
            <span className="inline-flex items-center gap-2 text-[12px] text-ink-soft">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--moss)" }} />
              {tPainel("bars.income")}
            </span>
            <span className="inline-flex items-center gap-2 text-[12px] text-ink-soft">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--ink)" }} />
              {tPainel("bars.expense")}
            </span>
          </div>
        </article>
      )}

      {/* ==================== RECENT LEDGER ==================== */}
      {!isEmpty && (
        <article className="bg-paper-deep border border-rule rounded-md p-6 mb-6">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-mute">
                {tPainel("ledger.eyebrow")}
              </span>
              <h3 className="font-display font-normal text-[22px] tracking-[-0.01em] text-ink mt-1.5">
                {tPainel("ledger.title")}
              </h3>
            </div>
            <a
              href="/dashboard/expenses"
              className="font-display text-[13px] text-gilt-deep hover:text-gilt transition-colors no-underline"
            >
              {tPainel("ledger.seeAll")} →
            </a>
          </div>

          {recentTransactions.length === 0 ? (
            <p className="text-[13px] text-ink-mute py-6 text-center">{t("transactions.noTransactions")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-rule">
                    <th className="text-left font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint pb-2 pr-3 w-[88px]">
                      {tPainel("ledger.date")}
                    </th>
                    <th className="text-left font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint pb-2 pr-3">
                      {tPainel("ledger.description")}
                    </th>
                    <th className="text-left font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint pb-2 pr-3 hidden md:table-cell">
                      {tPainel("ledger.category")}
                    </th>
                    <th className="text-right font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint pb-2">
                      {tPainel("ledger.amount")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((tx) => {
                    const isIncome = isIncomeTransaction(tx);
                    const date = new Date(tx.date);
                    const day = String(date.getDate()).padStart(2, "0");
                    const monthShort = MONTH_SHORT_PT[date.getMonth()];
                    const expense = !isIncome ? (tx as Expense) : null;
                    const eur = isIncome ? tx.amountEur : (expense ? effectiveEur(expense) : 0);
                    const isInflow = isIncome || eur < 0;
                    const showAmount = Math.abs(eur);
                    const { whole, cents } = formatPT(showAmount, 2);
                    const catName = isIncome ? null : translateCategory(tx.categoryName);
                    const catColor = isIncome ? null : CATEGORY_PALETTE[
                      Math.abs(catName?.charCodeAt(0) ?? 0) % CATEGORY_PALETTE.length
                    ];
                    return (
                      <tr
                        key={tx.id}
                        className={`border-b border-dotted border-rule last:border-b-0 ${
                          isIncome ? "" : "cursor-pointer hover:bg-paper-soft transition-colors"
                        }`}
                        onClick={() => !isIncome && handleViewExpense(tx.id)}
                      >
                        <td className="py-3 pr-3 font-mono text-[11px] tracking-[0.04em] text-ink-mute whitespace-nowrap">
                          {day} {monthShort}
                        </td>
                        <td className="py-3 pr-3">
                          <span className="text-[14px] font-medium text-ink">{tx.name}</span>
                        </td>
                        <td className="py-3 pr-3 hidden md:table-cell">
                          {catName && catColor ? (
                            <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-soft">
                              <span className="w-2 h-2 rounded-sm" style={{ background: catColor }} />
                              {catName}
                            </span>
                          ) : (
                            <span className="text-[12px] text-ink-faint">—</span>
                          )}
                        </td>
                        <td className="py-3 text-right whitespace-nowrap">
                          <span
                            className={`font-display text-[16px] tabular-nums ${
                              isInflow ? "text-moss" : "text-crimson"
                            }`}
                          >
                            {isInflow ? "+" : ""}
                            <span className="text-[0.7em] text-ink-mute mr-[0.1em] align-baseline">€</span>
                            {whole}
                            <span className="text-[0.65em] text-ink-mute align-[0.45em] ml-[0.02em]">,{cents}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </article>
      )}

      {/* ==================== ADVISOR COLD START ==================== */}
      {advisorState?.aiProcessingEnabled && advisorState?.isColdstart && !unreadRetro && (
        <Suspense fallback={null}>
          <AdvisorColdstartCard
            expenseCount={advisorState.expenseCount}
            monthsTracked={advisorState.monthsTracked}
          />
        </Suspense>
      )}

      {/* ==================== MODALS ==================== */}
      {isSelectorOpen && (
        <Suspense fallback={null}>
          <AddTypeSelector
            isOpen={isSelectorOpen}
            onClose={() => setIsSelectorOpen(false)}
            onExpenseCreated={handleExpenseCreated}
          />
        </Suspense>
      )}

      {editingExpense && (
        <Suspense fallback={null}>
          <EditExpenseModal
            isOpen={!!editingExpense}
            onClose={() => setEditingExpense(null)}
            expense={editingExpense}
            categories={categories}
            bankAccounts={bankAccounts}
            projects={projects}
            onSave={() => {
              setEditingExpense(null);
              router.refresh();
            }}
          />
        </Suspense>
      )}

      {viewingExpense && (
        <Suspense fallback={null}>
          <ExpenseDetailModal
            isOpen={!!viewingExpense}
            onClose={() => setViewingExpense(null)}
            expense={viewingExpense}
            onEdit={() => {
              const exp = viewingExpense;
              setViewingExpense(null);
              setEditingExpense({
                id: exp.id,
                name: exp.name,
                amount: Number(exp.amount),
                currency: exp.currency || "EUR",
                type: exp.type as "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT",
                date: exp.date,
                category: exp.category,
                bankAccount: exp.bankAccount,
                projects: exp.projects || [],
                excludeFromBudget: exp.excludeFromBudget || false,
                status: exp.status || "PAID",
                splitCount: exp.splitCount || null,
                splitData: exp.splitData || null,
                description: exp.description || undefined,
              });
            }}
            onDelete={() => {
              setViewingExpense(null);
            }}
          />
        </Suspense>
      )}

      {showOnboarding && (
        <Suspense fallback={null}>
          <OnboardingModal
            isOpen={showOnboarding}
            onClose={handleOnboardingClose}
            existingData={{ monthlySalary, monthlyBudget }}
          />
        </Suspense>
      )}

      {currentAnnouncementId && showAnnouncement && (
        <Suspense fallback={null}>
          <AnnouncementModal
            isOpen={showAnnouncement}
            onClose={() => setShowAnnouncement(false)}
            announcementId={currentAnnouncementId}
          />
        </Suspense>
      )}

      {showRetro && unreadRetro && (
        <Suspense fallback={null}>
          <RetrospectiveModal
            isOpen={showRetro}
            onClose={() => {
              setShowRetro(false);
              setUnreadRetro(null);
            }}
            insight={unreadRetro}
            markReadOnClose={true}
          />
        </Suspense>
      )}
    </div>
  );
}

/* ============================================================
   Small presentational helpers (kept in-file for cohesion)
   ============================================================ */

function HeroAmount({ value }: { value: number }) {
  const { whole, cents } = formatPT(value, 2);
  return (
    <span
      className="font-display font-normal text-[48px] md:text-[64px] leading-none tracking-[-0.02em] text-ink"
      style={{ fontVariantNumeric: "tabular-nums lining-nums", fontFeatureSettings: '"tnum","lnum","ss01"' }}
    >
      <span className="text-[0.42em] text-ink-mute mr-[0.12em] align-[0.18em] font-normal">€</span>
      {whole}
      <span className="text-[0.36em] text-ink-mute align-[0.62em] ml-[0.04em] font-normal">,{cents}</span>
    </span>
  );
}

function NetWorthAmount({ value }: { value: number }) {
  const { whole, cents } = formatPT(value, 2);
  return (
    <span
      className="font-display font-normal text-[28px] md:text-[36px] leading-none tracking-[-0.02em] text-ink"
      style={{ fontVariantNumeric: "tabular-nums lining-nums" }}
    >
      <span className="text-[0.5em] text-ink-mute mr-[0.12em] align-[0.16em]">€</span>
      {whole}
      <span className="text-[0.42em] text-ink-mute align-[0.55em] ml-[0.04em]">,{cents}</span>
    </span>
  );
}

function StatCell({ label, value, color }: { label: string; value: number; color: "moss" | "ink" | "ink-mute" }) {
  const { whole, cents } = formatPT(value, 2);
  const colorClass = color === "moss" ? "text-moss" : color === "ink-mute" ? "text-ink-mute" : "text-ink";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint">{label}</span>
      <span
        className={`font-display text-[22px] ${colorClass}`}
        style={{ fontVariantNumeric: "tabular-nums lining-nums" }}
      >
        <span className="text-[0.6em] text-ink-mute mr-[0.12em]">€</span>
        {whole}
        <span className="text-[0.55em] text-ink-mute align-[0.45em] ml-[0.04em]">,{cents}</span>
      </span>
    </div>
  );
}

function NetWorthRow({
  label, swatch, amount, negative = false, dim = false,
}: { label: string; swatch: string; amount: number; negative?: boolean; dim?: boolean }) {
  const fmt = fmtMoney(amount, 2);
  return (
    <div className="grid grid-cols-[1fr_auto] items-center py-2 border-b border-dotted border-rule last:border-b-0 text-[13px]">
      <span className={`flex items-center gap-2.5 ${dim ? "text-ink-faint" : "text-ink-soft"}`}>
        <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: swatch }} />
        {label}
      </span>
      <span
        className={`font-display text-[14px] ${negative ? "text-crimson" : "text-ink"} ${dim ? "opacity-60" : ""}`}
        style={{ fontVariantNumeric: "tabular-nums lining-nums" }}
      >
        {negative ? `(${fmt})` : fmt}
      </span>
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div className="bg-paper-deep border border-rule rounded-md grid grid-cols-1 md:grid-cols-[1.4fr_1fr] overflow-hidden mb-6">
      <div className="p-7 md:p-8 flex flex-col gap-3.5 border-b md:border-b-0 md:border-r border-rule">
        <div className="h-3 w-40 bg-paper-soft rounded animate-pulse" />
        <div className="h-12 w-56 bg-paper-soft rounded animate-pulse" />
        <div className="h-px bg-rule my-1" />
        <div className="flex gap-7">
          <div className="h-10 w-24 bg-paper-soft rounded animate-pulse" />
          <div className="h-10 w-24 bg-paper-soft rounded animate-pulse" />
          <div className="h-10 w-24 bg-paper-soft rounded animate-pulse" />
        </div>
      </div>
      <div className="p-7 md:p-8 flex flex-col gap-3.5">
        <div className="h-3 w-32 bg-paper-soft rounded animate-pulse" />
        <div className="h-9 w-44 bg-paper-soft rounded animate-pulse" />
        <div className="space-y-2 mt-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-4 w-full bg-paper-soft rounded animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

function CashflowChart({
  path, cashflow, isCurrentMonth,
}: {
  path: { w: number; h: number; padL: number; padR: number; padT: number; padB: number; usableW: number; usableH: number; line: string; area: string; todayX: number; zeroY: number };
  cashflow: { points: { day: number; label: string; value: number; isFuture: boolean }[]; todayDay: number; lastDay: number; monthLabel: string };
  isCurrentMonth: boolean;
}) {
  if (path.line === "") {
    return (
      <div className="w-full h-[180px] flex items-center justify-center text-[13px] text-ink-mute">
        —
      </div>
    );
  }
  const firstLabel = `01 ${cashflow.monthLabel}`;
  const midDay = Math.ceil(cashflow.lastDay / 2);
  const midLabel = `${String(midDay).padStart(2, "0")} ${cashflow.monthLabel}`;
  const lastLabel = `${cashflow.lastDay} ${cashflow.monthLabel}`;
  const lastVisiblePoint = cashflow.points.filter((p) => !p.isFuture).slice(-1)[0];

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${path.w} ${path.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="block w-full h-auto"
      >
        {/* zero rule */}
        <line x1={path.padL} y1={path.zeroY} x2={path.w - path.padR} y2={path.zeroY} stroke="var(--rule-strong)" strokeWidth="0.6" strokeDasharray="2 3" />
        {/* today marker */}
        {isCurrentMonth && (
          <line x1={path.todayX} y1={path.padT - 4} x2={path.todayX} y2={path.h - path.padB + 4} stroke="var(--gilt)" strokeWidth="0.6" strokeDasharray="1 4" />
        )}
        {/* area */}
        <path d={path.area} fill="var(--forest-tint)" opacity="0.65" />
        {/* line */}
        <path d={path.line} fill="none" stroke="var(--forest)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        {/* last visible point dot */}
        {lastVisiblePoint && isCurrentMonth && (
          <circle cx={path.todayX} cy={path.padT + ((Math.max(...cashflow.points.filter((p) => !p.isFuture).map((p) => p.value), 0) - lastVisiblePoint.value) / Math.max(Math.max(...cashflow.points.filter((p) => !p.isFuture).map((p) => p.value), 0) - Math.min(...cashflow.points.filter((p) => !p.isFuture).map((p) => p.value), 0), 1)) * path.usableH} r="3" fill="var(--gilt)" />
        )}
        {/* axis labels */}
        <text x={path.padL} y={path.h - 8} fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-faint)" letterSpacing="0.1em">{firstLabel}</text>
        <text x={path.w / 2} y={path.h - 8} fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-faint)" letterSpacing="0.1em" textAnchor="middle">{midLabel}</text>
        <text x={path.w - path.padR} y={path.h - 8} fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-faint)" letterSpacing="0.1em" textAnchor="end">{lastLabel}</text>
      </svg>
    </div>
  );
}

function MonthBars({
  months, max,
}: {
  months: { key: string; label: string; income: number; expense: number; isCurrent: boolean }[];
  max: number;
}) {
  const w = 720;
  const h = 170;
  const padL = 40;
  const padR = 20;
  const innerW = w - padL - padR;
  const bandW = innerW / months.length;
  const barW = 6;
  const barGap = 2;
  const usableH = (h - 30 - 6) / 2; // half above, half below zero
  const zeroY = 30 + usableH;

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="block w-full h-auto">
        <line x1={padL} y1={zeroY} x2={w - padR} y2={zeroY} stroke="var(--rule-strong)" strokeWidth="0.6" />
        {months.map((m, i) => {
          const cx = padL + bandW * i + bandW / 2;
          const incH = max > 0 ? (m.income / max) * usableH : 0;
          const expH = max > 0 ? (m.expense / max) * usableH : 0;
          const incX = cx - barW - barGap / 2;
          const expX = cx + barGap / 2;
          return (
            <g key={m.key}>
              {m.isCurrent && (
                <line x1={cx - barW - barGap / 2 - 3} y1={6} x2={cx - barW - barGap / 2 - 3} y2={h - 12} stroke="var(--gilt)" strokeWidth="0.6" strokeDasharray="1 4" />
              )}
              {/* income bar (above zero) */}
              {incH > 0 && (
                <rect
                  x={incX}
                  y={zeroY - incH}
                  width={barW}
                  height={incH}
                  fill={m.isCurrent ? "var(--moss)" : "var(--moss-tint)"}
                  stroke={m.isCurrent ? "var(--moss-deep)" : "none"}
                  strokeWidth="0.5"
                />
              )}
              {/* expense bar (below zero) */}
              {expH > 0 && (
                <rect
                  x={expX}
                  y={zeroY}
                  width={barW}
                  height={expH}
                  fill={m.isCurrent ? "var(--ink)" : "var(--paper-deep)"}
                  stroke={m.isCurrent ? "var(--ink)" : "var(--rule-strong)"}
                  strokeWidth="0.5"
                />
              )}
              <text
                x={cx}
                y={h - 4}
                fontFamily="var(--font-mono)"
                fontSize="9"
                textAnchor="middle"
                fill={m.isCurrent ? "var(--ink)" : "var(--ink-faint)"}
                letterSpacing="0.1em"
              >
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
