"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import ProjectTagSelector from "./project-tag-selector";
import AssetLinkPicker from "./asset-link-picker";
import { AmountInput } from "./ui/amount-input";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import { useModalBodyClass } from "@/hooks/use-modal-body-class";
import { useProjectTags } from "@/hooks/use-project-tags";
import { CURRENCIES, getCurrencySymbol } from "@/lib/currencies";
import { EXPENSE_TYPE_VALUES } from "@/lib/expense-types";
import { parseAmount, evaluateExpression, getTodayDateString } from "@/lib/utils";
import { buildCategoryTree, type FlatCategory } from "@/lib/category-utils";
import ExpenseImageUpload from "./expense-image-upload";
import ExpenseSplitSection from "./expense-split-section";
import { type SplitPerson, parseSplitData } from "@/lib/split-utils";
import { useSplitSync } from "@/hooks/use-split-sync";
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
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("modals");
  const tCommon = useTranslations("common");
  const { translateCategory } = useCategoryTranslation();

  // Use shared hook for body class management
  useModalBodyClass(isOpen);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [amountExpression, setAmountExpression] = useState<string | null>(null);
  const [currency, setCurrency] = useState("EUR");
  const [categoryId, setCategoryId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [date, setDate] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [expenseType, setExpenseType] = useState<ExpenseType>("LIFESTYLE");
  const [status, setStatus] = useState<"PAID" | "PENDING">("PAID");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [localCategories, setLocalCategories] = useState<Category[]>(categories);
  const [excludeFromBudget, setExcludeFromBudget] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [linkedRealAssetId, setLinkedRealAssetId] = useState<string | null>(null);
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [splitPeople, setSplitPeople] = useState<SplitPerson[] | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Installment plan progress (fetched when editing an installment expense)
  type InstallmentProgress = {
    months: number;
    totalAmount: number;
    monthlyAmount: number;
    paidCount: number;
    paidAmount: number;
    remainingAmount: number;
    isActive: boolean;
    currency: string;
  };
  const [installmentProgress, setInstallmentProgress] = useState<InstallmentProgress | null>(null);
  const [installmentConfirm, setInstallmentConfirm] = useState<"cancel" | "settle" | null>(null);
  const [installmentBusy, setInstallmentBusy] = useState(false);

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
      // Restore the original expression if one was stored, otherwise show computed amount
      setAmount(expense.amountExpression || Number(expense.amount).toString());
      setAmountExpression(expense.amountExpression || null);
      setCurrency(expense.currency || "EUR");
      setCategoryId(expense.category?.id || "");
      setBankAccountId(expense.bankAccount?.id || "");
      setSelectedProjectIds(expense.projects?.map(p => p.id) || []);
      setExpenseType(expense.type === "PROJECT" ? "LIFESTYLE" : expense.type);
      setDate(expense.date.split("T")[0]);
      setExcludeFromBudget(expense.excludeFromBudget || false);
      setStatus(expense.status || "PAID");
      setImageUrls(expense.imageUrls ? JSON.parse(expense.imageUrls) : []);
      setSplitEnabled(!!expense.splitCount);
      setSplitCount(expense.splitCount || 2);
      setSplitPeople(parseSplitData(expense.splitData));
      setDescription(expense.description || "");
      setShowNotes(!!expense.description);
      setLinkedRealAssetId(expense.realAssetId ?? null);
      setShowDatePicker(false);
      setShowDetails(false);
      setError("");
      resetTagInput();
    }
  }, [expense, setSelectedProjectIds, resetTagInput]);

  // Load installment plan progress when editing an installment expense
  useEffect(() => {
    setInstallmentProgress(null);
    setInstallmentConfirm(null);
    if (!isOpen || !expense?.installmentNumber || !expense?.recurringTemplateId) return;
    let stale = false;
    fetch(`/api/installments/${expense.recurringTemplateId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!stale && data?.progress) setInstallmentProgress(data.progress);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [isOpen, expense?.installmentNumber, expense?.recurringTemplateId]);

  const handleInstallmentAction = async (action: "cancel" | "settle") => {
    if (!expense?.recurringTemplateId || installmentBusy) return;
    setInstallmentBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/installments/${expense.recurringTemplateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update installment plan");
      }
      onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setInstallmentConfirm(null);
    } finally {
      setInstallmentBusy(false);
    }
  };

  const handleCreateTag = async () => {
    await createTag();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expense) return;
    if (splitError) {
      setError(splitError);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // If amount contains a math expression that wasn't evaluated on blur, handle it now
      let finalExpression = amountExpression;
      let finalAmount = amount;
      if (!finalExpression && evaluateExpression(amount) !== null) {
        finalExpression = amount;
        finalAmount = evaluateExpression(amount)!.toString();
      }

      const parsedAmount = parseAmount(finalAmount);

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
          amountExpression: finalExpression,
          currency,
          type: expenseType,
          categoryId: categoryId || null,
          bankAccountId: bankAccountId || null,
          projectIds: selectedProjectIds,
          date,
          excludeFromBudget,
          description: description || null,
          imageUrls: imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
          status,
          splitCount: splitEnabled ? splitCount : null,
          splitData: splitEnabled && splitPeople ? JSON.stringify(splitPeople) : null,
          realAssetId: linkedRealAssetId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update expense");
      }

      // Notify parent to refresh data, then close
      onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const isToday = date === getTodayDateString();
  const parsedAmount = parseAmount(amount);

  // Owns split recalculation — see useSplitSync for why it can't live in the section.
  const { splitError, setSplitError } = useSplitSync({
    amount: isNaN(parsedAmount) ? 0 : parsedAmount,
    splitEnabled,
    splitCount,
    splitPeople,
    onSplitPeopleChange: setSplitPeople,
    meLabel: t("split.meLabel"),
    lockedExceedsMessage: t("split.lockedExceedsTotal"),
  });

  // Derive display values for collapsed details card
  const selectedCategory = localCategories.find((c) => c.id === categoryId);
  const categoryLabel = selectedCategory ? translateCategory(selectedCategory.name) : t("uncategorized");
  const selectedAccount = bankAccounts.find((a) => a.id === bankAccountId);
  const accountLabel = selectedAccount ? selectedAccount.name : t("none");
  const typeLabel = t(`types.${expenseType.toLowerCase().replace("survival_", "")}`);

  if (!isOpen || !expense) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: "rgba(23,22,31,.45)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md mx-4 rounded-t-[28px] md:rounded-[28px] overflow-hidden max-h-[90vh] flex flex-col"
        style={{ background: "var(--app-bg)", boxShadow: "var(--shadow-pop)" }}
      >
        {/* Drag handle (mobile) + Header */}
        <div className="flex-shrink-0">
          <div className="flex justify-center pt-2.5 pb-0 md:hidden">
            <div className="rounded-full" style={{ width: 40, height: 4, background: "rgba(23,22,31,.15)" }} />
          </div>
          <div className="px-4 md:px-5 py-2 md:py-3 flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-[var(--ink)]">
              {t("editExpense")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--ink-subtle)] active:text-[var(--ink)] md:hover:text-[var(--ink)] tap-none"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body - Scrollable cards */}
        <div className="px-3 md:px-4 pb-3 space-y-2.5 overflow-y-auto scroll-touch flex-1">
          {(error || tagError) && (
            <div className="p-3 rounded-[14px] text-sm" style={{ background: "rgba(214,69,80,.1)", color: "var(--negative)" }}>
              {error || tagError}
            </div>
          )}

          {/* ── CARD 1: Essentials (Name + Amount + Date) ── */}
          <div className="rounded-[18px] border border-[var(--line)] p-4 space-y-3" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
            {/* Name */}
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full text-[17px] font-medium text-[var(--ink)] placeholder-[var(--ink-subtle)] bg-transparent outline-none"
            />

            {/* Amount + Currency */}
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-baseline gap-1">
                <span className="text-[var(--ink-subtle)] text-2xl font-light">{getCurrencySymbol(currency)}</span>
                <AmountInput
                  value={amount}
                  onChange={setAmount}
                  onExpressionChange={setAmountExpression}
                  currency={currency}
                  required
                  hideCurrencySymbol
                  className="flex-1"
                  inputClassName="!border-0 !ring-0 !shadow-none !py-0 text-[28px] font-bold tabular-nums !text-[var(--ink)] !placeholder-[var(--ink-subtle)]"
                />
              </div>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="px-3 py-1.5 rounded-[14px] text-sm font-medium text-[var(--ink-muted)] border-0 outline-none cursor-pointer"
                style={{ background: "var(--surface-2)" }}
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
              <svg className="w-4 h-4 text-[var(--ink-subtle)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-[var(--ink-muted)]">
                {isToday ? t("today") : new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
              </span>
              <button
                type="button"
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="text-[var(--accent)] text-xs"
              >
                {t("change")}
              </button>
            </div>

            {showDatePicker && (
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-[14px] border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                style={{ background: "var(--surface)" }}
              />
            )}
          </div>

          {/* ── CARD 2: Split ── */}
          {splitEnabled ? (
            /* Expanded split card */
            <div className="rounded-[18px] border border-[var(--line-strong)] p-4" style={{ background: "var(--surface-2)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <svg className="w-[18px] h-[18px] text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm font-semibold text-[var(--ink)]">{t("split.splitExpense")}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSplitEnabled(false)}
                  className="w-10 h-6 rounded-full relative transition-colors"
                  style={{ background: "var(--accent)" }}
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
                  error={splitError}
                  onErrorChange={setSplitError}
                />
              )}
              {parsedAmount <= 0 && (
                <p className="text-xs text-[var(--accent)]">{t("splitAmountHint")}</p>
              )}
            </div>
          ) : (
            /* Collapsed split card */
            <div className="rounded-[18px] border border-[var(--line)] px-4 py-3" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <svg className="w-[18px] h-[18px] text-[var(--ink-subtle)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm text-[var(--ink-muted)]">{t("split.splitExpense")}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSplitEnabled(true)}
                  className="w-10 h-6 rounded-full relative transition-colors"
                  style={{ background: "var(--surface-3)" }}
                >
                  <div className="w-5 h-5 rounded-full bg-white absolute top-0.5 left-0.5 shadow-sm" />
                </button>
              </div>
            </div>
          )}

          {/* ── CARD 3: Tags ── */}
          <div className="rounded-[18px] border border-[var(--line)] px-4 py-3" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
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
            <AssetLinkPicker
              value={linkedRealAssetId}
              onChange={setLinkedRealAssetId}
              className="mt-3 border-t border-[var(--line)] pt-3"
            />
          </div>

          {/* ── CARD 4: Details (collapsed/expanded) ── */}
          {showDetails ? (
            <div className="rounded-[18px] border border-[var(--line-strong)] p-4 space-y-4" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--ink)]">{tCommon("details")}</span>
                <button
                  type="button"
                  onClick={() => setShowDetails(false)}
                  className="p-1"
                >
                  <svg className="w-4 h-4 text-[var(--ink-subtle)] rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Category */}
              <div>
                <label className="text-xs font-medium text-[var(--ink-muted)] mb-1 block">{t("category")}</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-[14px] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                  style={{ background: "var(--surface)" }}
                >
                  <option value="">{t("uncategorized")}</option>
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
              {bankAccounts.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-[var(--ink-muted)] mb-1 block">{t("bankAccount")}</label>
                  <select
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                    className="w-full rounded-[14px] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                    style={{ background: "var(--surface)" }}
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

              {/* Expense Type */}
              <div>
                <label className="text-xs font-medium text-[var(--ink-muted)] mb-1.5 block">{t("expenseType")}</label>
                <div className="flex flex-wrap gap-2">
                  {EXPENSE_TYPES.map((type) => {
                    const active = expenseType === type.value;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setExpenseType(type.value)}
                        className={`px-3 py-1.5 text-xs rounded-[14px] font-medium transition-colors ${
                          active
                            ? "bg-[var(--ink)] text-white font-semibold"
                            : "bg-[var(--surface)] text-[var(--ink-muted)] border border-[var(--line)]"
                        }`}
                        style={active ? undefined : { boxShadow: "var(--shadow-card)" }}
                      >
                        {type.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* Collapsed details card */
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="w-full rounded-[18px] border border-[var(--line)] px-4 py-3 text-left"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--ink-subtle)]">{tCommon("details")}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] px-2 py-0.5 rounded-md font-medium" style={{ background: "#E7F5EE", color: "var(--positive)" }}>{categoryLabel}</span>
                  {bankAccounts.length > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-md font-medium" style={{ background: "var(--surface-2)", color: "var(--accent)" }}>{accountLabel}</span>
                  )}
                  <span className="text-[11px] px-2 py-0.5 rounded-md font-medium" style={{ background: "var(--surface-2)", color: "var(--ink-muted)" }}>{typeLabel}</span>
                  <svg className="w-4 h-4 text-[var(--ink-subtle)] ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </button>
          )}

          {/* ── CARD 5: Receipt Photos ── */}
          {imageUrls.length > 0 ? (
            <div className="rounded-[18px] border border-[var(--line)] p-4" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
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
                const el = document.querySelector<HTMLInputElement>("#edit-expense-file-input");
                el?.click();
              }}
              className="w-full rounded-[18px] border border-[var(--line)] px-4 py-3 text-left"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <svg className="w-[18px] h-[18px] text-[var(--ink-subtle)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-sm text-[var(--ink-subtle)]">{t("addPhoto")}</span>
                </div>
                <svg className="w-4 h-4 text-[var(--ink-subtle)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                fileInputId="edit-expense-file-input"
              />
            </div>
          )}

          {/* ── CARD 6: Notes ── */}
          {showNotes ? (
            <div className="rounded-[18px] border border-[var(--line)] p-4" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <svg className="w-[18px] h-[18px] text-[var(--ink-subtle)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="text-xs font-medium text-[var(--ink-muted)]">{t("addNote")}</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setDescription(""); setShowNotes(false); }}
                  className="p-1 text-[var(--ink-subtle)] hover:text-[var(--ink)]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("notesPlaceholder")}
                rows={2}
                maxLength={1000}
                className="w-full text-sm text-[var(--ink)] placeholder-[var(--ink-subtle)] rounded-[14px] p-2.5 border border-[var(--line)] outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent resize-none"
                style={{ background: "var(--surface-2)" }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="w-full rounded-[18px] border border-[var(--line)] px-4 py-3 text-left"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <svg className="w-[18px] h-[18px] text-[var(--ink-subtle)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="text-sm text-[var(--ink-subtle)]">{t("addNote")}</span>
                </div>
                <svg className="w-4 h-4 text-[var(--ink-subtle)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </button>
          )}

          {/* ── Exclude from budget (shown when project selected) ── */}
          {selectedProjectIds.length > 0 && (
            <div className="rounded-[18px] border border-[var(--line)] px-4 py-3" style={{ background: "var(--surface-2)", boxShadow: "var(--shadow-card)" }}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={excludeFromBudget}
                  onChange={(e) => setExcludeFromBudget(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--line-strong)] text-[var(--accent)] focus:ring-[var(--accent)]"
                />
                <div>
                  <span className="text-sm font-medium text-[var(--ink)]">
                    {t("excludeFromBudget")}
                  </span>
                  <p className="text-xs text-[var(--accent-strong)] mt-0.5">
                    {t("excludeFromBudgetHint")}
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* ── Expense Status (PAID/PENDING) ── */}
          <div className="rounded-[18px] border border-[var(--line)] px-4 py-3" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
            <label className="text-xs font-medium text-[var(--ink-muted)] mb-2 block">
              {t("expenseStatus")}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStatus("PAID")}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-[14px] text-sm font-medium transition-colors"
                style={
                  status === "PAID"
                    ? { background: "#E7F5EE", color: "var(--positive)", border: "2px solid var(--positive)" }
                    : { background: "var(--surface)", color: "var(--ink-muted)", border: "1px solid var(--line-strong)" }
                }
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {t("statusPaid")}
              </button>
              <button
                type="button"
                onClick={() => setStatus("PENDING")}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-[14px] text-sm font-medium transition-colors"
                style={
                  status === "PENDING"
                    ? { background: "var(--surface-2)", color: "var(--accent)", border: "2px solid var(--accent)" }
                    : { background: "var(--surface)", color: "var(--ink-muted)", border: "1px solid var(--line-strong)" }
                }
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t("statusScheduled")}
              </button>
            </div>
          </div>

          {/* ── Installment plan (progress + cancel/settle) ── */}
          {expense.installmentNumber && installmentProgress && (
            <div className="rounded-[18px] border border-[var(--line-strong)] p-4" style={{ background: "var(--surface-2)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <svg className="w-[18px] h-[18px] text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h10" />
                  </svg>
                  <span className="text-sm font-semibold text-[var(--ink)]">{t("installments.planTitle")}</span>
                </div>
                <span className="text-xs font-medium text-[var(--accent)] tabular-nums">
                  {installmentProgress.paidCount}/{installmentProgress.months}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: "var(--surface-3)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (installmentProgress.paidAmount / installmentProgress.totalAmount) * 100)}%`,
                    background: "var(--accent)",
                    transition: "width 500ms cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                />
              </div>
              <p className="text-xs text-[var(--accent-strong)] mb-3 tabular-nums">
                {t("installments.progressLine", {
                  paid: `${getCurrencySymbol(installmentProgress.currency)}${installmentProgress.paidAmount.toFixed(2)}`,
                  total: `${getCurrencySymbol(installmentProgress.currency)}${installmentProgress.totalAmount.toFixed(2)}`,
                  remaining: `${getCurrencySymbol(installmentProgress.currency)}${installmentProgress.remainingAmount.toFixed(2)}`,
                })}
              </p>

              {installmentProgress.isActive && installmentProgress.remainingAmount > 0 && (
                installmentConfirm ? (
                  <div className="p-3 rounded-[14px] border border-[var(--line-strong)]" style={{ background: "var(--surface)" }}>
                    <p className="text-xs text-[var(--ink-muted)] mb-2">
                      {installmentConfirm === "cancel"
                        ? t("installments.cancelConfirm")
                        : t("installments.settleConfirm", {
                            amount: `${getCurrencySymbol(installmentProgress.currency)}${installmentProgress.remainingAmount.toFixed(2)}`,
                          })}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setInstallmentConfirm(null)}
                        className="flex-1 px-3 py-2 rounded-[14px] text-xs font-medium border border-[var(--line-strong)] text-[var(--ink-muted)]"
                      >
                        {tCommon("cancel")}
                      </button>
                      <button
                        type="button"
                        disabled={installmentBusy}
                        onClick={() => handleInstallmentAction(installmentConfirm)}
                        className="flex-1 px-3 py-2 rounded-[14px] text-xs font-semibold text-white disabled:opacity-50"
                        style={{ background: installmentConfirm === "cancel" ? "var(--negative)" : "var(--accent)" }}
                      >
                        {installmentBusy ? "…" : tCommon("confirm")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setInstallmentConfirm("cancel")}
                      className="flex-1 px-3 py-2 rounded-[14px] text-xs font-medium border transition-colors"
                      style={{ background: "var(--surface)", color: "var(--negative)", borderColor: "rgba(214,69,80,.35)" }}
                    >
                      {t("installments.cancelRemaining")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setInstallmentConfirm("settle")}
                      className="flex-1 px-3 py-2 rounded-[14px] text-xs font-medium border transition-colors"
                      style={{ background: "var(--surface)", color: "var(--accent)", borderColor: "var(--accent-faint)" }}
                    >
                      {t("installments.settleNow")}
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-3 md:px-4 py-3 md:py-4 border-t border-[var(--line)] pb-safe flex gap-3" style={{ background: "var(--surface)" }}>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[14px] border border-[var(--line-strong)] px-4 py-3 md:py-2.5 text-[var(--ink-muted)] font-medium active:bg-[var(--surface-2)] md:hover:bg-[var(--surface-2)] transition-colors tap-none"
          >
            {tCommon("cancel")}
          </button>
          <button
            type="submit"
            disabled={isLoading || !name || amount === ""}
            className="flex-1 rounded-[18px] px-4 py-3 md:py-2.5 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed tap-none"
            style={{
              background: isLoading || !name || amount === "" ? "var(--accent-faint)" : "var(--accent)",
              color: "var(--accent-fg)",
              boxShadow: isLoading || !name || amount === "" ? "none" : "var(--shadow-fab)",
            }}
          >
            {isLoading ? t("saving") : t("saveChanges")}
          </button>
        </div>
      </form>
    </div>
  );
}
