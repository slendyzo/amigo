"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronRight, Tag, Loader2, Plus } from "lucide-react";

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
  isSystem?: boolean;
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "\u20ac",
  USD: "$",
  GBP: "\u00a3",
  BRL: "R$",
  PLN: "z\u0142",
};

function formatAmount(amount: number, currency?: string): string {
  const symbol = CURRENCY_SYMBOLS[currency || "EUR"] || "\u20ac";
  const absAmount = Math.abs(amount);
  if (amount < 0) {
    return `(${symbol}${absAmount.toFixed(2)})`;
  }
  return `${symbol}${amount.toFixed(2)}`;
}

export default function CategorizePage() {
  const t = useTranslations("categorize");
  const tCommon = useTranslations("common");
  const tTime = useTranslations("time");
  const tQuickCategory = useTranslations("modals.quickCategory");

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

  // Get translated month names
  const MONTHS = [
    tTime("months.january"), tTime("months.february"), tTime("months.march"),
    tTime("months.april"), tTime("months.may"), tTime("months.june"),
    tTime("months.july"), tTime("months.august"), tTime("months.september"),
    tTime("months.october"), tTime("months.november"), tTime("months.december")
  ];

  useEffect(() => {
    fetchData();
  }, []);

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

  const handleCategorize = async (categoryId: string) => {
    if (!currentExpense || isSaving) return;

    setSelectedCategory(categoryId);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/expenses/${currentExpense.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId }),
      });

      if (response.ok) {
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          setSelectedCategory(null);
          // Move to next or remove from list
          setExpenses((prev) => prev.filter((e) => e.id !== currentExpense.id));
          // Keep currentIndex the same (or decrease if at end)
          if (currentIndex >= expenses.length - 1 && currentIndex > 0) {
            setCurrentIndex((prev) => prev - 1);
          }
        }, 300);
      }
    } catch (error) {
      console.error("Failed to categorize:", error);
    } finally {
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

  const progress = expenses.length > 0
    ? Math.round(((expenses.length - expenses.length) / expenses.length) * 100)
    : 100;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const day = date.getDate();
    const month = MONTHS[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">{t("title")}</h1>
          <p className="text-slate-500 text-sm mt-1">{t("subtitle")}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-slate-900">{expenses.length}</div>
          <div className="text-xs text-slate-500">{t("remaining")}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-slate-200 rounded-full h-2 overflow-hidden">
        <div
          className="bg-[#0070f3] h-full transition-all duration-300"
          style={{ width: `${100 - (expenses.length / (expenses.length + currentIndex + 1)) * 100}%` }}
        />
      </div>

      {/* Current expense card */}
      {currentExpense && (
        <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all duration-300 ${showSuccess ? 'scale-95 opacity-50' : ''}`}>
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-start justify-between mb-2">
              <h2 className="text-lg font-semibold text-slate-900">{currentExpense.name}</h2>
              <span className={`text-lg font-bold ${Number(currentExpense.amount) < 0 ? 'text-green-600' : 'text-slate-900'}`}>
                {formatAmount(Number(currentExpense.amount), currentExpense.currency)}
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
            <p className="text-sm font-medium text-slate-700 mb-3">{t("selectCategory")}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => handleCategorize(category.id)}
                  disabled={isSaving || isCreatingCategory}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-left transition-all ${
                    selectedCategory === category.id
                      ? "border-[#0070f3] bg-[#0070f3]/5 text-[#0070f3]"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700"
                  } disabled:opacity-50`}
                >
                  <Tag className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate text-sm font-medium">{category.name}</span>
                  {selectedCategory === category.id && (
                    <Check className="w-4 h-4 ml-auto flex-shrink-0" />
                  )}
                </button>
              ))}

              {/* New Category button or inline form */}
              {!isCreatingCategory ? (
                <button
                  onClick={() => setIsCreatingCategory(true)}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-4 py-3 rounded-lg border border-dashed border-slate-300 hover:border-[#0070f3] hover:bg-[#0070f3]/5 text-slate-500 hover:text-[#0070f3] transition-all disabled:opacity-50"
                >
                  <Plus className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate text-sm font-medium">{tQuickCategory("createNew")}</span>
                </button>
              ) : (
                <div className="col-span-2 md:col-span-3 p-3 rounded-lg border border-[#0070f3] bg-[#0070f3]/5">
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
      )}

      {/* Navigation dots (for mobile to show position) */}
      {expenses.length > 1 && (
        <div className="flex justify-center gap-1.5">
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

      {/* Tips section */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <h3 className="text-sm font-medium text-slate-700 mb-2">{t("tip")}</h3>
        <p className="text-sm text-slate-600">{t("tipDescription")}</p>
      </div>
    </div>
  );
}
