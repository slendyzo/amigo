"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import EditExpenseModal from "@/components/edit-expense-modal";
import AddExpenseModal from "@/components/add-expense-modal";
import ExpenseDetailModal from "@/components/expense-detail-modal";
import ProjectWrappedModal from "@/components/project-wrapped-modal";
import { useCategoryTranslation } from "@/hooks/use-category-translation";

type Category = {
  id: string;
  name: string;
};

type BankAccount = {
  id: string;
  name: string;
};

type ProjectItem = {
  id: string;
  name: string;
};

type Expense = {
  id: string;
  name: string;
  amount: number;
  amountEur: number;
  currency: string;
  type: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT";
  date: string;
  category: { id: string; name: string } | null;
  bankAccount: { id: string; name: string } | null;
  projects: { id: string; name: string }[];
};

type Project = {
  id: string;
  name: string;
  description: string | null;
  budget: number | null;
  isActive: boolean;
  createdAt: string;
};

const EXPENSE_TYPES: Record<string, { label: string; color: string }> = {
  SURVIVAL_FIXED: { label: "Fixed", color: "bg-blue-100 text-blue-800" },
  SURVIVAL_VARIABLE: { label: "Variable", color: "bg-cyan-100 text-cyan-800" },
  LIFESTYLE: { label: "Lifestyle", color: "bg-purple-100 text-purple-800" },
  PROJECT: { label: "Project", color: "bg-amber-100 text-amber-800" },
};

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("projects");
  const tExpenses = useTranslations("expenses");
  const tCommon = useTranslations("common");
  const { translateCategory } = useCategoryTranslation();
  const [project, setProject] = useState<Project | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalSpent, setTotalSpent] = useState(0);

  // Add modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isWrappedOpen, setIsWrappedOpen] = useState(false);

  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);

  useEffect(() => {
    fetchProject();
    fetchExpenses();
    fetchCategories();
    fetchBankAccounts();
    fetchProjects();
  }, [id]);

  const fetchProject = async () => {
    try {
      const response = await fetch(`/api/projects/${id}`);
      if (response.ok) {
        const data = await response.json();
        setProject(data.project);
      }
    } catch (error) {
      console.error("Failed to fetch project:", error);
    }
  };

  const fetchExpenses = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/expenses?projectId=${id}&limit=500`);
      if (response.ok) {
        const data = await response.json();
        setExpenses(data.expenses || []);
        // Calculate total
        const total = (data.expenses || []).reduce(
          (sum: number, exp: Expense) => sum + Number(exp.amountEur),
          0
        );
        setTotalSpent(total);
      }
    } catch (error) {
      console.error("Failed to fetch expenses:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch("/api/categories");
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  };

  const fetchBankAccounts = async () => {
    try {
      const response = await fetch("/api/bank-accounts");
      if (response.ok) {
        const data = await response.json();
        setBankAccounts(data.bankAccounts || []);
      }
    } catch (error) {
      console.error("Failed to fetch bank accounts:", error);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await fetch("/api/projects");
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    }
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setIsEditModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
      if (response.ok) {
        setExpenses(expenses.filter((e) => e.id !== id));
        // Recalculate total
        const newExpenses = expenses.filter((e) => e.id !== id);
        const newTotal = newExpenses.reduce(
          (sum: number, exp: Expense) => sum + Number(exp.amountEur),
          0
        );
        setTotalSpent(newTotal);
      }
    } catch (error) {
      console.error("Failed to delete expense:", error);
    }
    setDeleteId(null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  };

  // Group expenses by month
  const expensesByMonth = expenses.reduce((groups, expense) => {
    const date = new Date(expense.date);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

    if (!groups[key]) {
      groups[key] = { label, expenses: [], total: 0 };
    }
    groups[key].expenses.push(expense);
    groups[key].total += Number(expense.amountEur);
    return groups;
  }, {} as Record<string, { label: string; expenses: Expense[]; total: number }>);

  const sortedMonths = Object.keys(expensesByMonth).sort().reverse();

  if (isLoading && !project) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/4"></div>
          <div className="h-64 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-slate-500">Project not found</p>
          <Link href="/dashboard/projects" className="text-blue-600 hover:underline mt-2 inline-block">
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  const budgetUsedPercent = project.budget ? (totalSpent / Number(project.budget)) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/projects"
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
            <span className={`px-2 py-0.5 text-xs rounded-full ${
              project.isActive ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"
            }`}>
              {project.isActive ? "Active" : "Inactive"}
            </span>
          </div>
          {project.description && (
            <p className="text-sm text-slate-500 mt-1">{project.description}</p>
          )}
        </div>
        {/* View Wrapped Button */}
        <button
          onClick={() => setIsWrappedOpen(true)}
          className="flex items-center gap-2 px-3 py-2 sm:px-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all font-medium shadow-lg shadow-amber-500/25"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          <span className="hidden sm:inline">{t("viewWrapped")}</span>
        </button>
        {/* Add Expense Button */}
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-3 py-2 sm:px-4 bg-[#0070f3] text-white rounded-lg hover:bg-[#005bb5] transition-colors font-medium"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden sm:inline">{t("addExpense")}</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <p className="text-sm text-slate-500 mb-1">Total Spent</p>
          <p className="text-2xl font-bold text-slate-900">€{totalSpent.toFixed(2)}</p>
        </div>
        {project.budget && (
          <div className="bg-white p-5 rounded-xl border border-slate-200">
            <p className="text-sm text-slate-500 mb-1">Budget</p>
            <p className="text-2xl font-bold text-slate-900">€{Number(project.budget).toFixed(2)}</p>
          </div>
        )}
        {project.budget && (
          <div className="bg-white p-5 rounded-xl border border-slate-200">
            <p className="text-sm text-slate-500 mb-1">Remaining</p>
            <p className={`text-2xl font-bold ${
              Number(project.budget) - totalSpent >= 0 ? "text-green-600" : "text-red-600"
            }`}>
              €{(Number(project.budget) - totalSpent).toFixed(2)}
            </p>
          </div>
        )}
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <p className="text-sm text-slate-500 mb-1">Total Expenses</p>
          <p className="text-2xl font-bold text-slate-900">{expenses.length}</p>
        </div>
      </div>

      {/* Budget Progress */}
      {project.budget && (
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-slate-700">Budget Usage</span>
            <span className={`text-sm font-medium ${
              budgetUsedPercent > 100 ? "text-red-600" : budgetUsedPercent > 80 ? "text-amber-600" : "text-slate-600"
            }`}>
              {budgetUsedPercent.toFixed(1)}%
            </span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                budgetUsedPercent > 100 ? "bg-red-500" : budgetUsedPercent > 80 ? "bg-amber-500" : "bg-blue-500"
              }`}
              style={{ width: `${Math.min(budgetUsedPercent, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Expenses List by Month */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Expenses ({expenses.length})</h2>
        </div>

        {expenses.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <svg className="w-12 h-12 mx-auto mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p>No expenses for this project yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sortedMonths.map((monthKey) => {
              const monthData = expensesByMonth[monthKey];
              return (
                <div key={monthKey}>
                  {/* Month Header */}
                  <div className="px-6 py-3 bg-slate-50 flex justify-between items-center">
                    <span className="font-medium text-slate-700">{monthData.label}</span>
                    <span className="text-sm font-medium text-slate-900">
                      €{monthData.total.toFixed(2)}
                    </span>
                  </div>
                  {/* Month Expenses */}
                  {monthData.expenses.map((expense) => (
                    <div
                      key={expense.id}
                      className="px-6 py-3 flex items-center justify-between hover:bg-slate-50 group cursor-pointer"
                      onClick={(e) => {
                        // Don't open detail if clicking on edit button
                        const target = e.target as HTMLElement;
                        if (target.closest("button")) return;
                        setViewingExpense(expense);
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 text-xs text-slate-400">
                          {formatDate(expense.date).split(" ")[0]}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{expense.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`px-1.5 py-0.5 text-xs rounded ${
                              EXPENSE_TYPES[expense.type]?.color || "bg-slate-100 text-slate-600"
                            }`}>
                              {EXPENSE_TYPES[expense.type]?.label || expense.type}
                            </span>
                            {expense.category && (
                              <span className="text-xs text-slate-500 truncate max-w-[120px]">{translateCategory(expense.category.name)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className={`font-medium ${Number(expense.amountEur) < 0 ? 'text-green-600' : 'text-slate-900'}`}>
                            {Number(expense.amountEur) < 0
                              ? `(€${Math.abs(Number(expense.amountEur)).toFixed(2)})`
                              : `€${Number(expense.amountEur).toFixed(2)}`}
                          </p>
                          {expense.currency !== "EUR" && (
                            <p className="text-xs text-slate-400">
                              {expense.currency} {Number(expense.amount) < 0
                                ? `(${Math.abs(Number(expense.amount)).toFixed(2)})`
                                : Number(expense.amount).toFixed(2)}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleEditExpense(expense)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 md:opacity-0 md:group-hover:opacity-100 transition-all"
                          title="Edit expense"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Expense Modal - Pre-select this project and exclude from budget */}
      <AddExpenseModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          fetchExpenses();
        }}
        categories={categories}
        bankAccounts={bankAccounts}
        projects={projects}
        defaultProjectId={id}
        defaultExcludeFromBudget={true}
      />

      {/* Edit Expense Modal */}
      <EditExpenseModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingExpense(null);
        }}
        expense={editingExpense}
        categories={categories}
        bankAccounts={bankAccounts}
        projects={projects}
        onSave={() => {
          fetchExpenses();
        }}
      />

      {/* Expense Detail Modal */}
      <ExpenseDetailModal
        isOpen={!!viewingExpense}
        onClose={() => setViewingExpense(null)}
        expense={viewingExpense}
        onEdit={() => {
          if (viewingExpense) {
            setEditingExpense(viewingExpense);
            setIsEditModalOpen(true);
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

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteId(null)} />
          <div className="relative bg-white rounded-xl p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{tExpenses("deleteExpenseQuestion")}</h3>
            <p className="text-slate-600 text-sm mb-4">{tExpenses("deleteWarning")}</p>
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

      {/* Project Wrapped Modal */}
      <ProjectWrappedModal
        isOpen={isWrappedOpen}
        onClose={() => setIsWrappedOpen(false)}
        projectId={id}
      />
    </div>
  );
}
