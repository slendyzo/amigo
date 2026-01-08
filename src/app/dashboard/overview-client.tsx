"use client";

import { useState, useEffect, useMemo, lazy, Suspense, useCallback } from "react";
import { useRouter } from "next/navigation";
import AddExpenseModal from "@/components/add-expense-modal";
import EditExpenseModal from "@/components/edit-expense-modal";
import OnboardingModal from "@/components/onboarding-modal";
import { LivingGauge } from "@/components/ui/living-gauge";
import { useSwipe } from "@/hooks/use-swipe";

// Lazy load BurnChart to reduce initial bundle size (Recharts is ~45kB!)
const BurnChart = lazy(() => import("@/components/ui/burn-chart").then(mod => ({ default: mod.BurnChart })));

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
  amountEur: number;
  categoryName: string;
  projects: { id: string; name: string }[];
  excludeFromBudget?: boolean;
};

type Project = { id: string; name: string };
type Category = { id: string; name: string };
type BankAccount = { id: string; name: string };

type Props = {
  workspaceId: string;
  userName: string;
  initialExpenses: Expense[];
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
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

type ViewMode = "month" | "quarter" | "year" | "all";
type TypeFilter = "all" | "living" | "lifestyle" | "project";

export default function DashboardOverview({
  workspaceId,
  userName,
  initialExpenses,
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
}: Props) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
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

  // Edit state
  const [editingExpense, setEditingExpense] = useState<{
    id: string;
    name: string;
    amount: number;
    currency?: string;
    type: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT";
    date: string;
    category: { id: string; name: string } | null;
    bankAccount: { id: string; name: string } | null;
    projects: { id: string; name: string }[];
  } | null>(null);
  const [isLoadingExpense, setIsLoadingExpense] = useState(false);

  // Previous month data for burn chart (pre-loaded from server!)
  const [previousMonthExpenses, setPreviousMonthExpenses] = useState<Expense[]>(initialPreviousMonthExpenses);

  // Onboarding modal state - show if not completed
  const [showOnboarding, setShowOnboarding] = useState(!onboardingCompleted);

  // Use monthly budget from settings, or expected income, or default to 2000
  const livingBudget = monthlyBudget || expectedMonthlyIncome || 2000;

  // Track if we're on initial load (server data) vs user-changed filters
  const [hasFilterChanged, setHasFilterChanged] = useState(false);

  // Listen for quick-add event from bottom nav
  // This page handles its own modal, so stop propagation to prevent GlobalAddButton from also opening
  useEffect(() => {
    const handleQuickAdd = (e: Event) => {
      e.stopImmediatePropagation();
      setIsModalOpen(true);
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
    setHasFilterChanged(true);
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  }, [selectedMonth]);

  // Swipe handlers for month navigation (only in month view)
  const { handlers: swipeHandlers } = useSwipe({
    onSwipeLeft: viewMode === "month" ? goToNextMonth : undefined,
    onSwipeRight: viewMode === "month" ? goToPreviousMonth : undefined,
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

      const response = await fetch(`/api/expenses?${params}`);
      const data = await response.json();

      if (data.expenses) {
        setExpenses(data.expenses.map((e: {
          id: string;
          name: string;
          date: string;
          type: string;
          amountEur?: number;
          amount?: number;
          category?: { name: string } | null;
          projects?: { id: string; name: string }[];
          excludeFromBudget?: boolean;
        }) => ({
          id: e.id,
          name: e.name,
          date: e.date,
          type: e.type,
          amountEur: Number(e.amountEur ?? e.amount ?? 0),
          categoryName: e.category?.name || "Uncategorized",
          projects: e.projects || [],
          excludeFromBudget: e.excludeFromBudget ?? false,
        })));
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

      // Fetch BOTH in parallel!
      const [currentRes, prevRes] = await Promise.all([
        fetch(`/api/expenses?${currentParams}`),
        fetch(`/api/expenses?${prevParams}`),
      ]);

      const [currentData, prevData] = await Promise.all([
        currentRes.json(),
        prevRes.json(),
      ]);

      const transformExpense = (e: {
        id: string;
        name: string;
        date: string;
        type: string;
        amountEur?: number;
        amount?: number;
        category?: { name: string } | null;
        projects?: { id: string; name: string }[];
        excludeFromBudget?: boolean;
      }) => ({
        id: e.id,
        name: e.name,
        date: e.date,
        type: e.type,
        amountEur: Number(e.amountEur ?? e.amount ?? 0),
        categoryName: e.category?.name || "Uncategorized",
        projects: e.projects || [],
        excludeFromBudget: e.excludeFromBudget ?? false,
      });

      if (currentData.expenses) {
        setExpenses(currentData.expenses.map(transformExpense));
      }
      if (prevData.expenses) {
        setPreviousMonthExpenses(prevData.expenses.map(transformExpense));
      }
    } catch (error) {
      console.error("Failed to fetch expenses:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter expenses by type
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (typeFilter === "all") return true;
      if (typeFilter === "living") return e.type === "SURVIVAL_FIXED" || e.type === "SURVIVAL_VARIABLE";
      if (typeFilter === "lifestyle") return e.type === "LIFESTYLE";
      if (typeFilter === "project") return e.type === "PROJECT";
      return true;
    });
  }, [expenses, typeFilter]);

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

    const livingTotal = livingExpenses.reduce((sum, e) => sum + e.amountEur, 0);
    const lifestyleTotal = lifestyleExpenses.reduce((sum, e) => sum + e.amountEur, 0);
    const projectTotal = projectExpenses.reduce((sum, e) => sum + e.amountEur, 0);
    const totalExcludingProjects = livingTotal + lifestyleTotal;
    const grandTotal = livingTotal + lifestyleTotal + projectTotal;

    // Budget total excludes expenses marked as "excludeFromBudget"
    const budgetTotal = expenses
      .filter((e) => !e.excludeFromBudget)
      .reduce((sum, e) => sum + e.amountEur, 0);

    return {
      total: totalExcludingProjects,
      living: livingTotal,
      livingFixed: livingExpenses.filter((e) => e.type === "SURVIVAL_FIXED").reduce((sum, e) => sum + e.amountEur, 0),
      livingVariable: livingExpenses.filter((e) => e.type === "SURVIVAL_VARIABLE").reduce((sum, e) => sum + e.amountEur, 0),
      lifestyle: lifestyleTotal,
      projects: projectTotal,
      grandTotal,
      budgetTotal, // For the gauge - excludes "offshore" expenses
    };
  }, [expenses]);

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
        });
      }
    } catch (error) {
      console.error("Failed to fetch expense:", error);
    } finally {
      setIsLoadingExpense(false);
    }
  };

  const getDateRangeLabel = () => {
    switch (viewMode) {
      case "month":
        return `${MONTHS[selectedMonth]} ${selectedYear}`;
      case "quarter":
        return `Q${selectedQuarter} ${selectedYear}`;
      case "year":
        return `${selectedYear}`;
      case "all":
        return "All Time";
    }
  };

  // Generate year options (last 5 years)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-4 md:space-y-6" {...swipeHandlers}>
      {/* Header with Welcome and Add Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Welcome, {userName}!</h1>
          <p className="text-slate-500 text-xs md:text-sm">Here&apos;s your financial overview</p>
        </div>
        {/* Desktop add button - hidden on mobile (use bottom nav instead) */}
        <button
          onClick={() => setIsModalOpen(true)}
          className="hidden md:flex items-center gap-2 rounded-lg bg-[#0070f3] px-4 py-2.5 text-white font-medium hover:bg-[#0060df] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Expense
        </button>
      </div>

      {/* Mobile Month Navigation with Swipe hint */}
      {viewMode === "month" && (
        <div className="md:hidden flex items-center justify-between bg-white rounded-xl border border-slate-200 p-3">
          <button
            onClick={goToPreviousMonth}
            className="p-2 rounded-lg text-slate-600 active:bg-slate-100 tap-none"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-center">
            <p className="font-semibold text-slate-900">{MONTHS[selectedMonth]} {selectedYear}</p>
            <p className="text-xs text-slate-400">Swipe to change month</p>
          </div>
          <button
            onClick={goToNextMonth}
            className="p-2 rounded-lg text-slate-600 active:bg-slate-100 tap-none"
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

      {/* Mobile Filters - Collapsible */}
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
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex gap-2 p-2 pt-0 overflow-x-auto scrollbar-hide">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="flex-shrink-0 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white min-w-[120px]"
          >
            <option value="all">All Types</option>
            <option value="living">Living</option>
            <option value="lifestyle">Lifestyle</option>
            <option value="project">Projects</option>
          </select>
          <select
            value={selectedProjectId || ""}
            onChange={(e) => handleFilterChange(setSelectedProjectId, e.target.value || null)}
            className="flex-shrink-0 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white min-w-[120px]"
          >
            <option value="">All Projects</option>
            <option value="__none__">No Project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Desktop Filters Bar */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* View Mode Tabs */}
          <div className="flex rounded-lg border border-slate-200 p-1">
            {(["month", "quarter", "year", "all"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => handleFilterChange(setViewMode, mode)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === mode
                    ? "bg-[#0070f3] text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>

          {/* Date Selectors */}
          {viewMode === "month" && (
            <>
              <select
                value={selectedMonth}
                onChange={(e) => handleFilterChange(setSelectedMonth, parseInt(e.target.value))}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
              >
                {MONTHS.map((month, i) => (
                  <option key={i} value={i}>{month}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => handleFilterChange(setSelectedYear, parseInt(e.target.value))}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </>
          )}

          {viewMode === "quarter" && (
            <>
              <select
                value={selectedQuarter}
                onChange={(e) => handleFilterChange(setSelectedQuarter, parseInt(e.target.value))}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
              >
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>Q{q}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => handleFilterChange(setSelectedYear, parseInt(e.target.value))}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </>
          )}

          {viewMode === "year" && (
            <select
              value={selectedYear}
              onChange={(e) => handleFilterChange(setSelectedYear, parseInt(e.target.value))}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          )}

          {/* Divider */}
          <div className="h-8 w-px bg-slate-200" />

          {/* Project Filter */}
          <select
            value={selectedProjectId || ""}
            onChange={(e) => handleFilterChange(setSelectedProjectId, e.target.value || null)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
          >
            <option value="">All Projects</option>
            <option value="__none__">No Project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
          >
            <option value="all">All Types</option>
            <option value="living">Living Only</option>
            <option value="lifestyle">Lifestyle Only</option>
            <option value="project">Projects Only</option>
          </select>

          {/* Loading indicator */}
          {isLoading && (
            <div className="ml-auto">
              <svg className="w-5 h-5 animate-spin text-[#0070f3]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Income & Balance Summary - Mobile optimized */}
      {viewMode === "month" && (expectedMonthlyIncome > 0 || monthlyIncome > 0) && (
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-3 md:p-5 rounded-xl border border-green-200">
            <p className="text-xs md:text-sm text-green-700 mb-0.5 md:mb-1">Expected</p>
            <p className="text-base md:text-2xl font-bold text-green-600">€{expectedMonthlyIncome.toFixed(0)}</p>
            <p className="hidden md:block text-xs text-green-600/70 mt-1">Recurring salary/income</p>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-3 md:p-5 rounded-xl border border-green-200">
            <p className="text-xs md:text-sm text-green-700 mb-0.5 md:mb-1">Received</p>
            <p className="text-base md:text-2xl font-bold text-green-600">€{monthlyIncome.toFixed(0)}</p>
            <p className="hidden md:block text-xs text-green-600/70 mt-1">All income sources</p>
          </div>
          <div className={`p-3 md:p-5 rounded-xl border ${
            (monthlyIncome || expectedMonthlyIncome) - stats.grandTotal >= 0
              ? "bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200"
              : "bg-gradient-to-br from-red-50 to-orange-50 border-red-200"
          }`}>
            <p className={`text-xs md:text-sm mb-0.5 md:mb-1 ${
              (monthlyIncome || expectedMonthlyIncome) - stats.grandTotal >= 0
                ? "text-blue-700"
                : "text-red-700"
            }`}>Balance</p>
            <p className={`text-base md:text-2xl font-bold ${
              (monthlyIncome || expectedMonthlyIncome) - stats.grandTotal >= 0
                ? "text-blue-600"
                : "text-red-600"
            }`}>
              €{((monthlyIncome || expectedMonthlyIncome) - stats.grandTotal).toFixed(0)}
            </p>
            <p className={`hidden md:block text-xs mt-1 ${
              (monthlyIncome || expectedMonthlyIncome) - stats.grandTotal >= 0
                ? "text-blue-600/70"
                : "text-red-600/70"
            }`}>
              {(monthlyIncome || expectedMonthlyIncome) - stats.grandTotal >= 0 ? "Surplus" : "Deficit"} after all expenses
            </p>
          </div>
        </div>
      )}

      {/* Stats Cards - Mobile optimized */}
      <div className="grid grid-cols-2 gap-2 md:gap-4 md:grid-cols-4 lg:grid-cols-5">
        <div className="bg-white p-3 md:p-5 rounded-xl border border-slate-200">
          <p className="text-xs md:text-sm text-slate-500 mb-0.5 md:mb-1">Total</p>
          <p className="text-lg md:text-2xl font-bold text-slate-900">€{stats.total.toFixed(0)}</p>
          <p className="hidden md:block text-xs text-slate-400 mt-1">{getDateRangeLabel()}</p>
        </div>
        <div className="bg-white p-3 md:p-5 rounded-xl border border-slate-200">
          <p className="text-xs md:text-sm text-slate-500 mb-0.5 md:mb-1">Living</p>
          <p className="text-lg md:text-2xl font-bold text-[#0070f3]">€{stats.living.toFixed(0)}</p>
          <div className="hidden md:block text-xs text-slate-400 mt-1 space-y-0.5">
            <p>Fixed: €{stats.livingFixed.toFixed(2)}</p>
            <p>Variable: €{stats.livingVariable.toFixed(2)}</p>
          </div>
        </div>
        <div className="bg-white p-3 md:p-5 rounded-xl border border-slate-200">
          <p className="text-xs md:text-sm text-slate-500 mb-0.5 md:mb-1">Lifestyle</p>
          <p className="text-lg md:text-2xl font-bold text-purple-600">€{stats.lifestyle.toFixed(0)}</p>
          <p className="hidden md:block text-xs text-slate-400 mt-1">Daily spending</p>
        </div>
        <div className="bg-white p-3 md:p-5 rounded-xl border border-slate-200">
          <p className="text-xs md:text-sm text-slate-500 mb-0.5 md:mb-1">Projects</p>
          <p className="text-lg md:text-2xl font-bold text-orange-600">€{stats.projects.toFixed(0)}</p>
          <p className="hidden md:block text-xs text-slate-400 mt-1">{projects.length} project(s)</p>
        </div>
        <div className="col-span-2 md:col-span-1 bg-white p-3 md:p-5 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100">
          <p className="text-xs md:text-sm text-slate-500 mb-0.5 md:mb-1">Grand Total</p>
          <p className="text-lg md:text-2xl font-bold text-slate-900">€{stats.grandTotal.toFixed(0)}</p>
          <p className="hidden md:block text-xs text-slate-400 mt-1">Including projects</p>
        </div>
      </div>

      {/* Visualizations - Mobile optimized */}
      {viewMode === "month" && (
        <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
          {/* Monthly Budget Gauge - shows all expenses except those marked "excludeFromBudget" */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6 flex items-center justify-center">
            <LivingGauge
              current={stats.budgetTotal}
              budget={livingBudget}
              label="Monthly Budget"
            />
          </div>

          {/* Burn Chart - Lazy loaded, hidden on mobile for performance */}
          <div className="hidden md:block lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4 md:p-6">
            <Suspense fallback={<ChartSkeleton />}>
              <BurnChart
                currentMonthExpenses={expenses
                  .filter((e) => !e.projects || e.projects.length === 0)
                  .map((e) => ({ date: e.date, amountEur: e.amountEur }))}
                previousMonthExpenses={previousMonthExpenses
                  .filter((e) => !e.projects || e.projects.length === 0)
                  .map((e) => ({ date: e.date, amountEur: e.amountEur }))}
                currentMonthLabel={`${MONTHS[selectedMonth]} ${selectedYear}`}
                previousMonthLabel={`${MONTHS[selectedMonth === 0 ? 11 : selectedMonth - 1]} ${selectedMonth === 0 ? selectedYear - 1 : selectedYear}`}
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* Expenses List - Mobile optimized */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 md:px-6 py-3 md:py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 text-sm md:text-base">
            Expenses ({filteredExpenses.length})
          </h3>
          <span className="text-xs md:text-sm text-slate-500">{getDateRangeLabel()}</span>
        </div>

        {filteredExpenses.length > 0 ? (
          <div className="divide-y divide-slate-100 max-h-[400px] md:max-h-[500px] overflow-y-auto scroll-touch">
            {filteredExpenses.map((expense) => (
              <div
                key={expense.id}
                className={`px-4 md:px-6 py-3 md:py-4 flex items-start md:items-center justify-between active:bg-slate-50 md:hover:bg-slate-50 transition-colors group tap-none ${expense.excludeFromBudget ? "bg-slate-50/50" : ""}`}
              >
                <div className="flex-1 min-w-0 mr-3">
                  <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                    <p className={`font-medium text-sm md:text-base truncate max-w-[180px] md:max-w-none ${expense.excludeFromBudget ? "text-slate-400" : "text-slate-900"}`}>{expense.name}</p>
                    {expense.projects && expense.projects.length > 0 && expense.projects.map((project) => (
                      <span key={project.id} className="px-1.5 md:px-2 py-0.5 text-[10px] md:text-xs rounded-full bg-orange-100 text-orange-700">
                        {project.name}
                      </span>
                    ))}
                    {expense.excludeFromBudget && (
                      <span className="px-1.5 md:px-2 py-0.5 text-[10px] md:text-xs rounded-full bg-slate-200 text-slate-600">
                        Offshore
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 md:gap-2 mt-0.5 md:mt-1 flex-wrap">
                    <span className="text-xs md:text-sm text-slate-500">
                      {new Date(expense.date).toLocaleDateString("pt-PT", { day: "numeric", month: "short" })}
                    </span>
                    <span
                      className={`text-xs md:text-sm font-medium ${
                        expense.type === "SURVIVAL_FIXED" ? "text-blue-600" :
                        expense.type === "SURVIVAL_VARIABLE" ? "text-cyan-600" :
                        expense.type === "LIFESTYLE" ? "text-purple-600" :
                        "text-orange-600"
                      }`}
                    >
                      {expense.type === "SURVIVAL_FIXED" ? "Fixed" :
                       expense.type === "SURVIVAL_VARIABLE" ? "Variable" :
                       expense.type === "LIFESTYLE" ? "Life" : "Proj"}
                    </span>
                    <span className="hidden md:inline text-slate-300">•</span>
                    <span className="hidden md:inline text-sm text-slate-400">{expense.categoryName}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
                  <p className={`font-semibold tabular-nums text-sm md:text-base ${
                    expense.excludeFromBudget ? "text-slate-400 line-through" :
                    expense.amountEur < 0 ? "text-green-600" : "text-slate-900"
                  }`}>
                    {expense.amountEur < 0
                      ? `(€${Math.abs(expense.amountEur).toFixed(2)})`
                      : `€${expense.amountEur.toFixed(2)}`}
                  </p>
                  {confirmDeleteId === expense.id ? (
                    <div className="flex items-center gap-1 md:gap-2">
                      <button
                        onClick={() => handleDelete(expense.id)}
                        disabled={deletingId === expense.id}
                        className="px-2 md:px-3 py-1.5 md:py-1 text-xs md:text-sm bg-red-500 text-white rounded-lg active:bg-red-600 md:hover:bg-red-600 disabled:opacity-50 tap-none"
                      >
                        {deletingId === expense.id ? "..." : "Del"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 md:px-3 py-1.5 md:py-1 text-xs md:text-sm border border-slate-300 rounded-lg active:bg-slate-100 md:hover:bg-slate-100 tap-none"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      {/* Toggle exclude from budget */}
                      <button
                        onClick={() => handleToggleExclude(expense)}
                        className={`md:opacity-0 md:group-hover:opacity-100 p-2 rounded-lg transition-all tap-none ${
                          expense.excludeFromBudget
                            ? "text-slate-500 active:text-slate-700 active:bg-slate-100 md:hover:text-slate-700 md:hover:bg-slate-100"
                            : "text-slate-400 active:text-amber-500 active:bg-amber-50 md:hover:text-amber-500 md:hover:bg-amber-50"
                        }`}
                        aria-label={expense.excludeFromBudget ? "Include in budget" : "Exclude from budget"}
                        title={expense.excludeFromBudget ? "Include in budget" : "Exclude from budget (offshore)"}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {expense.excludeFromBudget ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          )}
                        </svg>
                      </button>
                      {/* Edit button */}
                      <button
                        onClick={() => handleEditExpense(expense.id)}
                        disabled={isLoadingExpense}
                        className="md:opacity-0 md:group-hover:opacity-100 p-2 text-slate-400 active:text-blue-500 active:bg-blue-50 md:hover:text-blue-500 md:hover:bg-blue-50 rounded-lg transition-all tap-none disabled:opacity-50"
                        aria-label="Edit expense"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      {/* Delete button */}
                      <button
                        onClick={() => setConfirmDeleteId(expense.id)}
                        className="md:opacity-0 md:group-hover:opacity-100 p-2 text-slate-400 active:text-red-500 active:bg-red-50 md:hover:text-red-500 md:hover:bg-red-50 rounded-lg transition-all tap-none"
                        aria-label="Delete expense"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 md:px-6 py-8 md:py-12 text-center">
            <p className="text-slate-500 text-sm md:text-base">No expenses found for this period.</p>
          </div>
        )}
      </div>

      {/* Add Expense Modal */}
      <AddExpenseModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          fetchExpenses();
        }}
        categories={categories}
        bankAccounts={bankAccounts}
      />

      {/* Edit Expense Modal */}
      <EditExpenseModal
        isOpen={!!editingExpense}
        onClose={() => setEditingExpense(null)}
        expense={editingExpense}
        categories={categories}
        bankAccounts={bankAccounts}
        projects={projects}
        onSave={() => {
          setEditingExpense(null);
          fetchExpenses();
        }}
      />

      {/* Onboarding Modal - shown for new users */}
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        existingData={{
          monthlySalary,
          monthlyBudget,
        }}
      />
    </div>
  );
}
