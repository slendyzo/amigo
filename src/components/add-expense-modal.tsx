"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import ProjectTagSelector from "./project-tag-selector";
import AssetLinkPicker from "./asset-link-picker";
import { savePendingExpense, isOfflineStorageAvailable } from "@/lib/offline-storage";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import { useModalBodyClass } from "@/hooks/use-modal-body-class";
import { useModalData } from "@/hooks/use-modal-data";
import { useProjectTags } from "@/hooks/use-project-tags";
import { CURRENCIES, getCurrencySymbol } from "@/lib/currencies";
import { getTodayDateString } from "@/lib/utils";
import { parseQuickAdd, CATEGORY_VARIANTS } from "@/lib/parser";
import { buildCategoryTree, type FlatCategory } from "@/lib/category-utils";
import ExpenseImageUpload from "./expense-image-upload";
import ExpenseSplitSection from "./expense-split-section";
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

const EASE = [0.16, 1, 0.3, 1] as const;

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
  const tCommon = useTranslations("common");
  const { translateCategory } = useCategoryTranslation();

  useModalBodyClass(isOpen);

  const {
    categories: localCategories,
    projects: fetchedProjects,
    bankAccounts: localBankAccounts,
    defaultCurrency,
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

  // Natural-language input + derived parse
  const [rawInput, setRawInput] = useState("");
  const [inputFocused, setInputFocused] = useState(true);
  const parsed = useMemo(() => parseQuickAdd(rawInput), [rawInput]);
  const hasParse = parsed.amount > 0 && !!parsed.name.trim();

  // Type chip (auto until user overrides)
  const [expenseType, setExpenseType] = useState<ExpenseType>("LIFESTYLE");
  const [typeOverridden, setTypeOverridden] = useState(false);

  // Category (auto-resolved until user overrides)
  const [categoryId, setCategoryId] = useState("");
  const [categoryOverridden, setCategoryOverridden] = useState(false);

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

  const isFutureDate = new Date(date) > new Date(getTodayDateString());
  const isToday = date === getTodayDateString();

  const prevIsOpenRef = useRef(false);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 120);
  }, [isOpen]);

  // Reset on open
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setRawInput("");
      setInputFocused(true);
      setExpenseType("LIFESTYLE");
      setTypeOverridden(false);
      setCategoryId("");
      setCategoryOverridden(false);
      setCurrency(defaultCurrency);
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
    if (!hasParse) return;
    setIsLoading(true);
    setError("");

    const name = parsed.name.trim();
    const parsedAmount = parsed.amount;

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
        router.refresh();
        onClose();
        return;
      }

      const expenseData = {
        name, amount: parsedAmount, currency, type: expenseType as ExpenseType,
        categoryId: categoryId || undefined, bankAccountId: bankAccountId || undefined,
        projectIds: selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
        date, excludeFromBudget, description: description || undefined,
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
  const previewInitial = (parsed.name.trim().charAt(0) || "?").toUpperCase();
  const previewCategoryName = resolvedCategory ? translateCategory(resolvedCategory.name) : (parsed.category || "—");
  const typeChipLabel = te(`chips.${TYPE_CHIPS.find((c) => c.value === expenseType)?.chip ?? "lifestyle"}`);
  const dateLabel = isToday ? t("today") : new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center">
      {/* Scrim */}
      <div className="absolute inset-0" style={{ background: "rgba(23,22,31,.45)" }} onClick={onClose} />

      {/* Sheet */}
      <motion.form
        onSubmit={handleSubmit}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={{ duration: 0.33, ease: EASE }}
        className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[28px] md:mx-4 md:max-w-md md:rounded-[28px]"
        style={{ background: "var(--app-bg)", color: "var(--ink)" }}
      >
        <div className="flex flex-col gap-4 overflow-y-auto scroll-touch px-5 pb-6 pt-3.5" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
          {/* Grab handle */}
          <div className="mx-auto h-1 w-10 rounded-full md:hidden" style={{ background: "rgba(23,22,31,.15)" }} />

          {/* Title */}
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-bold">{t("addExpense")}</h2>
            <button type="button" onClick={onClose} className="tap-none flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "var(--surface)", ...{ boxShadow: "var(--shadow-card)" } }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-muted)" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>

          {(error || tagError) && (
            <div className="rounded-[14px] p-3 text-[13px]" style={{ background: "color-mix(in srgb, var(--negative) 12%, transparent)", color: "var(--negative)" }}>
              {error || tagError}
            </div>
          )}

          {/* NL input card */}
          <div
            className="rounded-[18px] px-[18px] py-4"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)", border: `1.5px solid ${inputFocused ? "var(--accent)" : "transparent"}` }}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--ink-subtle)" }}>
              {t("typeAnythingExample")}
            </div>
            <input
              ref={inputRef}
              type="text"
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="25 mcd"
              className="mt-1 w-full bg-transparent text-[20px] font-semibold outline-none placeholder:text-[var(--ink-subtle)]"
              style={{ color: "var(--ink)" }}
            />
          </div>

          {/* Parse preview */}
          {hasParse && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="flex items-center gap-3 rounded-[18px] px-4 py-3.5"
              style={{ background: "var(--surface-2)" }}
            >
              <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[12px] text-[14px] font-semibold" style={{ background: "var(--surface)", color: "var(--accent)" }}>
                {previewInitial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold">
                  {parsed.name} — {getCurrencySymbol(currency)}{parsed.amount.toFixed(2)}
                </div>
                <div className="truncate text-[11.5px]" style={{ color: "var(--hero-ink)" }}>
                  {previewCategoryName} · {typeChipLabel} · {dateLabel}
                </div>
              </div>
              <div className="flex-none rounded-[14px] px-2.5 py-1 text-[11px] font-semibold" style={{ background: "var(--surface)", color: "var(--accent)" }}>
                {t("auto")}
              </div>
            </motion.div>
          )}

          {/* Type chips */}
          <div className="flex gap-2">
            {TYPE_CHIPS.map((c) => {
              const active = expenseType === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => { setExpenseType(c.value); setTypeOverridden(true); }}
                  className="tap-none flex-1 rounded-[14px] py-[9px] text-center text-[12px]"
                  style={active ? { background: "var(--ink)", color: "var(--accent-fg)", fontWeight: 600 } : { background: "var(--surface)", color: "var(--ink-muted)", fontWeight: 500, boxShadow: "var(--shadow-card)" }}
                >
                  {te(`chips.${c.chip}`)}
                </button>
              );
            })}
          </div>

          {/* Category + Date */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <select
                value={categoryId}
                onChange={(e) => { setCategoryId(e.target.value); setCategoryOverridden(true); }}
                className="w-full appearance-none rounded-[14px] px-3.5 py-[11px] text-[12.5px] font-medium outline-none"
                style={{ background: "var(--surface)", color: categoryId ? "var(--ink)" : "var(--ink-muted)", boxShadow: "var(--shadow-card)" }}
              >
                <option value="">{t("auto")}</option>
                {buildCategoryTree(localCategories as FlatCategory[]).map((parent) =>
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
              <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-subtle)" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
            </div>
            <button
              type="button"
              onClick={() => setShowDatePicker((s) => !s)}
              className="tap-none relative flex flex-1 items-center justify-between rounded-[14px] px-3.5 py-[11px] text-[12.5px] font-medium"
              style={{ background: "var(--surface)", color: isFutureDate ? "var(--accent)" : "var(--ink)", boxShadow: "var(--shadow-card)" }}
            >
              <span>{dateLabel}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-subtle)" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          </div>
          {showDatePicker && (
            <input
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
                <label className="mb-1 block text-[12px] font-medium" style={{ color: "var(--ink-muted)" }}>{t("bankAccount")}</label>
                <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className="w-full rounded-[12px] px-3 py-2 text-[13px] outline-none" style={{ background: "var(--app-bg)", color: "var(--ink)", border: "1px solid var(--line)" }}>
                  <option value="">{t("none")}</option>
                  {localBankAccounts.map((acc) => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                </select>
              </div>
            )}
            <ProjectTagSelector
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

          {/* More options disclosure */}
          <button
            type="button"
            onClick={() => setShowMore((s) => !s)}
            className="tap-none flex items-center justify-between rounded-[14px] px-4 py-3 text-left"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
          >
            <span className="text-[13px] font-medium" style={{ color: "var(--ink-muted)" }}>{t("moreOptions")}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-subtle)" strokeWidth="2" style={{ transform: showMore ? "rotate(180deg)" : "none", transition: "transform .2s var(--ease)" }}><path d="M6 9l6 6 6-6" /></svg>
          </button>

          {showMore && (
            <div className="flex flex-col gap-2.5">
              {/* Currency + Account */}
              <div className="flex flex-col gap-3 rounded-[18px] p-4" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
                <div>
                  <label className="mb-1 block text-[12px] font-medium" style={{ color: "var(--ink-muted)" }}>{t("amount")}</label>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full rounded-[12px] px-3 py-2 text-[13px] outline-none" style={{ background: "var(--app-bg)", color: "var(--ink)", border: "1px solid var(--line)" }}>
                    {CURRENCIES.map((curr) => <option key={curr} value={curr}>{curr}</option>)}
                  </select>
                </div>
              </div>

              {/* Link to a real-world asset (advanced) */}
              <div className="rounded-[18px] p-4" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
                <AssetLinkPicker value={linkedRealAssetId} onChange={setLinkedRealAssetId} />
              </div>

              {/* Split */}
              {!installmentsEnabled && (
                <div className="rounded-[18px] p-4" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium" style={{ color: splitEnabled ? "var(--ink)" : "var(--ink-muted)" }}>{t("split.splitExpense")}</span>
                    <button type="button" onClick={() => setSplitEnabled((s) => !s)} className="relative tap-none" style={{ width: 40, height: 24, borderRadius: 12, background: splitEnabled ? "var(--accent)" : "var(--surface-3)" }}>
                      <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white" style={{ left: splitEnabled ? "18px" : "2px", transition: "left .2s var(--ease)" }} />
                    </button>
                  </div>
                  {splitEnabled && parsed.amount > 0 && (
                    <div className="mt-3">
                      <ExpenseSplitSection amount={parsed.amount} currency={currency} splitEnabled={splitEnabled} onSplitEnabledChange={setSplitEnabled} splitCount={splitCount} onSplitCountChange={setSplitCount} splitPeople={splitPeople} onSplitPeopleChange={setSplitPeople} hideToggle />
                    </div>
                  )}
                  {splitEnabled && parsed.amount <= 0 && <p className="mt-2 text-[11px]" style={{ color: "var(--ink-subtle)" }}>{t("splitAmountHint")}</p>}
                </div>
              )}

              {/* Installments */}
              {!splitEnabled && (
                <div className="rounded-[18px] p-4" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium" style={{ color: installmentsEnabled ? "var(--ink)" : "var(--ink-muted)" }}>{t("installments.title")}</span>
                    <button type="button" onClick={() => setInstallmentsEnabled((s) => !s)} className="relative tap-none" style={{ width: 40, height: 24, borderRadius: 12, background: installmentsEnabled ? "var(--accent)" : "var(--surface-3)" }}>
                      <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white" style={{ left: installmentsEnabled ? "18px" : "2px", transition: "left .2s var(--ease)" }} />
                    </button>
                  </div>
                  {installmentsEnabled && (
                    <>
                      <div className="mt-3 flex items-center gap-1.5">
                        {[3, 6, 12, 24].map((m) => (
                          <button key={m} type="button" onClick={() => setInstallmentMonths(m)} className="tap-none rounded-[10px] px-3 py-1.5 text-[13px] font-medium" style={installmentMonths === m ? { background: "var(--accent)", color: "#fff" } : { background: "var(--surface-2)", color: "var(--accent)" }}>{m}x</button>
                        ))}
                        <input type="number" min={2} max={120} value={installmentMonths} onChange={(e) => { const v = parseInt(e.target.value, 10); setInstallmentMonths(isNaN(v) ? 2 : Math.max(2, Math.min(120, v))); }} className="w-16 rounded-[10px] px-2 py-1.5 text-center text-[13px] outline-none" style={{ background: "var(--app-bg)", color: "var(--ink)", border: "1px solid var(--line)" }} />
                      </div>
                      {parsed.amount > 0 ? (
                        <p className="mt-2 text-[13px] font-medium" style={{ color: "var(--accent-strong)" }}>
                          {t("installments.preview", { months: installmentMonths, amount: `${getCurrencySymbol(currency)}${(Math.round((parsed.amount / installmentMonths) * 100) / 100).toFixed(2)}` })}
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

          {/* Save */}
          <button
            type="submit"
            disabled={isLoading || !hasParse}
            className="tap-none w-full rounded-[18px] py-[15px] text-center text-[15px] font-semibold text-white transition-opacity"
            style={{ background: hasParse && !isLoading ? "var(--accent)" : "var(--accent-faint)", boxShadow: hasParse ? "var(--shadow-fab)" : "none" }}
          >
            {isLoading ? t("adding") : t("saveExpense")}
          </button>
        </div>
      </motion.form>
    </div>
  );
}
