"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
} from "lucide-react";
import ShortcutsTokensCard from "@/components/shortcuts-tokens-card";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { useTheme, type Theme } from "@/components/theme-controls";

type Stats = {
  totalExpenses: number;
  totalAmount: number;
  totalCategories: number;
  totalProjects: number;
  totalIncomes: number;
  totalIncomeAmount: number;
};

type Workspace = {
  id: string;
  name: string;
  monthlyBudget: number | null;
  defaultCurrency: string;
  defaultBankAccountId: string | null;
  language: string;
  currencyDisplayMode: string;
};

type BankAccount = {
  id: string;
  name: string;
};

type RecurringIncome = {
  id: string;
  name: string;
  amount: number;
  amountEur: number;
  currency: string;
  type: string;
  dayOfMonth: number | null;
};

const CURRENCIES = [
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "PLN", symbol: "zł", name: "Polish Zloty" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
];

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "pt-PT", name: "Português (Portugal)" },
  { code: "fr-FR", name: "Français (France)" },
];

const EASE = [0.16, 1, 0.3, 1] as const;
const sectionMotion = (i: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: EASE, delay: i * 0.05 },
});
const cardShadow = { boxShadow: "var(--shadow-card)" };

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const tNav = useTranslations("nav");
  const tAi = useTranslations("aiAdvisor");
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [stats, setStats] = useState<Stats | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [recurringIncomes, setRecurringIncomes] = useState<RecurringIncome[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Current user (for the profile card)
  const [userName, setUserName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Budget form
  const [monthlyBudget, setMonthlyBudget] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [defaultBankAccountId, setDefaultBankAccountId] = useState("");
  const [language, setLanguage] = useState("en");
  const [currencyDisplayMode, setCurrencyDisplayMode] = useState("converted");
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  // Salary form
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [salaryName, setSalaryName] = useState("Salary");
  const [salaryAmount, setSalaryAmount] = useState("");
  const [salaryCurrency, setSalaryCurrency] = useState("EUR");
  const [salaryDay, setSalaryDay] = useState("1");
  const [editingSalaryId, setEditingSalaryId] = useState<string | null>(null);

  // Delete all expenses state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteSuccess, setDeleteSuccess] = useState("");

  // Delete account state
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState("");

  // Restart onboarding state
  const [isRestartingOnboarding, setIsRestartingOnboarding] = useState(false);

  // AI Advisor state
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiConsentAt, setAiConsentAt] = useState<string | null>(null);
  const [isTogglingAi, setIsTogglingAi] = useState(false);

  useEffect(() => {
    fetchData();
    // Fetch AI consent state
    fetch("/api/user/ai-consent")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setAiEnabled(data.aiProcessingEnabled);
          setAiConsentAt(data.aiConsentAt);
        }
      })
      .catch(() => {});
    // Fetch current user for the profile card
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setUserName(data.user.name || null);
          setUserEmail(data.user.email || null);
        }
      })
      .catch(() => {});
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch ALL data in parallel instead of sequentially
      const [workspaceRes, bankAccountsRes, expensesRes, categoriesRes, projectsRes, incomesRes] =
        await Promise.all([
          fetch("/api/workspace"),
          fetch("/api/bank-accounts"),
          fetch("/api/expenses?limit=10000"),
          fetch("/api/categories"),
          fetch("/api/projects"),
          fetch("/api/incomes"),
        ]);

      if (workspaceRes.ok) {
        const data = await workspaceRes.json();
        setWorkspace(data.workspace);
        setMonthlyBudget(data.workspace.monthlyBudget?.toString() || "");
        setCurrency(data.workspace.defaultCurrency || "EUR");
        setDefaultBankAccountId(data.workspace.defaultBankAccountId || "");
        setLanguage(data.workspace.language || "en");
        setCurrencyDisplayMode(data.workspace.currencyDisplayMode || "converted");
      }
      if (bankAccountsRes.ok) {
        const data = await bankAccountsRes.json();
        setBankAccounts(data.bankAccounts || []);
      }

      let newStats: Stats = {
        totalExpenses: 0,
        totalAmount: 0,
        totalCategories: 0,
        totalProjects: 0,
        totalIncomes: 0,
        totalIncomeAmount: 0,
      };

      if (expensesRes.ok) {
        const data = await expensesRes.json();
        newStats.totalExpenses = data.total;
        newStats.totalAmount = data.expenses.reduce(
          (sum: number, e: { amount: number }) => sum + Number(e.amount),
          0
        );
      }
      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        newStats.totalCategories = data.categories?.length || 0;
      }
      if (projectsRes.ok) {
        const data = await projectsRes.json();
        newStats.totalProjects = data.projects?.length || 0;
      }
      if (incomesRes.ok) {
        const data = await incomesRes.json();
        newStats.totalIncomes = data.count || 0;
        newStats.totalIncomeAmount = data.total || 0;
        const recurring = data.incomes?.filter(
          (i: { isRecurring: boolean; type: string }) => i.isRecurring && i.type === "SALARY"
        ) || [];
        setRecurringIncomes(recurring);
      }

      setStats(newStats);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveBudget = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyBudget,
          defaultCurrency: currency,
          defaultBankAccountId: defaultBankAccountId || null,
          language,
          currencyDisplayMode,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setWorkspace(data.workspace);

        // Update the locale cookie when language changes
        document.cookie = `NEXT_LOCALE=${language}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;

        setSaveMessage({ type: "success", text: t("saved") });
        setTimeout(() => setSaveMessage(null), 3000);

        // Refresh to apply new language
        if (data.workspace.language !== workspace?.language) {
          window.location.reload();
        }
      } else {
        throw new Error("Failed to save");
      }
    } catch {
      setSaveMessage({ type: "error", text: t("saveFailed") });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSalary = async () => {
    if (!salaryAmount) return;

    setIsSaving(true);
    try {
      const method = editingSalaryId ? "PUT" : "POST";
      const url = editingSalaryId
        ? `/api/incomes/${editingSalaryId}`
        : "/api/incomes";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: salaryName || "Salary",
          amount: salaryAmount,
          currency: salaryCurrency,
          type: "SALARY",
          isRecurring: true,
          interval: "MONTHLY",
          dayOfMonth: salaryDay,
          date: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        setShowSalaryModal(false);
        setSalaryName("Salary");
        setSalaryAmount("");
        setSalaryCurrency("EUR");
        setSalaryDay("1");
        setEditingSalaryId(null);
        fetchData();
      }
    } catch (error) {
      console.error("Failed to save salary:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSalary = async (id: string) => {
    try {
      const response = await fetch(`/api/incomes/${id}`, { method: "DELETE" });
      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Failed to delete salary:", error);
    }
  };

  const openEditSalary = (income: RecurringIncome) => {
    setEditingSalaryId(income.id);
    setSalaryName(income.name);
    setSalaryAmount(income.amount.toString());
    setSalaryCurrency(income.currency || "EUR");
    setSalaryDay(income.dayOfMonth?.toString() || "1");
    setShowSalaryModal(true);
  };

  const handleDeleteAllExpenses = async () => {
    if (deleteConfirmText !== "DELETE ALL") {
      setDeleteError("Please type 'DELETE ALL' exactly to confirm");
      return;
    }

    setIsDeleting(true);
    setDeleteError("");
    setDeleteSuccess("");

    try {
      const response = await fetch("/api/expenses/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmText: deleteConfirmText }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete expenses");
      }

      setDeleteSuccess(`Successfully deleted ${data.deleted} expenses`);
      setShowDeleteConfirm(false);
      setDeleteConfirmText("");
      fetchData();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsDeleting(false);
    }
  };

  const getCurrencySymbol = (code: string) => {
    return CURRENCIES.find((c) => c.code === code)?.symbol || "€";
  };

  const handleToggleAi = async () => {
    const newAction = aiEnabled ? "decline" : "enable";
    setIsTogglingAi(true);
    try {
      const res = await fetch("/api/user/ai-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: newAction }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiEnabled(data.aiProcessingEnabled);
        setAiConsentAt(data.aiConsentAt);
      }
    } catch (error) {
      console.error("Failed to update AI consent:", error);
    } finally {
      setIsTogglingAi(false);
    }
  };

  const handleRestartOnboarding = async () => {
    setIsRestartingOnboarding(true);
    try {
      // Reset onboarding flag
      await fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetOnboarding: true }),
      });
      // Redirect to dashboard to show onboarding modal
      window.location.href = "/dashboard";
    } catch (error) {
      console.error("Failed to restart onboarding:", error);
      setIsRestartingOnboarding(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteAccountConfirmText !== "DELETE MY ACCOUNT") {
      setDeleteAccountError("Please type 'DELETE MY ACCOUNT' exactly to confirm");
      return;
    }

    setIsDeletingAccount(true);
    setDeleteAccountError("");

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmText: deleteAccountConfirmText }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete account");
      }

      // Sign out and redirect to home
      await signOut({ callbackUrl: "/" });
    } catch (err) {
      setDeleteAccountError(err instanceof Error ? err.message : "Something went wrong");
      setIsDeletingAccount(false);
    }
  };

  // ---- Shared token styles ----
  const ctrlStyle = {
    background: "var(--app-bg)",
    color: "var(--ink)",
    border: "1px solid var(--line-strong)",
  };
  const selectCls =
    "tabular-nums text-[13px] font-semibold rounded-[14px] pl-3 pr-8 py-2 appearance-none focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] cursor-pointer max-w-[180px] truncate";
  const inputCls =
    "w-full rounded-[14px] px-4 py-2.5 text-[14px] text-[color:var(--ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]";
  const rowCls =
    "flex items-center justify-between gap-3 py-3 min-h-[44px] border-b last:border-b-0";

  const groupLabel = (text: string) => (
    <div
      className="px-1 mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em]"
      style={{ color: "var(--ink-subtle)" }}
    >
      {text}
    </div>
  );

  const themeOptions: { value: Theme; label: string }[] = [
    { value: "light", label: tNav("themeLight") },
    { value: "dark", label: tNav("themeDark") },
    { value: "system", label: tNav("themeSystem") },
  ];

  const initial = (userName?.[0] || userEmail?.[0] || "?").toUpperCase();

  return (
    <div className="mx-auto w-full max-w-[640px]">
      {/* Pushed header */}
      <div className="relative flex items-center justify-center mb-5">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label={tCommon("back")}
          className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-[.94]"
          style={{ background: "var(--surface)", ...cardShadow }}
        >
          <ChevronLeft size={20} strokeWidth={1.8} style={{ color: "var(--ink)" }} />
        </button>
        <h1 className="text-[16px] font-semibold" style={{ color: "var(--ink)" }}>
          {t("title")}
        </h1>
        <div className="absolute right-0 h-10 w-10" />
      </div>

      <div className="flex flex-col gap-[18px]">
        {/* Profile card → workspace */}
        <motion.button
          {...sectionMotion(0)}
          type="button"
          onClick={() => router.push("/dashboard/workspace")}
          className="flex items-center gap-[14px] rounded-[20px] px-4 py-[18px] text-left transition-transform active:scale-[.99]"
          style={{ background: "var(--surface)", ...cardShadow }}
        >
          <div
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-[20px] font-bold"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold truncate" style={{ color: "var(--ink)" }}>
              {userName || userEmail || tCommon("loading")}
            </div>
            <div className="text-[11.5px] truncate" style={{ color: "var(--ink-subtle)" }}>
              {userEmail ? `${userEmail} · ` : ""}
              {workspace?.name ? `${workspace.name} ${t("workspaceSuffix")}` : ""}
            </div>
          </div>
          <ChevronRight size={18} strokeWidth={1.8} style={{ color: "var(--ink-subtle)" }} />
        </motion.button>

        {/* Account stats */}
        <motion.section {...sectionMotion(1)}>
          {groupLabel(t("accountOverview"))}
          <div className="rounded-[20px] p-4" style={{ background: "var(--surface)", ...cardShadow }}>
            {isLoading ? (
              <div className="text-[13px]" style={{ color: "var(--ink-muted)" }}>
                {tCommon("loading")}
              </div>
            ) : stats ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  { value: String(stats.totalExpenses), label: t("totalExpenses"), color: "var(--ink)" },
                  {
                    value: `${getCurrencySymbol(currency)}${stats.totalAmount.toFixed(2)}`,
                    label: t("totalSpent"),
                    color: "var(--ink)",
                  },
                  {
                    value: `${getCurrencySymbol(currency)}${stats.totalIncomeAmount.toFixed(2)}`,
                    label: t("totalIncome"),
                    color: "var(--positive)",
                  },
                  { value: String(stats.totalProjects), label: t("projects"), color: "var(--ink)" },
                ].map((tile) => (
                  <div key={tile.label} className="rounded-[14px] p-4" style={{ background: "var(--app-bg)" }}>
                    <div className="text-[20px] font-bold tabular-nums" style={{ color: tile.color }}>
                      {tile.value}
                    </div>
                    <div className="mt-0.5 text-[12px]" style={{ color: "var(--ink-subtle)" }}>
                      {tile.label}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </motion.section>

        {/* MONEY group */}
        <motion.section {...sectionMotion(2)}>
          {groupLabel(t("groupMoney"))}
          <div className="rounded-[20px] px-4 py-1.5" style={{ background: "var(--surface)", ...cardShadow }}>
            {/* Monthly budget */}
            <div className={rowCls} style={{ borderColor: "var(--line)" }}>
              <label htmlFor="budget" className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                {t("monthlyBudget")}
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-[13px]" style={{ color: "var(--ink-subtle)" }}>
                  {getCurrencySymbol(currency)}
                </span>
                <input
                  id="budget"
                  type="number"
                  value={monthlyBudget}
                  onChange={(e) => setMonthlyBudget(e.target.value)}
                  placeholder="0.00"
                  className="w-28 rounded-[14px] px-3 py-2 text-right text-[13px] font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                  style={ctrlStyle}
                />
              </div>
            </div>

            {/* Default currency */}
            <div className={rowCls} style={{ borderColor: "var(--line)" }}>
              <label className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                {t("currency")}
              </label>
              <div className="relative">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className={selectCls}
                  style={ctrlStyle}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.symbol} {c.code}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  strokeWidth={1.8}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--ink-subtle)" }}
                />
              </div>
            </div>

            {/* Currency display mode */}
            <div className={rowCls} style={{ borderColor: "var(--line)" }}>
              <label className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                {t("currencyDisplayMode")}
              </label>
              <div className="relative">
                <select
                  value={currencyDisplayMode}
                  onChange={(e) => setCurrencyDisplayMode(e.target.value)}
                  className={selectCls}
                  style={ctrlStyle}
                >
                  <option value="converted">{t("currencyModes.converted")}</option>
                  <option value="original">{t("currencyModes.original")}</option>
                  <option value="original_only">{t("currencyModes.originalOnly")}</option>
                </select>
                <ChevronDown
                  size={14}
                  strokeWidth={1.8}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--ink-subtle)" }}
                />
              </div>
            </div>

            {/* Default bank account */}
            {bankAccounts.length > 0 && (
              <div className={rowCls} style={{ borderColor: "var(--line)" }}>
                <label className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                  {t("defaultBankAccount")}
                </label>
                <div className="relative">
                  <select
                    value={defaultBankAccountId}
                    onChange={(e) => setDefaultBankAccountId(e.target.value)}
                    className={selectCls}
                    style={ctrlStyle}
                  >
                    <option value="">{t("noDefault")}</option>
                    {bankAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    strokeWidth={1.8}
                    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--ink-subtle)" }}
                  />
                </div>
              </div>
            )}
          </div>
        </motion.section>

        {/* APP group */}
        <motion.section {...sectionMotion(3)}>
          {groupLabel(t("groupApp"))}
          <div className="rounded-[20px] px-4 py-1.5" style={{ background: "var(--surface)", ...cardShadow }}>
            {/* Theme segment */}
            <div className={rowCls} style={{ borderColor: "var(--line)" }}>
              <span className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                {t("theme")}
              </span>
              <div
                className="flex gap-1 rounded-[12px] p-[3px]"
                style={{ background: "var(--app-bg)" }}
              >
                {themeOptions.map((o) => {
                  const on = theme === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setTheme(o.value)}
                      aria-pressed={on}
                      className="rounded-[9px] px-3 py-1.5 text-[11px] transition-colors duration-200"
                      style={
                        on
                          ? { background: "var(--surface)", color: "var(--ink)", fontWeight: 600, boxShadow: "var(--shadow-card)" }
                          : { color: "var(--ink-muted)", fontWeight: 500 }
                      }
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Language */}
            <div className={rowCls} style={{ borderColor: "var(--line)" }}>
              <label className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                {t("language")}
              </label>
              <div className="relative">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className={selectCls}
                  style={ctrlStyle}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  strokeWidth={1.8}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--ink-subtle)" }}
                />
              </div>
            </div>

            {/* AI categorization toggle */}
            <div className={rowCls} style={{ borderColor: "var(--line)" }}>
              <div className="min-w-0 pr-3">
                <div className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                  {tAi("title")}
                </div>
                {aiConsentAt && (
                  <div className="mt-0.5 text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>
                    {aiEnabled ? tAi("statusEnabled") : tAi("statusDisabled")}
                  </div>
                )}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={aiEnabled}
                onClick={handleToggleAi}
                disabled={isTogglingAi}
                className="relative inline-flex h-[21px] w-9 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50"
                style={{ background: aiEnabled ? "var(--accent)" : "var(--surface-3)" }}
              >
                <motion.span
                  className="absolute h-4 w-4 rounded-full bg-white shadow"
                  style={{ top: 2.5 }}
                  animate={{ left: aiEnabled ? 17 : 3 }}
                  transition={{ type: "spring", stiffness: 500, damping: 32 }}
                />
              </button>
            </div>
          </div>
          <p className="px-1 mt-2 text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>
            {tAi("toggleLabel")}
          </p>

          {/* Save settings */}
          {saveMessage && (
            <div
              className="mt-3 rounded-[14px] p-3 text-[13px]"
              style={{
                background:
                  saveMessage.type === "success"
                    ? "color-mix(in srgb, var(--positive) 10%, transparent)"
                    : "color-mix(in srgb, var(--negative) 10%, transparent)",
                color: saveMessage.type === "success" ? "var(--positive)" : "var(--negative)",
              }}
            >
              {saveMessage.text}
            </div>
          )}
          <button
            onClick={handleSaveBudget}
            disabled={isSaving}
            className="mt-3 w-full rounded-[18px] py-3 text-[14px] font-semibold transition-transform active:scale-[.99] disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {isSaving ? tCommon("loading") : t("saveSettings")}
          </button>
        </motion.section>

        {/* Recurring income (salary) */}
        <motion.section {...sectionMotion(4)}>
          <div className="rounded-[20px] p-4" style={{ background: "var(--surface)", ...cardShadow }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[15px] font-bold" style={{ color: "var(--ink)" }}>
                  {t("recurringIncome")}
                </h2>
                <p className="text-[12px]" style={{ color: "var(--ink-subtle)" }}>
                  {t("salaryDescription")}
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingSalaryId(null);
                  setSalaryName(t("salary"));
                  setSalaryAmount("");
                  setSalaryCurrency("EUR");
                  setSalaryDay("1");
                  setShowSalaryModal(true);
                }}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-transform active:scale-[.96]"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                <Plus size={16} strokeWidth={1.8} />
                {t("addSalary")}
              </button>
            </div>

            {recurringIncomes.length === 0 ? (
              <div className="py-8 text-center text-[13px]" style={{ color: "var(--ink-subtle)" }}>
                <p style={{ color: "var(--ink-muted)" }}>{t("noRecurringIncome")}</p>
                <p className="mt-1 text-[11.5px]">{t("addSalaryHint")}</p>
              </div>
            ) : (
              <div className="mt-3 space-y-2.5">
                {recurringIncomes.map((income) => (
                  <div
                    key={income.id}
                    className="flex items-center justify-between rounded-[14px] p-3.5"
                    style={{ background: "color-mix(in srgb, var(--positive) 8%, transparent)" }}
                  >
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold truncate" style={{ color: "var(--ink)" }}>
                        {income.name}
                      </div>
                      <div className="text-[12px]" style={{ color: "var(--ink-subtle)" }}>
                        {income.dayOfMonth ? t("dayOfMonth", { day: income.dayOfMonth }) : t("monthly")}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-[16px] font-bold tabular-nums" style={{ color: "var(--positive)" }}>
                          {getCurrencySymbol(income.currency || "EUR")}
                          {Number(income.amount).toFixed(2)}
                        </div>
                        {income.currency && income.currency !== "EUR" && (
                          <div className="text-[11px] tabular-nums" style={{ color: "var(--ink-subtle)" }}>
                            ~{"€"}
                            {Number(income.amountEur).toFixed(2)} EUR
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEditSalary(income)}
                          aria-label={tCommon("edit")}
                          className="flex h-9 w-9 items-center justify-center rounded-full transition-colors"
                          style={{ color: "var(--ink-muted)" }}
                        >
                          <Pencil size={16} strokeWidth={1.8} />
                        </button>
                        <button
                          onClick={() => handleDeleteSalary(income.id)}
                          aria-label={tCommon("delete")}
                          className="flex h-9 w-9 items-center justify-center rounded-full transition-colors"
                          style={{ color: "var(--negative)" }}
                        >
                          <Trash2 size={16} strokeWidth={1.8} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.section>

        {/* Extra incomes link */}
        <motion.section {...sectionMotion(5)}>
          <a
            href="/dashboard/incomes"
            className="flex items-center justify-between gap-3 rounded-[20px] p-4 transition-transform active:scale-[.99]"
            style={{ background: "var(--surface)", ...cardShadow }}
          >
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold" style={{ color: "var(--ink)" }}>
                {t("extraIncomes")}
              </h2>
              <p className="text-[12px]" style={{ color: "var(--ink-subtle)" }}>
                {t("extraIncomesDescription")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
              {t("manageIncomes")}
              <ChevronRight size={16} strokeWidth={1.8} />
            </div>
          </a>
        </motion.section>

        {/* Restart setup */}
        <motion.section {...sectionMotion(6)}>
          <div
            className="flex items-center justify-between gap-3 rounded-[20px] p-4"
            style={{ background: "var(--surface)", ...cardShadow }}
          >
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold" style={{ color: "var(--ink)" }}>
                {t("restartSetup")}
              </h2>
              <p className="text-[12px]" style={{ color: "var(--ink-subtle)" }}>
                {t("restartSetupDescription")}
              </p>
            </div>
            <button
              onClick={handleRestartOnboarding}
              disabled={isRestartingOnboarding}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-transform active:scale-[.96] disabled:opacity-50"
              style={{
                border: "1px solid var(--accent)",
                color: "var(--accent)",
                background: "var(--accent-tint)",
              }}
            >
              <RotateCcw size={16} strokeWidth={1.8} />
              {isRestartingOnboarding ? tCommon("loading") : t("restartSetupButton")}
            </button>
          </div>
        </motion.section>

        {/* iPhone Shortcuts (API tokens) — shared component, left wired */}
        <motion.section {...sectionMotion(7)}>
          <ShortcutsTokensCard />
        </motion.section>

        {/* DANGER group */}
        <motion.section {...sectionMotion(8)}>
          {groupLabel(t("dangerZone"))}
          <div
            className="rounded-[20px] p-4"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)", border: "1px solid color-mix(in srgb, var(--negative) 22%, transparent)" }}
          >
            {deleteSuccess && (
              <div
                className="mb-3 rounded-[14px] p-3 text-[13px]"
                style={{
                  background: "color-mix(in srgb, var(--positive) 10%, transparent)",
                  color: "var(--positive)",
                }}
              >
                {deleteSuccess}
              </div>
            )}

            <div
              className="flex items-center justify-between gap-3 rounded-[14px] p-3.5"
              style={{ background: "color-mix(in srgb, var(--negative) 8%, transparent)" }}
            >
              <div className="min-w-0">
                <div className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
                  {t("deleteAllExpenses")}
                </div>
                <div className="text-[12px]" style={{ color: "var(--ink-subtle)" }}>
                  {t("deleteAllExpensesCount", { count: stats?.totalExpenses || 0 })}
                </div>
              </div>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold transition-transform active:scale-[.96]"
                style={{ border: "1px solid var(--negative)", color: "var(--negative)" }}
              >
                {t("deleteAll")}
              </button>
            </div>

            <div
              className="mt-3 flex items-center justify-between gap-3 rounded-[14px] p-3.5"
              style={{ background: "color-mix(in srgb, var(--negative) 8%, transparent)" }}
            >
              <div className="min-w-0">
                <div className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
                  {t("deleteAccount")}
                </div>
                <div className="text-[12px]" style={{ color: "var(--ink-subtle)" }}>
                  {t("deleteAccountDescription")}
                </div>
              </div>
              <button
                onClick={() => setShowDeleteAccountConfirm(true)}
                className="h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold text-white transition-transform active:scale-[.96]"
                style={{ background: "var(--negative)" }}
              >
                {t("deleteAccount")}
              </button>
            </div>
          </div>
        </motion.section>

        {/* Sign out */}
        <motion.button
          {...sectionMotion(9)}
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="w-full rounded-[18px] py-[13px] text-center text-[13.5px] font-semibold transition-transform active:scale-[.99]"
          style={{
            background: "color-mix(in srgb, var(--negative) 8%, transparent)",
            color: "var(--negative)",
          }}
        >
          {tNav("signOut")}
        </motion.button>
      </div>

      {/* Salary Modal */}
      <Modal
        isOpen={showSalaryModal}
        onClose={() => setShowSalaryModal(false)}
        variant="dialog"
        size="md"
        zIndexClassName="z-50"
      >
        <ModalHeader
          showClose={false}
          className="border-b border-[var(--line)] px-6 py-4"
        >
          <h2 className="text-[16px] font-bold" style={{ color: "var(--ink)" }}>
            {editingSalaryId ? t("editRecurringIncome") : t("addRecurringIncome")}
          </h2>
        </ModalHeader>

        <ModalBody className="px-6 pb-0 pt-6">
          <div className="space-y-4">
              <div>
                <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--ink-muted)" }}>
                  {t("name")}
                </label>
                <input
                  type="text"
                  value={salaryName}
                  onChange={(e) => setSalaryName(e.target.value)}
                  placeholder={t("salaryNamePlaceholder")}
                  className={inputCls}
                  style={ctrlStyle}
                />
              </div>

              <div>
                <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--ink-muted)" }}>
                  {t("amount")}
                </label>
                <div className="flex gap-2">
                  <div className="relative">
                    <select
                      value={salaryCurrency}
                      onChange={(e) => setSalaryCurrency(e.target.value)}
                      className="h-full appearance-none rounded-[14px] pl-3 pr-8 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                      style={ctrlStyle}
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.symbol} {c.code}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      strokeWidth={1.8}
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                      style={{ color: "var(--ink-subtle)" }}
                    />
                  </div>
                  <input
                    type="number"
                    value={salaryAmount}
                    onChange={(e) => setSalaryAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 rounded-[14px] px-4 py-2.5 text-[14px] tabular-nums focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                    style={ctrlStyle}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--ink-muted)" }}>
                  {t("dayOfMonthLabel")}
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={salaryDay}
                  onChange={(e) => setSalaryDay(e.target.value)}
                  placeholder="1"
                  className={`${inputCls} tabular-nums`}
                  style={ctrlStyle}
                />
                <p className="mt-1 text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>
                  {t("dayOfMonthHint")}
                </p>
              </div>
          </div>
        </ModalBody>

        <ModalFooter className="gap-3 px-6 pb-6 pt-6 md:px-6 md:pb-6">
          <button
            onClick={() => setShowSalaryModal(false)}
            className="flex-1 rounded-[18px] py-2.5 text-[14px] font-semibold transition-transform active:scale-[.98]"
            style={{ border: "1px solid var(--line-strong)", color: "var(--ink)" }}
          >
            {tCommon("cancel")}
          </button>
          <button
            onClick={handleSaveSalary}
            disabled={isSaving || !salaryAmount}
            className="flex-1 rounded-[18px] py-2.5 text-[14px] font-semibold transition-transform active:scale-[.98] disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {isSaving ? tCommon("loading") : editingSalaryId ? tCommon("save") : t("addSalary")}
          </button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setDeleteConfirmText("");
          setDeleteError("");
        }}
        variant="dialog"
        size="md"
        zIndexClassName="z-50"
      >
        <ModalHeader
          showClose={false}
          className="border-b border-[var(--line)] px-6 py-4"
        >
          <h2 className="text-[16px] font-bold" style={{ color: "var(--negative)" }}>
            {t("deleteAllExpensesTitle")}
          </h2>
        </ModalHeader>

        <ModalBody className="px-6 pb-0 pt-6">
          <div className="space-y-4">
              <div className="text-[14px]" style={{ color: "var(--ink-muted)" }}>
                {t("deleteAllExpensesWarning", { count: stats?.totalExpenses || 0 })}
              </div>

              {deleteError && (
                <div
                  className="rounded-[14px] p-3 text-[13px]"
                  style={{ background: "color-mix(in srgb, var(--negative) 10%, transparent)", color: "var(--negative)" }}
                >
                  {deleteError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--ink-muted)" }}>
                  {t("typeDeleteAllConfirm")}
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE ALL"
                  className={inputCls}
                  style={ctrlStyle}
                />
              </div>
          </div>
        </ModalBody>

        <ModalFooter className="gap-3 px-6 pb-6 pt-4 md:px-6 md:pb-6">
          <button
            type="button"
            onClick={() => {
              setShowDeleteConfirm(false);
              setDeleteConfirmText("");
              setDeleteError("");
            }}
            className="flex-1 rounded-[18px] py-2.5 text-[14px] font-semibold transition-transform active:scale-[.98]"
            style={{ border: "1px solid var(--line-strong)", color: "var(--ink)" }}
          >
            {tCommon("cancel")}
          </button>
          <button
            onClick={handleDeleteAllExpenses}
            disabled={isDeleting || deleteConfirmText !== "DELETE ALL"}
            className="flex-1 rounded-[18px] py-2.5 text-[14px] font-semibold text-white transition-transform active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "var(--negative)" }}
          >
            {isDeleting ? tCommon("loading") : t("deleteAllExpenses")}
          </button>
        </ModalFooter>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal
        isOpen={showDeleteAccountConfirm}
        onClose={() => {
          setShowDeleteAccountConfirm(false);
          setDeleteAccountConfirmText("");
          setDeleteAccountError("");
        }}
        variant="dialog"
        size="md"
        zIndexClassName="z-50"
      >
        <ModalHeader
          showClose={false}
          className="border-b border-[var(--line)] px-6 py-4"
        >
          <h2 className="text-[16px] font-bold" style={{ color: "var(--negative)" }}>
            {t("deleteAccountTitle")}
          </h2>
        </ModalHeader>

        <ModalBody className="px-6 pb-0 pt-6">
          <div className="space-y-4">
              <div className="text-[14px]" style={{ color: "var(--ink-muted)" }}>
                {t("deleteAccountWarning")}
              </div>
              <ul className="list-inside list-disc space-y-1 text-[13px]" style={{ color: "var(--ink-muted)" }}>
                <li>{t("deleteAccountItem1")}</li>
                <li>{t("deleteAccountItem2")}</li>
                <li>{t("deleteAccountItem3")}</li>
                <li>{t("deleteAccountItem4")}</li>
                <li>{t("deleteAccountItem5")}</li>
              </ul>

              {deleteAccountError && (
                <div
                  className="rounded-[14px] p-3 text-[13px]"
                  style={{ background: "color-mix(in srgb, var(--negative) 10%, transparent)", color: "var(--negative)" }}
                >
                  {deleteAccountError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--ink-muted)" }}>
                  {t("typeDeleteAccountConfirm")}
                </label>
                <input
                  type="text"
                  value={deleteAccountConfirmText}
                  onChange={(e) => setDeleteAccountConfirmText(e.target.value)}
                  placeholder="DELETE MY ACCOUNT"
                  className={inputCls}
                  style={ctrlStyle}
                />
              </div>
          </div>
        </ModalBody>

        <ModalFooter className="gap-3 px-6 pb-6 pt-4 md:px-6 md:pb-6">
          <button
            type="button"
            onClick={() => {
              setShowDeleteAccountConfirm(false);
              setDeleteAccountConfirmText("");
              setDeleteAccountError("");
            }}
            className="flex-1 rounded-[18px] py-2.5 text-[14px] font-semibold transition-transform active:scale-[.98]"
            style={{ border: "1px solid var(--line-strong)", color: "var(--ink)" }}
          >
            {tCommon("cancel")}
          </button>
          <button
            onClick={handleDeleteAccount}
            disabled={isDeletingAccount || deleteAccountConfirmText !== "DELETE MY ACCOUNT"}
            className="flex-1 rounded-[18px] py-2.5 text-[14px] font-semibold text-white transition-transform active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "var(--negative)" }}
          >
            {isDeletingAccount ? tCommon("loading") : t("deleteAccount")}
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
