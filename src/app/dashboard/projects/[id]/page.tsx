"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Sparkles, Pencil, ImageIcon } from "lucide-react";
import EditExpenseModal from "@/components/edit-expense-modal";
import AddExpenseModal from "@/components/add-expense-modal";
import ExpenseDetailModal from "@/components/expense-detail-modal";
import ProjectWrappedModal from "@/components/project-wrapped-modal";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import { effectiveEur, getUserShare } from "@/lib/split-utils";
import { formatCurrency } from "@/lib/currencies";

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
  imageUrls?: string | null;
  splitCount?: number | null;
  splitData?: string | null;
};

type Project = {
  id: string;
  name: string;
  description: string | null;
  budget: number | null;
  isActive: boolean;
  createdAt: string;
};

const EXPENSE_TYPE_LABELS: Record<string, string> = {
  SURVIVAL_FIXED: "Fixed",
  SURVIVAL_VARIABLE: "Variable",
  LIFESTYLE: "Lifestyle",
  PROJECT: "Project",
};

// Framer-motion entrance: fade + rise, 0.05s stagger
const EASE = [0.16, 1, 0.3, 1] as const;
const sectionMotion = (i: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: EASE, delay: i * 0.05 },
});

const fmtEur = (v: number) =>
  `€${Number(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const cardShadow = { boxShadow: "var(--shadow-card)" };

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
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
        const total = (data.expenses || []).reduce(
          (sum: number, exp: Expense) => sum + effectiveEur(exp),
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
        const newExpenses = expenses.filter((e) => e.id !== id);
        setExpenses(newExpenses);
        const newTotal = newExpenses.reduce(
          (sum: number, exp: Expense) => sum + effectiveEur(exp),
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
    groups[key].total += effectiveEur(expense);
    return groups;
  }, {} as Record<string, { label: string; expenses: Expense[]; total: number }>);

  const sortedMonths = Object.keys(expensesByMonth).sort().reverse();

  if (isLoading && !project) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="animate-pulse space-y-4">
          <div className="h-10 w-1/3 rounded-[14px]" style={{ background: "var(--surface-2)" }} />
          <div className="h-64 rounded-[20px]" style={{ background: "var(--surface-2)" }} />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="py-12 text-center">
          <p style={{ color: "var(--ink-muted)" }}>{t("notFound")}</p>
          <button
            onClick={() => router.push("/dashboard/projects")}
            className="mt-2 inline-block text-[13px] font-semibold"
            style={{ color: "var(--accent)" }}
          >
            {t("backToProjects")}
          </button>
        </div>
      </div>
    );
  }

  const budgetUsedPercent = project.budget ? (totalSpent / Number(project.budget)) * 100 : 0;
  const remaining = project.budget ? Number(project.budget) - totalSpent : 0;

  const iconBtn = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Pushed-page header */}
      <motion.header {...sectionMotion(0)} className="flex items-center gap-3 py-1">
        <button
          onClick={() => router.back()}
          aria-label={tCommon("back")}
          className={iconBtn}
          style={{ background: "var(--surface)", ...cardShadow, color: "var(--ink)" }}
        >
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </button>
        <h1 className="flex-1 truncate text-center text-[16px] font-semibold" style={{ color: "var(--ink)" }}>
          {project.name}
        </h1>
        <button
          onClick={() => setIsWrappedOpen(true)}
          aria-label={t("viewWrapped")}
          className={iconBtn}
          style={{ background: "var(--accent)", boxShadow: "var(--shadow-fab)", color: "var(--accent-fg)" }}
        >
          <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </button>
        <button
          onClick={() => setIsAddModalOpen(true)}
          aria-label={t("addExpense")}
          className={iconBtn}
          style={{ background: "var(--surface)", ...cardShadow, color: "var(--ink)" }}
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </button>
      </motion.header>

      {/* Status + description */}
      <motion.div {...sectionMotion(1)} className="flex flex-wrap items-center gap-2 px-1">
        <span
          className="rounded-[12px] px-[9px] py-[3px] text-[11px] font-semibold"
          style={
            project.isActive
              ? { background: "var(--surface-2)", color: "var(--accent)" }
              : { background: "var(--app-bg)", color: "var(--ink-muted)" }
          }
        >
          {project.isActive ? t("statuses.active") : t("inactive")}
        </span>
        {project.description && (
          <span className="text-[12px]" style={{ color: "var(--ink-muted)" }}>{project.description}</span>
        )}
      </motion.div>

      {/* Stat tiles */}
      <motion.div {...sectionMotion(2)} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-[18px] p-4" style={{ background: "var(--surface)", ...cardShadow }}>
          <p className="mb-1 text-[12px]" style={{ color: "var(--ink-muted)" }}>{t("totalSpent")}</p>
          <p className="text-[20px] font-bold tabular-nums" style={{ color: "var(--ink)" }}>{fmtEur(totalSpent)}</p>
        </div>
        {project.budget != null && (
          <div className="rounded-[18px] p-4" style={{ background: "var(--surface)", ...cardShadow }}>
            <p className="mb-1 text-[12px]" style={{ color: "var(--ink-muted)" }}>{t("budget")}</p>
            <p className="text-[20px] font-bold tabular-nums" style={{ color: "var(--ink)" }}>{fmtEur(Number(project.budget))}</p>
          </div>
        )}
        {project.budget != null && (
          <div className="rounded-[18px] p-4" style={{ background: "var(--surface)", ...cardShadow }}>
            <p className="mb-1 text-[12px]" style={{ color: "var(--ink-muted)" }}>{t("remaining")}</p>
            <p
              className="text-[20px] font-bold tabular-nums"
              style={{ color: remaining >= 0 ? "var(--positive)" : "var(--negative)" }}
            >
              {fmtEur(remaining)}
            </p>
          </div>
        )}
        <div className="rounded-[18px] p-4" style={{ background: "var(--surface)", ...cardShadow }}>
          <p className="mb-1 text-[12px]" style={{ color: "var(--ink-muted)" }}>{t("totalExpenses")}</p>
          <p className="text-[20px] font-bold tabular-nums" style={{ color: "var(--ink)" }}>{expenses.length}</p>
        </div>
      </motion.div>

      {/* Budget Progress */}
      {project.budget != null && (
        <motion.div {...sectionMotion(3)} className="rounded-[20px] p-[18px]" style={{ background: "var(--surface)", ...cardShadow }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-medium" style={{ color: "var(--ink-muted)" }}>{t("budgetUsage")}</span>
            <span
              className="text-[13px] font-semibold tabular-nums"
              style={{
                color:
                  budgetUsedPercent > 100
                    ? "var(--negative)"
                    : budgetUsedPercent > 80
                    ? "var(--warning)"
                    : "var(--ink-muted)",
              }}
            >
              {budgetUsedPercent.toFixed(1)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-[4px]" style={{ background: "var(--surface-2)" }}>
            <motion.div
              className="h-full rounded-[4px]"
              style={{
                background:
                  budgetUsedPercent > 100 ? "var(--negative)" : "var(--bar-gradient)",
              }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(budgetUsedPercent, 100)}%` }}
              transition={{ duration: 0.5, ease: EASE }}
            />
          </div>
        </motion.div>
      )}

      {/* Expenses List by Month */}
      <motion.div {...sectionMotion(4)} className="overflow-hidden rounded-[20px]" style={{ background: "var(--surface)", ...cardShadow }}>
        <div className="border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
            {t("expenses")} ({expenses.length})
          </h2>
        </div>

        {expenses.length === 0 ? (
          <div className="p-12 text-center" style={{ color: "var(--ink-muted)" }}>
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "var(--accent-fainter)", color: "var(--accent)" }}
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-[13px]">{t("noExpensesInProject")}</p>
          </div>
        ) : (
          <div>
            {sortedMonths.map((monthKey) => {
              const monthData = expensesByMonth[monthKey];
              return (
                <div key={monthKey}>
                  {/* Month Header */}
                  <div className="flex items-center justify-between px-5 py-3" style={{ background: "var(--surface-2)" }}>
                    <span className="text-[13px] font-medium" style={{ color: "var(--ink-muted)" }}>{monthData.label}</span>
                    <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--ink)" }}>
                      {fmtEur(monthData.total)}
                    </span>
                  </div>
                  {/* Month Expenses */}
                  {monthData.expenses.map((expense) => (
                    <div
                      key={expense.id}
                      className="group flex cursor-pointer items-center justify-between border-t px-5 py-3 transition-colors hover:bg-[var(--surface-2)]"
                      style={{ borderColor: "var(--line)" }}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest("button")) return;
                        setViewingExpense(expense);
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="w-8 text-[11px] tabular-nums" style={{ color: "var(--ink-subtle)" }}>
                          {formatDate(expense.date).split(" ")[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-[14px] font-medium" style={{ color: "var(--ink)" }}>
                            <span className="truncate">{expense.name}</span>
                            {expense.splitCount && expense.splitCount > 1 && (
                              <span
                                className="shrink-0 rounded-[6px] px-1 py-0.5 text-[10px] font-medium tabular-nums"
                                style={{ background: "var(--accent-fainter)", color: "var(--accent)" }}
                              >
                                ÷{expense.splitCount}
                              </span>
                            )}
                            {expense.imageUrls && (
                              <ImageIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} style={{ color: "var(--ink-subtle)" }} />
                            )}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2">
                            <span
                              className="rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium"
                              style={{ background: "var(--surface-3)", color: "var(--ink-muted)" }}
                            >
                              {EXPENSE_TYPE_LABELS[expense.type] || expense.type}
                            </span>
                            {expense.category && (
                              <span className="max-w-[120px] truncate text-[11px]" style={{ color: "var(--ink-subtle)" }}>
                                {translateCategory(expense.category.name)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          {(() => {
                            const displayEur = effectiveEur(expense);
                            const share = getUserShare(expense.splitCount, expense.splitData);
                            const displayOriginal = share !== null ? share : Number(expense.amount);
                            const fullEur = Number(expense.amountEur);
                            return (
                              <>
                                <p
                                  className="text-[14px] font-medium tabular-nums"
                                  style={{ color: displayEur < 0 ? "var(--positive)" : "var(--ink)" }}
                                >
                                  {displayEur < 0
                                    ? `(€${Math.abs(displayEur).toFixed(2)})`
                                    : `€${displayEur.toFixed(2)}`}
                                </p>
                                {expense.currency !== "EUR" && (
                                  <p className="text-[11px] tabular-nums" style={{ color: "var(--ink-subtle)" }}>
                                    {formatCurrency(displayOriginal, expense.currency)}
                                  </p>
                                )}
                                {share !== null && (
                                  <p className="text-[10px] tabular-nums" style={{ color: "var(--ink-subtle)" }}>
                                    {`€${Math.abs(fullEur).toFixed(2)}`}
                                  </p>
                                )}
                              </>
                            );
                          })()}
                        </div>
                        <button
                          onClick={() => handleEditExpense(expense)}
                          className="rounded-[12px] p-1.5 transition-all hover:bg-[var(--surface-3)] md:opacity-0 md:group-hover:opacity-100"
                          style={{ color: "var(--ink-muted)" }}
                          title={tCommon("edit")}
                        >
                          <Pencil className="h-4 w-4" strokeWidth={1.8} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

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
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        variant="dialog"
        size="sm"
        zIndexClassName="z-50"
      >
        <ModalBody className="px-6 pb-0 pt-6">
          <h3 className="mb-2 text-[17px] font-semibold" style={{ color: "var(--ink)" }}>{tExpenses("deleteExpenseQuestion")}</h3>
          <p className="mb-4 text-[13px]" style={{ color: "var(--ink-muted)" }}>{tExpenses("deleteWarning")}</p>
        </ModalBody>
        <ModalFooter className="gap-3 px-6 pb-6 pt-0 md:px-6 md:pb-6">
          <button
            onClick={() => setDeleteId(null)}
            className="flex-1 rounded-[14px] px-4 py-2.5 text-[14px] font-medium"
            style={{ border: "1px solid var(--line-strong)", color: "var(--ink-muted)" }}
          >
            {tCommon("cancel")}
          </button>
          <button
            onClick={() => { if (deleteId) handleDelete(deleteId); }}
            className="flex-1 rounded-[14px] px-4 py-2.5 text-[14px] font-semibold text-white"
            style={{ background: "var(--negative)" }}
          >
            {tCommon("delete")}
          </button>
        </ModalFooter>
      </Modal>

      {/* Project Wrapped Modal */}
      <ProjectWrappedModal
        isOpen={isWrappedOpen}
        onClose={() => setIsWrappedOpen(false)}
        projectId={id}
      />
    </div>
  );
}
