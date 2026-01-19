"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import QuickCreateCategory from "./quick-create-category";
import ProjectTagSelector from "./project-tag-selector";
import { AmountInput } from "./ui/amount-input";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import { useModalBodyClass } from "@/hooks/use-modal-body-class";
import { useProjectTags } from "@/hooks/use-project-tags";
import { CURRENCIES } from "@/lib/currencies";
import { EXPENSE_TYPE_VALUES, getExpenseTypeButtonClass } from "@/lib/expense-types";
import { parseAmount, getTodayDateString } from "@/lib/utils";
import type { Category, BankAccount, Project, Expense, ExpenseType } from "@/types/models";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("modals");
  const tCommon = useTranslations("common");
  const { translateCategory } = useCategoryTranslation();

  // Use shared hook for body class management
  useModalBodyClass(isOpen);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [categoryId, setCategoryId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [date, setDate] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [expenseType, setExpenseType] = useState<ExpenseType>("LIFESTYLE");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [localCategories, setLocalCategories] = useState<Category[]>(categories);
  const [excludeFromBudget, setExcludeFromBudget] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const {
    localProjects,
    setLocalProjects,
    selectedProjectIds,
    setSelectedProjectIds,
    showNewTagInput,
    setShowNewTagInput,
    newTagName,
    setNewTagName,
    error: tagError,
    createTag,
    toggleProject,
    clearSelection,
    resetTagInput,
  } = useProjectTags({
    initialProjects: projects,
  });

  const EXPENSE_TYPES = EXPENSE_TYPE_VALUES.map((value) => ({
    value,
    label: t(`types.${value.toLowerCase().replace("survival_", "")}`),
  }));

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Update local categories when props change
  useEffect(() => {
    const categoriesJson = JSON.stringify(categories);
    const localCatJson = JSON.stringify(localCategories);
    if (categoriesJson !== localCatJson) {
      setLocalCategories(categories);
    }
  }, [categories, localCategories]);

  // Update local projects when props change
  useEffect(() => {
    const projectsJson = JSON.stringify(projects);
    const localJson = JSON.stringify(localProjects);
    if (projectsJson !== localJson) {
      setLocalProjects(projects);
    }
  }, [projects, localProjects, setLocalProjects]);

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
      setShowDatePicker(false);
      setShowAdvanced(false);
      setError("");
      resetTagInput();
    }
  }, [expense, setSelectedProjectIds, resetTagInput]);

  const handleCreateTag = async () => {
    await createTag();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expense) return;

    setIsLoading(true);
    setError("");

    try {
      const parsedAmount = parseAmount(amount);

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

  const isToday = date === getTodayDateString();

  if (!isOpen || !expense) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal - Full width on mobile, slides up from bottom */}
      <form onSubmit={handleSubmit} className="relative w-full md:max-w-md md:mx-4 bg-white rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-4 md:px-6 py-3 md:py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <h2 className="text-base md:text-lg font-semibold text-slate-900">
            {t("editExpense")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 text-slate-400 active:text-slate-600 md:hover:text-slate-600 tap-none"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body - Scrollable */}
        <div className="p-4 md:p-6 space-y-4 overflow-y-auto scroll-touch flex-1">
          {(error || tagError) && (
            <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">
              {error || tagError}
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t("whatDidYouBuy")}
            </label>
            <input
              ref={inputRef}
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
              {t("howMuch")}
            </label>
            <div className="flex gap-2">
              <AmountInput
                value={amount}
                onChange={setAmount}
                currency={currency}
                required
                className="flex-1"
              />
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

          {/* Date - Collapsible like add modal */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">{t("date")}</label>
              <button
                type="button"
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="text-sm text-[#0070f3] hover:underline"
              >
                {isToday ? t("today") : new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                {!showDatePicker && ` ${t("change")}`}
              </button>
            </div>
            {showDatePicker && (
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
              />
            )}
          </div>

          {/* Project Tags */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t("tagsOptional")}
            </label>
            <ProjectTagSelector
              projects={localProjects}
              selectedIds={selectedProjectIds}
              onToggle={toggleProject}
              onClearAll={clearSelection}
              showNewTagInput={showNewTagInput}
              onShowNewTagInput={() => setShowNewTagInput(true)}
              newTagName={newTagName}
              onNewTagNameChange={setNewTagName}
              onCreateTag={handleCreateTag}
              onCancelNewTag={resetTagInput}
            />
          </div>

          {/* Advanced Options Toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-90" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {showAdvanced ? t("hideAdvanced") : t("showAdvanced")}
            </button>
          </div>

          {/* Expense Type - Collapsible Advanced Section */}
          {showAdvanced && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t("expenseType")}
              </label>
              <div className="flex flex-wrap gap-2">
                {EXPENSE_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setExpenseType(type.value)}
                    className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${getExpenseTypeButtonClass(type.value, expenseType === type.value)}`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category - Always visible */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t("category")}
            </label>
            <div className="flex gap-2">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-transparent"
              >
                <option value="">{t("uncategorized")}</option>
                {localCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {translateCategory(cat.name)}
                  </option>
                ))}
              </select>
              <QuickCreateCategory
                onCreated={(newCat) => {
                  setLocalCategories([...localCategories, newCat]);
                  setCategoryId(newCat.id);
                }}
                buttonClassName="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-slate-300"
              />
            </div>
          </div>

          {/* Bank Account - Always visible if available */}
          {bankAccounts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t("bankAccount")}
              </label>
              <select
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-transparent"
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

          {/* Exclude from budget - Show when project is selected */}
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
        </div>

        {/* Footer - Fixed at bottom, not scrollable */}
        <div className="flex-shrink-0 px-4 md:px-6 py-3 md:py-4 border-t border-slate-200 pb-safe flex gap-3 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-3 md:py-2.5 text-slate-700 font-medium active:bg-slate-50 md:hover:bg-slate-50 transition-colors tap-none"
          >
            {tCommon("cancel")}
          </button>
          <button
            type="submit"
            disabled={isLoading || !name || amount === ""}
            className="flex-1 rounded-lg bg-[#0070f3] px-4 py-3 md:py-2.5 text-white font-medium active:bg-[#0060df] md:hover:bg-[#0060df] transition-colors disabled:opacity-50 disabled:cursor-not-allowed tap-none"
          >
            {isLoading ? t("saving") : t("saveChanges")}
          </button>
        </div>
      </form>
    </div>
  );
}
