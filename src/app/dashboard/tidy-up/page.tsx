"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Tag, Loader2, Sparkles, Brain } from "lucide-react";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import { formatCurrency } from "@/lib/currencies";
import { buildCategoryTree, type FlatCategory, type CategoryNode } from "@/lib/category-utils";
import MerchantAvatar from "@/components/ui/merchant-avatar";

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
  const router = useRouter();
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
  const [showPicker, setShowPicker] = useState(false);

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
      const [expensesRes, categoriesRes, recentRes] = await Promise.all([
        fetch("/api/expenses?limit=10000"),
        fetch("/api/categories"),
        fetch("/api/expenses/recent-categorized"),
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
      // Load persisted recent categorizations into doneStack
      if (recentRes.ok) {
        const data = await recentRes.json();
        const recentDone: DoneItem[] = (data.expenses || []).map((e: Expense & { categoryId: string; category: { id: string; name: string } }) => ({
          expense: { id: e.id, name: e.name, amount: e.amount, currency: e.currency, type: e.type, date: e.date, category: e.category },
          categoryId: e.categoryId,
          categoryName: e.category?.name || "",
        }));
        setDoneStack(recentDone);
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
      // Remove category and categorizedAt from expense via API
      await fetch(`/api/expenses/${target.expense.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: null, categorizedAt: null }),
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
        body: JSON.stringify({ categoryId, categorizedAt: new Date().toISOString() }),
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
          setShowPicker(false);
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
    setShowPicker(false);
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
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" strokeWidth={1.8} />
      </div>
    );
  }

  if (expenses.length === 0) {
    return (
      <div className="space-y-5">
        {/* Pushed header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            aria-label={tCommon("back")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ink-muted)] shadow-[var(--shadow-card)] transition-colors hover:text-[var(--ink)]"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
          </button>
          <h1 className="text-[16px] font-semibold text-[var(--ink)]">{t("title")}</h1>
          <div className="h-10 w-10" />
        </div>

        <div className="rounded-[24px] bg-[var(--surface)] p-8 md:p-12 text-center shadow-[var(--shadow-pop)]">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-fainter)]">
            <Check className="h-8 w-8 text-[var(--accent)]" strokeWidth={1.8} />
          </div>
          <h2 className="mb-2 text-[18px] font-bold text-[var(--ink)]">{t("allDone")}</h2>
          <p className="text-[14px] text-[var(--ink-muted)]">{t("allDoneDescription")}</p>
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

  const typeLabel = (type: string) => type.toLowerCase().replace("_", " ");

  // Restyled inline category grid picker (shared by Pick-other flow)
  const renderCategoryGrid = () => (
    <div className="mt-4">
      <p className="mb-2.5 text-[13px] font-semibold text-[var(--ink)]">{t("selectCategory")}</p>
      <div className="space-y-3">
        {buildCategoryTree(categories as FlatCategory[]).map((parent) => {
          const tileClass = (id: string) =>
            `min-h-[38px] rounded-[14px] px-3.5 py-2 text-[13px] font-medium transition-colors disabled:opacity-50 ${
              selectedCategory === id
                ? "bg-[var(--surface-2)] text-[var(--accent-strong)] ring-1 ring-[var(--accent)]"
                : "bg-[var(--app-bg)] text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--accent-strong)]"
            }`;

          // Parent with children: grouped section
          if (parent.children.length > 0) {
            return (
              <div key={parent.id}>
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-subtle)]">
                  {parent.icon && <span>{parent.icon}</span>}
                  {translateCategory(parent.name)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {parent.children.map((child) => (
                    <button
                      key={child.id}
                      onClick={() => handleCategorize(child.id)}
                      disabled={isSaving || isCreatingCategory}
                      className={tileClass(child.id)}
                    >
                      {translateCategory(child.name)}
                      {selectedCategory === child.id && <Check className="ml-1 inline h-3.5 w-3.5" strokeWidth={1.8} />}
                    </button>
                  ))}
                </div>
              </div>
            );
          }

          // Flat parent (no children): single tile
          return (
            <div key={parent.id} className="flex flex-wrap gap-1.5">
              <button
                onClick={() => handleCategorize(parent.id)}
                disabled={isSaving || isCreatingCategory}
                className={tileClass(parent.id)}
              >
                {translateCategory(parent.name)}
                {selectedCategory === parent.id && <Check className="ml-1 inline h-3.5 w-3.5" strokeWidth={1.8} />}
              </button>
            </div>
          );
        })}

        {/* New Category tile / inline form */}
        <div className="flex flex-wrap gap-1.5">
          {!isCreatingCategory ? (
            <button
              onClick={() => setIsCreatingCategory(true)}
              disabled={isSaving}
              className="min-h-[38px] rounded-[14px] border border-dashed border-[var(--line-strong)] px-3.5 py-2 text-[13px] font-medium text-[var(--ink-subtle)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
            >
              + {tQuickCategory("createNew")}
            </button>
          ) : (
            <div className="w-full rounded-[16px] border border-[var(--accent)] bg-[var(--surface-2)] p-3">
              <div className="mb-2 flex items-center gap-2">
                <Tag className="h-4 w-4 text-[var(--accent)]" strokeWidth={1.8} />
                <span className="text-[13px] font-semibold text-[var(--accent-strong)]">{tQuickCategory("title")}</span>
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
                  className="flex-1 rounded-[12px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  disabled={isCreatingCategorySaving}
                />
                <button
                  onClick={handleCreateCategory}
                  disabled={isCreatingCategorySaving || !newCategoryName.trim()}
                  className="whitespace-nowrap rounded-[12px] bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCreatingCategorySaving ? tQuickCategory("creating") : tCommon("create")}
                </button>
                <button
                  onClick={handleCancelCreateCategory}
                  disabled={isCreatingCategorySaving}
                  className="rounded-[12px] px-3 py-2 text-[13px] text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
                >
                  {tCommon("cancel")}
                </button>
              </div>
              {createCategoryError && <p className="mt-2 text-[12px] text-[var(--negative)]">{createCategoryError}</p>}
            </div>
          )}
        </div>

        {/* Skip inside picker */}
        <button
          onClick={handleSkip}
          disabled={isSaving}
          className="flex w-full items-center justify-center gap-1 rounded-[14px] py-2.5 text-[13px] font-medium text-[var(--ink-muted)] transition-colors hover:bg-[var(--app-bg)] hover:text-[var(--ink)] disabled:opacity-50"
        >
          {t("skip")}
          <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );

  // Left-column content shared between mobile and desktop layouts
  const renderMain = () => {
    const nextExpense = expenses[currentIndex + 1];
    const pickerOpen = showPicker || !suggestion;
    const amountNeg = Number(currentExpense.amount) < 0;

    return (
      <div className="space-y-3">
        {/* Focus card */}
        <div
          className={`rounded-[24px] bg-[var(--surface)] p-[22px] shadow-[var(--shadow-pop)] ${showSuccess ? "scale-95 opacity-50" : ""}`}
          style={{ transition: "transform 0.35s var(--ease), opacity 0.35s var(--ease)" }}
        >
          {/* Top row */}
          <div className="flex items-center gap-3">
            <MerchantAvatar name={currentExpense.name} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-[var(--ink)]">{currentExpense.name}</p>
              <p className="mt-0.5 text-[11.5px] capitalize text-[var(--ink-subtle)]">
                {formatDate(currentExpense.date)} · {typeLabel(currentExpense.type)}
              </p>
            </div>
            <span
              className="flex-none text-[16px] font-bold tabular-nums"
              style={{ color: amountNeg ? "var(--positive)" : "var(--ink)" }}
            >
              {formatCurrency(Number(currentExpense.amount), currentExpense.currency)}
            </span>
          </div>

          {/* Suggestion strip */}
          {suggestion && (
            <div className="mt-4 flex items-start gap-2.5 rounded-[16px] bg-[var(--surface-2)] px-3.5 py-3">
              <Sparkles className="mt-0.5 h-4 w-4 flex-none text-[var(--accent)]" strokeWidth={1.8} />
              <p className="text-[12.5px] leading-snug text-[var(--accent-strong)]">
                <span className="font-semibold">{t("suggested")}: </span>
                {translateCategory(suggestion.categoryName)}
                {suggestion.source === "history" && suggestion.count
                  ? ` · ${t("usedTimes", { count: suggestion.count })}`
                  : ""}
              </p>
            </div>
          )}

          {/* Actions OR category picker */}
          {!pickerOpen && suggestion ? (
            <div className="mt-3.5 flex gap-2">
              <button
                onClick={() => handleCategorize(suggestion.categoryId)}
                disabled={isSaving}
                className="flex-1 rounded-[14px] bg-[var(--accent)] py-3 text-center text-[13px] font-semibold text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-strong)] disabled:opacity-50"
              >
                {t("accept")}
              </button>
              <button
                onClick={() => setShowPicker(true)}
                disabled={isSaving}
                className="flex-1 rounded-[14px] bg-[var(--app-bg)] py-3 text-center text-[13px] font-semibold text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)] disabled:opacity-50"
              >
                {t("pickOther")}
              </button>
              <button
                onClick={handleSkip}
                disabled={isSaving}
                aria-label={t("skip")}
                className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[14px] bg-[var(--app-bg)] text-[var(--ink-subtle)] transition-colors hover:text-[var(--ink)] disabled:opacity-50"
              >
                <ChevronRight className="h-5 w-5" strokeWidth={1.8} />
              </button>
            </div>
          ) : (
            renderCategoryGrid()
          )}
        </div>

        {/* Next item peek */}
        {nextExpense && (
          <div
            className="rounded-[20px] bg-[var(--surface)] px-[18px] py-3.5 opacity-50 shadow-[var(--shadow-card)]"
            style={{ transform: "scale(0.98)" }}
          >
            <div className="flex items-center gap-3">
              <MerchantAvatar name={nextExpense.name} size={38} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[var(--ink)]">{nextExpense.name}</p>
                <p className="text-[11px] text-[var(--ink-subtle)]">{t("upNext")}</p>
              </div>
              <span
                className="flex-none text-[13px] font-semibold tabular-nums"
                style={{ color: Number(nextExpense.amount) < 0 ? "var(--positive)" : "var(--ink)" }}
              >
                {formatCurrency(Number(nextExpense.amount), nextExpense.currency)}
              </span>
            </div>
          </div>
        )}

        {/* Footer microcopy */}
        <p className="text-center text-[11px] text-[var(--ink-subtle)]">{t("keywordRuleHint")} ✓</p>
      </div>
    );
  };

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Pushed header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          aria-label={tCommon("back")}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ink-muted)] shadow-[var(--shadow-card)] transition-colors hover:text-[var(--ink)]"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
        </button>
        <h1 className="text-[16px] font-semibold text-[var(--ink)]">{t("title")}</h1>
        <div className="h-10 w-10" />
      </div>

      {/* Progress bar + counter */}
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
          <div
            className="h-full rounded-full"
            style={{ width: `${progressPercent}%`, background: "var(--bar-gradient)", transition: "width 0.5s var(--ease)" }}
          />
        </div>
        <span className="text-[12px] font-semibold tabular-nums text-[var(--ink-muted)]">
          {t("progressCount", { done: doneStack.length, total: totalItems })}
        </span>
      </div>

      {/* Auto-assign (preserved feature) */}
      {expenses.length > 0 && (
        <div className="flex flex-col items-start gap-1">
          <button
            onClick={handleAutoAssign}
            disabled={isAutoAssigning}
            className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent-strong)] disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.8} />
            {isAutoAssigning ? t("autoAssigning") : t("autoAssignAll")}
          </button>
          {autoAssignResult && (
            <p className="text-[12px] font-medium text-[var(--positive)]">
              {t("autoAssigned", { count: autoAssignResult.assigned })}
            </p>
          )}
        </div>
      )}

      {/* Desktop layout - always two-column for stable layout */}
      <div className="hidden md:flex gap-5">
        {/* Card - left side */}
        <div className="flex-1">{currentExpense && renderMain()}</div>

        {/* History sidebar - always visible */}
        <div className="w-72 flex-shrink-0 self-start overflow-hidden rounded-[20px] bg-[var(--surface)] shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[var(--ink-subtle)]" strokeWidth={1.8} />
              <span className="text-[13px] font-semibold text-[var(--ink)]">{t("recentlyDone")}</span>
            </div>
            <span className="text-[12px] tabular-nums text-[var(--ink-subtle)]">{doneStack.length}</span>
          </div>
          {doneStack.length > 0 ? (
            <div className="max-h-[400px] divide-y divide-[var(--line)] overflow-y-auto">
              {doneStack.map((item) => (
                <div key={item.expense.id} className="group px-4 py-2.5 transition-colors hover:bg-[var(--app-bg)]">
                  {changingItemId === item.expense.id ? (
                    <div className="space-y-1.5">
                      <p className="truncate text-[13px] font-medium text-[var(--ink)]">{item.expense.name}</p>
                      <select
                        autoFocus
                        defaultValue={item.categoryId}
                        onChange={(e) => handleChangeDoneItem(item, e.target.value)}
                        onBlur={() => setChangingItemId(null)}
                        className="w-full rounded-[12px] border border-[var(--line-strong)] bg-[var(--surface)] px-2 py-1.5 text-[12px] text-[var(--ink)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
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
                        <p className="truncate text-[13px] font-medium text-[var(--ink)]">{item.expense.name}</p>
                        <button
                          onClick={() => setChangingItemId(item.expense.id)}
                          className="ml-2 flex-shrink-0 text-[12px] text-[var(--accent)] opacity-0 transition-opacity hover:text-[var(--accent-strong)] group-hover:opacity-100"
                        >
                          {t("change")}
                        </button>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="text-[12px] tabular-nums text-[var(--ink-muted)]">
                          {formatCurrency(Number(item.expense.amount), item.expense.currency)}
                        </span>
                        <span className="rounded-[8px] bg-[var(--accent-fainter)] px-1.5 py-0.5 text-[10px] text-[var(--accent-strong)]">
                          {translateCategory(item.categoryName)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-[13px] text-[var(--ink-subtle)]">{t("noRecentlyDone")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile: single column layout */}
      <div className="md:hidden">{currentExpense && renderMain()}</div>

      {/* Navigation dots (mobile only) */}
      {expenses.length > 1 && (
        <div className="flex justify-center gap-1.5 md:hidden">
          {expenses.slice(0, Math.min(10, expenses.length)).map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              aria-label={`${index + 1}`}
              className={`h-2 w-2 rounded-full transition-colors ${
                index === currentIndex ? "bg-[var(--accent)]" : "bg-[var(--surface-3)]"
              }`}
            />
          ))}
          {expenses.length > 10 && (
            <span className="ml-1 text-[12px] tabular-nums text-[var(--ink-subtle)]">+{expenses.length - 10}</span>
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
      <div className="rounded-[20px] border border-[var(--line)] bg-[var(--surface-2)] p-4 md:hidden">
        <h3 className="mb-2 text-[13px] font-semibold text-[var(--accent-strong)]">{t("tip")}</h3>
        <p className="text-[13px] text-[var(--ink-muted)]">{t("tipDescription")}</p>
      </div>

      {/* Floating undo toast */}
      {undoToast && (
        <div className={`fixed ${showLearnedToast ? "bottom-32" : "bottom-24"} md:bottom-6 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-md z-50 animate-in slide-in-from-bottom-4 transition-all`}>
          <div className="flex items-center justify-between gap-4 rounded-[16px] bg-[var(--ink)] px-4 py-3 shadow-[var(--shadow-pop)] md:min-w-[320px]">
            <div className="flex min-w-0 items-center gap-2">
              <Check className="h-4 w-4 flex-shrink-0 text-[var(--positive)]" strokeWidth={1.8} />
              <span className="truncate text-[13px] font-medium text-[var(--surface)]">
                {undoToast.expense.name} → {translateCategory(undoToast.categoryName)}
              </span>
            </div>
            <button
              onClick={() => handleUndo()}
              className="flex-shrink-0 text-[13px] font-bold text-[var(--accent-soft)] transition-colors hover:text-[var(--surface)]"
            >
              {t("undo")}
            </button>
          </div>
        </div>
      )}

      {/* Learned mapping toast */}
      {showLearnedToast && (
        <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-md z-50 animate-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2 rounded-[16px] bg-[var(--accent)] px-4 py-3 shadow-[var(--shadow-pop)]">
            <Brain className="h-5 w-5 text-[var(--accent-fg)]" strokeWidth={1.8} />
            <span className="text-[13px] font-medium text-[var(--accent-fg)]">{t("learnedMapping")}</span>
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
    <div className="overflow-hidden rounded-[20px] bg-[var(--surface)] shadow-[var(--shadow-card)]">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setIsHistoryOpen(!isHistoryOpen)}
      >
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-[var(--ink-subtle)]" strokeWidth={1.8} />
          <span className="text-[13px] font-semibold text-[var(--ink)]">{t("recentlyCategorized")}</span>
          <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] tabular-nums text-[var(--ink-muted)]">{doneStack.length}</span>
        </div>
        <ChevronDown className={`h-4 w-4 text-[var(--ink-subtle)] transition-transform duration-200 ${isHistoryOpen ? "rotate-180" : ""}`} strokeWidth={1.8} />
      </button>
      {isHistoryOpen && (
        <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
          {doneStack.map((item) => (
            <div key={item.expense.id} className="flex items-center justify-between px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[13px] font-medium text-[var(--ink)]">{item.expense.name}</p>
                  <span className="flex-shrink-0 rounded-[8px] bg-[var(--accent-fainter)] px-1.5 py-0.5 text-[11px] text-[var(--accent-strong)]">
                    {translateCategory(item.categoryName)}
                  </span>
                </div>
                <p className="text-[12px] tabular-nums text-[var(--ink-muted)]">
                  {formatCurrency(Number(item.expense.amount), item.expense.currency)} &middot; {formatShortDate(item.expense.date)}
                </p>
              </div>
              {changingItemId === item.expense.id ? (
                <select
                  autoFocus
                  defaultValue={item.categoryId}
                  onChange={(e) => onChangeCategory(item, e.target.value)}
                  onBlur={() => setChangingItemId(null)}
                  className="ml-2 rounded-[12px] border border-[var(--line-strong)] bg-[var(--surface)] px-2 py-1.5 text-[12px] text-[var(--ink)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
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
                  className="ml-2 flex-shrink-0 text-[12px] font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent-strong)]"
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
