"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import AddExpenseModal from "@/components/add-expense-modal";
import EditExpenseModal from "@/components/edit-expense-modal";
import ExpenseDetailModal from "@/components/expense-detail-modal";
import AssetLinkPicker from "@/components/asset-link-picker";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import { formatCurrency } from "@/lib/currencies";
import { effectiveEur, getUserShare } from "@/lib/split-utils";
import ExportModal from "@/components/export-modal";
import NudgeCategorizeCard from "@/components/nudge-categorize-card";
import NudgeCategorizeModal from "@/components/nudge-categorize-modal";

type Expense = {
  id: string;
  name: string;
  amount: number;
  currency?: string;
  amountEur?: number;
  type: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT";
  date: string;
  isRecurring?: boolean;
  recurringTemplateId?: string | null;
  category: { id: string; name: string } | null;
  bankAccount: { id: string; name: string } | null;
  projects: { id: string; name: string }[];
  imageUrls?: string | null;
  splitCount?: number | null;
  splitData?: string | null;
  createdAt: string;
};

type Category = {
  id: string;
  name: string;
};

type BankAccount = {
  id: string;
  name: string;
};

type Project = {
  id: string;
  name: string;
};

type GroupedExpenses = {
  monthKey: string;
  monthLabel: string;
  expenses: Expense[];
  total: number;
};

export default function ExpensesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("expenses");
  const tTime = useTranslations("time");
  const tCommon = useTranslations("common");
  const { translateCategory } = useCategoryTranslation();

  // Get translated month names
  const MONTHS = [
    tTime("months.january"), tTime("months.february"), tTime("months.march"),
    tTime("months.april"), tTime("months.may"), tTime("months.june"),
    tTime("months.july"), tTime("months.august"), tTime("months.september"),
    tTime("months.october"), tTime("months.november"), tTime("months.december")
  ];

  const SHORT_MONTHS = [
    tTime("monthsShort.jan"), tTime("monthsShort.feb"), tTime("monthsShort.mar"),
    tTime("monthsShort.apr"), tTime("monthsShort.may"), tTime("monthsShort.jun"),
    tTime("monthsShort.jul"), tTime("monthsShort.aug"), tTime("monthsShort.sep"),
    tTime("monthsShort.oct"), tTime("monthsShort.nov"), tTime("monthsShort.dec")
  ];
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Bulk asset-link
  const tRwa = useTranslations("rwa");
  const [showBulkLinkModal, setShowBulkLinkModal] = useState(false);
  const [bulkLinkAssetId, setBulkLinkAssetId] = useState<string | null>(null);
  const [bulkLinkBusy, setBulkLinkBusy] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>(searchParams.get("category") || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "amount" | "name" | "category">("date");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // Export state
  const [showExportModal, setShowExportModal] = useState(false);

  // Nudge — categorize
  const [nudgeCount, setNudgeCount] = useState(0);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [showCategorizeModal, setShowCategorizeModal] = useState(false);

  useEffect(() => {
    fetch("/api/user/ai-consent")
      .then((r) => r.json())
      .then((d) => setAiEnabled(!!d.aiProcessingEnabled))
      .catch(() => {});
    fetch("/api/insights/nudges/categorize?countOnly=1")
      .then((r) => r.json())
      .then((d) => setNudgeCount(d.count ?? 0))
      .catch(() => {});
  }, []);

  // Month filter - defaults to current month
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>(
    searchParams.get("category") ? "all" : `${currentYear}-${String(currentMonth).padStart(2, "0")}`
  );
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // Total count
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchData();
  }, [typeFilter, selectedMonthFilter]);

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

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      // Always fetch all expenses - we handle pagination client-side for better UX
      params.set("limit", "10000");
      if (typeFilter) params.set("type", typeFilter);

      const [expensesRes, categoriesRes, accountsRes, projectsRes] = await Promise.all([
        fetch(`/api/expenses?${params}`),
        fetch("/api/categories"),
        fetch("/api/bank-accounts"),
        fetch("/api/projects"),
      ]);

      if (expensesRes.ok) {
        const data = await expensesRes.json();
        setExpenses(data.expenses);
        setTotal(data.total);
      }
      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        setCategories(data.categories || []);
      }
      if (accountsRes.ok) {
        const data = await accountsRes.json();
        setBankAccounts(data.bankAccounts || []);
      }
      if (projectsRes.ok) {
        const data = await projectsRes.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
      if (response.ok) {
        setExpenses(expenses.filter((e) => e.id !== id));
        setTotal((prev) => prev - 1);
      }
    } catch (error) {
      console.error("Failed to delete expense:", error);
    }
    setDeleteId(null);
  };

  // Selection handlers
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      // Exit selection mode if nothing selected
      if (newSet.size === 0) {
        setIsSelectionMode(false);
      }
      return newSet;
    });
  };

  const handleLongPressStart = (id: string) => {
    longPressTimerRef.current = setTimeout(() => {
      setIsSelectionMode(true);
      setSelectedIds(new Set([id]));
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const selectAll = () => {
    const allIds = sortedExpenses.map((e) => e.id);
    setSelectedIds(new Set(allIds));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const handleBulkLink = async (link: boolean) => {
    if (selectedIds.size === 0) return;
    setBulkLinkBusy(true);
    try {
      const response = await fetch("/api/expenses/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          realAssetId: link ? bulkLinkAssetId : null,
        }),
      });
      if (response.ok) {
        clearSelection();
        setShowBulkLinkModal(false);
        setBulkLinkAssetId(null);
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to bulk-link expenses:", error);
    } finally {
      setBulkLinkBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    setIsDeleting(true);
    try {
      const response = await fetch("/api/expenses/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      if (response.ok) {
        const data = await response.json();
        setExpenses(expenses.filter((e) => !selectedIds.has(e.id)));
        setTotal((prev) => prev - data.deleted);
        clearSelection();
      }
    } catch (error) {
      console.error("Failed to delete expenses:", error);
    } finally {
      setIsDeleting(false);
      setShowBulkDeleteConfirm(false);
    }
  };

  // Export handled by ExportModal component

  // Sort and filter expenses
  const sortedExpenses = useMemo(() => {
    let filtered = expenses.filter((e) =>
      searchQuery ? e.name.toLowerCase().includes(searchQuery.toLowerCase()) : true
    );

    // Apply category filter
    if (categoryFilter) {
      filtered = filtered.filter((e) => e.category?.id === categoryFilter);
    }

    // Apply month filter (unless "all" is selected)
    if (selectedMonthFilter !== "all") {
      filtered = filtered.filter((e) => {
        const date = new Date(e.date);
        const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth()).padStart(2, "0")}`;
        return monthKey === selectedMonthFilter;
      });
    }

    // Sort based on current sort settings
    return [...filtered].sort((a, b) => {
      if (sortBy === "date") {
        // Include full timestamp for proper time-based sorting
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        const dateDiff = sortOrder === "desc" ? dateB - dateA : dateA - dateB;
        if (dateDiff !== 0) return dateDiff;
        // Tiebreaker: most recently created first
        const createdA = new Date(a.createdAt).getTime();
        const createdB = new Date(b.createdAt).getTime();
        return createdB - createdA;
      } else if (sortBy === "amount") {
        const amountA = Number(a.amount);
        const amountB = Number(b.amount);
        return sortOrder === "desc" ? amountB - amountA : amountA - amountB;
      } else if (sortBy === "name") {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();
        return sortOrder === "desc" ? nameB.localeCompare(nameA) : nameA.localeCompare(nameB);
      } else if (sortBy === "category") {
        const catA = (a.category?.name || "").toLowerCase();
        const catB = (b.category?.name || "").toLowerCase();
        return sortOrder === "desc" ? catB.localeCompare(catA) : catA.localeCompare(catB);
      }
      return 0;
    });
  }, [expenses, searchQuery, categoryFilter, sortBy, sortOrder, selectedMonthFilter]);

  // Group expenses by month (for grouped view)
  const groupedExpenses = useMemo(() => {
    // Group by month-year
    const groups: Record<string, Expense[]> = {};
    sortedExpenses.forEach((expense) => {
      const date = new Date(expense.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, "0")}`;
      if (!groups[monthKey]) {
        groups[monthKey] = [];
      }
      groups[monthKey].push(expense);
    });

    // Convert to array and sort months
    const result: GroupedExpenses[] = Object.entries(groups)
      .map(([monthKey, monthExpenses]) => {
        const [year, month] = monthKey.split("-");
        return {
          monthKey,
          monthLabel: `${MONTHS[parseInt(month)]} ${year}`,
          expenses: monthExpenses, // Already sorted from sortedExpenses
          total: monthExpenses.reduce(
            (sum, e) => sum + effectiveEur({ ...e, amountEur: e.amountEur ?? e.amount }),
            0
          ),
        };
      })
      .sort((a, b) => sortOrder === "desc"
        ? b.monthKey.localeCompare(a.monthKey)
        : a.monthKey.localeCompare(b.monthKey)
      );

    return result;
  }, [sortedExpenses, sortOrder]);


  // Compute available years from expenses
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    // Always include current year
    years.add(currentYear);
    expenses.forEach((e) => {
      const year = new Date(e.date).getUTCFullYear();
      years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a); // Most recent first
  }, [expenses, currentYear]);

  const typeColors: Record<string, string> = {
    SURVIVAL_FIXED: "bg-blue-100 text-blue-700",
    SURVIVAL_VARIABLE: "bg-cyan-100 text-cyan-700",
    LIFESTYLE: "bg-purple-100 text-purple-700",
    PROJECT: "bg-amber-100 text-amber-700",
  };

  const typeLabels: Record<string, string> = {
    SURVIVAL_FIXED: t("types.fixed"),
    SURVIVAL_VARIABLE: t("types.variable"),
    LIFESTYLE: t("types.lifestyle"),
    PROJECT: t("types.project"),
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Categorize nudge */}
      {aiEnabled && nudgeCount >= 5 && (
        <NudgeCategorizeCard
          count={nudgeCount}
          onClick={() => setShowCategorizeModal(true)}
        />
      )}

      {/* Categorize modal */}
      <NudgeCategorizeModal
        isOpen={showCategorizeModal}
        onClose={() => {
          setShowCategorizeModal(false);
          fetch("/api/insights/nudges/categorize?countOnly=1")
            .then((r) => r.json())
            .then((d) => setNudgeCount(d.count ?? 0))
            .catch(() => {});
          router.refresh();
        }}
      />

      {/* Selection Bar */}
      {isSelectionMode && (
        <div className="bg-[#0070f3] text-white rounded-xl p-3 md:p-4 shadow-sm flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <button
              onClick={clearSelection}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <span className="font-medium">
              {selectedIds.size} {t("selected")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="px-3 py-1.5 text-sm bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            >
              {t("selectAll")}
            </button>
            <button
              onClick={() => setShowBulkLinkModal(true)}
              className="px-3 py-1.5 text-sm bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 17H3v-5l2-5h11l4 5v5h-2M5 17h10M5 12h14" />
              </svg>
              {tRwa("bulkLinkAction")}
            </button>
            <button
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="px-3 py-1.5 text-sm bg-red-500 hover:bg-red-600 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {tCommon("delete")}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      {!isSelectionMode && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">{t("title")}</h1>
            <p className="text-slate-500 text-xs md:text-sm mt-0.5 md:mt-1">
              {selectedMonthFilter !== "all" ? (
                <>
                  {sortedExpenses.length} {t("title").toLowerCase()} {
                    selectedMonthFilter === `${currentYear}-${String(currentMonth).padStart(2, "0")}`
                      ? tTime("thisMonth").toLowerCase()
                      : MONTHS[parseInt(selectedMonthFilter.split("-")[1])] + " " + selectedMonthFilter.split("-")[0]
                  }
                </>
              ) : (
                <>{total} {t("total").toLowerCase()} {t("title").toLowerCase()}</>
              )}
            </p>
          </div>
          {/* Desktop add button */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="hidden md:flex items-center gap-2 bg-[#0070f3] text-white px-4 py-2 rounded-lg hover:bg-[#0060df] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t("addExpense")}
          </button>
        </div>
      )}

      {/* Year & Month Filter Bar */}
      <div className="bg-white rounded-xl p-2 md:p-4 shadow-sm border border-slate-200">
        {/* Year selector */}
        <div className="flex gap-2 items-center mb-2 pb-2 border-b border-slate-100">
          <span className="text-xs text-slate-500 font-medium mr-1">{t("year")}:</span>
          {availableYears.map((year) => (
            <button
              key={year}
              onClick={() => {
                setSelectedYear(year);
                // If current filter is for a different year, reset to first month of new year
                if (selectedMonthFilter !== "all") {
                  const filterYear = parseInt(selectedMonthFilter.split("-")[0]);
                  if (filterYear !== year) {
                    // Select January of the new year, or current month if it's current year
                    const targetMonth = year === currentYear ? currentMonth : 0;
                    setSelectedMonthFilter(`${year}-${String(targetMonth).padStart(2, "0")}`);
                  }
                }
              }}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors tap-none ${
                selectedYear === year
                  ? "bg-slate-700 text-white"
                  : "bg-slate-100 text-slate-600 active:bg-slate-200 md:hover:bg-slate-200"
              }`}
            >
              {year}
            </button>
          ))}
        </div>

        {/* Month selector */}
        <div className="flex gap-2 items-center overflow-x-auto scrollbar-hide pb-1">
          {/* All button */}
          <button
            onClick={() => setSelectedMonthFilter("all")}
            className={`flex-shrink-0 px-3 py-1.5 md:py-1.5 rounded-full text-sm font-medium transition-colors tap-none ${
              selectedMonthFilter === "all"
                ? "bg-[#0070f3] text-white"
                : "bg-slate-100 text-slate-600 active:bg-slate-200 md:hover:bg-slate-200"
            }`}
          >
            {tCommon("all")}
          </button>

          {/* Months for selected year */}
          {MONTHS.map((month, index) => {
            const monthKey = `${selectedYear}-${String(index).padStart(2, "0")}`;
            const isSelected = selectedMonthFilter === monthKey;
            // Only disable future months in current year
            const isFuture = selectedYear === currentYear && index > currentMonth;
            return (
              <button
                key={monthKey}
                onClick={() => setSelectedMonthFilter(monthKey)}
                disabled={isFuture}
                className={`flex-shrink-0 px-3 py-1.5 md:py-1.5 rounded-full text-sm font-medium transition-colors tap-none ${
                  isSelected
                    ? "bg-[#0070f3] text-white"
                    : isFuture
                    ? "bg-slate-50 text-slate-300 cursor-not-allowed"
                    : "bg-slate-100 text-slate-600 active:bg-slate-200 md:hover:bg-slate-200"
                }`}
              >
                {SHORT_MONTHS[index]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters - Mobile optimized */}
      <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row gap-3 md:gap-4 md:items-center">
          {/* Search */}
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 md:py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
            />
          </div>
          {/* Filter row */}
          <div className="flex gap-2 items-center">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-1 min-w-0">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="flex-shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
              >
                <option value="">{t("filterByType")}</option>
                <option value="SURVIVAL_FIXED">{t("types.fixed")}</option>
                <option value="SURVIVAL_VARIABLE">{t("types.variable")}</option>
                <option value="LIFESTYLE">{t("types.lifestyle")}</option>
                <option value="PROJECT">{t("types.project")}</option>
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="flex-shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
              >
                <option value="">{t("filterByCategory")}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{translateCategory(cat.name)}</option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "date" | "amount" | "name" | "category")}
                className="flex-shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
              >
                <option value="date">{t("sortByDate")}</option>
                <option value="amount">{t("sortByAmount")}</option>
                <option value="name">{t("sortByName")}</option>
                <option value="category">{t("sortByCategory")}</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
                className="flex-shrink-0 p-2 rounded-lg border border-slate-300 active:bg-slate-50 md:hover:bg-slate-50 tap-none"
                title={sortOrder === "desc" ? t("descending") : t("ascending")}
              >
                {sortOrder === "desc" ? (
                  <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                  </svg>
                )}
              </button>
            </div>
            {/* Export button — always visible, outside scrollable area */}
            <button
              onClick={() => setShowExportModal(true)}
              className="flex-shrink-0 p-2 rounded-lg border border-slate-300 active:bg-slate-50 md:hover:bg-slate-50 tap-none"
              title={t("export")}
            >
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Expenses Grouped by Month */}
      {isLoading ? (
        <div className="bg-white rounded-xl p-8 text-center text-slate-500 shadow-sm border border-slate-200">
          {tCommon("loading")}
        </div>
      ) : groupedExpenses.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-slate-500 shadow-sm border border-slate-200">
          {t("noExpenses")}
        </div>
      ) : (
        <div className="space-y-4 md:space-y-6">
          {groupedExpenses.map((group) => (
            <div key={group.monthKey} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Month Header */}
              <div className="px-3 md:px-4 py-2 md:py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 text-sm md:text-base">{group.monthLabel}</h3>
                <div className="flex items-center gap-2 md:gap-4">
                  <span className="text-xs md:text-sm text-slate-500">{group.expenses.length}</span>
                  <span className="font-semibold text-slate-900 text-sm md:text-base">€{group.total.toFixed(2)}</span>
                </div>
              </div>

              {/* Desktop Table */}
              <table className="hidden md:table w-full">
                <thead className="bg-slate-50/50 border-b border-slate-100">
                  <tr>
                    <th className="w-10 px-4 py-2">
                      <input
                        type="checkbox"
                        checked={group.expenses.every((e) => selectedIds.has(e.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setIsSelectionMode(true);
                            setSelectedIds((prev) => {
                              const newSet = new Set(prev);
                              group.expenses.forEach((exp) => newSet.add(exp.id));
                              return newSet;
                            });
                          } else {
                            setSelectedIds((prev) => {
                              const newSet = new Set(prev);
                              group.expenses.forEach((exp) => newSet.delete(exp.id));
                              if (newSet.size === 0) setIsSelectionMode(false);
                              return newSet;
                            });
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-[#0070f3] focus:ring-[#0070f3]"
                      />
                    </th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">{t("date")}</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">{t("description")}</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">{t("type")}</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">{t("category")}</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">{t("amount")}</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">{t("actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {group.expenses.map((expense) => (
                    <tr
                      key={expense.id}
                      className={`${expense.isRecurring ? "bg-blue-50/60 hover:bg-blue-100/60" : "hover:bg-slate-50"} ${selectedIds.has(expense.id) ? "bg-blue-50" : ""} cursor-pointer`}
                      onClick={(e) => {
                        // Don't open detail if clicking on checkbox, edit, or delete buttons
                        const target = e.target as HTMLElement;
                        if (target.tagName === "INPUT" || target.closest("button")) return;
                        setViewingExpense(expense);
                      }}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(expense.id)}
                          onChange={() => {
                            if (!isSelectionMode) setIsSelectionMode(true);
                            toggleSelection(expense.id);
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-[#0070f3] focus:ring-[#0070f3]"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        <div className="flex items-center gap-1.5">
                          {expense.isRecurring && (
                            <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                            </svg>
                          )}
                          <div className="flex flex-col">
                            <span>{new Date(expense.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
                            <span className="text-xs text-slate-400">{new Date(expense.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                          {expense.name}
                          {expense.splitCount && expense.splitCount > 1 && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-100 text-indigo-600 font-medium">
                              ÷{expense.splitCount}
                            </span>
                          )}
                          {expense.imageUrls && (
                            <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          )}
                        </div>
                        {expense.projects && expense.projects.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {expense.projects.map((project) => (
                              <span
                                key={project.id}
                                className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"
                              >
                                {project.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${typeColors[expense.type]}`}>
                          {typeLabels[expense.type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {expense.category ? translateCategory(expense.category.name) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {(() => {
                          const amt = Number(expense.amount);
                          const share = getUserShare(expense.splitCount, expense.splitData);
                          const displayAmt = share !== null ? share : amt;
                          const colorClass = amt < 0 ? 'text-green-600' : 'text-slate-900';
                          return (
                            <div>
                              <span className={`text-sm font-medium ${colorClass}`}>
                                {formatCurrency(displayAmt, expense.currency)}
                              </span>
                              {share !== null && (
                                <p className="text-[10px] text-slate-400 tabular-nums">
                                  {formatCurrency(amt, expense.currency)}
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setEditingExpense(expense)}
                            className="text-slate-500 hover:text-slate-700 p-1"
                            title={tCommon("edit")}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteId(expense.id)}
                            className="text-red-500 hover:text-red-700 p-1"
                            title={tCommon("delete")}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile List */}
              <div className="md:hidden divide-y divide-slate-100">
                {group.expenses.map((expense) => (
                  <div
                    key={expense.id}
                    className={`px-3 py-3 flex items-start justify-between tap-none ${
                      expense.isRecurring
                        ? "bg-blue-50/60 active:bg-blue-100/60"
                        : selectedIds.has(expense.id)
                        ? "bg-blue-50"
                        : "active:bg-slate-50"
                    }`}
                    onTouchStart={() => handleLongPressStart(expense.id)}
                    onTouchEnd={handleLongPressEnd}
                    onTouchMove={handleLongPressEnd}
                    onClick={(e) => {
                      if (isSelectionMode) {
                        toggleSelection(expense.id);
                      } else {
                        // Don't open detail if clicking on edit or delete buttons
                        const target = e.target as HTMLElement;
                        if (target.closest("button")) return;
                        setViewingExpense(expense);
                      }
                    }}
                  >
                    {/* Checkbox in selection mode */}
                    {isSelectionMode && (
                      <div className="flex items-center mr-3 pt-0.5">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(expense.id)}
                          onChange={() => toggleSelection(expense.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-5 h-5 rounded border-slate-300 text-[#0070f3] focus:ring-[#0070f3]"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0 mr-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {expense.isRecurring && (
                          <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                          </svg>
                        )}
                        <p className="font-medium text-slate-900 text-sm truncate max-w-[160px] inline-flex items-center gap-1">
                          {expense.name}
                          {expense.splitCount && expense.splitCount > 1 && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-100 text-indigo-600 font-medium">
                              ÷{expense.splitCount}
                            </span>
                          )}
                          {expense.imageUrls && (
                            <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          )}
                        </p>
                        {expense.projects && expense.projects.length > 0 && expense.projects.map((project) => (
                          <span key={project.id} className="px-1.5 py-0.5 text-[10px] rounded bg-amber-100 text-amber-700">
                            {project.name}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-xs text-slate-500">
                          {new Date(expense.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}
                          {" "}
                          <span className="text-slate-400">
                            {new Date(expense.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}
                          </span>
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${typeColors[expense.type]}`}>
                          {expense.type === "SURVIVAL_FIXED" ? t("typesShort.fixed") :
                           expense.type === "SURVIVAL_VARIABLE" ? t("typesShort.variable") :
                           expense.type === "LIFESTYLE" ? t("typesShort.lifestyle") : t("typesShort.project")}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {(() => {
                        const amt = Number(expense.amount);
                        const share = getUserShare(expense.splitCount, expense.splitData);
                        const displayAmt = share !== null ? share : amt;
                        const colorClass = amt < 0 ? 'text-green-600' : 'text-slate-900';
                        return (
                          <div className="text-right">
                            <p className={`font-semibold text-sm tabular-nums ${colorClass}`}>
                              {formatCurrency(displayAmt, expense.currency)}
                            </p>
                            {share !== null && (
                              <p className="text-[10px] text-slate-400 tabular-nums">
                                {formatCurrency(amt, expense.currency)}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                      {!isSelectionMode && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingExpense(expense); }}
                            className="p-1.5 text-slate-400 active:text-slate-700 active:bg-slate-100 rounded tap-none"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteId(expense.id); }}
                            className="p-1.5 text-slate-400 active:text-red-600 active:bg-red-50 rounded tap-none"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Show total count */}
      {sortedExpenses.length > 0 && (
        <div className="text-center text-sm text-slate-500 py-2">
          {t("showingAll", { count: sortedExpenses.length })}
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteId(null)} />
          <div className="relative bg-white rounded-xl p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{t("deleteExpenseQuestion")}</h3>
            <p className="text-slate-600 text-sm mb-4">{t("deleteWarning")}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                {tCommon("cancel")}
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600"
              >
                {tCommon("delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Asset Link */}
      {showBulkLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !bulkLinkBusy && setShowBulkLinkModal(false)} />
          <div className="relative bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              {tRwa("bulkLinkTitle")}
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              {tRwa("bulkLinkSubtitle", { count: selectedIds.size })}
            </p>
            <AssetLinkPicker value={bulkLinkAssetId} onChange={setBulkLinkAssetId} />
            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={() => handleBulkLink(true)}
                disabled={bulkLinkBusy || !bulkLinkAssetId}
                className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {bulkLinkBusy ? tRwa("matchLinking") : tRwa("bulkLinkConfirm", { count: selectedIds.size })}
              </button>
              <button
                onClick={() => handleBulkLink(false)}
                disabled={bulkLinkBusy}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {tRwa("bulkUnlink")}
              </button>
              <button
                onClick={() => {
                  setShowBulkLinkModal(false);
                  setBulkLinkAssetId(null);
                }}
                disabled={bulkLinkBusy}
                className="w-full px-4 py-2 rounded-lg text-slate-500 hover:text-slate-700 disabled:opacity-50"
              >
                {tCommon("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowBulkDeleteConfirm(false)} />
          <div className="relative bg-white rounded-xl p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              {t("deleteSelectedQuestion", { count: selectedIds.size })}
            </h3>
            <p className="text-slate-600 text-sm mb-4">{t("deleteWarning")}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {tCommon("cancel")}
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {t("deleting")}
                  </>
                ) : (
                  t("deleteSelected", { count: selectedIds.size })
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      <AddExpenseModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          fetchData();
        }}
        categories={categories}
        bankAccounts={bankAccounts}
        projects={projects}
      />

      {/* Edit Expense Modal */}
      <EditExpenseModal
        isOpen={!!editingExpense}
        onClose={() => setEditingExpense(null)}
        expense={editingExpense}
        categories={categories}
        bankAccounts={bankAccounts}
        projects={projects}
        onSave={fetchData}
      />

      {/* Expense Detail Modal */}
      <ExpenseDetailModal
        isOpen={!!viewingExpense}
        onClose={() => setViewingExpense(null)}
        expense={viewingExpense}
        onEdit={() => {
          if (viewingExpense) {
            setEditingExpense(viewingExpense);
            setViewingExpense(null);
          }
        }}
        onDelete={() => {
          if (viewingExpense) {
            setDeleteId(viewingExpense.id);
            setViewingExpense(null);
          }
        }}
      />

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        currentFilters={{
          typeFilter,
          categoryFilter,
          selectedMonthFilter,
        }}
      />
    </div>
  );
}
