"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import QuickCreateCategory from "./quick-create-category";

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

type Expense = {
  id: string;
  name: string;
  amount: number;
  currency?: string;
  type: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT";
  date: string;
  category: { id: string; name: string } | null;
  bankAccount: { id: string; name: string } | null;
  projects: { id: string; name: string }[];
  excludeFromBudget?: boolean;
};

type EditExpenseModalProps = {
  isOpen: boolean;
  onClose: () => void;
  expense: Expense | null;
  categories?: Category[];
  bankAccounts?: BankAccount[];
  projects?: Project[];
  onSave: () => void;
};

export default function EditExpenseModal({
  isOpen,
  onClose,
  expense,
  categories = [],
  bankAccounts = [],
  projects = [],
  onSave,
}: EditExpenseModalProps) {
  const t = useTranslations("modals");
  const tCommon = useTranslations("common");

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [categoryId, setCategoryId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [date, setDate] = useState("");
  const [expenseType, setExpenseType] = useState("LIFESTYLE");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [localCategories, setLocalCategories] = useState<Category[]>(categories);

  const CURRENCIES = ["EUR", "USD", "GBP", "BRL", "PLN"];
  const CURRENCY_SYMBOLS: Record<string, string> = {
    EUR: "€",
    USD: "$",
    GBP: "£",
    BRL: "R$",
    PLN: "zł",
  };

  // Tag/Project state - now supports multiple tags
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [localProjects, setLocalProjects] = useState<Project[]>(projects);
  const [excludeFromBudget, setExcludeFromBudget] = useState(false);

  const EXPENSE_TYPES = [
    { value: "LIFESTYLE", label: t("types.lifestyle"), color: "purple" },
    { value: "SURVIVAL_FIXED", label: t("types.fixed"), color: "blue" },
    { value: "SURVIVAL_VARIABLE", label: t("types.variable"), color: "cyan" },
  ];

  // Update local categories when props change (compare by content to avoid infinite loops)
  useEffect(() => {
    const categoriesJson = JSON.stringify(categories);
    const localCatJson = JSON.stringify(localCategories);
    if (categoriesJson !== localCatJson) {
      setLocalCategories(categories);
    }
  }, [categories, localCategories]);

  // Update local projects when props change (compare by content to avoid infinite loops)
  useEffect(() => {
    const projectsJson = JSON.stringify(projects);
    const localJson = JSON.stringify(localProjects);
    if (projectsJson !== localJson) {
      setLocalProjects(projects);
    }
  }, [projects, localProjects]);

  // Reset form when expense changes
  useEffect(() => {
    if (expense) {
      setName(expense.name);
      setAmount(Number(expense.amount).toString());
      setCurrency(expense.currency || "EUR");
      setCategoryId(expense.category?.id || "");
      setBankAccountId(expense.bankAccount?.id || "");
      setSelectedProjectIds(expense.projects?.map(p => p.id) || []);
      setExpenseType(expense.type === "PROJECT" ? "LIFESTYLE" : expense.type);
      setDate(expense.date.split("T")[0]);
      setExcludeFromBudget(expense.excludeFromBudget || false);
      setError("");
      setShowNewTagInput(false);
      setNewTagName("");
    }
  }, [expense]);

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        setLocalProjects([...localProjects, data.project]);
        setSelectedProjectIds([...selectedProjectIds, data.project.id]);
        setShowNewTagInput(false);
        setNewTagName("");
        setError("");
      } else {
        const data = await response.json();
        setError(data.error || "Failed to create tag");
      }
    } catch (err) {
      console.error("Failed to create tag:", err);
      setError("Failed to create tag");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expense) return;

    setIsLoading(true);
    setError("");

    try {
      // Normalize amount: replace comma with dot for parsing
      const normalizedAmount = amount.replace(",", ".");
      const parsedAmount = parseFloat(normalizedAmount);

      if (isNaN(parsedAmount)) {
        setError("Invalid amount");
        setIsLoading(false);
        return;
      }

      const response = await fetch(`/api/expenses/${expense.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          amount: parsedAmount,
          currency,
          type: expenseType,
          categoryId: categoryId || null,
          bankAccountId: bankAccountId || null,
          projectIds: selectedProjectIds,
          date,
          excludeFromBudget,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update expense");
      }

      onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !expense) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {t("editExpense")}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t("description")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-transparent"
            />
          </div>

          {/* Amount + Currency */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t("amount")}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                  {CURRENCY_SYMBOLS[currency]}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  value={amount}
                  onChange={(e) => {
                    // Allow digits, comma, and dot
                    const value = e.target.value.replace(/[^0-9.,-]/g, "");
                    setAmount(value);
                  }}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-transparent"
                />
              </div>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-transparent"
              >
                {CURRENCIES.map((curr) => (
                  <option key={curr} value={curr}>
                    {curr}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t("date")}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-transparent"
            />
          </div>

          {/* Project Tags */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t("tags")}
            </label>
            <div className="flex flex-wrap gap-2">
              {/* Clear all tags option */}
              <button
                type="button"
                onClick={() => setSelectedProjectIds([])}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedProjectIds.length === 0
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {t("noTags")}
              </button>

              {/* Existing project tags (multi-select) */}
              {localProjects.map((project) => {
                const isSelected = selectedProjectIds.includes(project.id);
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedProjectIds(selectedProjectIds.filter(id => id !== project.id));
                      } else {
                        setSelectedProjectIds([...selectedProjectIds, project.id]);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      isSelected
                        ? "bg-amber-500 text-white"
                        : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                    }`}
                  >
                    {project.name}
                  </button>
                );
              })}

              {/* Add new tag button */}
              {!showNewTagInput && (
                <button
                  type="button"
                  onClick={() => setShowNewTagInput(true)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {t("new")}
                </button>
              )}
            </div>

            {/* New tag input */}
            {showNewTagInput && (
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder={t("tagPlaceholder")}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateTag();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleCreateTag}
                  disabled={!newTagName.trim()}
                  className="px-3 py-2 rounded-lg bg-[#0070f3] text-white text-sm font-medium hover:bg-[#0060df] disabled:opacity-50"
                >
                  {tCommon("add")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewTagInput(false);
                    setNewTagName("");
                  }}
                  className="px-3 py-2 rounded-lg text-slate-500 hover:text-slate-700"
                >
                  {tCommon("cancel")}
                </button>
              </div>
            )}

            {selectedProjectIds.length > 0 && (
              <p className="mt-2 text-xs text-amber-600">
                {t("taggedTo", { count: selectedProjectIds.length })}
              </p>
            )}
          </div>

          {/* Exclude from budget checkbox - only show when project is selected */}
          {selectedProjectIds.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={excludeFromBudget}
                  onChange={(e) => setExcludeFromBudget(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="text-sm font-medium text-amber-800">
                    {t("excludeFromBudget")}
                  </span>
                  <p className="text-xs text-amber-600 mt-0.5">
                    {t("excludeFromBudgetHint")}
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Optional: Category & Bank (collapsible) */}
          <details className="group">
            <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-700">
              {t("moreOptions")}
            </summary>
            <div className="mt-3 space-y-3">
              {/* Expense Type */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t("expenseType")}
                </label>
                <div className="flex flex-wrap gap-2">
                  {EXPENSE_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setExpenseType(type.value)}
                      className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                        expenseType === type.value
                          ? type.color === "purple"
                            ? "bg-purple-600 text-white"
                            : type.color === "blue"
                            ? "bg-blue-600 text-white"
                            : "bg-cyan-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t("category")}
                </label>
                <div className="flex gap-1">
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
                  >
                    <option value="">{t("uncategorized")}</option>
                    {localCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  <QuickCreateCategory
                    onCreated={(newCat) => {
                      setLocalCategories([...localCategories, newCat]);
                      setCategoryId(newCat.id);
                    }}
                    buttonClassName="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  />
                </div>
              </div>
              {bankAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {t("bankAccount")}
                  </label>
                  <select
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
                  >
                    <option value="">{t("none")}</option>
                    {bankAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              </div>
            </div>
          </details>

          {/* Footer */}
          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
            >
              {tCommon("cancel")}
            </button>
            <button
              type="submit"
              disabled={isLoading || !name || amount === ""}
              className="flex-1 rounded-lg bg-[#0070f3] px-4 py-2.5 text-white font-medium hover:bg-[#0060df] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? t("saving") : t("saveChanges")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
