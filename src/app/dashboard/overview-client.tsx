"use client";

import { useState, useEffect, useMemo, lazy, Suspense, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSwipe } from "@/hooks/use-swipe";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import { formatCurrency } from "@/lib/currencies";
import type { Expense as FullExpense } from "@/types/models";
import { getUserShare } from "@/lib/split-utils";
import OverviewHero from "@/components/dashboard/overview-hero";
import TidyUpNudge from "@/components/dashboard/tidy-up-nudge";
import RailPortfolio from "@/components/dashboard/rail-portfolio";
import RailRwa from "@/components/dashboard/rail-rwa";
import RailCategories from "@/components/dashboard/rail-categories";

// Lazy load heavy modals and charts to reduce initial bundle size
const AddTypeSelector = lazy(() => import("@/components/add-type-selector"));
const EditExpenseModal = lazy(() => import("@/components/edit-expense-modal"));
const ExpenseDetailModal = lazy(() => import("@/components/expense-detail-modal"));
const OnboardingModal = lazy(() => import("@/components/onboarding-modal"));
const AnnouncementModal = lazy(() => import("@/components/announcement-modal"));
const BurnChart = lazy(() => import("@/components/ui/burn-chart").then(mod => ({ default: mod.BurnChart })));
const DashboardRwaSection = lazy(() => import("@/components/dashboard-rwa-section"));
const AdvisorColdstartCard = lazy(() => import("@/components/advisor-coldstart-card"));
const RetrospectiveModal = lazy(() => import("@/components/retrospective-modal"));

// Loading skeleton for the chart
function ChartSkeleton() {
  return (
    <div className="w-full animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="h-5 w-32 bg-slate-200 rounded" />
          <div className="h-4 w-48 bg-slate-200 rounded mt-1" />
        </div>
        <div className="text-right">
          <div className="h-6 w-20 bg-slate-200 rounded" />
          <div className="h-4 w-24 bg-slate-200 rounded mt-1" />
        </div>
      </div>
      <div className="h-[280px] w-full bg-slate-100 rounded-lg" />
    </div>
  );
}

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

type Transaction = Expense | Income;

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
  // Overview/home redesign (AMIGO-279) — current values; consumed by the new
  // Bento client. Optional during the migration so this component still builds.
  netWorthEur?: number;
  netWorthDeltaEur?: number | null;
  portfolioTotalEur?: number;
  portfolioDeltaEur?: number | null;
  rwaEquityEur?: number;
  rwaTopAssets?: { id: string; name: string; valueEur: number }[];
  rwaLinkedDebtEur?: number;
  topCategories?: { name: string; amountEur: number }[];
};

// Current announcement IDs - add new ones here when releasing new features
const CURRENT_ANNOUNCEMENTS = ["unified-transactions-v1", "workspaces-v1", "scheduled-expenses-v1", "category-groups-v1"];

// Month keys for i18n
const MONTH_KEYS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
] as const;

type ViewMode = "month" | "quarter" | "year" | "all";
type TypeFilter = "all" | "living" | "lifestyle" | "project" | "income";

// Helper to check if a transaction is an income
const isIncomeTransaction = (t: Transaction): t is Income => {
  return "isIncome" in t && t.isIncome === true;
};

export default function DashboardOverview({
  workspaceId,
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
  monthlyIncome,
  expectedMonthlyIncome,
  onboardingCompleted,
  seenAnnouncements,
  currencyDisplayMode,
  defaultCurrency,
  exchangeConnections,
  portfolioAssets,
  netWorthEur,
  netWorthDeltaEur,
  portfolioTotalEur,
  portfolioDeltaEur,
  rwaEquityEur,
  rwaTopAssets,
  rwaLinkedDebtEur,
  topCategories,
}: Props) {
  const router = useRouter();
  const t = useTranslations("dashboard");
  const tTime = useTranslations("time");
  const tCommon = useTranslations("common");
  const tIncomes = useTranslations("incomes");
  const { translateCategory } = useCategoryTranslation();
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [incomes, setIncomes] = useState<Income[]>(initialIncomes);
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(initialMonth / 3) + 1);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Mobile: tap-to-reveal action buttons
  const [expandedMobileRow, setExpandedMobileRow] = useState<string | null>(null);

  // Edit state
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
  const [isLoadingExpense, setIsLoadingExpense] = useState(false);
  const [viewingExpense, setViewingExpense] = useState<FullExpense | null>(null);

  // Previous month data for burn chart (pre-loaded from server!)
  const [previousMonthExpenses, setPreviousMonthExpenses] = useState<Expense[]>(initialPreviousMonthExpenses);

  // Pull-to-refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // AI Advisor cold-start state
  const [advisorState, setAdvisorState] = useState<{
    aiProcessingEnabled: boolean;
    isColdstart: boolean;
    expenseCount: number;
    monthsTracked: number;
  } | null>(null);

  // Inline quick-add ("mcd 12") in the spending box.
  const [quickAddText, setQuickAddText] = useState("");
  const [quickAddBusy, setQuickAddBusy] = useState(false);

  // Uncategorized count drives the dashboard tidy-up nudge.
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  useEffect(() => {
    fetch("/api/expenses/uncategorized-count")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.count === "number") setUncategorizedCount(d.count); })
      .catch(() => { /* non-critical */ });
  }, []);

  // Retrospective state
  type UnreadInsight = {
    id: string;
    periodYear: number;
    periodMonth: number;
    content: { headline: string; observations: [string, string, string]; momHighlights: Array<{ category: string; currentTotal: number; prevTotal: number; pctChange: number }> };
    readAt: string | null;
  };
  const [unreadRetro, setUnreadRetro] = useState<UnreadInsight | null>(null);
  const [showRetro, setShowRetro] = useState(false);

  // Onboarding modal state - show if not completed
  const [showOnboarding, setShowOnboarding] = useState(!onboardingCompleted);

  // Announcement modal state - find first unseen announcement
  // Only show after onboarding is complete (either already done or just completed)
  const unseenAnnouncement = CURRENT_ANNOUNCEMENTS.find(
    (id) => !seenAnnouncements.includes(id)
  );
  const [showAnnouncement, setShowAnnouncement] = useState(
    onboardingCompleted && !!unseenAnnouncement
  );
  const [currentAnnouncementId, setCurrentAnnouncementId] = useState<string | null>(
    onboardingCompleted && unseenAnnouncement ? unseenAnnouncement : null
  );

  // When onboarding closes, check if we should show announcement
  const handleOnboardingClose = () => {
    setShowOnboarding(false);
    // After onboarding completes, show announcement if there's an unseen one
    if (unseenAnnouncement) {
      setCurrentAnnouncementId(unseenAnnouncement);
      setShowAnnouncement(true);
    }
  };

  // Use monthly budget from settings, or expected income, or default to 2000
  const livingBudget = monthlyBudget || expectedMonthlyIncome || 2000;

  // Track if we're on initial load (server data) vs user-changed filters
  const [hasFilterChanged, setHasFilterChanged] = useState(false);

  // Mobile hero card expand/collapse
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);

  // Sync server-rendered data to state when router.refresh() triggers a re-render.
  // This ensures budget/expense data updates correctly after adding/editing expenses
  // without needing a separate fetchExpenses() call (which would race with router.refresh).
  useEffect(() => {
    if (!hasFilterChanged) {
      setExpenses(initialExpenses);
      setIncomes(initialIncomes);
      setPreviousMonthExpenses(initialPreviousMonthExpenses);
    }
  }, [initialExpenses, initialIncomes, initialPreviousMonthExpenses, hasFilterChanged]);

  // Load expanded state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("dashboard-details-expanded");
      if (saved === "true") setIsDetailsExpanded(true);
    } catch { /* ignore */ }
  }, []);

  const toggleDetails = useCallback(() => {
    setIsDetailsExpanded((prev) => {
      const next = !prev;
      try { localStorage.setItem("dashboard-details-expanded", String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Listen for quick-add event from bottom nav
  // This page handles its own modal, so stop propagation to prevent GlobalAddButton from also opening
  useEffect(() => {
    const handleQuickAdd = (e: Event) => {
      e.stopImmediatePropagation();
      setIsSelectorOpen(true);
    };
    window.addEventListener("openQuickAdd", handleQuickAdd);
    return () => window.removeEventListener("openQuickAdd", handleQuickAdd);
  }, []);

  // Auto-generate recurring expenses for current month (runs once on mount)
  useEffect(() => {
    const autoGenerateRecurring = async () => {
      try {
        const response = await fetch("/api/recurring-templates/generate");
        const data = await response.json();
        if (data.generated > 0) {
          // Refresh expenses if any were auto-generated
          router.refresh();
        }
      } catch (error) {
        console.error("Auto-generate recurring expenses failed:", error);
      }
    };
    autoGenerateRecurring();

    // Fetch AI Advisor state for cold-start card and unread retrospective
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
            // Delay popup slightly so it doesn't fight first paint
            const timer = setTimeout(() => setShowRetro(true), 600);
            return () => clearTimeout(timer);
          }
        }
      } catch { /* non-critical, ignore */ }
    };
    fetchAdvisorState();
  }, [router]);

  // Month navigation for swipe
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
    // Prevent navigation to future months
    const now = new Date();
    const atCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
    if (atCurrentMonth) return;

    setHasFilterChanged(true);
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  }, [selectedMonth, selectedYear]);

  // Pull-to-refresh handler (only at top of page, mobile only)
  const handlePullRefresh = useCallback(() => {
    if (window.scrollY > 10 || isRefreshing) return;
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 1500);
  }, [router, isRefreshing]);

  // Swipe handlers for month navigation (only in month view) + pull-to-refresh
  const { handlers: swipeHandlers } = useSwipe({
    onSwipeLeft: viewMode === "month" ? goToNextMonth : undefined,
    onSwipeRight: viewMode === "month" ? goToPreviousMonth : undefined,
    onSwipeDown: handlePullRefresh,
    threshold: 75,
  });

  // Fetch expenses when filters change (but not on initial mount - we have server data)
  useEffect(() => {
    if (!hasFilterChanged) return;

    // Fetch both current and previous month in parallel
    if (viewMode === "month") {
      fetchBothMonths();
    } else {
      fetchExpenses();
    }
  }, [viewMode, selectedMonth, selectedYear, selectedQuarter, selectedProjectId, hasFilterChanged]);

  // Mark filter as changed when user interacts
  const handleFilterChange = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
    setHasFilterChanged(true);
    setter(value);
  };

  const fetchExpenses = async () => {
    setIsLoading(true);
    try {
      let startDate: Date;
      let endDate: Date;

      switch (viewMode) {
        case "month":
          startDate = new Date(selectedYear, selectedMonth, 1);
          endDate = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
          break;
        case "quarter":
          const quarterStartMonth = (selectedQuarter - 1) * 3;
          startDate = new Date(selectedYear, quarterStartMonth, 1);
          endDate = new Date(selectedYear, quarterStartMonth + 3, 0, 23, 59, 59);
          break;
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

      if (selectedProjectId) {
        params.set("projectId", selectedProjectId);
      }

      // Fetch expenses and incomes in parallel
      const [expensesRes, incomesRes] = await Promise.all([
        fetch(`/api/expenses?${params}`),
        fetch(`/api/incomes?month=${startDate.getMonth()}&year=${startDate.getFullYear()}`),
      ]);

      const [expensesData, incomesData] = await Promise.all([
        expensesRes.json(),
        incomesRes.json(),
      ]);

      if (expensesData.expenses) {
        setExpenses(expensesData.expenses.map((e: {
          id: string;
          name: string;
          date: string;
          type: string;
          amountEur?: number;
          amount?: number;
          currency?: string;
          category?: { name: string; parent?: { name: string } | null } | null;
          projects?: { id: string; name: string }[];
          excludeFromBudget?: boolean;
          status?: "PAID" | "PENDING";
          splitCount?: number | null;
          splitData?: string | null;
          createdAt?: string;
        }) => ({
          id: e.id,
          name: e.name,
          date: e.date,
          type: e.type,
          amount: Number(e.amount ?? 0),
          currency: e.currency || "EUR",
          amountEur: Number(e.amountEur ?? e.amount ?? 0),
          categoryName: e.category?.name || "Uncategorized",
          parentCategoryName: e.category?.parent?.name || e.category?.name || "Uncategorized",
          projects: e.projects || [],
          excludeFromBudget: e.excludeFromBudget ?? false,
          status: e.status || "PAID",
          splitCount: e.splitCount || null,
          splitData: e.splitData || null,
          createdAt: e.createdAt || e.date,
        })));
      }

      // Update incomes based on the selected date range
      if (incomesData.incomes) {
        setIncomes(incomesData.incomes.map((i: {
          id: string;
          name: string;
          date: string;
          type: string;
          amountEur?: number;
          amount?: number;
          currency?: string;
          category?: { name: string; parent?: { name: string } | null } | null;
          createdAt?: string;
        }) => ({
          id: i.id,
          name: i.name,
          date: i.date,
          type: "INCOME" as const,
          incomeType: i.type,
          amount: Number(i.amount ?? 0),
          currency: i.currency || "EUR",
          amountEur: Number(i.amountEur ?? i.amount ?? 0),
          categoryName: i.category?.name || "Uncategorized",
          projects: [],
          excludeFromBudget: false,
          isIncome: true as const,
          createdAt: i.createdAt || i.date,
        })));
      } else {
        // Clear incomes if none found for this period
        setIncomes([]);
      }
    } catch (error) {
      console.error("Failed to fetch expenses:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch both current and previous month in parallel (eliminates waterfall!)
  const fetchBothMonths = async () => {
    setIsLoading(true);
    try {
      // Calculate previous month
      let prevMonth = selectedMonth - 1;
      let prevYear = selectedYear;
      if (prevMonth < 0) {
        prevMonth = 11;
        prevYear -= 1;
      }

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

      if (selectedProjectId) {
        currentParams.set("projectId", selectedProjectId);
      }

      // Fetch expenses (current + prev) and incomes in parallel!
      const [currentRes, prevRes, incomesRes] = await Promise.all([
        fetch(`/api/expenses?${currentParams}`),
        fetch(`/api/expenses?${prevParams}`),
        fetch(`/api/incomes?month=${selectedMonth}&year=${selectedYear}`),
      ]);

      const [currentData, prevData, incomesData] = await Promise.all([
        currentRes.json(),
        prevRes.json(),
        incomesRes.json(),
      ]);

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
      }) => ({
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

      if (currentData.expenses) {
        setExpenses(currentData.expenses.map(transformExpense));
      }
      if (prevData.expenses) {
        setPreviousMonthExpenses(prevData.expenses.map(transformExpense));
      }

      // Update incomes for the selected month
      if (incomesData.incomes) {
        setIncomes(incomesData.incomes.map((i: {
          id: string;
          name: string;
          date: string;
          type: string;
          amountEur?: number;
          amount?: number;
          currency?: string;
          category?: { name: string; parent?: { name: string } | null } | null;
          createdAt?: string;
        }) => ({
          id: i.id,
          name: i.name,
          date: i.date,
          type: "INCOME" as const,
          incomeType: i.type,
          amount: Number(i.amount ?? 0),
          currency: i.currency || "EUR",
          amountEur: Number(i.amountEur ?? i.amount ?? 0),
          categoryName: i.category?.name || "Uncategorized",
          projects: [],
          excludeFromBudget: false,
          isIncome: true as const,
          createdAt: i.createdAt || i.date,
        })));
      } else {
        // Clear incomes if none found for this period
        setIncomes([]);
      }
    } catch (error) {
      console.error("Failed to fetch expenses:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Merge expenses and incomes into unified transactions list, sorted by date
  const transactions = useMemo(() => {
    const allTransactions: Transaction[] = [...expenses, ...incomes];
    return allTransactions.sort((a, b) => {
      const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [expenses, incomes]);

  // Filter transactions by type
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (typeFilter === "all") return true;
      if (typeFilter === "income") return isIncomeTransaction(t);
      if (isIncomeTransaction(t)) return false; // Hide incomes for expense-only filters
      if (typeFilter === "living") return t.type === "SURVIVAL_FIXED" || t.type === "SURVIVAL_VARIABLE";
      if (typeFilter === "lifestyle") return t.type === "LIFESTYLE";
      if (typeFilter === "project") return t.type === "PROJECT";
      return true;
    });
  }, [transactions, typeFilter]);

  // Filter expenses only (for stats calculation - excluding incomes)
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (typeFilter === "all" || typeFilter === "income") return true;
      if (typeFilter === "living") return e.type === "SURVIVAL_FIXED" || e.type === "SURVIVAL_VARIABLE";
      if (typeFilter === "lifestyle") return e.type === "LIFESTYLE";
      if (typeFilter === "project") return e.type === "PROJECT";
      return true;
    });
  }, [expenses, typeFilter]);

  // Calculate income from state (updates when navigating months)
  const currentMonthIncome = useMemo(() => {
    return incomes.reduce((sum, i) => sum + i.amountEur, 0);
  }, [incomes]);

  // Get effective EUR amount for an expense (user's share if split)
  const effectiveEur = (e: Expense) => {
    if (e.splitCount && e.splitCount > 1) {
      const share = getUserShare(e.splitCount, e.splitData);
      if (share !== null && e.amount !== 0) {
        // Proportional EUR: user's share in original currency → scale EUR by same ratio
        return e.amountEur * (share / e.amount);
      }
      return e.amountEur / e.splitCount;
    }
    return e.amountEur;
  };

  // Calculate stats (excluding projects from living/lifestyle totals unless viewing project)
  const stats = useMemo(() => {
    const hasProjects = (e: Expense) => e.projects && e.projects.length > 0;
    const livingExpenses = expenses.filter(
      (e) => (e.type === "SURVIVAL_FIXED" || e.type === "SURVIVAL_VARIABLE") && !hasProjects(e)
    );
    const lifestyleExpenses = expenses.filter(
      (e) => e.type === "LIFESTYLE" && !hasProjects(e)
    );
    const projectExpenses = expenses.filter((e) => e.type === "PROJECT" || hasProjects(e));

    const livingTotal = livingExpenses.reduce((sum, e) => sum + effectiveEur(e), 0);
    const lifestyleTotal = lifestyleExpenses.reduce((sum, e) => sum + effectiveEur(e), 0);
    const projectTotal = projectExpenses.reduce((sum, e) => sum + effectiveEur(e), 0);
    const totalExcludingProjects = livingTotal + lifestyleTotal;
    const grandTotal = livingTotal + lifestyleTotal + projectTotal;

    // Budget total excludes only expenses explicitly marked as "excludeFromBudget"
    // PENDING (scheduled) expenses still count towards budget since they're planned spending
    const budgetTotal = expenses
      .filter((e) => !e.excludeFromBudget)
      .reduce((sum, e) => sum + effectiveEur(e), 0);

    return {
      total: totalExcludingProjects,
      living: livingTotal,
      livingFixed: livingExpenses.filter((e) => e.type === "SURVIVAL_FIXED").reduce((sum, e) => sum + effectiveEur(e), 0),
      livingVariable: livingExpenses.filter((e) => e.type === "SURVIVAL_VARIABLE").reduce((sum, e) => sum + effectiveEur(e), 0),
      lifestyle: lifestyleTotal,
      projects: projectTotal,
      grandTotal,
      budgetTotal, // For the gauge - excludes "offshore" expenses
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses]);

  // Budget percentage for ring gauge
  const budgetPercentage = useMemo(() => {
    if (!livingBudget || livingBudget <= 0) return 0;
    if (!Number.isFinite(stats.budgetTotal)) return 0;
    return (stats.budgetTotal / livingBudget) * 100;
  }, [stats.budgetTotal, livingBudget]);

  const isOverBudget = stats.budgetTotal > livingBudget && livingBudget > 0;
  const budgetRemaining = livingBudget - stats.budgetTotal;
  const ringColor = isOverBudget ? "#ef4444" : budgetPercentage > 80 ? "#f59e0b" : "#0070f3";
  const balance = (currentMonthIncome || expectedMonthlyIncome) - stats.grandTotal;

  // Portfolio computed values
  const hasPortfolio = exchangeConnections.length > 0;
  const portfolioTotalValue = portfolioAssets.reduce((sum, a) => sum + a.currentValueEur, 0);
  const portfolioTotalCost = portfolioAssets.reduce((sum, a) => sum + a.totalCostEur, 0);
  const portfolioTotalPnl = portfolioAssets.reduce((sum, a) => sum + a.unrealizedPnlEur, 0);
  const portfolioPnlPct = portfolioTotalCost > 0 ? (portfolioTotalPnl / portfolioTotalCost) * 100 : 0;
  const portfolioFreeCash = exchangeConnections.reduce((sum, c) => sum + c.freeCash, 0);

  // Category data for inline bar (same logic as CategoryBreakdown component)
  const CATEGORY_COLORS = ["#0070f3", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#6366f1"];
  const categoryData = useMemo(() => {
    const categoryMap = new Map<string, number>();
    expenses.filter((e) => !e.excludeFromBudget).forEach((expense) => {
      const rawName = expense.parentCategoryName || expense.categoryName;
      const category = rawName ? translateCategory(rawName) : t("uncategorized");
      const current = categoryMap.get(category) || 0;
      categoryMap.set(category, current + effectiveEur(expense));
    });
    const sorted = Array.from(categoryMap.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
    const total = sorted.reduce((sum, cat) => sum + cat.amount, 0);
    return sorted.map((cat, i) => ({
      ...cat,
      percentage: total > 0 ? (cat.amount / total) * 100 : 0,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, t, translateCategory]);

  // SVG ring calculations
  const ringSize = 90;
  const ringStroke = 6;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashoffset = ringCircumference - (Math.min(budgetPercentage, 100) / 100) * ringCircumference;

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const response = await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
      if (response.ok) {
        setExpenses(expenses.filter((e) => e.id !== id));
        setConfirmDeleteId(null);
      }
    } catch (error) {
      console.error("Failed to delete expense:", error);
    } finally {
      setDeletingId(null);
    }
  };

  // Toggle exclude from budget
  const handleToggleExclude = async (expense: Expense) => {
    const newValue = !expense.excludeFromBudget;
    // Optimistic update
    setExpenses(expenses.map((e) =>
      e.id === expense.id ? { ...e, excludeFromBudget: newValue } : e
    ));
    try {
      const response = await fetch(`/api/expenses/${expense.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludeFromBudget: newValue }),
      });
      if (!response.ok) {
        // Revert on error
        setExpenses(expenses.map((e) =>
          e.id === expense.id ? { ...e, excludeFromBudget: !newValue } : e
        ));
      }
    } catch (error) {
      console.error("Failed to toggle exclude:", error);
      // Revert on error
      setExpenses(expenses.map((e) =>
        e.id === expense.id ? { ...e, excludeFromBudget: !newValue } : e
      ));
    }
  };

  // Optimistically add a newly created expense to local state
  const handleExpenseCreated = useCallback((expense: {
    id: string;
    name: string;
    date: string;
    type: string;
    amount: number;
    currency: string;
    amountEur: number;
    categoryName: string;
    projects: { id: string; name: string }[];
    excludeFromBudget: boolean;
    splitCount: number | null;
    splitData: string | null;
    status: string;
    createdAt: string;
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

  // Inline quick-add: POST the raw string; the API parses it server-side
  // (parseQuickAdd + keyword mappings) and creates the expense. Refresh to
  // reflect it everywhere (gauge, burn, recent, stats) in one shot.
  const handleInlineQuickAdd = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = quickAddText.trim();
    if (!text || quickAddBusy) return;
    setQuickAddBusy(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quickAdd: text }),
      });
      if (res.ok) {
        setQuickAddText("");
        router.refresh();
      }
    } catch (error) {
      console.error("Inline quick-add failed:", error);
    } finally {
      setQuickAddBusy(false);
    }
  };

  // Fetch full expense data for editing
  const handleEditExpense = async (expenseId: string) => {
    setIsLoadingExpense(true);
    try {
      const response = await fetch(`/api/expenses/${expenseId}`);
      if (response.ok) {
        const data = await response.json();
        const exp = data.expense;
        setEditingExpense({
          id: exp.id,
          name: exp.name,
          amount: Number(exp.amount),
          currency: exp.currency || "EUR",
          type: exp.type,
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
      }
    } catch (error) {
      console.error("Failed to fetch expense:", error);
    } finally {
      setIsLoadingExpense(false);
    }
  };

  // Fetch full expense data for detail view
  const handleViewExpense = async (expenseId: string) => {
    try {
      const response = await fetch(`/api/expenses/${expenseId}`);
      if (response.ok) {
        const data = await response.json();
        setViewingExpense(data.expense);
      }
    } catch (error) {
      console.error("Failed to fetch expense:", error);
    }
  };

  const getDateRangeLabel = () => {
    switch (viewMode) {
      case "month":
        return `${tTime(`months.${MONTH_KEYS[selectedMonth]}`)} ${selectedYear}`;
      case "quarter":
        return `Q${selectedQuarter} ${selectedYear}`;
      case "year":
        return `${selectedYear}`;
      case "all":
        return t("allTime");
    }
  };

  // Render transaction amount based on currency display mode
  const renderAmount = (transaction: Transaction) => {
    const isIncome = isIncomeTransaction(transaction);
    const eur = transaction.amountEur;
    const original = transaction.amount;
    const cur = transaction.currency || "EUR";
    const isSameCurrency = cur === "EUR";
    const expense = !isIncome ? (transaction as Expense) : null;
    const splitCount = expense?.splitCount;
    const isSplit = splitCount && splitCount > 1;
    const share = isSplit ? getUserShare(splitCount, expense?.splitData) : null;
    const splitOriginal = share !== null ? share : (isSplit ? original / splitCount : original);
    const splitEur = share !== null && original !== 0 ? eur * (share / original) : (isSplit ? eur / splitCount : eur);

    if (currencyDisplayMode === "converted" || isSameCurrency) {
      if (isIncome) return { text: `+€${eur.toFixed(2)}` };
      if (splitEur < 0) return { text: `(€${Math.abs(splitEur).toFixed(2)})`, secondary: isSplit ? `${formatCurrency(original, cur)}` : undefined };
      return { text: `€${splitEur.toFixed(2)}`, secondary: isSplit ? `${formatCurrency(original, cur)}` : undefined };
    }

    const mainText = isIncome
      ? `+${formatCurrency(original, cur)}`
      : formatCurrency(splitOriginal, cur);

    if (currencyDisplayMode === "original") {
      const secondaryParts: string[] = [];
      if (isSplit) secondaryParts.push(formatCurrency(original, cur));
      secondaryParts.push(`≈€${Math.abs(splitEur).toFixed(2)}`);
      return { text: mainText, secondary: secondaryParts.join(" · ") };
    }

    // original_only
    return { text: mainText, secondary: isSplit ? formatCurrency(original, cur) : undefined };
  };

  // Generate year options (last 5 years) and current date for navigation limits
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  // Check if viewing current month (can't go to future)
  const isAtCurrentMonth = selectedYear === currentYear && selectedMonth === currentMonth;
  const canGoNext = !isAtCurrentMonth;

  // Burn chart data (shared between mobile compact and desktop full)
  const burnChartCurrentExpenses = useMemo(() =>
    expenses
      .filter((e) => !e.excludeFromBudget && e.status !== "PENDING" && (!e.projects || e.projects.length === 0))
      .map((e) => ({ date: e.date, amountEur: effectiveEur(e) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses]
  );
  const burnChartPreviousExpenses = useMemo(() =>
    previousMonthExpenses
      .filter((e) => !e.excludeFromBudget && e.status !== "PENDING" && (!e.projects || e.projects.length === 0))
      .map((e) => ({ date: e.date, amountEur: effectiveEur(e) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previousMonthExpenses]
  );
  const currentMonthLabel = `${tTime(`months.${MONTH_KEYS[selectedMonth]}`)} ${selectedYear}`;
  const previousMonthLabel = `${tTime(`months.${MONTH_KEYS[selectedMonth === 0 ? 11 : selectedMonth - 1]}`)} ${selectedMonth === 0 ? selectedYear - 1 : selectedYear}`;

  // Whether to show sidebar/hero (month view with budget/income configured)
  const showBudgetInfo = viewMode === "month";


  return (
    <div {...swipeHandlers}>
      {/* Pull-to-refresh indicator (mobile) */}
      {isRefreshing && (
        <div className="flex justify-center py-2 md:hidden">
          <svg className="w-5 h-5 animate-spin text-[#0070f3]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      )}

      {/* Tidy-up nudge — only renders when there are uncategorized expenses */}
      <TidyUpNudge count={uncategorizedCount} />

      {/* ==================== MOBILE-ONLY HEADER ==================== */}
      <div className="md:hidden space-y-3">
        {/* Month Navigation */}
        {viewMode === "month" && (
          <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 p-3">
            <button
              onClick={goToPreviousMonth}
              className="p-2 rounded-lg text-slate-600 active:bg-slate-100 tap-none"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="text-center">
              <p className="font-semibold text-slate-900">{tTime(`months.${MONTH_KEYS[selectedMonth]}`)} {selectedYear}</p>
              <p className="text-xs text-slate-400">{t("swipeToChange")}</p>
            </div>
            <button
              onClick={goToNextMonth}
              disabled={!canGoNext}
              className={`p-2 rounded-lg tap-none transition-colors ${
                canGoNext ? "text-slate-600 active:bg-slate-100" : "text-slate-300 cursor-not-allowed"
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {isLoading && (
              <div className="absolute right-4">
                <svg className="w-4 h-4 animate-spin text-[#0070f3]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}
          </div>
        )}

        {/* Portfolio Summary Card (mobile) — only if exchanges connected */}
        {hasPortfolio && (
          <a href="/dashboard/portfolio" className="block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-indigo-500 mb-1">{t("portfolio.title")}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-[22px] font-extrabold text-slate-900 dark:text-white tabular-nums tracking-tight">
                  €{portfolioTotalValue.toFixed(2)}
                </span>
                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                  portfolioTotalPnl >= 0
                    ? "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                }`}>
                  {portfolioTotalPnl >= 0 ? "▲" : "▼"} {Math.abs(portfolioPnlPct).toFixed(1)}%
                </span>
              </div>
              <div className="flex gap-4 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                <div>
                  <p className="text-[9px] font-semibold uppercase text-slate-400 tracking-wide">{t("portfolio.invested")}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">€{portfolioTotalCost.toFixed(0)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase text-slate-400 tracking-wide">{t("portfolio.pnl")}</p>
                  <p className={`text-sm font-bold mt-0.5 tabular-nums ${portfolioTotalPnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {portfolioTotalPnl >= 0 ? "+" : ""}€{portfolioTotalPnl.toFixed(0)}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase text-slate-400 tracking-wide">{t("portfolio.freeCash")}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">€{portfolioFreeCash.toFixed(0)}</p>
                </div>
              </div>
            </div>
          </a>
        )}

        {/* Hero Card - expandable budget overview (month view only) */}
        {showBudgetInfo && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {/* Always visible: Ring + key numbers */}
            <div className="p-4 flex items-center gap-4">
              {/* Mini ring gauge */}
              <div className="relative flex-shrink-0" style={{ width: ringSize, height: ringSize }}>
                <svg className="transform -rotate-90" width={ringSize} height={ringSize}>
                  <circle cx={ringSize / 2} cy={ringSize / 2} r={ringRadius} fill="none" stroke="#e2e8f0" strokeWidth={ringStroke} />
                  <circle
                    cx={ringSize / 2} cy={ringSize / 2} r={ringRadius}
                    fill="none" stroke={ringColor} strokeWidth={ringStroke}
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringDashoffset}
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold text-slate-900">{budgetPercentage.toFixed(0)}%</span>
                </div>
              </div>

              {/* Key numbers */}
              <div className="flex-1 min-w-0">
                <p className="text-2xl font-bold text-slate-900 tabular-nums truncate">€{stats.budgetTotal.toFixed(2)}</p>
                <p className="text-xs text-slate-500 truncate">{t("budget.ofBudget", { budget: livingBudget.toFixed(2) })}</p>
                <div className="flex gap-3 mt-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-green-600 font-medium whitespace-nowrap">{t("income.received")}</p>
                    <p className="text-sm font-bold text-green-600 tabular-nums truncate">€{currentMonthIncome.toFixed(2)}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[10px] font-medium whitespace-nowrap ${balance >= 0 ? "text-blue-600" : "text-red-600"}`}>{t("income.balance")}</p>
                    <p className={`text-sm font-bold tabular-nums truncate ${balance >= 0 ? "text-blue-600" : "text-red-500"}`}>
                      €{balance.toFixed(2)}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[10px] font-medium whitespace-nowrap ${isOverBudget ? "text-red-600" : "text-green-600"}`}>{t("budgetRemaining")}</p>
                    <p className={`text-sm font-bold tabular-nums truncate ${isOverBudget ? "text-red-500" : "text-green-600"}`}>
                      {isOverBudget ? "-" : ""}€{Math.abs(budgetRemaining).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Expanded details */}
            {isDetailsExpanded && (
              <div>
                {/* Type Breakdown */}
                <div className="px-4 py-3 border-t border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">{t("typeBreakdown")}</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-slate-700">{t("stats.living")}</span>
                      </div>
                      <span className="font-medium text-slate-900">€{stats.living.toFixed(2)}</span>
                    </div>
                    <div className="pl-4 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{t("stats.fixed")}</span>
                      <span>€{stats.livingFixed.toFixed(2)}</span>
                    </div>
                    <div className="pl-4 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{t("stats.variable")}</span>
                      <span>€{stats.livingVariable.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-purple-500" />
                        <span className="text-slate-700">{t("stats.lifestyle")}</span>
                      </div>
                      <span className="font-medium text-slate-900">€{stats.lifestyle.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-orange-500" />
                        <span className="text-slate-700">{t("stats.projects")}</span>
                      </div>
                      <span className="font-medium text-slate-900">€{stats.projects.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[12px] pt-1.5 border-t border-slate-100">
                      <span className="font-semibold text-slate-900">{t("stats.grandTotal")}</span>
                      <span className="font-bold text-slate-900">€{stats.grandTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Category Breakdown */}
                {categoryData.length > 0 && (
                  <div className="px-4 py-3 border-t border-slate-100">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">{t("whereMoneyGoes")}</p>
                    <div className="h-2.5 rounded-full overflow-hidden bg-slate-100 flex">
                      {categoryData.map((cat, i) => (
                        <div
                          key={cat.name}
                          className="h-full"
                          style={{
                            width: `${cat.percentage}%`,
                            backgroundColor: cat.color,
                            marginLeft: i > 0 ? "1px" : 0,
                          }}
                        />
                      ))}
                    </div>
                    <div className="mt-2 space-y-1">
                      {categoryData.slice(0, 5).map((cat) => (
                        <div key={cat.name} className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="text-slate-600 truncate">{cat.name}</span>
                          </div>
                          <span className="font-medium text-slate-900 ml-2">€{cat.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mini Burn Chart */}
                <div className="px-4 py-3 border-t border-slate-100">
                  <Suspense fallback={<div className="h-24 animate-pulse bg-slate-100 rounded-lg" />}>
                    <BurnChart
                      currentMonthExpenses={burnChartCurrentExpenses}
                      previousMonthExpenses={burnChartPreviousExpenses}
                      currentMonthLabel={currentMonthLabel}
                      previousMonthLabel={previousMonthLabel}
                      compact
                    />
                  </Suspense>
                </div>
              </div>
            )}

            {/* Expand/collapse toggle */}
            <button
              onClick={toggleDetails}
              className="w-full py-2.5 flex items-center justify-center gap-1.5 text-[11px] text-blue-500 font-medium border-t border-slate-100 active:bg-slate-50"
            >
              <span>{isDetailsExpanded ? t("hideDetails") : t("showDetails")}</span>
              <svg className={`w-3.5 h-3.5 transition-transform ${isDetailsExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ==================== DESKTOP HUB LAYOUT (Option C) ==================== */}
      <div className="hidden md:block space-y-4">
        {/* Overview hero — greeting + net worth / spent / portfolio */}
        <OverviewHero
          userName={userName}
          netWorthEur={netWorthEur ?? portfolioTotalValue}
          netWorthDeltaEur={netWorthDeltaEur}
          spentEur={stats.budgetTotal}
          budgetEur={livingBudget}
          portfolioEur={portfolioTotalEur ?? portfolioTotalValue}
          portfolioDeltaEur={portfolioDeltaEur}
        />

        {/* Bento body — spending box (left) + rail (right) */}
        <div className="grid grid-cols-[2fr_1fr] gap-4 items-start">
          {/* LEFT: Spending box — gauge + burn + recent */}
          <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.07em]" style={{ color: "var(--accent)" }}>
                {t("thisMonth")}
              </span>
              <button
                onClick={() => setIsSelectorOpen(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-opacity hover:opacity-90"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                {t("addExpense")}
              </button>
            </div>

            <div className="flex items-center gap-6">
              <div className="relative flex-shrink-0" style={{ width: ringSize, height: ringSize }}>
                <svg className="-rotate-90" width={ringSize} height={ringSize}>
                  <circle cx={ringSize / 2} cy={ringSize / 2} r={ringRadius} fill="none" stroke="var(--surface-3)" strokeWidth={ringStroke} />
                  <circle
                    cx={ringSize / 2} cy={ringSize / 2} r={ringRadius}
                    fill="none" stroke={isOverBudget ? "var(--negative)" : "var(--accent)"} strokeWidth={ringStroke}
                    strokeLinecap="round" strokeDasharray={ringCircumference} strokeDashoffset={ringDashoffset}
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold tabular-nums">{budgetPercentage.toFixed(0)}%</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums">€{stats.budgetTotal.toFixed(2)}</span>
                  {showBudgetInfo && (
                    <span className="text-sm" style={{ color: "var(--ink-subtle)" }}>/ €{livingBudget.toFixed(0)}</span>
                  )}
                </div>
                <p className="mt-0.5 text-[12px]" style={{ color: isOverBudget ? "var(--negative)" : "var(--ink-muted)" }}>
                  {isOverBudget
                    ? `€${Math.abs(budgetRemaining).toFixed(0)} · ${budgetPercentage.toFixed(0)}%`
                    : `€${Math.max(budgetRemaining, 0).toFixed(0)} · ${budgetPercentage.toFixed(0)}% ${t("budget.used")}`}
                </p>
                {showBudgetInfo && (
                  <div className="mt-3">
                    <Suspense fallback={<div className="h-20 animate-pulse rounded-lg" style={{ background: "var(--surface-2)" }} />}>
                      <BurnChart
                        currentMonthExpenses={burnChartCurrentExpenses}
                        previousMonthExpenses={burnChartPreviousExpenses}
                        currentMonthLabel={currentMonthLabel}
                        previousMonthLabel={previousMonthLabel}
                        compact
                      />
                    </Suspense>
                  </div>
                )}
              </div>
            </div>

            <div className="my-4 h-px" style={{ background: "var(--line)" }} />

            {/* Inline quick-add — "mcd 12" parsed server-side */}
            <form onSubmit={handleInlineQuickAdd} className="mb-3 flex gap-2">
              <input
                value={quickAddText}
                onChange={(ev) => setQuickAddText(ev.target.value)}
                placeholder={t("quickAddPlaceholder")}
                className="flex-1 rounded-lg px-3 py-2 font-mono text-[13px] outline-none focus:ring-2"
                style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--ink)" }}
              />
              <button
                type="submit"
                disabled={quickAddBusy || !quickAddText.trim()}
                className="rounded-lg px-4 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                {quickAddBusy ? "…" : t("quickAddButton")}
              </button>
            </form>

            {expenses.length > 0 ? (
              <div>
                {expenses.slice(0, 5).map((e) => {
                  const shownEur = effectiveEur(e);
                  return (
                    <div
                      key={e.id}
                      onClick={() => handleViewExpense(e.id)}
                      className="-mx-2 flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--surface-2)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">{e.name}</p>
                          {e.projects && e.projects.length > 0 && e.projects.map((project) => (
                            <span
                              key={project.id}
                              className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px]"
                              style={{ background: "color-mix(in srgb, var(--warning) 15%, transparent)", color: "var(--warning)" }}
                            >
                              {project.name}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs" style={{ color: "var(--ink-subtle)" }}>
                          {new Date(e.date).toLocaleDateString("pt-PT", { day: "numeric", month: "short", timeZone: "UTC" })}
                        </p>
                      </div>
                      <p className="flex-shrink-0 text-sm font-semibold tabular-nums" style={{ color: shownEur < 0 ? "var(--positive)" : "var(--ink)" }}>
                        {shownEur < 0 ? `(€${Math.abs(shownEur).toFixed(2)})` : `-€${shownEur.toFixed(2)}`}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-4 text-center text-sm" style={{ color: "var(--ink-subtle)" }}>{t("logFirstExpense")}</p>
            )}
            <a href="/dashboard/expenses" className="block pt-2.5 text-center text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
              {t("viewAllMoney")} →
            </a>
          </div>

          {/* RIGHT: rail */}
          <div className="space-y-4">
            <RailPortfolio
              totalEur={portfolioTotalEur ?? portfolioTotalValue}
              deltaEur={portfolioDeltaEur}
              holdings={portfolioAssets.slice(0, 2).map((a) => ({ symbol: a.symbol, label: `${a.symbol} · ${a.exchange.label}`, valueEur: a.currentValueEur }))}
              exchangeCount={exchangeConnections.length}
              moreCount={Math.max(0, exchangeConnections.reduce((s, c) => s + c.assetCount, 0) - 2)}
              hasData={hasPortfolio}
            />
            <RailRwa
              equityEur={rwaEquityEur ?? 0}
              assets={rwaTopAssets ?? []}
              linkedDebtEur={rwaLinkedDebtEur ?? 0}
              hasData={(rwaTopAssets?.length ?? 0) > 0}
            />
            <RailCategories categories={topCategories ?? []} />
          </div>
        </div>
      </div>

      {/* ==================== MOBILE-ONLY LAYOUT ==================== */}
      <div className="mt-3 md:hidden">
        <div className="space-y-3">
          {/* Mobile Filters */}
          <div className="md:hidden bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex overflow-x-auto scrollbar-hide p-2 gap-2">
              {(["month", "quarter", "year", "all"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleFilterChange(setViewMode, mode)}
                  className={`flex-shrink-0 px-4 py-2 text-sm font-medium rounded-lg transition-colors tap-none ${
                    viewMode === mode
                      ? "bg-[#0070f3] text-white"
                      : "bg-slate-100 text-slate-600 active:bg-slate-200"
                  }`}
                >
                  {t(`viewModes.${mode}`)}
                </button>
              ))}
            </div>
            <div className="flex gap-2 p-2 pt-0 overflow-x-auto scrollbar-hide">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                className="flex-shrink-0 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white min-w-[120px]"
              >
                <option value="all">{t("filters.allTypes")}</option>
                <option value="income">{t("filters.income")}</option>
                <option value="living">{t("filters.living")}</option>
                <option value="lifestyle">{t("filters.lifestyle")}</option>
                <option value="project">{t("filters.projects")}</option>
              </select>
              <select
                value={selectedProjectId || ""}
                onChange={(e) => handleFilterChange(setSelectedProjectId, e.target.value || null)}
                className="flex-shrink-0 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white min-w-[120px]"
              >
                <option value="">{t("filters.allProjects")}</option>
                <option value="__none__">{t("filters.noProject")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* AI Advisor cold-start card (mobile) — suppressed when an unread retrospective exists */}
          {advisorState?.aiProcessingEnabled && advisorState?.isColdstart && !unreadRetro && (
            <Suspense fallback={null}>
              <AdvisorColdstartCard
                expenseCount={advisorState.expenseCount}
                monthsTracked={advisorState.monthsTracked}
              />
            </Suspense>
          )}

          {/* Transaction List */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 md:px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 text-sm md:text-base">
                {t("transactions.count", { count: filteredTransactions.length })}
              </h3>
              <span className="text-xs md:text-sm text-slate-500">{getDateRangeLabel()}</span>
            </div>

            {filteredTransactions.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {filteredTransactions.map((transaction) => {
                  const isIncome = isIncomeTransaction(transaction);
                  const isRowExpanded = expandedMobileRow === transaction.id;
                  return (
                    <div
                      key={transaction.id}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest("button")) return;
                        if (isIncome) return;

                        // Mobile: tap to reveal buttons, tap again to view detail
                        if (window.matchMedia("(max-width: 767px)").matches) {
                          if (isRowExpanded) {
                            handleViewExpense(transaction.id);
                            setExpandedMobileRow(null);
                          } else {
                            setExpandedMobileRow(transaction.id);
                          }
                        } else {
                          handleViewExpense(transaction.id);
                        }
                      }}
                      className={`px-4 md:px-5 py-3 flex items-center justify-between active:bg-slate-50 md:hover:bg-slate-50 transition-colors group tap-none cursor-pointer ${
                        isIncome ? "bg-green-50/30" :
                        !isIncome && transaction.status === "PENDING" ? "bg-blue-50/50 border-l-2 border-blue-400" :
                        transaction.excludeFromBudget ? "bg-slate-50/50" : ""
                      }`}
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                          {isIncome && (
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                              <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m0-16l-4 4m4-4l4 4" />
                              </svg>
                            </span>
                          )}
                          <p className={`font-medium text-sm md:text-base truncate max-w-[200px] md:max-w-none ${
                            isIncome ? "text-green-700" : transaction.excludeFromBudget ? "text-slate-400" : "text-slate-900"
                          }`}>{transaction.name}</p>
                          {!isIncome && transaction.projects && transaction.projects.length > 0 && transaction.projects.map((project) => (
                            <span key={project.id} className="px-1.5 md:px-2 py-0.5 text-[10px] md:text-xs rounded-full bg-orange-100 text-orange-700">
                              {project.name}
                            </span>
                          ))}
                          {!isIncome && transaction.excludeFromBudget && (
                            <span className="px-1.5 md:px-2 py-0.5 text-[10px] md:text-xs rounded-full bg-slate-200 text-slate-600">
                              {t("expenses.offshore")}
                            </span>
                          )}
                          {!isIncome && transaction.status === "PENDING" && (
                            <span className="flex items-center gap-1 px-1.5 md:px-2 py-0.5 text-[10px] md:text-xs rounded-full bg-blue-100 text-blue-700">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {t("expenses.scheduled")}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 md:gap-2 mt-0.5 md:mt-1 flex-wrap">
                          <span className="text-xs md:text-sm text-slate-500">
                            {new Date(transaction.date).toLocaleDateString("pt-PT", { day: "numeric", month: "short", timeZone: "UTC" })}
                          </span>
                          {isIncome ? (
                            <span className="text-xs md:text-sm font-medium text-green-600">
                              {tIncomes(`types.${transaction.incomeType.toLowerCase()}`)}
                            </span>
                          ) : (
                            <span
                              className={`text-xs md:text-sm font-medium ${
                                transaction.type === "SURVIVAL_FIXED" ? "text-blue-600" :
                                transaction.type === "SURVIVAL_VARIABLE" ? "text-cyan-600" :
                                transaction.type === "LIFESTYLE" ? "text-purple-600" :
                                "text-orange-600"
                              }`}
                            >
                              {transaction.type === "SURVIVAL_FIXED" ? t("expenseTypes.fixed") :
                               transaction.type === "SURVIVAL_VARIABLE" ? t("expenseTypes.variable") :
                               transaction.type === "LIFESTYLE" ? t("expenseTypes.lifestyle") : t("expenseTypes.project")}
                            </span>
                          )}
                          <span className="hidden md:inline text-slate-300">•</span>
                          <span className="hidden md:inline text-sm text-slate-400">{translateCategory(transaction.categoryName)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
                        {(() => {
                          const amt = renderAmount(transaction);
                          const colorClass = isIncome ? "text-green-600" :
                            transaction.excludeFromBudget ? "text-slate-400 line-through" :
                            transaction.amountEur < 0 ? "text-green-600" : "text-slate-900";
                          return amt.secondary ? (
                            <div className={`text-right whitespace-nowrap transition-transform duration-200 ease-out ${isRowExpanded ? "-translate-x-1" : ""} md:translate-x-0`}>
                              <p className={`font-semibold tabular-nums text-sm md:text-base ${colorClass}`}>
                                {amt.text}
                              </p>
                              <p className="text-[10px] md:text-xs text-slate-400 tabular-nums">
                                {amt.secondary}
                              </p>
                            </div>
                          ) : (
                            <p className={`font-semibold tabular-nums text-sm md:text-base whitespace-nowrap transition-transform duration-200 ease-out ${isRowExpanded ? "-translate-x-1" : ""} md:translate-x-0 ${colorClass}`}>
                              {amt.text}
                            </p>
                          );
                        })()}
                        {!isIncome && (
                          <>
                            {confirmDeleteId === transaction.id ? (
                              <div className="flex items-center gap-1 md:gap-2">
                                <button
                                  onClick={() => handleDelete(transaction.id)}
                                  disabled={deletingId === transaction.id}
                                  className="px-2 md:px-3 py-1.5 md:py-1 text-xs md:text-sm bg-red-500 text-white rounded-lg active:bg-red-600 md:hover:bg-red-600 disabled:opacity-50 tap-none"
                                >
                                  {deletingId === transaction.id ? "..." : "Del"}
                                </button>
                                <button
                                  onClick={() => { setConfirmDeleteId(null); setExpandedMobileRow(null); }}
                                  className="px-2 md:px-3 py-1.5 md:py-1 text-xs md:text-sm border border-slate-300 rounded-lg active:bg-slate-100 md:hover:bg-slate-100 tap-none"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <div className={`flex items-center gap-1 transition-all duration-200 ease-out ${
                                isRowExpanded
                                  ? "opacity-100 translate-x-0"
                                  : "opacity-0 translate-x-3 pointer-events-none"
                              } md:opacity-0 md:translate-x-0 md:pointer-events-auto md:group-hover:opacity-100`}>
                                <button
                                  onClick={() => handleToggleExclude(transaction as Expense)}
                                  className={`hidden md:inline-flex md:opacity-0 md:group-hover:opacity-100 p-2 rounded-lg transition-all tap-none ${
                                    transaction.excludeFromBudget
                                      ? "text-slate-500 active:text-slate-700 active:bg-slate-100 md:hover:text-slate-700 md:hover:bg-slate-100"
                                      : "text-slate-400 active:text-amber-500 active:bg-amber-50 md:hover:text-amber-500 md:hover:bg-amber-50"
                                  }`}
                                  aria-label={transaction.excludeFromBudget ? t("expenses.includeInBudget") : t("expenses.excludeFromBudget")}
                                  title={transaction.excludeFromBudget ? t("expenses.includeInBudget") : t("expenses.excludeFromBudget")}
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    {transaction.excludeFromBudget ? (
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    ) : (
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                    )}
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleEditExpense(transaction.id)}
                                  disabled={isLoadingExpense}
                                  className="p-1.5 md:p-2 text-slate-400 active:text-blue-500 active:bg-blue-50 md:hover:text-blue-500 md:hover:bg-blue-50 rounded-lg transition-all tap-none disabled:opacity-50"
                                  aria-label="Edit expense"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(transaction.id)}
                                  className="p-1.5 md:p-2 text-slate-400 active:text-red-500 active:bg-red-50 md:hover:text-red-500 md:hover:bg-red-50 rounded-lg transition-all tap-none"
                                  aria-label="Delete expense"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 md:px-6 py-8 md:py-12 text-center">
                <p className="text-slate-500 text-sm md:text-base">{t("transactions.noTransactions")}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== REAL-WORLD ASSETS (mobile — desktop shows it in the rail) ==================== */}
      <div className="mt-6 md:hidden">
        <Suspense fallback={null}>
          <DashboardRwaSection />
        </Suspense>
      </div>

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
              const id = viewingExpense.id;
              setViewingExpense(null);
              setConfirmDeleteId(id);
            }}
          />
        </Suspense>
      )}

      {showOnboarding && (
        <Suspense fallback={null}>
          <OnboardingModal
            isOpen={showOnboarding}
            onClose={handleOnboardingClose}
            existingData={{
              monthlySalary,
              monthlyBudget,
            }}
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

      {/* Retrospective popup — auto-shown on day 1 of month when unread insight exists */}
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
