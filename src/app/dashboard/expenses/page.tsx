"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import AddExpenseModal from "@/components/add-expense-modal";
import EditExpenseModal from "@/components/edit-expense-modal";

type Expense = {
  id: string;
  name: string;
  amount: number;
  type: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT";
  date: string;
  isRecurring?: boolean;
  recurringTemplateId?: string | null;
  category: { id: string; name: string } | null;
  bankAccount: { id: string; name: string } | null;
  projects: { id: string; name: string }[];
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

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function ExpensesPage() {
  const router = useRouter();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // Month filter - defaults to current month
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>(
    `${currentYear}-${String(currentMonth).padStart(2, "0")}`
  );
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // Pagination
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState<number | "all">(50);

  useEffect(() => {
    fetchData();
  }, [page, typeFilter, limit, selectedMonthFilter]);

  // Listen for quick-add event from bottom nav
  useEffect(() => {
    const handleQuickAdd = () => setIsModalOpen(true);
    window.addEventListener("openQuickAdd", handleQuickAdd);
    return () => window.removeEventListener("openQuickAdd", handleQuickAdd);
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      // When filtering by a specific month, we fetch more data since filtering is client-side
      // For "all" view, use pagination
      if (selectedMonthFilter !== "all") {
        // Fetch all expenses for month filtering (client-side filter)
        params.set("limit", "10000");
      } else if (limit !== "all") {
        params.set("limit", limit.toString());
        params.set("offset", (page * limit).toString());
      } else {
        params.set("limit", "10000"); // Large number for "all"
      }
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

  // Sort and filter expenses
  const sortedExpenses = useMemo(() => {
    let filtered = expenses.filter((e) =>
      searchQuery ? e.name.toLowerCase().includes(searchQuery.toLowerCase()) : true
    );

    // Apply month filter (unless "all" is selected)
    if (selectedMonthFilter !== "all") {
      filtered = filtered.filter((e) => {
        const date = new Date(e.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, "0")}`;
        return monthKey === selectedMonthFilter;
      });
    }

    // Sort based on current sort settings
    return [...filtered].sort((a, b) => {
      if (sortBy === "date") {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
      } else {
        const amountA = Number(a.amount);
        const amountB = Number(b.amount);
        return sortOrder === "desc" ? amountB - amountA : amountA - amountB;
      }
    });
  }, [expenses, searchQuery, sortBy, sortOrder, selectedMonthFilter]);

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
          total: monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0),
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
      const year = new Date(e.date).getFullYear();
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
    SURVIVAL_FIXED: "Living (Fixed)",
    SURVIVAL_VARIABLE: "Living (Variable)",
    LIFESTYLE: "Lifestyle",
    PROJECT: "Project",
  };

  const totalPages = limit === "all" ? 1 : Math.ceil(total / limit);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Expenses</h1>
          <p className="text-slate-500 text-xs md:text-sm mt-0.5 md:mt-1">
            {selectedMonthFilter !== "all" ? (
              <>
                {sortedExpenses.length} expenses in {
                  selectedMonthFilter === `${currentYear}-${String(currentMonth).padStart(2, "0")}`
                    ? "this month"
                    : MONTHS[parseInt(selectedMonthFilter.split("-")[1])] + " " + selectedMonthFilter.split("-")[0]
                }
              </>
            ) : (
              <>{total} total expenses</>
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
          Add Expense
        </button>
      </div>

      {/* Year & Month Filter Bar */}
      <div className="bg-white rounded-xl p-2 md:p-4 shadow-sm border border-slate-200">
        {/* Year selector */}
        <div className="flex gap-2 items-center mb-2 pb-2 border-b border-slate-100">
          <span className="text-xs text-slate-500 font-medium mr-1">Year:</span>
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
            All
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
                {month.slice(0, 3)}
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
              placeholder="Search expenses..."
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 md:py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
            />
          </div>
          {/* Filter row */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(0);
              }}
              className="flex-shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
            >
              <option value="">All Types</option>
              <option value="SURVIVAL_FIXED">Fixed</option>
              <option value="SURVIVAL_VARIABLE">Variable</option>
              <option value="LIFESTYLE">Lifestyle</option>
              <option value="PROJECT">Project</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "date" | "amount")}
              className="flex-shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
            >
              <option value="date">By Date</option>
              <option value="amount">By Amount</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
              className="flex-shrink-0 p-2 rounded-lg border border-slate-300 active:bg-slate-50 md:hover:bg-slate-50 tap-none"
              title={sortOrder === "desc" ? "Newest/Highest first" : "Oldest/Lowest first"}
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
        </div>
      </div>

      {/* Expenses Grouped by Month */}
      {isLoading ? (
        <div className="bg-white rounded-xl p-8 text-center text-slate-500 shadow-sm border border-slate-200">
          Loading...
        </div>
      ) : groupedExpenses.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center text-slate-500 shadow-sm border border-slate-200">
          No expenses found
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
                    <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Description</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Category</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {group.expenses.map((expense) => (
                    <tr key={expense.id} className={expense.isRecurring ? "bg-blue-50/60 hover:bg-blue-100/60" : "hover:bg-slate-50"}>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        <div className="flex items-center gap-1.5">
                          {expense.isRecurring && (
                            <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                            </svg>
                          )}
                          {new Date(expense.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-900">{expense.name}</div>
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
                        {expense.category?.name || "-"}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900 text-right">
                        €{Number(expense.amount).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setEditingExpense(expense)}
                            className="text-slate-500 hover:text-slate-700 p-1"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteId(expense.id)}
                            className="text-red-500 hover:text-red-700 p-1"
                            title="Delete"
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
                        : "active:bg-slate-50"
                    }`}
                  >
                    <div className="flex-1 min-w-0 mr-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {expense.isRecurring && (
                          <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                          </svg>
                        )}
                        <p className="font-medium text-slate-900 text-sm truncate max-w-[160px]">{expense.name}</p>
                        {expense.projects && expense.projects.length > 0 && expense.projects.map((project) => (
                          <span key={project.id} className="px-1.5 py-0.5 text-[10px] rounded bg-amber-100 text-amber-700">
                            {project.name}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-xs text-slate-500">
                          {new Date(expense.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${typeColors[expense.type]}`}>
                          {expense.type === "SURVIVAL_FIXED" ? "Fixed" :
                           expense.type === "SURVIVAL_VARIABLE" ? "Var" :
                           expense.type === "LIFESTYLE" ? "Life" : "Proj"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className="font-semibold text-slate-900 text-sm tabular-nums">
                        €{Number(expense.amount).toFixed(2)}
                      </p>
                      <button
                        onClick={() => setEditingExpense(expense)}
                        className="p-1.5 text-slate-400 active:text-slate-700 active:bg-slate-100 rounded tap-none"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteId(expense.id)}
                        className="p-1.5 text-slate-400 active:text-red-600 active:bg-red-50 rounded tap-none"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {limit !== "all" && totalPages > 1 && (
        <div className="bg-white rounded-xl px-4 py-3 shadow-sm border border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            Showing {page * (limit as number) + 1} to {Math.min((page + 1) * (limit as number), total)} of {total}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-50 hover:bg-slate-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 rounded border border-slate-300 text-sm disabled:opacity-50 hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteId(null)} />
          <div className="relative bg-white rounded-xl p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Delete Expense?</h3>
            <p className="text-slate-600 text-sm mb-4">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600"
              >
                Delete
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
    </div>
  );
}
