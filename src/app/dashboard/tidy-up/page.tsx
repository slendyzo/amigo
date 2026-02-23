"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, ChevronRight, Clock, Tag, Loader2, Plus, Sparkles, Brain } from "lucide-react";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import { formatCurrency } from "@/lib/currencies";
import { buildCategoryTree, type FlatCategory, type CategoryNode } from "@/lib/category-utils";

type Expense = {
  id: string;
  name: string;
  amount: number;
  currency?: string;
  type: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT";
  date: string;
  category: { id: string; name: string } | null;
};

type Category = {
  id: string;
  name: string;
  parentId: string | null;
  icon?: string | null;
  isSystem?: boolean;
};

type Suggestion = {
  categoryId: string;
  categoryName: string;
  confidence: "high" | "medium" | "low";
  count?: number;
  source: "mapping" | "history";
};

type DoneItem = {
  expense: Expense;
  categoryId: string;
  categoryName: string;
};

export default function CategorizePage() {
  const t = useTranslations("tidyUp");
  const tCommon = useTranslations("common");
  const tTime = useTranslations("time");
  const tQuickCategory = useTranslations("modals.quickCategory");
  const { translateCategory } = useCategoryTranslation();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // New category creation state
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCreatingCategorySaving, setIsCreatingCategorySaving] = useState(false);
  const [createCategoryError, setCreateCategoryError] = useState("");
  const newCategoryInputRef = useRef<HTMLInputElement>(null);

  // Suggestion state
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [showLearnedToast, setShowLearnedToast] = useState(false);

  // Auto-assign state
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  const [autoAssignResult, setAutoAssignResult] = useState<{ assigned: number } | null>(null);

  // Undo / history state
  const [doneStack, setDoneStack] = useState<DoneItem[]>([]);
  const [undoToast, setUndoToast] = useState<DoneItem | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [changingItemId, setChangingItemId] = useState<string | null>(null);
  const initialTotalRef = useRef(0);

  // Get translated month names
  const MONTHS = [
    tTime("months.january"), tTime("months.february"), tTime("months.march"),
    tTime("months.april"), tTime("months.may"), tTime("months.june"),
    tTime("months.july"), tTime("months.august"), tTime("months.september"),
    tTime("months.october"), tTime("months.november"), tTime("months.december")
  ];

  // Fetch suggestion for current expense
  const fetchSuggestion = useCallback(async (expenseName: string) => {
    try {
      const res = await fetch(`/api/keyword-mappings/learn?name=${encodeURIComponent(expenseName)}`);
      if (res.ok) {
        const data = await res.json();
        setSuggestion(data.suggestion);
      } else {
        setSuggestion(null);
      }
    } catch {
      setSuggestion(null);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch suggestion when current expense changes
  useEffect(() => {
    const expense = expenses[currentIndex];
    if (expense?.name) {
      fetchSuggestion(expense.name);
    } else {
      setSuggestion(null);
    }
  }, [expenses, currentIndex, fetchSuggestion]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [expensesRes, categoriesRes] = await Promise.all([
        fetch("/api/expenses?limit=10000"),
        fetch("/api/categories"),
      ]);

      if (expensesRes.ok) {
        const data = await expensesRes.json();
        // Filter only uncategorized expenses (category is null or name is "Uncategorized")
        const uncategorized = data.expenses.filter(
          (e: Expense) => !e.category || e.category.name === "Uncategorized"
        );
        setExpenses(uncategorized);
        initialTotalRef.current = uncategorized.length;
      }
      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        // Filter out the "Uncategorized" system category
        const filtered = (data.categories || []).filter(
          (c: Category) => c.name !== "Uncategorized"
        );
        setCategories(filtered);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const currentExpense = expenses[currentIndex];

  const showUndoToast = (item: DoneItem) => {
    // Clear any existing timer
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast(item);
    undoTimerRef.current = setTimeout(() => {
      setUndoToast(null);
    }, 5000);
  };

  const handleUndo = async (item?: DoneItem) => {
    const target = item || undoToast;
    if (!target) return;

    // Clear the toast
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast(null);

    try {
      // Remove category from expense via API
      await fetch(`/api/expenses/${target.expense.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: null }),
      });

      // Remove from done stack
      setDoneStack((prev) => prev.filter((d) => d.expense.id !== target.expense.id));

      // Add back to expenses list
      setExpenses((prev) => [target.expense, ...prev]);
      setCurrentIndex(0);
    } catch (error) {
      console.error("Failed to undo:", error);
    }
  };

  const handleChangeDoneItem = async (doneItem: DoneItem, newCategoryId: string) => {
    const newCategory = categories.find((c) => c.id === newCategoryId);
    if (!newCategory) return;

    try {
      const response = await fetch(`/api/expenses/${doneItem.expense.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: newCategoryId }),
      });

      if (response.ok) {
        setDoneStack((prev) =>
          prev.map((d) =>
            d.expense.id === doneItem.expense.id
              ? { ...d, categoryId: newCategoryId, categoryName: newCategory.name }
              : d
          )
        );
        setChangingItemId(null);
      }
    } catch (error) {
      console.error("Failed to change category:", error);
    }
  };

  const handleCategorize = async (categoryId: string) => {
    if (!currentExpense || isSaving) return;

    setSelectedCategory(categoryId);
    setIsSaving(true);

    // Capture expense ID before any async/timeout to avoid stale closures
    const removedId = currentExpense.id;

    try {
      const response = await fetch(`/api/expenses/${currentExpense.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId }),
      });

      if (response.ok) {
        const categoryName = categories.find((c) => c.id === categoryId)?.name || "";

        // Check if a mapping was learned (fire and forget the POST, but check result)
        fetch("/api/keyword-mappings/learn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expenseName: currentExpense.name,
            categoryId,
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.learned) {
              setShowLearnedToast(true);
              setTimeout(() => setShowLearnedToast(false), 3000);
            }
          })
          .catch(() => {});

        // Add to done stack
        const doneItem: DoneItem = {
          expense: currentExpense,
          categoryId,
          categoryName,
        };
        setDoneStack((prev) => [doneItem, ...prev]);

        // Show undo toast
        showUndoToast(doneItem);

        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          setSelectedCategory(null);
          setSuggestion(null);
          // Remove expense and adjust index using functional updaters (avoids stale closures)
          setExpenses((prev) => {
            const filtered = prev.filter((e) => e.id !== removedId);
            setCurrentIndex((prevIndex) => {
              if (prevIndex >= filtered.length && prevIndex > 0) {
                return prevIndex - 1;
              }
              return prevIndex;
            });
            return filtered;
          });
          // Release saving lock after animation completes
          setIsSaving(false);
        }, 300);
      } else {
        setIsSaving(false);
      }
    } catch (error) {
      console.error("Failed to categorize:", error);
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    if (currentIndex < expenses.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Loop back to start
      setCurrentIndex(0);
    }
  };

  const handleAutoAssign = async () => {
    setIsAutoAssigning(true);
    setAutoAssignResult(null);
    try {
      const res = await fetch("/api/expenses/auto-categorize", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.assigned > 0) {
          setAutoAssignResult({ assigned: data.assigned });
          fetchData();
          setTimeout(() => setAutoAssignResult(null), 4000);
        }
      }
    } catch (error) {
      console.error("Auto-assign failed:", error);
    } finally {
      setIsAutoAssigning(false);
    }
  };

  // Focus input when opening create category
  useEffect(() => {
    if (isCreatingCategory) {
      setTimeout(() => newCategoryInputRef.current?.focus(), 0);
    }
  }, [isCreatingCategory]);

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      setCreateCategoryError(tQuickCategory("nameRequired"));
      return;
    }

    setIsCreatingCategorySaving(true);
    setCreateCategoryError("");

    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        // Add to categories list and auto-select it for the current expense
        setCategories((prev) => [...prev, data.category]);
        setIsCreatingCategory(false);
        setNewCategoryName("");
        // Automatically categorize the current expense with the new category
        handleCategorize(data.category.id);
      } else {
        const data = await response.json();
        setCreateCategoryError(data.error || "Failed to create category");
      }
    } catch {
      setCreateCategoryError("Failed to create category");
    } finally {
      setIsCreatingCategorySaving(false);
    }
  };

  const handleCancelCreateCategory = () => {
    setIsCreatingCategory(false);
    setNewCategoryName("");
    setCreateCategoryError("");
  };

  const totalItems = expenses.length + doneStack.length;
  const progressPercent = totalItems > 0
    ? Math.round((doneStack.length / totalItems) * 100)
    : 0;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const day = date.getDate();
    const month = MONTHS[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getDate()} ${MONTHS[date.getMonth()]?.slice(0, 3)}`;
  };

  // Cleanup undo timer
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-[#0070f3]" />
      </div>
    );
  }

  if (expenses.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">{t("title")}</h1>
          <p className="text-slate-500 text-sm mt-1">{t("subtitle")}</p>
        </div>

        <div className="bg-white rounded-xl p-8 md:p-12 shadow-sm border border-slate-200 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">{t("allDone")}</h2>
          <p className="text-slate-600">{t("allDoneDescription")}</p>
        </div>

        {/* Show history even when all done, so user can fix mistakes */}
        {doneStack.length > 0 && (
          <HistorySection
            doneStack={doneStack}
            isHistoryOpen={true}
            setIsHistoryOpen={setIsHistoryOpen}
            changingItemId={changingItemId}
            setChangingItemId={setChangingItemId}
            categories={categories}
            onChangeCategory={handleChangeDoneItem}
            onUndo={handleUndo}
            translateCategory={translateCategory}
            formatShortDate={formatShortDate}
            formatCurrency={formatCurrency}
            t={t}
          />
        )}
      </div>
    );
  }

  // Card content shared between mobile and desktop layouts
  const renderCardContent = () => (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300 ${showSuccess ? 'scale-95 opacity-50' : ''}`}>
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-start justify-between mb-2">
          <h2 className="text-lg font-semibold text-slate-900">{currentExpense.name}</h2>
          <span className={`text-lg font-bold ${Number(currentExpense.amount) < 0 ? 'text-green-600' : 'text-slate-900'}`}>
            {formatCurrency(Number(currentExpense.amount), currentExpense.currency)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span>{formatDate(currentExpense.date)}</span>
          <span className="w-1 h-1 rounded-full bg-slate-300" />
          <span className="capitalize">{currentExpense.type.toLowerCase().replace("_", " ")}</span>
        </div>
      </div>

      {/* Category buttons */}
      <div className="p-4">
        {/* Suggested category */}
        {suggestion && (
          <div className="mb-4">
            <div className="flex items-center gap-2 text-sm font-medium text-purple-700 mb-2">
              <Sparkles className="w-4 h-4" />
              <span>{t("suggested")}</span>
              {suggestion.source === "history" && suggestion.count && (
                <span className="text-xs text-purple-500">
                  ({t("usedTimes", { count: suggestion.count })})
                </span>
              )}
            </div>
            <button
              onClick={() => handleCategorize(suggestion.categoryId)}
              disabled={isSaving || isCreatingCategory}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-all ${
                selectedCategory === suggestion.categoryId
                  ? "border-purple-500 bg-purple-100 text-purple-700"
                  : "border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-700"
              } disabled:opacity-50`}
            >
              <Sparkles className="w-5 h-5 flex-shrink-0 text-purple-500" />
              <span className="text-sm font-semibold">{translateCategory(suggestion.categoryName)}</span>
              {selectedCategory === suggestion.categoryId && (
                <Check className="w-4 h-4 ml-auto flex-shrink-0" />
              )}
            </button>
          </div>
        )}

        <p className="text-sm font-medium text-slate-700 mb-3">{t("selectCategory")}</p>
        <div className="space-y-2">
          {buildCategoryTree(categories as FlatCategory[]).map((parent) => {
            const visibleChildren = parent.children.filter(
              (c) => !suggestion || c.id !== suggestion.categoryId
            );
            const isParentSuggested = suggestion && parent.id === suggestion.categoryId;

            // Parent with children: show as grouped section
            if (parent.children.length > 0) {
              if (visibleChildren.length === 0) return null;
              return (
                <div key={parent.id}>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    {parent.icon && <span>{parent.icon}</span>}
                    {translateCategory(parent.name)}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {visibleChildren.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => handleCategorize(child.id)}
                        disabled={isSaving || isCreatingCategory}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-left transition-all ${
                          selectedCategory === child.id
                            ? "border-[#0070f3] bg-[#0070f3]/5 text-[#0070f3]"
                            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700"
                        } disabled:opacity-50`}
                      >
                        {child.icon && <span className="text-sm flex-shrink-0">{child.icon}</span>}
                        <span className="text-sm font-medium">{translateCategory(child.name)}</span>
                        {selectedCategory === child.id && (
                          <Check className="w-3.5 h-3.5 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            // Flat parent (no children, like "Gifts & Donations"): render as button
            if (isParentSuggested) return null;
            return (
              <div key={parent.id} className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => handleCategorize(parent.id)}
                  disabled={isSaving || isCreatingCategory}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-left transition-all ${
                    selectedCategory === parent.id
                      ? "border-[#0070f3] bg-[#0070f3]/5 text-[#0070f3]"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700"
                  } disabled:opacity-50`}
                >
                  {parent.icon && <span className="text-sm flex-shrink-0">{parent.icon}</span>}
                  <span className="text-sm font-medium">{translateCategory(parent.name)}</span>
                  {selectedCategory === parent.id && (
                    <Check className="w-3.5 h-3.5 flex-shrink-0" />
                  )}
                </button>
              </div>
            );
          })}

          {/* New Category button or inline form */}
          <div className="flex flex-wrap gap-1.5">
            {!isCreatingCategory ? (
              <button
                onClick={() => setIsCreatingCategory(true)}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed border-slate-300 hover:border-[#0070f3] hover:bg-[#0070f3]/5 text-slate-500 hover:text-[#0070f3] transition-all disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-sm font-medium">{tQuickCategory("createNew")}</span>
              </button>
            ) : (
              <div className="w-full p-3 rounded-lg border border-[#0070f3] bg-[#0070f3]/5">
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="w-4 h-4 text-[#0070f3]" />
                  <span className="text-sm font-medium text-[#0070f3]">{tQuickCategory("title")}</span>
                </div>
                <div className="flex gap-2">
                  <input
                    ref={newCategoryInputRef}
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateCategory();
                      } else if (e.key === "Escape") {
                        handleCancelCreateCategory();
                      }
                    }}
                    placeholder={tQuickCategory("placeholder")}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0070f3] focus:border-transparent"
                    disabled={isCreatingCategorySaving}
                  />
                  <button
                    onClick={handleCreateCategory}
                    disabled={isCreatingCategorySaving || !newCategoryName.trim()}
                    className="px-4 py-2 bg-[#0070f3] text-white text-sm rounded-lg hover:bg-[#0070f3]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    {isCreatingCategorySaving ? tQuickCategory("creating") : tCommon("create")}
                  </button>
                  <button
                    onClick={handleCancelCreateCategory}
                    disabled={isCreatingCategorySaving}
                    className="px-3 py-2 text-slate-600 text-sm hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    {tCommon("cancel")}
                  </button>
                </div>
                {createCategoryError && (
                  <p className="text-xs text-red-500 mt-2">{createCategoryError}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Skip button */}
      <div className="px-4 pb-4">
        <button
          onClick={handleSkip}
          disabled={isSaving}
          className="w-full py-2.5 text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {t("skip")}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">{t("title")}</h1>
          <p className="text-slate-500 text-sm mt-1">{t("subtitle")}</p>
          {expenses.length > 0 && (
            <button
              onClick={handleAutoAssign}
              disabled={isAutoAssigning}
              className="mt-2 flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-800 font-medium disabled:opacity-50 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              {isAutoAssigning ? t("autoAssigning") : t("autoAssignAll")}
            </button>
          )}
          {autoAssignResult && (
            <p className="mt-1 text-xs text-green-600 font-medium">
              {t("autoAssigned", { count: autoAssignResult.assigned })}
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-slate-900">{expenses.length}</div>
          <div className="text-xs text-slate-500">{t("remaining")}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-slate-200 rounded-full h-2 overflow-hidden">
        <div
          className="bg-[#0070f3] h-full transition-all duration-300 rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Desktop layout */}
      <div className="hidden md:block">
        {doneStack.length > 0 ? (
          <div className="flex gap-5">
            {/* Card - left side */}
            <div className="flex-1">
              {currentExpense && renderCardContent()}
            </div>

            {/* History sidebar - right side */}
            <div className="w-72 bg-white rounded-xl border border-slate-200 overflow-hidden flex-shrink-0 self-start">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-700">{t("recentlyDone")}</span>
                </div>
                <span className="text-xs text-slate-400">{doneStack.length}</span>
              </div>
              <div className="divide-y divide-slate-50 max-h-[400px] overflow-y-auto">
                {doneStack.map((item) => (
                  <div key={item.expense.id} className="px-4 py-2.5 hover:bg-slate-50 transition-colors group">
                    {changingItemId === item.expense.id ? (
                      <div className="space-y-1.5">
                        <p className="text-sm font-medium text-slate-900 truncate">{item.expense.name}</p>
                        <select
                          autoFocus
                          defaultValue={item.categoryId}
                          onChange={(e) => handleChangeDoneItem(item, e.target.value)}
                          onBlur={() => setChangingItemId(null)}
                          className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-[#0070f3] focus:border-transparent"
                        >
                          {buildCategoryTree(categories as FlatCategory[]).map((parent) =>
                            parent.children.length > 0 ? (
                              <optgroup key={parent.id} label={translateCategory(parent.name)}>
                                {parent.children.map((child) => (
                                  <option key={child.id} value={child.id}>{translateCategory(child.name)}</option>
                                ))}
                              </optgroup>
                            ) : (
                              <option key={parent.id} value={parent.id}>{translateCategory(parent.name)}</option>
                            )
                          )}
                        </select>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-900 truncate">{item.expense.name}</p>
                          <button
                            onClick={() => setChangingItemId(item.expense.id)}
                            className="text-xs text-[#0070f3] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2"
                          >
                            {t("change")}
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-slate-500">
                            {formatCurrency(Number(item.expense.amount), item.expense.currency)}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                            {translateCategory(item.categoryName)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl">
            {currentExpense && renderCardContent()}
          </div>
        )}
      </div>

      {/* Mobile: single column layout */}
      <div className="md:hidden">
        {currentExpense && renderCardContent()}
      </div>

      {/* Navigation dots (mobile only) */}
      {expenses.length > 1 && (
        <div className="flex justify-center gap-1.5 md:hidden">
          {expenses.slice(0, Math.min(10, expenses.length)).map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentIndex ? "bg-[#0070f3]" : "bg-slate-300"
              }`}
            />
          ))}
          {expenses.length > 10 && (
            <span className="text-xs text-slate-400 ml-1">+{expenses.length - 10}</span>
          )}
        </div>
      )}

      {/* Mobile: Collapsible history section */}
      {doneStack.length > 0 && (
        <div className="md:hidden">
          <HistorySection
            doneStack={doneStack}
            isHistoryOpen={isHistoryOpen}
            setIsHistoryOpen={setIsHistoryOpen}
            changingItemId={changingItemId}
            setChangingItemId={setChangingItemId}
            categories={categories}
            onChangeCategory={handleChangeDoneItem}
            onUndo={handleUndo}
            translateCategory={translateCategory}
            formatShortDate={formatShortDate}
            formatCurrency={formatCurrency}
            t={t}
          />
        </div>
      )}

      {/* Tips section (mobile only) */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 md:hidden">
        <h3 className="text-sm font-medium text-slate-700 mb-2">{t("tip")}</h3>
        <p className="text-sm text-slate-600">{t("tipDescription")}</p>
      </div>

      {/* Floating undo toast */}
      {undoToast && (
        <div className={`fixed ${showLearnedToast ? "bottom-32" : "bottom-24"} md:bottom-6 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:left-auto md:right-auto md:w-auto z-50 animate-in slide-in-from-bottom-4 transition-all`}>
          <div className="bg-slate-800 text-white rounded-xl px-4 py-3 shadow-lg flex items-center justify-between gap-4 md:min-w-[320px]">
            <div className="flex items-center gap-2 min-w-0">
              <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span className="text-sm font-medium truncate">
                {undoToast.expense.name} → {translateCategory(undoToast.categoryName)}
              </span>
            </div>
            <button
              onClick={() => handleUndo()}
              className="text-sm font-bold text-blue-400 hover:text-white flex-shrink-0 transition-colors"
            >
              {t("undo")}
            </button>
          </div>
        </div>
      )}

      {/* Learned mapping toast */}
      {showLearnedToast && (
        <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-auto z-50 animate-in slide-in-from-bottom-4">
          <div className="bg-purple-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <Brain className="w-5 h-5" />
            <span className="text-sm font-medium">{t("learnedMapping")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==============================
   HISTORY SECTION (Mobile collapsible)
   ============================== */
function HistorySection({
  doneStack,
  isHistoryOpen,
  setIsHistoryOpen,
  changingItemId,
  setChangingItemId,
  categories,
  onChangeCategory,
  onUndo,
  translateCategory,
  formatShortDate,
  formatCurrency,
  t,
}: {
  doneStack: DoneItem[];
  isHistoryOpen: boolean;
  setIsHistoryOpen: (open: boolean) => void;
  changingItemId: string | null;
  setChangingItemId: (id: string | null) => void;
  categories: Category[];
  onChangeCategory: (item: DoneItem, categoryId: string) => void;
  onUndo: (item: DoneItem) => void;
  translateCategory: (name: string) => string;
  formatShortDate: (date: string) => string;
  formatCurrency: (amount: number, currency?: string) => string;
  t: (key: string) => string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setIsHistoryOpen(!isHistoryOpen)}
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">{t("recentlyCategorized")}</span>
          <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{doneStack.length}</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isHistoryOpen ? "rotate-180" : ""}`} />
      </button>
      {isHistoryOpen && (
        <div className="border-t border-slate-100 divide-y divide-slate-50">
          {doneStack.map((item) => (
            <div key={item.expense.id} className="px-4 py-2.5 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-900 truncate">{item.expense.name}</p>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 flex-shrink-0">
                    {translateCategory(item.categoryName)}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {formatCurrency(Number(item.expense.amount), item.expense.currency)} &middot; {formatShortDate(item.expense.date)}
                </p>
              </div>
              {changingItemId === item.expense.id ? (
                <select
                  autoFocus
                  defaultValue={item.categoryId}
                  onChange={(e) => onChangeCategory(item, e.target.value)}
                  onBlur={() => setChangingItemId(null)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 ml-2 focus:ring-2 focus:ring-[#0070f3] focus:border-transparent"
                >
                  {buildCategoryTree(categories as FlatCategory[]).map((parent) =>
                    parent.children.length > 0 ? (
                      <optgroup key={parent.id} label={translateCategory(parent.name)}>
                        {parent.children.map((child) => (
                          <option key={child.id} value={child.id}>{translateCategory(child.name)}</option>
                        ))}
                      </optgroup>
                    ) : (
                      <option key={parent.id} value={parent.id}>{translateCategory(parent.name)}</option>
                    )
                  )}
                </select>
              ) : (
                <button
                  onClick={() => setChangingItemId(item.expense.id)}
                  className="text-xs font-medium text-[#0070f3] hover:underline flex-shrink-0 ml-2"
                >
                  {t("change")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
