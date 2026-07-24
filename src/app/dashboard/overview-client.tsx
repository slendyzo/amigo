"use client";

import { useState, useEffect, useMemo, lazy, Suspense, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { motion } from "framer-motion";
import Link from "next/link";
import { useSwipe } from "@/hooks/use-swipe";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import { formatCurrency } from "@/lib/currencies";
import type { Expense as FullExpense } from "@/types/models";
import { getUserShare } from "@/lib/split-utils";
import MerchantAvatar from "@/components/ui/merchant-avatar";
import TidyUpNudge from "@/components/dashboard/tidy-up-nudge";
import RailPortfolio from "@/components/dashboard/rail-portfolio";
import RailRwa from "@/components/dashboard/rail-rwa";
import RailCategories from "@/components/dashboard/rail-categories";

// Lazy load heavy modals to reduce initial bundle size
const AddTypeSelector = lazy(() => import("@/components/add-type-selector"));
const EditExpenseModal = lazy(() => import("@/components/edit-expense-modal"));
const ExpenseDetailModal = lazy(() => import("@/components/expense-detail-modal"));
const OnboardingModal = lazy(() => import("@/components/onboarding-modal"));
const AnnouncementModal = lazy(() => import("@/components/announcement-modal"));
const RetrospectiveModal = lazy(() => import("@/components/retrospective-modal"));

type Expense = {
  id: string;
  name: string;
  date: string;
  type: string;
  amount: number;
  currency: string;
  amountEur: number;
  amountExpression?: string | null;
  categoryName: string;
  parentCategoryName?: string;
  projects: { id: string; name: string }[];
  excludeFromBudget?: boolean;
  status?: "PAID" | "PENDING";
  splitCount?: number | null;
  splitData?: string | null;
  installmentNumber?: number | null;
  installmentMonths?: number | null;
  createdAt: string;
};

type Income = {
  id: string;
  name: string;
  date: string;
  type: "INCOME";
  incomeType: string;
  amount: number;
  currency: string;
  amountEur: number;
  categoryName: string;
  projects: { id: string; name: string }[];
  excludeFromBudget: boolean;
  isIncome: true;
  createdAt: string;
};

type Transaction = Expense | Income;

type DashboardExchangeConnection = {
  id: string;
  provider: string;
  label: string;
  freeCash: number;
  freeCashCurrency: string;
  assetCount: number;
};

type DashboardPortfolioAsset = {
  id: string;
  symbol: string;
  name: string;
  assetType: string;
  quantity: number;
  averageBuyPriceEur: number;
  currentPriceEur: number;
  currentValueEur: number;
  totalCostEur: number;
  unrealizedPnlEur: number;
  unrealizedPnlPct: number;
  currency: string;
  exchange: { provider: string; label: string };
};

type UpcomingTemplate = {
  id: string;
  name: string;
  amount: number | null;
  currency: string;
  dayOfMonth: number | null;
  endDate: string | null;
};

type Project = { id: string; name: string };
type Category = { id: string; name: string };
type BankAccount = { id: string; name: string };

type Props = {
  workspaceId: string;
  userName: string;
  initialExpenses: Expense[];
  initialIncomes: Income[];
  initialPreviousMonthExpenses: Expense[];
  projects: Project[];
  categories: Category[];
  bankAccounts: BankAccount[];
  initialMonth: number;
  initialYear: number;
  monthlyBudget: number | null;
  monthlySalary: number | null;
  monthlyIncome: number;
  expectedMonthlyIncome: number;
  onboardingCompleted: boolean;
  seenAnnouncements: string[];
  currencyDisplayMode: string;
  defaultCurrency: string;
  exchangeConnections: DashboardExchangeConnection[];
  portfolioAssets: DashboardPortfolioAsset[];
  netWorthEur?: number;
  netWorthDeltaEur?: number | null;
  portfolioTotalEur?: number;
  portfolioDeltaEur?: number | null;
  rwaEquityEur?: number;
  rwaTopAssets?: { id: string; name: string; valueEur: number }[];
  rwaLinkedDebtEur?: number;
  topCategories?: { name: string; amountEur: number }[];
  upcomingTemplates?: UpcomingTemplate[];
};

// Current announcement IDs - add new ones here when releasing new features
const CURRENT_ANNOUNCEMENTS = ["unified-transactions-v1", "workspaces-v1", "scheduled-expenses-v1", "category-groups-v1"];

// Month keys for i18n
const MONTH_KEYS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
] as const;

// Helper to check if a transaction is an income
const isIncomeTransaction = (t: Transaction): t is Income => {
  return "isIncome" in t && t.isIncome === true;
};

// Framer-motion entrance per the codebase pattern: fade + rise, 0.05s stagger
const EASE = [0.16, 1, 0.3, 1] as const;
const sectionMotion = (i: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: EASE, delay: i * 0.05 },
});

const cardShadow = { boxShadow: "var(--shadow-card)" };

export default function DashboardOverview({
  userName,
  initialExpenses,
  initialIncomes,
  projects,
  categories,
  bankAccounts,
  initialMonth,
  monthlyBudget,
  monthlySalary,
  expectedMonthlyIncome,
  onboardingCompleted,
  seenAnnouncements,
  currencyDisplayMode,
  exchangeConnections,
  portfolioAssets,
  netWorthEur,
  netWorthDeltaEur,
  portfolioTotalEur,
  portfolioDeltaEur,
  rwaEquityEur,
  rwaTopAssets,
  rwaLinkedDebtEur,
  topCategories,
  upcomingTemplates,
}: Props) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const tTime = useTranslations("time");
  const tCommon = useTranslations("common");
  const tIncomes = useTranslations("incomes");
  const { translateCategory } = useCategoryTranslation();
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [incomes, setIncomes] = useState<Income[]>(initialIncomes);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Edit state
  const [editingExpense, setEditingExpense] = useState<{
    id: string;
    name: string;
    amount: number;
    currency?: string;
    type: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT" | "INVESTMENT";
    date: string;
    category: { id: string; name: string } | null;
    bankAccount: { id: string; name: string } | null;
    projects: { id: string; name: string }[];
    excludeFromBudget?: boolean;
    status?: "PAID" | "PENDING";
    splitCount?: number | null;
    splitData?: string | null;
    description?: string;
  } | null>(null);
  const [viewingExpense, setViewingExpense] = useState<FullExpense | null>(null);

  // Pull-to-refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // AI Advisor cold-start state (consent gating — kept; consumed by advisor UI)
  const [, setAdvisorState] = useState<{
    aiProcessingEnabled: boolean;
    isColdstart: boolean;
    expenseCount: number;
    monthsTracked: number;
  } | null>(null);

  // Inline quick-add ("mcd 12") — desktop, or mobile when deep-linked.
  const [quickAddText, setQuickAddText] = useState("");
  const [quickAddBusy, setQuickAddBusy] = useState(false);
  const quickAddInputRef = useRef<HTMLInputElement>(null);

  // Deep link prefill: /dashboard?add=mcd%2012 (iOS Shortcuts "review before save" mode).
  // Prefills the inline quick-add and shows it on mobile too. Never auto-submits.
  const [quickAddPrefilled, setQuickAddPrefilled] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const add = params.get("add");
    if (add?.trim()) {
      setQuickAddText(add.trim());
      setQuickAddPrefilled(true);
      // Clean the URL so refresh/back doesn't re-trigger the prefill
      window.history.replaceState(null, "", "/dashboard");
      // Focus after the input renders
      setTimeout(() => quickAddInputRef.current?.focus(), 100);
    }
  }, []);

  // Uncategorized count drives the dashboard tidy-up nudge.
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  useEffect(() => {
    fetch("/api/expenses/uncategorized-count")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.count === "number") setUncategorizedCount(d.count); })
      .catch(() => { /* non-critical */ });
  }, []);

  // Retrospective state
  type UnreadInsight = {
    id: string;
    periodYear: number;
    periodMonth: number;
    content: { headline: string; observations: [string, string, string]; momHighlights: Array<{ category: string; currentTotal: number; prevTotal: number; pctChange: number }> };
    readAt: string | null;
  };
  const [unreadRetro, setUnreadRetro] = useState<UnreadInsight | null>(null);
  const [showRetro, setShowRetro] = useState(false);

  // Onboarding modal state - show if not completed
  const [showOnboarding, setShowOnboarding] = useState(!onboardingCompleted);

  // Announcement modal state - find first unseen announcement
  // Only show after onboarding is complete (either already done or just completed)
  const unseenAnnouncement = CURRENT_ANNOUNCEMENTS.find(
    (id) => !seenAnnouncements.includes(id)
  );
  const [showAnnouncement, setShowAnnouncement] = useState(
    onboardingCompleted && !!unseenAnnouncement
  );
  const [currentAnnouncementId, setCurrentAnnouncementId] = useState<string | null>(
    onboardingCompleted && unseenAnnouncement ? unseenAnnouncement : null
  );
  // Bell button opens the latest announcement in view-only mode (doesn't mark seen)
  const [announcementViewOnly, setAnnouncementViewOnly] = useState(false);
  const openWhatsNew = () => {
    setCurrentAnnouncementId(unseenAnnouncement ?? CURRENT_ANNOUNCEMENTS[CURRENT_ANNOUNCEMENTS.length - 1]);
    setAnnouncementViewOnly(true);
    setShowAnnouncement(true);
  };

  // When onboarding closes, check if we should show announcement
  const handleOnboardingClose = () => {
    setShowOnboarding(false);
    // After onboarding completes, show announcement if there's an unseen one
    if (unseenAnnouncement) {
      setCurrentAnnouncementId(unseenAnnouncement);
      setShowAnnouncement(true);
    }
  };

  // Time-of-day greeting computed on the client (server runs in UTC) to avoid
  // an SSR/CSR hydration mismatch.
  const [greetingKey, setGreetingKey] = useState<"greetingShortMorning" | "greetingShortAfternoon" | "greetingShortEvening">("greetingShortEvening");
  useEffect(() => {
    const h = new Date().getHours();
    setGreetingKey(h < 12 ? "greetingShortMorning" : h < 18 ? "greetingShortAfternoon" : "greetingShortEvening");
  }, []);

  // Sync server-rendered data to state when router.refresh() triggers a re-render.
  // This ensures budget/expense data updates correctly after adding/editing expenses.
  useEffect(() => {
    setExpenses(initialExpenses);
    setIncomes(initialIncomes);
  }, [initialExpenses, initialIncomes]);

  // Listen for quick-add event from bottom nav.
  // This page handles its own modal, so claim the event — GlobalAddButton
  // checks defaultPrevented and stands down. preventDefault rather than
  // stopImmediatePropagation because the latter only silences listeners
  // registered after ours, and GlobalAddButton is lazy-loaded so the order
  // isn't guaranteed (AMIGO-331: that race opened two stacked modals).
  useEffect(() => {
    const handleQuickAdd = (e: Event) => {
      e.preventDefault();
      setIsSelectorOpen(true);
    };
    window.addEventListener("openQuickAdd", handleQuickAdd);
    return () => window.removeEventListener("openQuickAdd", handleQuickAdd);
  }, []);

  // Auto-generate recurring expenses for current month (runs once on mount)
  useEffect(() => {
    const autoGenerateRecurring = async () => {
      try {
        const response = await fetch("/api/recurring-templates/generate");
        const data = await response.json();
        if (data.generated > 0) {
          // Refresh expenses if any were auto-generated
          router.refresh();
        }
      } catch (error) {
        console.error("Auto-generate recurring expenses failed:", error);
      }
    };
    autoGenerateRecurring();

    // Fetch AI Advisor state for cold-start card and unread retrospective
    const fetchAdvisorState = async () => {
      try {
        const [stateRes, retroRes] = await Promise.all([
          fetch("/api/user/advisor-state"),
          fetch("/api/insights/retrospective"),
        ]);
        if (stateRes.ok) {
          const data = await stateRes.json();
          setAdvisorState(data);
        }
        if (retroRes.ok) {
          const retro = await retroRes.json();
          if (retro && retro.id) {
            setUnreadRetro(retro);
            // Delay popup slightly so it doesn't fight first paint
            const timer = setTimeout(() => setShowRetro(true), 600);
            return () => clearTimeout(timer);
          }
        }
      } catch { /* non-critical, ignore */ }
    };
    fetchAdvisorState();
  }, [router]);

  // Pull-to-refresh handler (only at top of page, mobile only)
  const handlePullRefresh = useCallback(() => {
    if (window.scrollY > 10 || isRefreshing) return;
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 1500);
  }, [router, isRefreshing]);

  const { handlers: swipeHandlers } = useSwipe({
    onSwipeDown: handlePullRefresh,
    threshold: 75,
  });

  // Merge expenses and incomes into unified transactions list, sorted by date
  const transactions = useMemo(() => {
    const allTransactions: Transaction[] = [...expenses, ...incomes];
    return allTransactions.sort((a, b) => {
      const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [expenses, incomes]);

  // Get effective EUR amount for an expense (user's share if split)
  const effectiveEur = (e: Expense) => {
    if (e.splitCount && e.splitCount > 1) {
      const share = getUserShare(e.splitCount, e.splitData);
      if (share !== null && e.amount !== 0) {
        // Proportional EUR: user's share in original currency → scale EUR by same ratio
        return e.amountEur * (share / e.amount);
      }
      return e.amountEur / e.splitCount;
    }
    return e.amountEur;
  };

  // Budget "spent" — exact same math as the old ring gauge: every expense not
  // explicitly marked excludeFromBudget counts (PENDING included), at the
  // user's share when split.
  const budgetSpent = useMemo(() => {
    return expenses
      .filter((e) => !e.excludeFromBudget)
      .reduce((sum, e) => sum + effectiveEur(e), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses]);

  // Budget value: workspace budget, falling back to expected recurring income
  // (existing behavior). Null → "Set a budget" CTA.
  const effectiveBudget = monthlyBudget ?? (expectedMonthlyIncome > 0 ? expectedMonthlyIncome : null);
  const budgetLeft = (effectiveBudget ?? 0) - budgetSpent;

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  // Today still counts as a spending day, so the allowance divides by the
  // remaining days *including* today — never zero, even on the 31st.
  const daysLeftInclusive = Math.max(daysInMonth - dayOfMonth + 1, 1);
  const dailyAllowance = Math.max(Math.floor(budgetLeft / daysLeftInclusive), 0);
  // Pace = where an evenly-spread budget would have you by end of today.
  // Positive delta → under pace (good), negative → over pace.
  const paceDelta = (effectiveBudget ?? 0) * (dayOfMonth / daysInMonth) - budgetSpent;
  const monthName = tTime(`months.${MONTH_KEYS[initialMonth]}`);

  // Whole-euro currency formatting for hero/budget numbers (locale-aware)
  const fmtEur0 = useCallback(
    (v: number) =>
      new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v),
    [locale]
  );

  // Net worth values (server-computed; fall back to visible portfolio sum)
  const portfolioFallback = portfolioAssets.reduce((sum, a) => sum + a.currentValueEur, 0);
  const heroNetWorth = netWorthEur ?? portfolioFallback;
  const heroInvested = portfolioTotalEur ?? portfolioFallback;
  const heroAssets = rwaEquityEur ?? 0;
  const heroDebt = rwaLinkedDebtEur ?? 0;

  // Upcoming: next occurrence of each active monthly template from dayOfMonth
  const upcoming = useMemo(() => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return (upcomingTemplates ?? [])
      .filter((tpl) => tpl.dayOfMonth !== null)
      .map((tpl) => {
        const dom = tpl.dayOfMonth as number;
        let y = today.getFullYear();
        let m = today.getMonth();
        if (dom < today.getDate()) {
          m += 1;
          if (m > 11) { m = 0; y += 1; }
        }
        const lastDay = new Date(y, m + 1, 0).getDate();
        const next = new Date(y, m, Math.min(dom, lastDay));
        const days = Math.round((next.getTime() - startOfToday.getTime()) / 86400000);
        return { ...tpl, next, days };
      })
      .filter((tpl) => !tpl.endDate || new Date(tpl.endDate) >= tpl.next)
      .sort((a, b) => a.days - b.days)
      .slice(0, 6);
  }, [upcomingTemplates]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const response = await fetch(`/api/expenses?id=${id}`, { method: "DELETE" });
      if (response.ok) {
        setExpenses((prev) => prev.filter((e) => e.id !== id));
        setConfirmDeleteId(null);
      }
    } catch (error) {
      console.error("Failed to delete expense:", error);
    } finally {
      setDeletingId(null);
    }
  };

  // Optimistically add a newly created expense to local state
  const handleExpenseCreated = useCallback((expense: {
    id: string;
    name: string;
    date: string;
    type: string;
    amount: number;
    currency: string;
    amountEur: number;
    categoryName: string;
    projects: { id: string; name: string }[];
    excludeFromBudget: boolean;
    splitCount: number | null;
    splitData: string | null;
    status: string;
    createdAt: string;
  }) => {
    setExpenses((prev) => [
      {
        id: expense.id,
        name: expense.name,
        date: expense.date,
        type: expense.type,
        amount: expense.amount,
        currency: expense.currency,
        amountEur: expense.amountEur,
        categoryName: expense.categoryName,
        projects: expense.projects,
        excludeFromBudget: expense.excludeFromBudget,
        splitCount: expense.splitCount,
        splitData: expense.splitData,
        status: expense.status as "PAID" | "PENDING",
        createdAt: expense.createdAt,
      },
      ...prev,
    ]);
  }, []);

  // Inline quick-add: POST the raw string; the API parses it server-side
  // (parseQuickAdd + keyword mappings) and creates the expense.
  const handleInlineQuickAdd = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = quickAddText.trim();
    if (!text || quickAddBusy) return;
    setQuickAddBusy(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quickAdd: text }),
      });
      if (res.ok) {
        setQuickAddText("");
        router.refresh();
      }
    } catch (error) {
      console.error("Inline quick-add failed:", error);
    } finally {
      setQuickAddBusy(false);
    }
  };

  // Fetch full expense data for detail view
  const handleViewExpense = async (expenseId: string) => {
    try {
      const response = await fetch(`/api/expenses/${expenseId}`);
      if (response.ok) {
        const data = await response.json();
        setViewingExpense(data.expense);
      }
    } catch (error) {
      console.error("Failed to fetch expense:", error);
    }
  };

  // Render transaction amount based on currency display mode
  const renderAmount = (transaction: Transaction) => {
    const isIncome = isIncomeTransaction(transaction);
    const eur = transaction.amountEur;
    const original = transaction.amount;
    const cur = transaction.currency || "EUR";
    const isSameCurrency = cur === "EUR";
    const expense = !isIncome ? (transaction as Expense) : null;
    const splitCount = expense?.splitCount;
    const isSplit = splitCount && splitCount > 1;
    const share = isSplit ? getUserShare(splitCount, expense?.splitData) : null;
    const splitOriginal = share !== null ? share : (isSplit ? original / splitCount : original);
    const splitEur = share !== null && original !== 0 ? eur * (share / original) : (isSplit ? eur / splitCount : eur);

    if (currencyDisplayMode === "converted" || isSameCurrency) {
      if (isIncome) return { text: `+€${eur.toFixed(2)}` };
      if (splitEur < 0) return { text: `(€${Math.abs(splitEur).toFixed(2)})`, secondary: isSplit ? `${formatCurrency(original, cur)}` : undefined };
      return { text: `€${splitEur.toFixed(2)}`, secondary: isSplit ? `${formatCurrency(original, cur)}` : undefined };
    }

    const mainText = isIncome
      ? `+${formatCurrency(original, cur)}`
      : formatCurrency(splitOriginal, cur);

    if (currencyDisplayMode === "original") {
      const secondaryParts: string[] = [];
      if (isSplit) secondaryParts.push(formatCurrency(original, cur));
      secondaryParts.push(`≈€${Math.abs(splitEur).toFixed(2)}`);
      return { text: mainText, secondary: secondaryParts.join(" · ") };
    }

    // original_only
    return { text: mainText, secondary: isSplit ? formatCurrency(original, cur) : undefined };
  };

  // "Today / Yesterday / Jul 1" label for the Recent rows
  const whenLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    const local = new Date();
    const dY = d.getUTCFullYear(), dM = d.getUTCMonth(), dD = d.getUTCDate();
    if (dY === local.getFullYear() && dM === local.getMonth() && dD === local.getDate()) return tTime("today");
    const yest = new Date(local.getFullYear(), local.getMonth(), local.getDate() - 1);
    if (dY === yest.getFullYear() && dM === yest.getMonth() && dD === yest.getDate()) return tTime("yesterday");
    return d.toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  };

  const recent = transactions.slice(0, 3);

  const seeAllLink = (href: string) => (
    <Link href={href} className="text-[12px] font-medium" style={{ color: "var(--accent)" }}>
      {t("seeAll")}
    </Link>
  );

  return (
    <div {...swipeHandlers}>
      {/* Pull-to-refresh indicator (mobile) */}
      {isRefreshing && (
        <div className="flex justify-center py-2 md:hidden">
          <svg className="h-5 w-5 animate-spin" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      )}

      <div className="flex flex-col gap-[18px]">
        {/* ============ LEFT COLUMN — the five dashboard sections ============ */}
        <div className="flex flex-col gap-[18px]">
          {/* 1 — Header row: greeting + search / bell */}
          <motion.section {...sectionMotion(0)} className="flex items-center justify-between">
            <div>
              <div className="text-[13px]" style={{ color: "var(--ink-muted)" }}>{t(greetingKey)}</div>
              <div className="text-[20px] font-bold tracking-[-0.02em]">{userName}</div>
            </div>
            <div className="flex gap-[10px]">
              <button
                type="button"
                onClick={() => router.push("/dashboard/expenses")}
                aria-label={t("searchAction")}
                className="tap-none flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-[.94]"
                style={{ background: "var(--surface)", ...cardShadow }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.5-3.5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={openWhatsNew}
                aria-label={t("whatsNewAction")}
                className="tap-none relative flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-[.94]"
                style={{ background: "var(--surface)", ...cardShadow }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.8">
                  <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
                  <path d="M10 19a2 2 0 0 0 4 0" />
                </svg>
                {unseenAnnouncement && (
                  <span
                    className="absolute right-[10px] top-[9px] h-[7px] w-[7px] rounded-full"
                    style={{ background: "var(--accent)", border: "1.5px solid var(--surface)" }}
                  />
                )}
              </button>
            </div>
          </motion.section>

          {/* 2 — Net-worth hero card */}
          <motion.section {...sectionMotion(1)}>
            <Link
              href="/dashboard/networth"
              className="block rounded-[24px] px-[22px] py-5 transition-transform active:scale-[.98]"
              style={{ background: "var(--hero-gradient)" }}
            >
              <div className="flex items-start justify-between">
                <div className="text-[13px] font-medium" style={{ color: "var(--hero-ink)" }}>
                  {t("statNetWorth")}
                </div>
                {netWorthDeltaEur != null && (
                  <div
                    className="rounded-[20px] bg-white/55 px-[10px] py-1 text-[12px] font-semibold tabular-nums dark:bg-white/10"
                    style={{ color: "var(--accent-strong)" }}
                  >
                    {netWorthDeltaEur >= 0 ? "▲" : "▼"} {fmtEur0(Math.abs(netWorthDeltaEur))} {t("thisMonthLower")}
                  </div>
                )}
              </div>
              <div className="mt-1.5 text-[34px] font-bold tracking-[-0.03em] tabular-nums dark:text-white">
                {fmtEur0(heroNetWorth)}
              </div>
              <div className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] tabular-nums" style={{ color: "var(--hero-ink)" }}>
                <span>
                  <span className="mr-[5px] inline-block h-2 w-2 rounded-[2px]" style={{ background: "var(--accent)" }} />
                  {t("heroInvested")} {fmtEur0(heroInvested)}
                </span>
                <span>
                  <span className="mr-[5px] inline-block h-2 w-2 rounded-[2px]" style={{ background: "var(--accent-soft)" }} />
                  {t("heroAssets")} {fmtEur0(heroAssets)}
                </span>
                <span>
                  <span className="mr-[5px] inline-block h-2 w-2 rounded-[2px]" style={{ background: "var(--accent-faint)" }} />
                  {t("heroDebt")} −{fmtEur0(heroDebt)}
                </span>
              </div>
            </Link>
          </motion.section>

          {/* 3 — Budget card */}
          <motion.section {...sectionMotion(2)}>
            <div className="rounded-[20px] px-[18px] py-[18px]" style={{ background: "var(--surface)", ...cardShadow }}>
              {effectiveBudget !== null ? (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-semibold">
                      {budgetLeft < 0 ? t("budgetOverLabel") : t("safeToSpendToday")}
                    </span>
                    <span className="text-[12px]" style={{ color: "var(--ink-muted)" }}>{monthName}</span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
                    <span
                      className="text-[34px] font-bold leading-[1.05] tracking-[-0.03em] tabular-nums"
                      style={budgetLeft < 0 ? { color: "var(--negative)" } : undefined}
                    >
                      {fmtEur0(budgetLeft < 0 ? Math.abs(budgetLeft) : dailyAllowance)}
                    </span>
                    <span className="text-[12px]" style={{ color: "var(--ink-muted)" }}>
                      {budgetLeft < 0
                        ? t("budgetOverSuffix", { month: monthName })
                        : t("perDayFor", { days: daysLeftInclusive })}
                    </span>
                  </div>

                  {/* Day strip — one bar per day, today accented and taller */}
                  {/* max-w keeps the bars slim ticks on the wide desktop column
                      instead of inflating into squares; the gaps absorb the space. */}
                  <div className="mt-4 flex items-end justify-between gap-[3px]">
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const day = i + 1;
                      const isToday = day === dayOfMonth;
                      return (
                        <motion.span
                          key={day}
                          className={`max-w-[16px] flex-1 rounded-[3px] ${
                            isToday ? "h-[26px] md:h-[36px]" : "h-[20px] md:h-[28px]"
                          }`}
                          style={{
                            transformOrigin: "bottom",
                            background: isToday
                              ? "var(--accent)"
                              : day < dayOfMonth
                                ? "var(--accent-faint)"
                                : "var(--surface-2)",
                          }}
                          initial={{ scaleY: 0, opacity: 0 }}
                          animate={{ scaleY: 1, opacity: 1 }}
                          transition={{ duration: 0.45, ease: EASE, delay: 0.12 + i * 0.012 }}
                        />
                      );
                    })}
                  </div>

                  <div className="mt-2.5 flex items-baseline justify-between gap-3">
                    <span className="text-[11px] tabular-nums" style={{ color: "var(--ink-subtle)" }}>
                      {t("budgetLeftOf", {
                        left: fmtEur0(Math.max(budgetLeft, 0)),
                        budget: fmtEur0(effectiveBudget),
                      })}
                    </span>
                    <span
                      className="whitespace-nowrap text-[11px] font-semibold tabular-nums"
                      style={{
                        color:
                          Math.abs(paceDelta) < 1
                            ? "var(--ink-subtle)"
                            : paceDelta > 0
                              ? "var(--positive)"
                              : "var(--warning)",
                      }}
                    >
                      {Math.abs(paceDelta) < 1
                        ? t("budgetOnPace")
                        : paceDelta > 0
                          ? t("budgetUnderPace", { amount: fmtEur0(paceDelta) })
                          : t("budgetOverPace", { amount: fmtEur0(-paceDelta) })}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-semibold">{t("monthBudget", { month: monthName })}</span>
                  </div>
                  <Link
                    href="/dashboard/settings"
                    className="mt-2.5 block text-[13px] font-semibold"
                    style={{ color: "var(--accent)" }}
                  >
                    {t("setBudgetCta")} →
                  </Link>
                </>
              )}
            </div>
          </motion.section>

          {/* Tidy-up nudge — only renders when there are uncategorized expenses */}
          <TidyUpNudge count={uncategorizedCount} />

          {/* 4 — Upcoming (recurring templates) */}
          {upcoming.length > 0 && (
            <motion.section {...sectionMotion(3)}>
              <div className="mb-2.5 flex items-baseline justify-between">
                <span className="text-[14px] font-semibold">{t("upcoming")}</span>
                {seeAllLink("/dashboard/recurring")}
              </div>
              <div className="scrollbar-hide flex gap-[10px] overflow-x-auto">
                {upcoming.map((tpl, i) => {
                  const first = i === 0;
                  const value =
                    tpl.amount !== null
                      ? tpl.currency === "EUR" && Number.isInteger(tpl.amount)
                        ? fmtEur0(tpl.amount)
                        : formatCurrency(tpl.amount, tpl.currency)
                      : "~";
                  return (
                    <div
                      key={tpl.id}
                      className="w-32 flex-none rounded-[18px] p-3.5"
                      style={
                        first
                          ? { background: "var(--accent)", color: "var(--accent-fg)" }
                          : { background: "var(--surface)", ...cardShadow }
                      }
                    >
                      <div className="truncate text-[12px]" style={first ? { opacity: 0.75 } : { color: "var(--ink-muted)" }}>
                        {tpl.name}
                      </div>
                      <div className="mt-0.5 text-[17px] font-bold tabular-nums">{value}</div>
                      <div className="mt-2 text-[11px]" style={first ? { opacity: 0.75 } : { color: "var(--ink-subtle)" }}>
                        {t("inDays", { days: tpl.days })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.section>
          )}

          {/* 5 — Recent transactions */}
          <motion.section {...sectionMotion(4)}>
            <div className="mb-2.5 flex items-baseline justify-between">
              <span className="text-[14px] font-semibold">{t("recent")}</span>
              {seeAllLink("/dashboard/expenses")}
            </div>

            {/* Desktop inline quick-add ("mcd 12"); shows on mobile only when deep-linked */}
            <form onSubmit={handleInlineQuickAdd} className={`mb-2.5 gap-2 md:flex ${quickAddPrefilled ? "flex" : "hidden"}`}>
              <input
                ref={quickAddInputRef}
                value={quickAddText}
                onChange={(ev) => setQuickAddText(ev.target.value)}
                placeholder={t("quickAddPlaceholder")}
                className="flex-1 rounded-[14px] px-3.5 py-2 text-[13px] outline-none"
                style={{ background: "var(--surface)", border: "1px solid var(--line-strong)", color: "var(--ink)" }}
              />
              <button
                type="submit"
                disabled={quickAddBusy || !quickAddText.trim()}
                className="rounded-[14px] px-4 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                {quickAddBusy ? "…" : t("quickAddButton")}
              </button>
            </form>

            <div className="rounded-[20px] px-4 py-1.5" style={{ background: "var(--surface)", ...cardShadow }}>
              {recent.length > 0 ? (
                recent.map((tx, i) => {
                  const isIncome = isIncomeTransaction(tx);
                  const isRefund = !isIncome && tx.amountEur < 0;
                  const amt = renderAmount(tx);
                  const displayText =
                    isIncome || amt.text.startsWith("(") || amt.text.startsWith("+") ? amt.text : `−${amt.text}`;
                  const categoryLabel = isIncome
                    ? tIncomes(`types.${tx.incomeType.toLowerCase()}`)
                    : translateCategory(tx.parentCategoryName || tx.categoryName);
                  const rawCategory = isIncome ? "income" : (tx.parentCategoryName || tx.categoryName);
                  return (
                    <div
                      key={tx.id}
                      onClick={() => { if (!isIncome) handleViewExpense(tx.id); }}
                      className={`flex items-center gap-3 py-[11px] ${isIncome ? "" : "tap-none cursor-pointer"}`}
                      style={i < recent.length - 1 ? { borderBottom: "1px solid var(--line)" } : undefined}
                    >
                      <MerchantAvatar name={tx.name} category={rawCategory} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold">{tx.name}</div>
                        <div className="truncate text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>
                          {categoryLabel} · {whenLabel(tx.date)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className="text-[13.5px] font-semibold tabular-nums"
                          style={{ color: isIncome || isRefund ? "var(--positive)" : "var(--ink)" }}
                        >
                          {displayText}
                        </div>
                        {amt.secondary && (
                          <div className="text-[10px] tabular-nums" style={{ color: "var(--ink-subtle)" }}>
                            {amt.secondary}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-6 text-center">
                  <p className="text-[13px]" style={{ color: "var(--ink-muted)" }}>{t("noExpensesYet")}</p>
                  <button
                    type="button"
                    onClick={() => setIsSelectorOpen(true)}
                    className="tap-none mt-1.5 text-[13px] font-semibold"
                    style={{ color: "var(--accent)" }}
                  >
                    {t("addFirstExpense")} →
                  </button>
                </div>
              )}
            </div>
          </motion.section>
        </div>

        {/* ============ RIGHT RAIL (desktop only) ============ */}
        <motion.div {...sectionMotion(2)} className="hidden md:flex md:flex-col md:gap-[18px]">
          <RailPortfolio
            totalEur={heroInvested}
            deltaEur={portfolioDeltaEur}
            holdings={portfolioAssets.slice(0, 2).map((a) => ({ symbol: a.symbol, label: `${a.symbol} · ${a.exchange.label}`, valueEur: a.currentValueEur }))}
            exchangeCount={exchangeConnections.length}
            moreCount={Math.max(0, exchangeConnections.reduce((s, c) => s + c.assetCount, 0) - 2)}
            hasData={exchangeConnections.length > 0}
          />
          <RailRwa
            equityEur={rwaEquityEur ?? 0}
            assets={rwaTopAssets ?? []}
            linkedDebtEur={rwaLinkedDebtEur ?? 0}
            hasData={(rwaTopAssets?.length ?? 0) > 0}
          />
          <RailCategories categories={topCategories ?? []} />
        </motion.div>
      </div>

      {/* Delete confirmation bar (detail-modal delete flow) */}
      {confirmDeleteId && (
        <div className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-[18px] px-4 py-3 md:bottom-8" style={{ background: "var(--surface)", boxShadow: "var(--shadow-pop)" }}>
          <span className="text-[13px] font-medium">{t("confirmDeleteExpense")}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleDelete(confirmDeleteId)}
              disabled={deletingId === confirmDeleteId}
              className="tap-none rounded-[12px] px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
              style={{ background: "var(--negative)", color: "#fff" }}
            >
              {deletingId === confirmDeleteId ? "…" : tCommon("delete")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteId(null)}
              className="tap-none rounded-[12px] px-3 py-1.5 text-[12.5px] font-semibold"
              style={{ background: "var(--surface-2)", color: "var(--ink)" }}
            >
              {tCommon("cancel")}
            </button>
          </div>
        </div>
      )}

      {/* ==================== MODALS ==================== */}
      {isSelectorOpen && (
        <Suspense fallback={null}>
          <AddTypeSelector
            isOpen={isSelectorOpen}
            onClose={() => setIsSelectorOpen(false)}
            onExpenseCreated={handleExpenseCreated}
          />
        </Suspense>
      )}

      {editingExpense && (
        <Suspense fallback={null}>
          <EditExpenseModal
            isOpen={!!editingExpense}
            onClose={() => setEditingExpense(null)}
            expense={editingExpense}
            categories={categories}
            bankAccounts={bankAccounts}
            projects={projects}
            onSave={() => {
              setEditingExpense(null);
              router.refresh();
            }}
          />
        </Suspense>
      )}

      {viewingExpense && (
        <Suspense fallback={null}>
          <ExpenseDetailModal
            isOpen={!!viewingExpense}
            onClose={() => setViewingExpense(null)}
            expense={viewingExpense}
            onEdit={() => {
              const exp = viewingExpense;
              setViewingExpense(null);
              setEditingExpense({
                id: exp.id,
                name: exp.name,
                amount: Number(exp.amount),
                currency: exp.currency || "EUR",
                type: exp.type as "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT",
                date: exp.date,
                category: exp.category,
                bankAccount: exp.bankAccount,
                projects: exp.projects || [],
                excludeFromBudget: exp.excludeFromBudget || false,
                status: exp.status || "PAID",
                splitCount: exp.splitCount || null,
                splitData: exp.splitData || null,
                description: exp.description || undefined,
              });
            }}
            onDelete={() => {
              const id = viewingExpense.id;
              setViewingExpense(null);
              setConfirmDeleteId(id);
            }}
          />
        </Suspense>
      )}

      {showOnboarding && (
        <Suspense fallback={null}>
          <OnboardingModal
            isOpen={showOnboarding}
            onClose={handleOnboardingClose}
            existingData={{
              monthlySalary,
              monthlyBudget,
            }}
          />
        </Suspense>
      )}

      {currentAnnouncementId && showAnnouncement && (
        <Suspense fallback={null}>
          <AnnouncementModal
            isOpen={showAnnouncement}
            onClose={() => {
              setShowAnnouncement(false);
              setAnnouncementViewOnly(false);
            }}
            announcementId={currentAnnouncementId}
            viewOnly={announcementViewOnly}
          />
        </Suspense>
      )}

      {/* Retrospective popup — auto-shown on day 1 of month when unread insight exists */}
      {showRetro && unreadRetro && (
        <Suspense fallback={null}>
          <RetrospectiveModal
            isOpen={showRetro}
            onClose={() => {
              setShowRetro(false);
              setUnreadRetro(null);
            }}
            insight={unreadRetro}
            markReadOnClose={true}
          />
        </Suspense>
      )}
    </div>
  );
}
