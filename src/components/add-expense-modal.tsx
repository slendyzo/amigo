"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import ExpenseChoicePicker from "./expense-choice-picker";
import ProjectTagSelector from "./project-tag-selector";
import AssetLinkPicker from "./asset-link-picker";
import { savePendingExpense, isOfflineStorageAvailable } from "@/lib/offline-storage";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { useModalData } from "@/hooks/use-modal-data";
import { useProjectTags } from "@/hooks/use-project-tags";
import { CURRENCIES, getCurrencySymbol } from "@/lib/currencies";
import { getTodayDateString } from "@/lib/utils";
import { parseQuickAdd, CATEGORY_VARIANTS } from "@/lib/parser";

import ExpenseImageUpload from "./expense-image-upload";
import ExpenseSplitSection from "./expense-split-section";
import { useSplitSync } from "@/hooks/use-split-sync";
import { type SplitPerson } from "@/lib/split-utils";
import type { Category, BankAccount, Project, ExpenseType } from "@/types/models";

type CreatedExpense = {
  id: string; name: string; date: string; type: string; amount: number; currency: string;
  amountEur: number; categoryName: string; projects: { id: string; name: string }[];
  excludeFromBudget: boolean; splitCount: number | null; splitData: string | null;
  status: string; createdAt: string;
};

type AddExpenseModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onExpenseCreated?: (expense: CreatedExpense) => void;
  categories?: Category[];
  bankAccounts?: BankAccount[];
  projects?: Project[];
  defaultProjectId?: string;
  defaultExcludeFromBudget?: boolean;
  defaultBankAccountId?: string;
};



const TYPE_CHIPS: { value: ExpenseType; chip: string }[] = [
  { value: "SURVIVAL_FIXED", chip: "fixed" },
  { value: "SURVIVAL_VARIABLE", chip: "variable" },
  { value: "LIFESTYLE", chip: "lifestyle" },
  { value: "PROJECT", chip: "project" },
];

// Client-side type suggestion from the parser's category guess. Mirrors the
// spirit of the server keyword mappings (which win on POST); here it only
// pre-selects the chip until the user overrides it.
function inferType(category: string | null): ExpenseType {
  if (!category) return "LIFESTYLE";
  if (category === "Subscriptions" || category === "Rent / Mortgage") return "SURVIVAL_FIXED";
  if (category === "Utilities" || category === "Internet & Phone") return "SURVIVAL_VARIABLE";
  return "LIFESTYLE";
}

// Evaluate the amount field — supports a plain number or simple arithmetic
// ("5+5", "12.50*2"). Returns 0 for empty/invalid. Only digits and + - * / ( )
// are allowed, so the eval is safe.
function evalAmount(raw: string): number {
  const s = (raw || "").trim().replace(/,/g, ".");
  if (!s) return 0;
  if (!/^[0-9+\-*/().\s]+$/.test(s)) return 0;
  try {
    const v = Function(`"use strict";return (${s})`)();
    return typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 0;
  } catch {
    return 0;
  }
}

export default function AddExpenseModal({
  isOpen,
  onClose,
  onExpenseCreated,
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
  const te = useTranslations("expenses");
  const locale = useLocale();
  const currencyNames = useMemo(() => new Intl.DisplayNames([locale], { type: "currency" }), [locale]);
  const { translateCategory } = useCategoryTranslation();


  const {
    categories: localCategories,
    projects: fetchedProjects,
    bankAccounts: localBankAccounts,
    defaultCurrency,
    lastExpenseCurrency,
    rememberExpenseCurrency,
    defaultBankAccountId: workspaceDefaultBankAccountId,
  } = useModalData(isOpen, propCategories, propProjects, propBankAccounts);

  const resolvedDefaultBankAccountId = propDefaultBankAccountId || workspaceDefaultBankAccountId || "";

  const {
    localProjects, setLocalProjects, selectedProjectIds, setSelectedProjectIds,
    showNewTagInput, setShowNewTagInput, newTagName, setNewTagName,
    error: tagError, createTag, toggleProject, clearSelection, resetTagInput,
  } = useProjectTags({
    initialProjects: fetchedProjects.filter((p) => p.isActive !== false),
    initialSelectedIds: defaultProjectId ? [defaultProjectId] : [],
  });

  useEffect(() => {
    if (fetchedProjects.length > 0 && localProjects.length === 0) {
      setLocalProjects(fetchedProjects.filter((p) => p.isActive !== false));
    }
  }, [fetchedProjects, localProjects.length, setLocalProjects]);

  // Name (free text — numbers/dates stay in the name) + explicit amount field.
  // parseQuickAdd still runs on the name for category/type SUGGESTIONS only; it
  // never sets the amount (that's its own field now).
  const [rawInput, setRawInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [amountFocused, setAmountFocused] = useState(true);
  const amountRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseQuickAdd(rawInput), [rawInput]);
  const amountValue = useMemo(() => evalAmount(amountInput), [amountInput]);
  const amountExpression = /[+\-*/]/.test(amountInput.trim()) && amountValue > 0 ? amountInput.trim() : null;


  // Type chip (auto until user overrides)
  const [expenseType, setExpenseType] = useState<ExpenseType>("LIFESTYLE");
  const [typeOverridden, setTypeOverridden] = useState(false);

  // Category (auto-resolved until user overrides)
  const [categoryId, setCategoryId] = useState("");
  const [categoryOverridden, setCategoryOverridden] = useState(false);

  const currencyChosen = useRef(false);
  const [currency, setCurrency] = useState("EUR");
  const [date, setDate] = useState(getTodayDateString());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [bankAccountId, setBankAccountId] = useState("");
  const [excludeFromBudget, setExcludeFromBudget] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitCount, setSplitCount] = useState(2);
  const [splitPeople, setSplitPeople] = useState<SplitPerson[] | null>(null);
  const [installmentsEnabled, setInstallmentsEnabled] = useState(false);
  const [installmentMonths, setInstallmentMonths] = useState(12);
  const [description, setDescription] = useState("");
  const [linkedRealAssetId, setLinkedRealAssetId] = useState<string | null>(null);

  const [showMore, setShowMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Keep split recalculation in the form so it also runs while details are hidden.
  const { splitError, setSplitError } = useSplitSync({
    amount: amountValue,
    splitEnabled,
    splitCount,
    splitPeople,
    onSplitPeopleChange: setSplitPeople,
    meLabel: t("split.meLabel"),
    lockedExceedsMessage: t("split.lockedExceedsTotal"),
  });

  // Why the Save button is disabled — surfaced instead of failing silently.
  const noAmount = amountValue <= 0;
  const noName = !rawInput.trim();
  const blockedReason = splitError
    ? splitError
    : noAmount && noName
      ? t("needBoth")
      : noAmount
        ? t("needAmount")
        : noName
          ? t("needName")
          : "";
  const canSubmit = !blockedReason;

  const isFutureDate = new Date(date) > new Date(getTodayDateString());
  const isToday = date === getTodayDateString();

  const prevIsOpenRef = useRef(false);

  // Focus the amount field when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => amountRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Reset on open
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setRawInput("");
      setAmountInput("");
      setInputFocused(false);
      setAmountFocused(true);
      setExpenseType("LIFESTYLE");
      setTypeOverridden(false);
      setCategoryId("");
      setCategoryOverridden(false);
      currencyChosen.current = false;
      setCurrency(rememberExpenseCurrency && lastExpenseCurrency ? lastExpenseCurrency : defaultCurrency);
      setLinkedRealAssetId(null);
      setDate(getTodayDateString());
      setShowDatePicker(false);
      setBankAccountId(resolvedDefaultBankAccountId);
      setSelectedProjectIds(defaultProjectId ? [defaultProjectId] : []);
      resetTagInput();
      setExcludeFromBudget(defaultExcludeFromBudget);
      setIsScheduled(false);
      setImageUrls([]);
      setSplitEnabled(false);
      setSplitCount(2);
      setSplitPeople(null);
      setInstallmentsEnabled(false);
      setInstallmentMonths(12);
      setDescription("");
      setShowMore(false);
      setError("");
    }
    prevIsOpenRef.current = isOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Apply asynchronously loaded defaults only until the user makes a choice.
  useEffect(() => {
    if (isOpen && !currencyChosen.current) {
      setCurrency(rememberExpenseCurrency && lastExpenseCurrency ? lastExpenseCurrency : defaultCurrency);
    }
  }, [isOpen, defaultCurrency, lastExpenseCurrency, rememberExpenseCurrency]);

  const rememberSavedCurrency = async () => {
    if (rememberExpenseCurrency) await fetch("/api/workspace", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastExpenseCurrency: currency }),
    }).catch(() => {});
  };

  // Resolve category id from parser suggestion (until user overrides)
  const resolvedCategory = useMemo(() => {
    if (!parsed.category) return null;
    const variants = (CATEGORY_VARIANTS[parsed.category] || [parsed.category]).map((v) => v.toLowerCase());
    return localCategories.find((c) => variants.includes(c.name.toLowerCase())) || null;
  }, [parsed.category, localCategories]);

  // Auto-apply type + category suggestions when input changes (unless overridden)
  useEffect(() => {
    if (!typeOverridden) setExpenseType(inferType(parsed.category));
  }, [parsed.category, typeOverridden]);
  useEffect(() => {
    if (!categoryOverridden) setCategoryId(resolvedCategory?.id || "");
  }, [resolvedCategory, categoryOverridden]);
  // Auto-detect installment ("12x") from the parsed string
  useEffect(() => {
    if (parsed.installmentMonths) {
      setInstallmentsEnabled(true);
      setInstallmentMonths(parsed.installmentMonths);
    }
  }, [parsed.installmentMonths]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isLoading) return;
    if (!canSubmit) {
      setError(blockedReason);
      return;
    }
    setIsLoading(true);
    setError("");

    const name = rawInput.trim();
    const parsedAmount = amountValue;

    try {
      // Installment plan
      if (installmentsEnabled && installmentMonths >= 2) {
        if (!navigator.onLine) throw new Error(t("installments.offlineError"));
        const response = await fetch("/api/installments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name, totalAmount: parsedAmount, months: installmentMonths, startDate: date,
            type: expenseType, categoryId: categoryId || undefined, bankAccountId: bankAccountId || undefined,
            currency, description: description || undefined,
            projectIds: selectedProjectIds.length > 0 ? selectedProjectIds : undefined, excludeFromBudget,
          }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to create installment plan");
        }
        await rememberSavedCurrency();
        router.refresh();
        onClose();
        return;
      }

      const expenseData = {
        name, amount: parsedAmount, currency, type: expenseType as ExpenseType,
        categoryId: categoryId || undefined, bankAccountId: bankAccountId || undefined,
        projectIds: selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
        date, excludeFromBudget, description: description || undefined,
        amountExpression: amountExpression || undefined,
        rawInput,
        imageUrls: imageUrls.length > 0 ? JSON.stringify(imageUrls) : undefined,
        status: (isScheduled ? "PENDING" : "PAID") as "PAID" | "PENDING",
        dueDate: isScheduled ? date : undefined,
        splitCount: splitEnabled ? splitCount : undefined,
        splitData: splitEnabled && splitPeople ? JSON.stringify(splitPeople) : undefined,
        realAssetId: linkedRealAssetId || undefined,
      };

      if (navigator.onLine) {
        const response = await fetch("/api/expenses", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(expenseData),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to add expense");
        }
        const data = await response.json();
        if (onExpenseCreated && data.expense) {
          const exp = data.expense;
          onExpenseCreated({
            id: exp.id, name: exp.name,
            date: typeof exp.date === "string" ? exp.date : new Date(exp.date).toISOString(),
            type: exp.type, amount: Number(exp.amount), currency: exp.currency || "EUR",
            amountEur: Number(exp.amountEur), categoryName: exp.category?.name || "Uncategorized",
            projects: (exp.projects || []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
            excludeFromBudget: exp.excludeFromBudget || false, splitCount: exp.splitCount || null,
            splitData: exp.splitData || null, status: exp.status || "PAID",
            createdAt: typeof exp.createdAt === "string" ? exp.createdAt : new Date(exp.createdAt).toISOString(),
          });
        }
        await rememberSavedCurrency();
        router.refresh();
        onClose();
      } else {
        if (isOfflineStorageAvailable()) {
          await savePendingExpense(expenseData);
          window.dispatchEvent(new CustomEvent("offline-expense-added"));
          onClose();
        } else {
          throw new Error("Offline storage not available");
        }
      }
    } catch (err) {
      if (err instanceof TypeError && err.message.includes("fetch")) {
        if (isOfflineStorageAvailable()) {
          await savePendingExpense({
            name, amount: parsedAmount, currency, type: expenseType as ExpenseType,
            categoryId: categoryId || undefined, bankAccountId: bankAccountId || undefined,
            projectIds: selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
            date, excludeFromBudget,
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

  // Preview display values
  const dateLabel = isToday ? t("today") : new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      variant="sheet"
      size="md"
      as="form"
      onSubmit={handleSubmit}
    >
      <ModalHeader title={t("addExpense")} />

      <ModalBody className="flex flex-col gap-4 px-5 pb-4 pt-1">
          {(error || tagError) && (
            <div className="rounded-[14px] p-3 text-[13px]" style={{ background: "color-mix(in srgb, var(--negative) 12%, transparent)", color: "var(--negative)" }}>
              {error || tagError}
            </div>
          )}

          {/* Amount — its own field (name numbers never become the price) */}
          <div
            className="rounded-[18px] px-[18px] py-4"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)", border: `1.5px solid ${amountFocused ? "var(--accent)" : "transparent"}` }}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--ink-subtle)" }}>
              {t("amountLabel")}
            </div>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-[24px] font-bold" style={{ color: amountValue > 0 ? "var(--ink)" : "var(--ink-subtle)" }}>{getCurrencySymbol(currency)}</span>
              <input
                aria-label={t("amountLabel")}
                enterKeyHint="next"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); inputRef.current?.focus(); } }}
                ref={amountRef}
                type="text"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                onFocus={() => setAmountFocused(true)}
                onBlur={() => setAmountFocused(false)}
                placeholder="0.00"
                className="min-w-0 flex-1 bg-transparent text-[24px] font-bold tabular-nums outline-none placeholder:text-[var(--ink-subtle)]"
                style={{ color: "var(--ink)" }}
              />
              <div className="relative w-24 shrink-0 border-l border-[var(--line)] pl-3">
                <select
                  aria-label={t("choices.currency")}
                  value={currency}
                  onChange={(e) => { currencyChosen.current = true; setCurrency(e.target.value); }}
                  className="h-11 w-full appearance-none rounded-[10px] bg-transparent pl-1 pr-6 text-[15px] font-semibold text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  {[...new Set([currency, lastExpenseCurrency || defaultCurrency, defaultCurrency, ...CURRENCIES])].map(code => (
                    <option key={code} value={code} title={currencyNames.of(code)}>{code}</option>
                  ))}
                </select>
                <svg aria-hidden="true" className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[var(--ink-subtle)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
              </div>
            </div>
            {amountExpression && <p className="mt-1 text-[13px] tabular-nums text-[var(--ink-subtle)]">= {getCurrencySymbol(currency)}{amountValue.toFixed(2)}</p>}
          </div>

          {/* Name — free text, numbers and dates allowed */}
          <div
            className="rounded-[18px] px-[18px] py-4"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)", border: `1.5px solid ${inputFocused ? "var(--accent)" : "transparent"}` }}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--ink-subtle)" }}>
              {t("nameLabel")}
            </div>
            <input
              aria-label={t("nameLabel")}
              ref={inputRef}
              type="text"
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={t("namePlaceholder")}
              className="mt-1 w-full bg-transparent text-[17px] font-medium outline-none placeholder:text-[var(--ink-subtle)]"
              style={{ color: "var(--ink)" }}
            />
          </div>

          {/* Type chips */}
          <div className="grid grid-cols-4 gap-2">
            {TYPE_CHIPS.map((c) => {
              const active = expenseType === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => { setExpenseType(c.value); setTypeOverridden(true); }}
                  aria-pressed={active}
                  className="tap-none h-11 min-w-0 rounded-[12px] px-1 text-center text-[12px]"
                  style={active ? { background: "var(--ink)", color: "var(--accent-fg)", fontWeight: 600 } : { background: "var(--surface)", color: "var(--ink-muted)", fontWeight: 500, boxShadow: "var(--shadow-card)" }}
                >
                  {te(`chips.${c.chip}`)}
                </button>
              );
            })}
          </div>

          <ExpenseChoicePicker label={t("category")} value={categoryId}
            choices={[{ value: "", label: t("auto") }, ...localCategories.map(c => ({ value: c.id, label: translateCategory(c.name) }))]}
            onChange={(id) => { setCategoryId(id); setCategoryOverridden(id !== ""); }} />

          {/* Date */}
          <div className="flex gap-2">
            <button
              type="button"
              aria-expanded={showDatePicker}
              onClick={() => setShowDatePicker((s) => !s)}
              className="tap-none relative flex min-h-11 flex-1 items-center justify-between rounded-[14px] px-3.5 py-[11px] text-[12.5px] font-medium"
              style={{ background: "var(--surface)", color: isFutureDate ? "var(--accent)" : "var(--ink)", boxShadow: "var(--shadow-card)" }}
            >
              <span>{t("date")} · {dateLabel}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-subtle)" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          </div>
          {showDatePicker && (
            <input
              aria-label={t("date")}
              required
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (new Date(e.target.value) > new Date(getTodayDateString())) setIsScheduled(true);
              }}
              className="w-full rounded-[14px] px-3.5 py-2.5 text-[13px] outline-none"
              style={{ background: "var(--surface)", color: "var(--ink)", boxShadow: "var(--shadow-card)" }}
            />
          )}

          {/* Schedule toggle for future dates */}
          {(isFutureDate || isScheduled) && !installmentsEnabled && (
            <label className="flex items-center gap-3 rounded-[14px] px-4 py-3" style={{ background: "var(--surface-2)" }}>
              <input type="checkbox" checked={isScheduled} onChange={(e) => setIsScheduled(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              <div>
                <span className="text-[13px] font-medium" style={{ color: "var(--accent-strong)" }}>{t("scheduleForLater")}</span>
                <p className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                  {t("scheduleForLaterHint", { month: new Date(date).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }) })}
                </p>
              </div>
            </label>
          )}

          {/* Account + Projects — always visible (Nuno feedback: don't bury these) */}
          <div className="flex flex-col gap-3 rounded-[18px] p-4" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
            {localBankAccounts.length > 0 && (
              <div>
                <ExpenseChoicePicker label={t("bankAccount")} value={bankAccountId}
                  choices={[{ value: "", label: t("none") }, ...localBankAccounts.map(acc => ({ value: acc.id, label: acc.name }))]}
                  onChange={setBankAccountId} />
              </div>
            )}
            <ProjectTagSelector
              fillRows
              projects={localProjects}
              selectedIds={selectedProjectIds}
              onToggle={toggleProject}
              onClearAll={clearSelection}
              showNewTagInput={showNewTagInput}
              onShowNewTagInput={() => setShowNewTagInput(true)}
              newTagName={newTagName}
              onNewTagNameChange={setNewTagName}
              onCreateTag={createTag}
              onCancelNewTag={resetTagInput}
            />
            {selectedProjectIds.length > 0 && (
              <label className="flex items-center gap-3 rounded-[12px] px-3 py-2.5" style={{ background: "var(--surface-2)" }}>
                <input type="checkbox" checked={excludeFromBudget} onChange={(e) => setExcludeFromBudget(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                <div>
                  <span className="text-[13px] font-medium" style={{ color: "var(--accent-strong)" }}>{t("excludeFromBudget")}</span>
                  <p className="text-[11px]" style={{ color: "var(--ink-muted)" }}>{t("excludeFromBudgetHint")}</p>
                </div>
              </label>
            )}
          </div>

              {/* Split */}
              {!installmentsEnabled && (
                <div className="rounded-[18px] p-4" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
                  <button type="button" role="switch" aria-checked={splitEnabled} onClick={() => setSplitEnabled((s) => !s)} className="tap-none flex min-h-11 w-full items-center justify-between gap-3 text-left">
                    <span className="text-[13px] font-medium" style={{ color: splitEnabled ? "var(--ink)" : "var(--ink-muted)" }}>{t("split.splitExpense")}</span>
                    <span aria-hidden="true" className="relative shrink-0" style={{ width: 40, height: 24, borderRadius: 12, background: splitEnabled ? "var(--accent)" : "var(--surface-3)" }}>
                      <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white" style={{ left: splitEnabled ? "18px" : "2px", transition: "left .2s var(--ease)" }} />
                    </span>
                  </button>
                  {splitEnabled && amountValue > 0 && (
                    <div className="mt-3">
                      <ExpenseSplitSection amount={amountValue} currency={currency} splitEnabled={splitEnabled} onSplitEnabledChange={setSplitEnabled} splitCount={splitCount} onSplitCountChange={setSplitCount} splitPeople={splitPeople} onSplitPeopleChange={setSplitPeople} hideToggle error={splitError} onErrorChange={setSplitError} />
                    </div>
                  )}
                  {splitEnabled && amountValue <= 0 && <p className="mt-2 text-[11px]" style={{ color: "var(--ink-subtle)" }}>{t("splitAmountHint")}</p>}
                </div>
              )}


          {/* More options disclosure */}
          <button
            type="button"
            aria-expanded={showMore}
            onClick={() => setShowMore((s) => !s)}
            className="tap-none flex items-center justify-between rounded-[14px] px-4 py-3 text-left"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
          >
            <span className="text-[13px] font-medium" style={{ color: "var(--ink-muted)" }}>{t("moreOptions")}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-subtle)" strokeWidth="2" style={{ transform: showMore ? "rotate(180deg)" : "none", transition: "transform .2s var(--ease)" }}><path d="M6 9l6 6 6-6" /></svg>
          </button>

          {showMore && (
            <div className="flex flex-col gap-2.5">
              {/* Link to a real-world asset (advanced) */}
              <div className="rounded-[18px] p-4" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
                <AssetLinkPicker value={linkedRealAssetId} onChange={setLinkedRealAssetId} />
              </div>

              {/* Installments */}
              {!splitEnabled && (
                <div className="rounded-[18px] p-4" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
                  <button type="button" role="switch" aria-checked={installmentsEnabled} onClick={() => setInstallmentsEnabled((s) => !s)} className="tap-none flex min-h-11 w-full items-center justify-between gap-3 text-left">
                    <span className="text-[13px] font-medium" style={{ color: installmentsEnabled ? "var(--ink)" : "var(--ink-muted)" }}>{t("installments.title")}</span>
                    <span aria-hidden="true" className="relative shrink-0" style={{ width: 40, height: 24, borderRadius: 12, background: installmentsEnabled ? "var(--accent)" : "var(--surface-3)" }}>
                      <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white" style={{ left: installmentsEnabled ? "18px" : "2px", transition: "left .2s var(--ease)" }} />
                    </span>
                  </button>
                  {installmentsEnabled && (
                    <>
                      <div className="mt-3 grid grid-cols-5 gap-2">
                        {[3, 6, 12, 24].map((m) => (
                          <button key={m} type="button" onClick={() => setInstallmentMonths(m)} className="tap-none h-11 min-w-0 rounded-[12px] text-[13px] font-medium" style={installmentMonths === m ? { background: "var(--accent)", color: "#fff" } : { background: "var(--surface-2)", color: "var(--accent)" }}>{m}x</button>
                        ))}
                        <input type="number" min={2} max={120} value={installmentMonths} onChange={(e) => { const v = parseInt(e.target.value, 10); setInstallmentMonths(isNaN(v) ? 2 : Math.max(2, Math.min(120, v))); }} aria-label={t("installments.title")} className="h-11 w-full min-w-0 rounded-[12px] px-1 text-center text-[13px] outline-none" style={{ background: "var(--app-bg)", color: "var(--ink)", border: "1px solid var(--line)" }} />
                      </div>
                      {amountValue > 0 ? (
                        <p className="mt-2 text-[13px] font-medium" style={{ color: "var(--accent-strong)" }}>
                          {t("installments.preview", { months: installmentMonths, amount: `${getCurrencySymbol(currency)}${(Math.round((amountValue / installmentMonths) * 100) / 100).toFixed(2)}` })}
                        </p>
                      ) : (
                        <p className="mt-2 text-[11px]" style={{ color: "var(--ink-subtle)" }}>{t("installments.amountHint")}</p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Receipt */}
              <div className="rounded-[18px] p-4" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
                <ExpenseImageUpload imageUrls={imageUrls} onChange={setImageUrls} disabled={isLoading} />
              </div>

              {/* Notes */}
              <div className="rounded-[18px] p-4" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
                <label className="mb-1.5 block text-[12px] font-medium" style={{ color: "var(--ink-muted)" }}>{t("addNote")}</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("notesPlaceholder")} rows={2} maxLength={1000} className="w-full resize-none rounded-[12px] p-2.5 text-[13px] outline-none" style={{ background: "var(--app-bg)", color: "var(--ink)", border: "1px solid var(--line)" }} />
              </div>
            </div>
          )}

      </ModalBody>

      {/* Save — pinned, never scrolls out of reach */}
      <ModalFooter className="flex-col gap-2">
        <button
          type="submit"
          disabled={isLoading || !canSubmit}
          className="tap-none w-full rounded-[18px] py-[15px] text-center text-[15px] font-semibold text-white transition-opacity"
          style={{ background: canSubmit && !isLoading ? "var(--accent)" : "var(--accent-faint)", boxShadow: canSubmit ? "var(--shadow-fab)" : "none" }}
        >
          {isLoading ? t("adding") : t("saveExpense")}
        </button>
        {blockedReason && (
          <p className="text-center text-[12px]" style={{ color: splitError ? "var(--danger, #ef4444)" : "var(--ink-subtle)" }}>
            {blockedReason}
          </p>
        )}
      </ModalFooter>
    </Modal>
  );
}
