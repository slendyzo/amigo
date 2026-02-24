"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import ProjectTagSelector from "./project-tag-selector";
import { AmountInput } from "./ui/amount-input";
import { savePendingExpense, isOfflineStorageAvailable } from "@/lib/offline-storage";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import { useModalBodyClass } from "@/hooks/use-modal-body-class";
import { useModalData } from "@/hooks/use-modal-data";
import { useProjectTags } from "@/hooks/use-project-tags";
import { CURRENCIES, getCurrencySymbol } from "@/lib/currencies";
import { EXPENSE_TYPE_VALUES, getExpenseTypeButtonClass } from "@/lib/expense-types";
import { parseAmount, getTodayDateString } from "@/lib/utils";
import { buildCategoryTree, type FlatCategory } from "@/lib/category-utils";
import ExpenseImageUpload from "./expense-image-upload";
import ExpenseSplitSection from "./expense-split-section";
import { type SplitPerson } from "@/lib/split-utils";
import type { Category, BankAccount, Project, ExpenseType } from "@/types/models";

type AddExpenseModalProps = {
  isOpen: boolean;
  onClose: () => void;
  categories?: Category[];
  bankAccounts?: BankAccount[];
  projects?: Project[];
  defaultProjectId?: string;
  defaultExcludeFromBudget?: boolean;
  defaultBankAccountId?: string;
};

export default function AddExpenseModal({
  isOpen,
  onClose,
  categories: propCategories,
  bankAccounts: propBankAccounts,
  projects: propProjects,
  defaultProjectId,
  defaultExcludeFromBudget = false,
  defaultBankAccountId: propDefaultBankAccountId,
}: AddExpenseModalProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("modals");
  const tCommon = useTranslations("common");
  const { translateCategory } = useCategoryTranslation();

  // Use shared hooks
  useModalBodyClass(isOpen);

  const {
    categories: localCategories,
    projects: fetchedProjects,
    bankAccounts: localBankAccounts,
    defaultCurrency,
    defaultBankAccountId: workspaceDefaultBankAccountId,
    setCategories: setLocalCategories,
    setProjects: setFetchedProjects,
  } = useModalData(isOpen, propCategories, propProjects, propBankAccounts);

  // Use prop default if provided, otherwise fall back to workspace default
  const resolvedDefaultBankAccountId = propDefaultBankAccountId || workspaceDefaultBankAccountId || "";

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
    setError: setTagError,
    createTag,
    toggleProject,
    clearSelection,
    resetTagInput,
  } = useProjectTags({
    initialProjects: fetchedProjects.filter((p) => p.isActive !== false),
    initialSelectedIds: defaultProjectId ? [defaultProjectId] : [],
  });

  // Keep localProjects in sync with fetchedProjects (only active ones)
  useEffect(() => {
    if (fetchedProjects.length > 0 && localProjects.length === 0) {
      setLocalProjects(fetchedProjects.filter((p) => p.isActive !== false));
    }
  }, [fetchedProjects, localProjects.length, setLocalProjects]);

  // Form state
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [date, setDate] = useState(getTodayDateString());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [expenseType, setExpenseType] = useState<ExpenseType>("LIFESTYLE");
  const [categoryId, setCategoryId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [excludeFromBudget, setExcludeFromBudget] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [splitPeople, setSplitPeople] = useState<SplitPerson[] | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  // Check if selected date is in the future
  const isFutureDate = new Date(date) > new Date(getTodayDateString());

  const EXPENSE_TYPES = EXPENSE_TYPE_VALUES.map((value) => ({
    value,
    label: t(`types.${value.toLowerCase().replace("survival_", "")}`),
  }));

  // Track whether modal was previously open (to detect open transitions)
  const prevIsOpenRef = useRef(false);
  const hasSetInitialDefaults = useRef(false);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Reset form only when modal transitions from closed → open
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setName("");
      setAmount("");
      setCurrency(defaultCurrency);
      setDate(getTodayDateString());
      setShowDatePicker(false);
      setExpenseType("LIFESTYLE");
      setCategoryId("");
      setBankAccountId(resolvedDefaultBankAccountId);
      setSelectedProjectIds(defaultProjectId ? [defaultProjectId] : []);
      resetTagInput();
      setExcludeFromBudget(defaultExcludeFromBudget);
      setIsScheduled(false);
      setImageUrls([]);
      setSplitEnabled(false);
      setSplitCount(2);
      setSplitPeople(null);
      setShowDetails(false);
      setError("");
      hasSetInitialDefaults.current = false;
    }
    prevIsOpenRef.current = isOpen;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Silently update currency/bank account when async data arrives (without clearing other fields)
  useEffect(() => {
    if (isOpen && !hasSetInitialDefaults.current && defaultCurrency !== "EUR") {
      setCurrency(defaultCurrency);
      hasSetInitialDefaults.current = true;
    }
  }, [isOpen, defaultCurrency]);

  useEffect(() => {
    if (isOpen && resolvedDefaultBankAccountId) {
      setBankAccountId((prev) => prev || resolvedDefaultBankAccountId);
    }
  }, [isOpen, resolvedDefaultBankAccountId]);

  const handleCreateTag = async () => {
    await createTag();
    // Sync to parent state if needed
    if (tagError) {
      setError(tagError);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const parsedAmount = parseAmount(amount);

      if (isNaN(parsedAmount)) {
        setError("Invalid amount");
        setIsLoading(false);
        return;
      }

      const expenseData = {
        name,
        amount: parsedAmount,
        currency,
        type: expenseType as ExpenseType,
        categoryId: categoryId || undefined,
        bankAccountId: bankAccountId || undefined,
        projectIds: selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
        date,
        excludeFromBudget,
        imageUrls: imageUrls.length > 0 ? JSON.stringify(imageUrls) : undefined,
        // Scheduled expense fields
        status: (isScheduled ? "PENDING" : "PAID") as "PAID" | "PENDING",
        dueDate: isScheduled ? date : undefined,
        // Split expense fields
        splitCount: splitEnabled ? splitCount : undefined,
        splitData: splitEnabled && splitPeople ? JSON.stringify(splitPeople) : undefined,
      };

      // Try to submit online first
      if (navigator.onLine) {
        const response = await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(expenseData),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to add expense");
        }

        router.refresh();
        onClose();
      } else {
        // Save offline if not connected
        if (isOfflineStorageAvailable()) {
          await savePendingExpense(expenseData);
          window.dispatchEvent(new CustomEvent("offline-expense-added"));
          onClose();
        } else {
          throw new Error("Offline storage not available");
        }
      }
    } catch (err) {
      // If online submission fails due to network, try offline storage
      if (err instanceof TypeError && err.message.includes("fetch")) {
        if (isOfflineStorageAvailable()) {
          const parsedAmount = parseAmount(amount);
          await savePendingExpense({
            name,
            amount: parsedAmount,
            currency,
            type: expenseType as ExpenseType,
            categoryId: categoryId || undefined,
            bankAccountId: bankAccountId || undefined,
            projectIds: selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
            date,
            excludeFromBudget,
            status: (isScheduled ? "PENDING" : "PAID") as "PAID" | "PENDING",
            dueDate: isScheduled ? date : undefined,
          });
          window.dispatchEvent(new CustomEvent("offline-expense-added"));
          onClose();
          return;
        }
      }
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const isToday = date === getTodayDateString();
  const parsedAmount = parseAmount(amount);

  // Derive display values for collapsed details card
  const selectedCategory = localCategories.find((c) => c.id === categoryId);
  const categoryLabel = selectedCategory ? translateCategory(selectedCategory.name) : t("auto");
  const selectedAccount = localBankAccounts.find((a) => a.id === bankAccountId);
  const accountLabel = selectedAccount ? selectedAccount.name : t("none");
  const typeLabel = t(`types.${expenseType.toLowerCase().replace("survival_", "")}`);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <form onSubmit={handleSubmit} className="relative w-full md:max-w-md md:mx-4 bg-slate-50 rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Drag handle (mobile) + Header */}
        <div className="flex-shrink-0">
          <div className="flex justify-center pt-2 pb-0 md:hidden">
            <div className="w-10 h-1 rounded-full bg-slate-300" />
          </div>
          <div className="px-4 md:px-5 py-2 md:py-3 flex items-center justify-between">
            <h2 className="text-base md:text-lg font-semibold text-slate-900">
              {t("addExpense")}
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
        </div>

        {/* Body - Scrollable cards */}
        <div className="px-3 md:px-4 pb-3 space-y-2.5 overflow-y-auto scroll-touch flex-1">
          {(error || tagError) && (
            <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm">
              {error || tagError}
            </div>
          )}

          {/* ── CARD 1: Essentials (Name + Amount + Date) ── */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-sm">
            {/* Name */}
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("whatDidYouBuyPlaceholder")}
              required
              className="w-full text-[17px] font-medium text-slate-900 placeholder-slate-400 bg-transparent outline-none"
            />

            {/* Amount + Currency */}
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-baseline gap-1">
                <span className="text-slate-400 text-2xl font-light">{getCurrencySymbol(currency)}</span>
                <AmountInput
                  value={amount}
                  onChange={setAmount}
                  currency={currency}
                  required
                  hideCurrencySymbol
                  className="flex-1"
                  inputClassName="!border-0 !ring-0 !shadow-none !py-0 text-[28px] font-bold !text-slate-900 !placeholder-slate-300"
                />
              </div>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="px-3 py-1.5 bg-slate-100 rounded-lg text-sm font-medium text-slate-600 border-0 outline-none cursor-pointer"
              >
                {CURRENCIES.map((curr) => (
                  <option key={curr} value={curr}>
                    {curr}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div className="flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className={`${isFutureDate ? "text-blue-700 font-medium" : "text-slate-500"}`}>
                {isToday ? t("today") : new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
              </span>
              <button
                type="button"
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="text-[#0070f3] text-xs"
              >
                {t("change")}
              </button>
            </div>

            {showDatePicker && (
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  const selectedDate = new Date(e.target.value);
                  const today = new Date(getTodayDateString());
                  if (selectedDate > today) {
                    setIsScheduled(true);
                  }
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
              />
            )}

            {/* Schedule toggle (inside essentials card when future date) */}
            {(isFutureDate || isScheduled) && (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isScheduled}
                    onChange={(e) => setIsScheduled(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-blue-800">
                      {t("scheduleForLater")}
                    </span>
                    <p className="text-xs text-blue-600 mt-0.5">
                      {t("scheduleForLaterHint", {
                        month: new Date(date).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
                      })}
                    </p>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* ── CARD 2: Split ── */}
          {splitEnabled ? (
            /* Expanded split card */
            <div className="bg-indigo-50 rounded-2xl border border-indigo-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <svg className="w-[18px] h-[18px] text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm font-semibold text-indigo-800">{t("split.splitExpense")}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSplitEnabled(false)}
                  className="w-10 h-6 rounded-full bg-indigo-500 relative transition-colors"
                >
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 right-0.5 shadow-sm" />
                </button>
              </div>
              {parsedAmount > 0 && (
                <ExpenseSplitSection
                  amount={parsedAmount}
                  currency={currency}
                  splitEnabled={splitEnabled}
                  onSplitEnabledChange={setSplitEnabled}
                  splitCount={splitCount}
                  onSplitCountChange={setSplitCount}
                  splitPeople={splitPeople}
                  onSplitPeopleChange={setSplitPeople}
                  hideToggle
                />
              )}
              {parsedAmount <= 0 && (
                <p className="text-xs text-indigo-500">{t("splitAmountHint")}</p>
              )}
            </div>
          ) : (
            /* Collapsed split card */
            <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <svg className="w-[18px] h-[18px] text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm text-slate-500">{t("split.splitExpense")}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSplitEnabled(true)}
                  className="w-10 h-6 rounded-full bg-slate-200 relative transition-colors"
                >
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 left-0.5 shadow-sm" />
                </button>
              </div>
            </div>
          )}

          {/* ── CARD 3: Tags ── */}
          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-sm">
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

          {/* ── CARD 4: Details (collapsed/expanded) ── */}
          {showDetails ? (
            <div className="bg-white rounded-2xl border-2 border-blue-200 p-4 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">{tCommon("details")}</span>
                <button
                  type="button"
                  onClick={() => setShowDetails(false)}
                  className="p-1"
                >
                  <svg className="w-4 h-4 text-slate-400 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Category */}
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">{t("category")}</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-transparent"
                >
                  <option value="">{t("auto")}</option>
                  {buildCategoryTree(localCategories as FlatCategory[]).map((parent) =>
                    parent.children.length > 0 ? (
                      <optgroup key={parent.id} label={translateCategory(parent.name)}>
                        {parent.children.map((child) => (
                          <option key={child.id} value={child.id}>
                            {translateCategory(child.name)}
                          </option>
                        ))}
                      </optgroup>
                    ) : (
                      <option key={parent.id} value={parent.id}>
                        {translateCategory(parent.name)}
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* Bank Account */}
              {localBankAccounts.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1 block">{t("bankAccount")}</label>
                  <select
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-transparent"
                  >
                    <option value="">{t("none")}</option>
                    {localBankAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Expense Type */}
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1.5 block">{t("expenseType")}</label>
                <div className="flex flex-wrap gap-2">
                  {EXPENSE_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setExpenseType(type.value)}
                      className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${getExpenseTypeButtonClass(type.value, expenseType === type.value)}`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Collapsed details card */
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="w-full bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-sm text-left"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">{tCommon("details")}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-medium">{categoryLabel}</span>
                  {localBankAccounts.length > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 font-medium">{accountLabel}</span>
                  )}
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 font-medium">{typeLabel}</span>
                  <svg className="w-4 h-4 text-slate-300 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </button>
          )}

          {/* ── CARD 5: Receipt Photos ── */}
          {imageUrls.length > 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <ExpenseImageUpload
                imageUrls={imageUrls}
                onChange={setImageUrls}
                disabled={isLoading}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                /* Trigger file input via a ref approach - we render the upload component hidden and click it */
                const el = document.querySelector<HTMLInputElement>("#add-expense-file-input");
                el?.click();
              }}
              className="w-full bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-sm text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <svg className="w-[18px] h-[18px] text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm text-slate-400">{t("addPhoto")}</span>
                </div>
                <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </button>
          )}
          {/* Hidden file input for collapsed receipt trigger */}
          {imageUrls.length === 0 && (
            <div className="hidden">
              <ExpenseImageUpload
                imageUrls={imageUrls}
                onChange={setImageUrls}
                disabled={isLoading}
                fileInputId="add-expense-file-input"
              />
            </div>
          )}

          {/* ── Exclude from budget (shown when project selected) ── */}
          {selectedProjectIds.length > 0 && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 shadow-sm">
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

        {/* Footer */}
        <div className="flex-shrink-0 px-3 md:px-4 py-3 md:py-4 border-t border-slate-200 pb-safe flex gap-3 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-3 md:py-2.5 text-slate-700 font-medium active:bg-slate-50 md:hover:bg-slate-50 transition-colors tap-none"
          >
            {tCommon("cancel")}
          </button>
          <button
            type="submit"
            disabled={isLoading || !name || !amount}
            className="flex-1 rounded-xl bg-[#0070f3] px-4 py-3 md:py-2.5 text-white font-medium active:bg-[#0060df] md:hover:bg-[#0060df] transition-colors disabled:opacity-50 disabled:cursor-not-allowed tap-none"
          >
            {isLoading ? t("adding") : (isScheduled ? t("scheduleForLater") : tCommon("add"))}
          </button>
        </div>
      </form>
    </div>
  );
}
