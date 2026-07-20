"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import MoneyHubTabs from "@/components/money-hub-tabs";
import MerchantAvatar from "@/components/ui/merchant-avatar";
import AddExpenseModal from "@/components/add-expense-modal";
import EditExpenseModal from "@/components/edit-expense-modal";
import ExpenseDetailModal from "@/components/expense-detail-modal";
import AssetLinkPicker from "@/components/asset-link-picker";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import { formatCurrency } from "@/lib/currencies";
import { effectiveEur, getUserShare } from "@/lib/split-utils";
import ExportModal from "@/components/export-modal";
import NudgeCategorizeCard from "@/components/nudge-categorize-card";
import NudgeCategorizeModal from "@/components/nudge-categorize-modal";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";

type Expense = {
  id: string;
  name: string;
  amount: number;
  currency?: string;
  amountEur?: number;
  type: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT";
  date: string;
  isRecurring?: boolean;
  recurringTemplateId?: string | null;
  installmentNumber?: number | null;
  recurringTemplate?: { installmentMonths: number | null } | null;
  category: { id: string; name: string } | null;
  bankAccount: { id: string; name: string } | null;
  projects: { id: string; name: string }[];
  imageUrls?: string | null;
  splitCount?: number | null;
  splitData?: string | null;
  createdAt: string;
};

type Category = { id: string; name: string };
type BankAccount = { id: string; name: string };
type Project = { id: string; name: string };

type DayGroup = {
  dayKey: string;
  label: string;
  expenses: Expense[];
  total: number;
};

const EASE = [0.16, 1, 0.3, 1] as const;
const sectionMotion = (i: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: EASE, delay: i * 0.05 },
});
const cardShadow = { boxShadow: "var(--shadow-card)" };

const TYPE_FILTERS: { key: string; chip: string; value: string }[] = [
  { key: "all", chip: "all", value: "" },
  { key: "fixed", chip: "fixed", value: "SURVIVAL_FIXED" },
  { key: "variable", chip: "variable", value: "SURVIVAL_VARIABLE" },
  { key: "lifestyle", chip: "lifestyle", value: "LIFESTYLE" },
  { key: "project", chip: "project", value: "PROJECT" },
];

export default function ExpensesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("expenses");
  const tTime = useTranslations("time");
  const tCommon = useTranslations("common");
  const { translateCategory } = useCategoryTranslation();

  const MONTHS = [
    tTime("months.january"), tTime("months.february"), tTime("months.march"),
    tTime("months.april"), tTime("months.may"), tTime("months.june"),
    tTime("months.july"), tTime("months.august"), tTime("months.september"),
    tTime("months.october"), tTime("months.november"), tTime("months.december")
  ];
  const SHORT_MONTHS = [
    tTime("monthsShort.jan"), tTime("monthsShort.feb"), tTime("monthsShort.mar"),
    tTime("monthsShort.apr"), tTime("monthsShort.may"), tTime("monthsShort.jun"),
    tTime("monthsShort.jul"), tTime("monthsShort.aug"), tTime("monthsShort.sep"),
    tTime("monthsShort.oct"), tTime("monthsShort.nov"), tTime("monthsShort.dec")
  ];

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Bulk asset-link
  const tRwa = useTranslations("rwa");
  const [showBulkLinkModal, setShowBulkLinkModal] = useState(false);
  const [bulkLinkAssetId, setBulkLinkAssetId] = useState<string | null>(null);
  const [bulkLinkBusy, setBulkLinkBusy] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>(searchParams.get("category") || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "amount" | "name" | "category">("date");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // Export state
  const [showExportModal, setShowExportModal] = useState(false);

  // Nudge — categorize
  const [nudgeCount, setNudgeCount] = useState(0);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [showCategorizeModal, setShowCategorizeModal] = useState(false);

  useEffect(() => {
    fetch("/api/user/ai-consent")
      .then((r) => r.json())
      .then((d) => setAiEnabled(!!d.aiProcessingEnabled))
      .catch(() => {});
    fetch("/api/insights/nudges/categorize?countOnly=1")
      .then((r) => r.json())
      .then((d) => setNudgeCount(d.count ?? 0))
      .catch(() => {});
  }, []);

  // Month filter - defaults to current month
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>(
    searchParams.get("category") ? "all" : `${currentYear}-${String(currentMonth).padStart(2, "0")}`
  );
  const [, setSelectedYear] = useState<number>(currentYear);

  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, selectedMonthFilter]);

  // Listen for quick-add event from bottom nav
  useEffect(() => {
    const handleQuickAdd = (e: Event) => {
      e.stopImmediatePropagation();
      setIsModalOpen(true);
    };
    window.addEventListener("openQuickAdd", handleQuickAdd);
    return () => window.removeEventListener("openQuickAdd", handleQuickAdd);
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "10000");
      if (typeFilter) params.set("type", typeFilter);

      const [expensesRes, categoriesRes, accountsRes, projectsRes] = await Promise.all([
        fetch(`/api/expenses?${params}`),
        fetch("/api/categories"),
        fetch("/api/bank-accounts"),
        fetch("/api/projects"),
      ]);

      if (expensesRes.ok) {
        const data = await expensesRes.json();
        setExpenses(data.expenses);
        setTotal(data.total);
      }
      if (categoriesRes.ok) setCategories((await categoriesRes.json()).categories || []);
      if (accountsRes.ok) setBankAccounts((await accountsRes.json()).bankAccounts || []);
      if (projectsRes.ok) setProjects((await projectsRes.json()).projects || []);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
      if (response.ok) {
        setExpenses(expenses.filter((e) => e.id !== id));
        setTotal((prev) => prev - 1);
      }
    } catch (error) {
      console.error("Failed to delete expense:", error);
    }
    setDeleteId(null);
  };

  // Selection handlers
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
      if (newSet.size === 0) setIsSelectionMode(false);
      return newSet;
    });
  };

  const handleLongPressStart = (id: string) => {
    longPressTimerRef.current = setTimeout(() => {
      setIsSelectionMode(true);
      setSelectedIds(new Set([id]));
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const selectAll = () => setSelectedIds(new Set(sortedExpenses.map((e) => e.id)));
  const clearSelection = () => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
  };

  const handleBulkLink = async (link: boolean) => {
    if (selectedIds.size === 0) return;
    setBulkLinkBusy(true);
    try {
      const response = await fetch("/api/expenses/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), realAssetId: link ? bulkLinkAssetId : null }),
      });
      if (response.ok) {
        clearSelection();
        setShowBulkLinkModal(false);
        setBulkLinkAssetId(null);
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to bulk-link expenses:", error);
    } finally {
      setBulkLinkBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const response = await fetch("/api/expenses/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (response.ok) {
        const data = await response.json();
        setExpenses(expenses.filter((e) => !selectedIds.has(e.id)));
        setTotal((prev) => prev - data.deleted);
        clearSelection();
      }
    } catch (error) {
      console.error("Failed to delete expenses:", error);
    } finally {
      setIsDeleting(false);
      setShowBulkDeleteConfirm(false);
    }
  };

  // Sort and filter expenses
  const sortedExpenses = useMemo(() => {
    let filtered = expenses.filter((e) =>
      searchQuery ? e.name.toLowerCase().includes(searchQuery.toLowerCase()) : true
    );
    if (categoryFilter) filtered = filtered.filter((e) => e.category?.id === categoryFilter);
    if (selectedMonthFilter !== "all") {
      filtered = filtered.filter((e) => {
        const date = new Date(e.date);
        const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth()).padStart(2, "0")}`;
        return monthKey === selectedMonthFilter;
      });
    }
    return [...filtered].sort((a, b) => {
      if (sortBy === "date") {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        const dateDiff = sortOrder === "desc" ? dateB - dateA : dateA - dateB;
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      } else if (sortBy === "amount") {
        return sortOrder === "desc" ? Number(b.amount) - Number(a.amount) : Number(a.amount) - Number(b.amount);
      } else if (sortBy === "name") {
        return sortOrder === "desc" ? b.name.toLowerCase().localeCompare(a.name.toLowerCase()) : a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      } else if (sortBy === "category") {
        const catA = (a.category?.name || "").toLowerCase();
        const catB = (b.category?.name || "").toLowerCase();
        return sortOrder === "desc" ? catB.localeCompare(catA) : catA.localeCompare(catB);
      }
      return 0;
    });
  }, [expenses, searchQuery, categoryFilter, sortBy, sortOrder, selectedMonthFilter]);

  const monthTotal = useMemo(
    () => sortedExpenses.reduce((sum, e) => sum + effectiveEur({ ...e, amountEur: e.amountEur ?? e.amount }), 0),
    [sortedExpenses]
  );

  // Day-of-week / relative label for a date (UTC-based against local today)
  const dayLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    const dY = d.getUTCFullYear(), dM = d.getUTCMonth(), dD = d.getUTCDate();
    const now = new Date();
    let word: string;
    if (dY === now.getFullYear() && dM === now.getMonth() && dD === now.getDate()) {
      word = tTime("today");
    } else {
      const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      if (dY === yest.getFullYear() && dM === yest.getMonth() && dD === yest.getDate()) {
        word = tTime("yesterday");
      } else {
        word = d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
      }
    }
    return `${word} · ${SHORT_MONTHS[dM]} ${dD}`;
  };

  // Group by day (desc)
  const dayGroups = useMemo(() => {
    const groups: Record<string, Expense[]> = {};
    sortedExpenses.forEach((e) => {
      const d = new Date(e.date);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      (groups[key] ||= []).push(e);
    });
    const result: DayGroup[] = Object.entries(groups).map(([dayKey, list]) => ({
      dayKey,
      label: dayLabel(list[0].date),
      expenses: list,
      total: list.reduce((s, e) => s + effectiveEur({ ...e, amountEur: e.amountEur ?? e.amount }), 0),
    }));
    result.sort((a, b) => (sortOrder === "desc" ? b.dayKey.localeCompare(a.dayKey) : a.dayKey.localeCompare(b.dayKey)));
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedExpenses, sortOrder]);

  const typeLabels: Record<string, string> = {
    SURVIVAL_FIXED: t("types.fixed"),
    SURVIVAL_VARIABLE: t("types.variable"),
    LIFESTYLE: t("types.lifestyle"),
    PROJECT: t("types.project"),
  };

  const isAll = selectedMonthFilter === "all";
  const [fy, fm] = isAll ? [currentYear, currentMonth] : selectedMonthFilter.split("-").map(Number);

  const shiftMonth = (delta: number) => {
    if (isAll) return;
    let nm = fm + delta, ny = fy;
    if (nm < 0) { nm = 11; ny--; }
    if (nm > 11) { nm = 0; ny++; }
    if (ny > currentYear || (ny === currentYear && nm > currentMonth)) return;
    setSelectedYear(ny);
    setSelectedMonthFilter(`${ny}-${String(nm).padStart(2, "0")}`);
  };
  const nextDisabled = isAll || (fy === currentYear && fm >= currentMonth);

  // Small inline chip for badges (recurring / split / installment / receipt)
  const badge = (label: string, key: string) => (
    <span
      key={key}
      className="ml-1.5 inline-flex items-center rounded-[6px] px-1.5 py-[1px] text-[10px] font-semibold tabular-nums"
      style={{ background: "var(--surface-2)", color: "var(--accent)" }}
    >
      {label}
    </span>
  );

  const money = (e: Expense) => {
    const amt = Number(e.amount);
    const share = getUserShare(e.splitCount, e.splitData);
    const displayAmt = share !== null ? share : amt;
    const isRefund = amt < 0;
    const abs = Math.abs(displayAmt);
    return (
      <div className="text-right">
        <div
          className="text-[13.5px] font-semibold tabular-nums"
          style={{ color: isRefund ? "var(--positive)" : "var(--ink)" }}
        >
          {isRefund ? "+" : "−"}{formatCurrency(abs, e.currency)}
        </div>
        {share !== null && (
          <div className="text-[10px] tabular-nums" style={{ color: "var(--ink-subtle)" }}>
            {formatCurrency(Math.abs(amt), e.currency)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 md:max-w-[640px]" style={{ color: "var(--ink)" }}>
      {/* Money hub segmented control */}
      <MoneyHubTabs active="expenses" />

      {/* Categorize nudge (restyled surface card via component tokens) */}
      {aiEnabled && nudgeCount >= 5 && (
        <NudgeCategorizeCard count={nudgeCount} onClick={() => setShowCategorizeModal(true)} />
      )}
      <NudgeCategorizeModal
        isOpen={showCategorizeModal}
        onClose={() => {
          setShowCategorizeModal(false);
          fetch("/api/insights/nudges/categorize?countOnly=1")
            .then((r) => r.json())
            .then((d) => setNudgeCount(d.count ?? 0))
            .catch(() => {});
          router.refresh();
        }}
      />

      {/* Month switcher card */}
      <motion.div {...sectionMotion(1)}>
        <div
          className="flex items-center justify-between rounded-[20px] px-[18px] py-4"
          style={{ background: "var(--surface)", ...cardShadow }}
        >
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            disabled={isAll}
            className="tap-none flex h-8 w-8 items-center justify-center disabled:opacity-30"
            aria-label="Previous month"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-subtle)" strokeWidth="2">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button type="button" onClick={() => setSelectedMonthFilter(isAll ? `${currentYear}-${String(currentMonth).padStart(2, "0")}` : "all")} className="tap-none flex flex-col items-center">
            <span className="text-[12px]" style={{ color: "var(--ink-muted)" }}>
              {isAll ? t("allTime") : `${MONTHS[fm]} ${fy}`}
            </span>
            <span className="text-[24px] font-bold tracking-[-0.02em] tabular-nums">
              {formatCurrency(monthTotal, "EUR")}
            </span>
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            disabled={nextDisabled}
            className="tap-none flex h-8 w-8 items-center justify-center disabled:opacity-30"
            aria-label="Next month"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-subtle)" strokeWidth="2">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </motion.div>

      {/* Type filter chips */}
      <motion.div {...sectionMotion(2)} className="-mx-1 flex gap-2 overflow-x-auto scrollbar-hide px-1">
        {TYPE_FILTERS.map((f) => {
          const active = typeFilter === f.value;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setTypeFilter(f.value)}
              className="tap-none flex-none rounded-[20px] px-[14px] py-2 text-[12.5px] transition-colors"
              style={
                active
                  ? { background: "var(--ink)", color: "var(--accent-fg)", fontWeight: 600 }
                  : { background: "var(--surface)", color: "var(--ink-muted)", fontWeight: 500, ...cardShadow }
              }
            >
              {t(`chips.${f.chip}`)}
            </button>
          );
        })}
      </motion.div>

      {/* Compact toolbar: search + category + sort + export + select */}
      <motion.div {...sectionMotion(3)} className="flex flex-col gap-2">
        {showSearch && (
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            autoFocus
            className="w-full rounded-[14px] px-3.5 py-2.5 text-[13px] outline-none"
            style={{ background: "var(--surface)", border: "1px solid var(--line-strong)", color: "var(--ink)" }}
          />
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSearch((s) => !s)}
            className="tap-none flex h-9 w-9 flex-none items-center justify-center rounded-[12px]"
            style={{ background: showSearch ? "var(--surface-2)" : "var(--surface)", ...cardShadow }}
            title={t("searchPlaceholder")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-muted)" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          </button>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="min-w-0 flex-1 rounded-[12px] px-3 py-2 text-[12.5px] outline-none"
            style={{ background: "var(--surface)", color: categoryFilter ? "var(--ink)" : "var(--ink-muted)", ...cardShadow }}
          >
            <option value="">{t("filterByCategory")}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{translateCategory(cat.name)}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "date" | "amount" | "name" | "category")}
            className="flex-none rounded-[12px] px-3 py-2 text-[12.5px] outline-none"
            style={{ background: "var(--surface)", color: "var(--ink-muted)", ...cardShadow }}
          >
            <option value="date">{t("sortByDate")}</option>
            <option value="amount">{t("sortByAmount")}</option>
            <option value="name">{t("sortByName")}</option>
            <option value="category">{t("sortByCategory")}</option>
          </select>
          <button
            type="button"
            onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
            className="tap-none flex h-9 w-9 flex-none items-center justify-center rounded-[12px]"
            style={{ background: "var(--surface)", ...cardShadow }}
            title={sortOrder === "desc" ? t("descending") : t("ascending")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-muted)" strokeWidth="2">
              {sortOrder === "desc"
                ? <path d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                : <path d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />}
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="tap-none flex h-9 w-9 flex-none items-center justify-center rounded-[12px]"
            style={{ background: "var(--surface)", ...cardShadow }}
            title={t("export")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-muted)" strokeWidth="2"><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </button>
          <button
            type="button"
            onClick={() => setIsSelectionMode((s) => !s)}
            className="tap-none flex h-9 w-9 flex-none items-center justify-center rounded-[12px]"
            style={{ background: isSelectionMode ? "var(--surface-2)" : "var(--surface)", ...cardShadow }}
            title={tCommon("selectAll")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-muted)" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
          </button>
        </div>
      </motion.div>

      {/* Day-grouped list */}
      {isLoading ? (
        <div className="rounded-[20px] p-8 text-center text-[13px]" style={{ background: "var(--surface)", color: "var(--ink-muted)", ...cardShadow }}>
          {tCommon("loading")}
        </div>
      ) : dayGroups.length === 0 ? (
        <div className="rounded-[20px] p-8 text-center text-[13px]" style={{ background: "var(--surface)", color: "var(--ink-muted)", ...cardShadow }}>
          {t("noExpenses")}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {dayGroups.map((group, gi) => (
            <motion.div key={group.dayKey} {...sectionMotion(Math.min(gi, 5) + 4)}>
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--ink-subtle)" }}>
                  {group.label}
                </span>
                <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] tabular-nums" style={{ color: "var(--ink-subtle)" }}>
                  −{formatCurrency(group.total, "EUR")}
                </span>
              </div>
              <div className="rounded-[20px] px-4 py-1.5" style={{ background: "var(--surface)", ...cardShadow }}>
                {group.expenses.map((expense, idx) => {
                  const selected = selectedIds.has(expense.id);
                  const catName = expense.category ? translateCategory(expense.category.name) : null;
                  const isInstallment = expense.installmentNumber && expense.recurringTemplate?.installmentMonths;
                  return (
                    <div
                      key={expense.id}
                      className="tap-none flex items-center gap-3 py-[11px]"
                      style={{ borderBottom: idx < group.expenses.length - 1 ? "1px solid var(--line)" : "none" }}
                      onTouchStart={() => handleLongPressStart(expense.id)}
                      onTouchEnd={handleLongPressEnd}
                      onTouchMove={handleLongPressEnd}
                      onClick={() => {
                        if (isSelectionMode) toggleSelection(expense.id);
                        else setViewingExpense(expense);
                      }}
                    >
                      {isSelectionMode && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleSelection(expense.id); }}
                          className="flex h-5 w-5 flex-none items-center justify-center rounded-[6px]"
                          style={{ border: selected ? "none" : "1.5px solid var(--line-strong)", background: selected ? "var(--accent)" : "transparent" }}
                        >
                          {selected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>}
                        </button>
                      )}
                      <MerchantAvatar name={expense.name} category={expense.category?.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center truncate text-[13.5px] font-semibold">
                          <span className="truncate">{expense.name}</span>
                          {expense.splitCount && expense.splitCount > 1 ? badge(`÷${expense.splitCount}`, "split") : null}
                          {isInstallment ? badge(`${expense.installmentNumber}/${expense.recurringTemplate!.installmentMonths}`, "inst") : null}
                        </div>
                        <div className="flex items-center truncate text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>
                          <span className="truncate">{catName ? `${catName} · ${typeLabels[expense.type]}` : typeLabels[expense.type]}</span>
                          {expense.isRecurring ? badge(t("recurring").toLowerCase(), "rec") : null}
                          {expense.imageUrls ? (
                            <svg className="ml-1.5 flex-none" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-subtle)" strokeWidth="1.8"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><circle cx="12" cy="13" r="3" /></svg>
                          ) : null}
                        </div>
                      </div>
                      {money(expense)}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {sortedExpenses.length > 0 && (
        <div className="py-1 text-center text-[12px]" style={{ color: "var(--ink-subtle)" }}>
          {t("showingAll", { count: sortedExpenses.length })}
        </div>
      )}

      {/* Selection action bar */}
      {isSelectionMode && (
        <div
          className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center justify-between gap-2 rounded-[18px] px-3 py-2.5 md:bottom-8"
          style={{ background: "var(--surface)", boxShadow: "var(--shadow-pop)" }}
        >
          <div className="flex items-center gap-2">
            <button onClick={clearSelection} className="tap-none flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: "var(--surface-2)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <span className="text-[13px] font-semibold tabular-nums">{selectedIds.size} {t("selected")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={selectAll} className="tap-none rounded-[10px] px-2.5 py-1.5 text-[12px] font-semibold" style={{ background: "var(--surface-2)", color: "var(--ink)" }}>
              {t("selectAll")}
            </button>
            <button onClick={() => setShowBulkLinkModal(true)} className="tap-none rounded-[10px] px-2.5 py-1.5 text-[12px] font-semibold" style={{ background: "var(--surface-2)", color: "var(--accent)" }}>
              {tRwa("bulkLinkAction")}
            </button>
            <button
              onClick={() => setShowBulkDeleteConfirm(true)}
              disabled={selectedIds.size === 0}
              className="tap-none rounded-[10px] px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-40"
              style={{ background: "var(--negative)", color: "#fff" }}
            >
              {tCommon("delete")}
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        variant="dialog"
        size="sm"
        zIndexClassName="z-50"
      >
        <ModalBody className="px-6 pb-0 pt-6">
          <h3 className="mb-2 text-[17px] font-bold">{t("deleteExpenseQuestion")}</h3>
          <p className="mb-4 text-[13px]" style={{ color: "var(--ink-muted)" }}>{t("deleteWarning")}</p>
        </ModalBody>
        <ModalFooter className="gap-3 px-6 pb-6 pt-0 md:px-6 md:pb-6">
          <button onClick={() => setDeleteId(null)} className="flex-1 rounded-[14px] px-4 py-2.5 text-[13.5px] font-semibold" style={{ border: "1px solid var(--line-strong)", color: "var(--ink)" }}>
            {tCommon("cancel")}
          </button>
          <button onClick={() => { if (deleteId) handleDelete(deleteId); }} className="flex-1 rounded-[14px] px-4 py-2.5 text-[13.5px] font-semibold text-white" style={{ background: "var(--negative)" }}>
            {tCommon("delete")}
          </button>
        </ModalFooter>
      </Modal>

      {/* Bulk Asset Link */}
      <Modal
        isOpen={showBulkLinkModal}
        onClose={() => { if (!bulkLinkBusy) setShowBulkLinkModal(false); }}
        variant="dialog"
        size="sm"
        zIndexClassName="z-50"
      >
        <ModalBody className="px-6 pb-0 pt-6">
          <h3 className="mb-1 text-[17px] font-bold">{tRwa("bulkLinkTitle")}</h3>
          <p className="mb-4 text-[13px]" style={{ color: "var(--ink-muted)" }}>{tRwa("bulkLinkSubtitle", { count: selectedIds.size })}</p>
          <AssetLinkPicker value={bulkLinkAssetId} onChange={setBulkLinkAssetId} />
        </ModalBody>
        <ModalFooter className="flex-col gap-2 px-6 pb-6 pt-5 md:px-6 md:pb-6">
          <button onClick={() => handleBulkLink(true)} disabled={bulkLinkBusy || !bulkLinkAssetId} className="w-full rounded-[14px] px-4 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
            {bulkLinkBusy ? tRwa("matchLinking") : tRwa("bulkLinkConfirm", { count: selectedIds.size })}
          </button>
          <button onClick={() => handleBulkLink(false)} disabled={bulkLinkBusy} className="w-full rounded-[14px] px-4 py-2.5 text-[13.5px] disabled:opacity-50" style={{ border: "1px solid var(--line-strong)", color: "var(--ink-muted)" }}>
            {tRwa("bulkUnlink")}
          </button>
          <button onClick={() => { setShowBulkLinkModal(false); setBulkLinkAssetId(null); }} disabled={bulkLinkBusy} className="w-full px-4 py-2 text-[13px] disabled:opacity-50" style={{ color: "var(--ink-subtle)" }}>
            {tCommon("cancel")}
          </button>
        </ModalFooter>
      </Modal>

      {/* Bulk Delete Confirmation */}
      <Modal
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        variant="dialog"
        size="sm"
        zIndexClassName="z-50"
      >
        <ModalBody className="px-6 pb-0 pt-6">
          <h3 className="mb-2 text-[17px] font-bold">{t("deleteSelectedQuestion", { count: selectedIds.size })}</h3>
          <p className="mb-4 text-[13px]" style={{ color: "var(--ink-muted)" }}>{t("deleteWarning")}</p>
        </ModalBody>
        <ModalFooter className="gap-3 px-6 pb-6 pt-0 md:px-6 md:pb-6">
          <button onClick={() => setShowBulkDeleteConfirm(false)} disabled={isDeleting} className="flex-1 rounded-[14px] px-4 py-2.5 text-[13.5px] font-semibold disabled:opacity-50" style={{ border: "1px solid var(--line-strong)", color: "var(--ink)" }}>
            {tCommon("cancel")}
          </button>
          <button onClick={handleBulkDelete} disabled={isDeleting} className="flex-1 rounded-[14px] px-4 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--negative)" }}>
            {isDeleting ? t("deleting") : t("deleteSelected", { count: selectedIds.size })}
          </button>
        </ModalFooter>
      </Modal>

      {/* Modals */}
      <AddExpenseModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); fetchData(); }}
        categories={categories}
        bankAccounts={bankAccounts}
        projects={projects}
      />
      <EditExpenseModal
        isOpen={!!editingExpense}
        onClose={() => setEditingExpense(null)}
        expense={editingExpense}
        categories={categories}
        bankAccounts={bankAccounts}
        projects={projects}
        onSave={fetchData}
      />
      <ExpenseDetailModal
        isOpen={!!viewingExpense}
        onClose={() => setViewingExpense(null)}
        expense={viewingExpense}
        onEdit={() => { if (viewingExpense) { setEditingExpense(viewingExpense); setViewingExpense(null); } }}
        onDelete={() => { if (viewingExpense) { setDeleteId(viewingExpense.id); setViewingExpense(null); } }}
      />
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        currentFilters={{ typeFilter, categoryFilter, selectedMonthFilter }}
      />
    </div>
  );
}
