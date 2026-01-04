"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";

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
];

export default function SettingsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [recurringIncomes, setRecurringIncomes] = useState<RecurringIncome[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Budget form
  const [monthlyBudget, setMonthlyBudget] = useState("");
  const [currency, setCurrency] = useState("EUR");

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

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch workspace settings
      const workspaceRes = await fetch("/api/workspace");
      if (workspaceRes.ok) {
        const data = await workspaceRes.json();
        setWorkspace(data.workspace);
        setMonthlyBudget(data.workspace.monthlyBudget?.toString() || "");
        setCurrency(data.workspace.defaultCurrency || "EUR");
      }

      // Fetch expenses stats
      const expensesRes = await fetch("/api/expenses?limit=10000");
      if (expensesRes.ok) {
        const data = await expensesRes.json();
        setStats({
          totalExpenses: data.total,
          totalAmount: data.expenses.reduce(
            (sum: number, e: { amount: number }) => sum + Number(e.amount),
            0
          ),
          totalCategories: 0,
          totalProjects: 0,
          totalIncomes: 0,
          totalIncomeAmount: 0,
        });
      }

      // Fetch categories count
      const categoriesRes = await fetch("/api/categories");
      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        setStats((prev) =>
          prev ? { ...prev, totalCategories: data.categories?.length || 0 } : prev
        );
      }

      // Fetch projects count
      const projectsRes = await fetch("/api/projects");
      if (projectsRes.ok) {
        const data = await projectsRes.json();
        setStats((prev) =>
          prev ? { ...prev, totalProjects: data.projects?.length || 0 } : prev
        );
      }

      // Fetch incomes
      const incomesRes = await fetch("/api/incomes");
      if (incomesRes.ok) {
        const data = await incomesRes.json();
        setStats((prev) =>
          prev
            ? {
                ...prev,
                totalIncomes: data.count || 0,
                totalIncomeAmount: data.total || 0,
              }
            : prev
        );
        // Get recurring incomes (salary type)
        const recurring = data.incomes?.filter(
          (i: { isRecurring: boolean; type: string }) => i.isRecurring && i.type === "SALARY"
        ) || [];
        setRecurringIncomes(recurring);
      }
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
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setWorkspace(data.workspace);
        setSaveMessage({ type: "success", text: "Budget settings saved!" });
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        throw new Error("Failed to save");
      }
    } catch {
      setSaveMessage({ type: "error", text: "Failed to save settings" });
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

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">
          Manage your budget, income, and preferences
        </p>
      </div>

      {/* Account Stats */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Account Overview</h2>
        {isLoading ? (
          <div className="text-slate-500">Loading...</div>
        ) : stats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-slate-900">{stats.totalExpenses}</div>
              <div className="text-sm text-slate-500">Total Expenses</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-slate-900">
                {getCurrencySymbol(currency)}{stats.totalAmount.toFixed(2)}
              </div>
              <div className="text-sm text-slate-500">Total Spent</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">
                {getCurrencySymbol(currency)}{stats.totalIncomeAmount.toFixed(2)}
              </div>
              <div className="text-sm text-slate-500">Total Income</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-slate-900">{stats.totalProjects}</div>
              <div className="text-sm text-slate-500">Projects</div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Budget Settings */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Budget & Currency</h2>
        <div className="space-y-4">
          {/* Monthly Budget */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Monthly Budget
              </label>
              <p className="text-xs text-slate-500">
                Set your target monthly spending limit
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg text-slate-500">{getCurrencySymbol(currency)}</span>
              <input
                type="number"
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(e.target.value)}
                placeholder="0.00"
                className="w-32 rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
              />
            </div>
          </div>

          {/* Currency */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Default Currency
              </label>
              <p className="text-xs text-slate-500">
                Used for displaying totals and new entries
              </p>
            </div>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.name}
                </option>
              ))}
            </select>
          </div>

          {saveMessage && (
            <div
              className={`p-3 rounded-lg text-sm ${
                saveMessage.type === "success"
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {saveMessage.text}
            </div>
          )}

          <button
            onClick={handleSaveBudget}
            disabled={isSaving}
            className="px-4 py-2 bg-[#0070f3] text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {isSaving ? "Saving..." : "Save Budget Settings"}
          </button>
        </div>
      </div>

      {/* Recurring Income (Salary) */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Recurring Income</h2>
            <p className="text-sm text-slate-500">Set up your salary or regular income</p>
          </div>
          <button
            onClick={() => {
              setEditingSalaryId(null);
              setSalaryName("Salary");
              setSalaryAmount("");
              setSalaryCurrency("EUR");
              setSalaryDay("1");
              setShowSalaryModal(true);
            }}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Income
          </button>
        </div>

        {recurringIncomes.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>No recurring income set up</p>
            <p className="text-xs mt-1">Add your salary to track income vs expenses</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recurringIncomes.map((income) => (
              <div
                key={income.id}
                className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-100"
              >
                <div>
                  <div className="font-medium text-slate-900">{income.name}</div>
                  <div className="text-sm text-slate-500">
                    {income.dayOfMonth ? `Day ${income.dayOfMonth} of each month` : "Monthly"}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xl font-bold text-green-600">
                      {getCurrencySymbol(income.currency || "EUR")}{Number(income.amount).toFixed(2)}
                    </div>
                    {income.currency && income.currency !== "EUR" && (
                      <div className="text-xs text-slate-500">
                        ~{"\u20ac"}{Number(income.amountEur).toFixed(2)} EUR
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditSalary(income)}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteSalary(income.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-white rounded-lg"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Extra Incomes Link */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Extra Incomes</h2>
            <p className="text-sm text-slate-500">
              Track one-time income like sales, gifts, refunds, and more
            </p>
          </div>
          <a
            href="/dashboard/incomes"
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
          >
            Manage Incomes
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-red-200">
        <h2 className="text-lg font-semibold text-red-600 mb-4">Danger Zone</h2>

        {deleteSuccess && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 text-green-700 text-sm">
            {deleteSuccess}
          </div>
        )}

        <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
          <div>
            <div className="font-medium text-slate-900">Delete All Expenses</div>
            <div className="text-sm text-slate-500">
              Permanently remove all {stats?.totalExpenses || 0} expenses from your account
            </div>
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            Delete All
          </button>
        </div>

        <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg mt-4">
          <div>
            <div className="font-medium text-slate-900">Delete Account</div>
            <div className="text-sm text-slate-500">
              Permanently delete your account and all associated data
            </div>
          </div>
          <button
            onClick={() => setShowDeleteAccountConfirm(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Delete Account
          </button>
        </div>
      </div>

      {/* Salary Modal */}
      {showSalaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowSalaryModal(false)}
          />
          <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-green-50">
              <h2 className="text-lg font-semibold text-green-700">
                {editingSalaryId ? "Edit Recurring Income" : "Add Recurring Income"}
              </h2>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={salaryName}
                  onChange={(e) => setSalaryName(e.target.value)}
                  placeholder="e.g., Salary, Freelance"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Amount
                </label>
                <div className="flex gap-2">
                  <select
                    value={salaryCurrency}
                    onChange={(e) => setSalaryCurrency(e.target.value)}
                    className="w-24 rounded-lg border border-slate-300 px-2 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={salaryAmount}
                    onChange={(e) => setSalaryAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Day of Month
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={salaryDay}
                  onChange={(e) => setSalaryDay(e.target.value)}
                  placeholder="1"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-slate-500 mt-1">
                  The day you typically receive this income
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowSalaryModal(false)}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSalary}
                  disabled={isSaving || !salaryAmount}
                  className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-white font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : editingSalaryId ? "Update" : "Add Income"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setShowDeleteConfirm(false);
              setDeleteConfirmText("");
              setDeleteError("");
            }}
          />
          <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-red-50">
              <h2 className="text-lg font-semibold text-red-600">
                Delete All Expenses?
              </h2>
            </div>

            <div className="p-6 space-y-4">
              <div className="text-slate-600">
                This action <strong>cannot be undone</strong>. This will permanently delete{" "}
                <strong>{stats?.totalExpenses || 0} expenses</strong> from your account.
              </div>

              {deleteError && (
                <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">
                  {deleteError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Type <span className="font-mono bg-slate-100 px-1">DELETE ALL</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE ALL"
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText("");
                    setDeleteError("");
                  }}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAllExpenses}
                  disabled={isDeleting || deleteConfirmText !== "DELETE ALL"}
                  className="flex-1 rounded-lg bg-red-500 px-4 py-2.5 text-white font-medium hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? "Deleting..." : "Delete All Expenses"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteAccountConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setShowDeleteAccountConfirm(false);
              setDeleteAccountConfirmText("");
              setDeleteAccountError("");
            }}
          />
          <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-red-50">
              <h2 className="text-lg font-semibold text-red-600">
                Delete Your Account?
              </h2>
            </div>

            <div className="p-6 space-y-4">
              <div className="text-slate-600">
                This action <strong>cannot be undone</strong>. This will permanently delete:
              </div>
              <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                <li>Your user account</li>
                <li>All your expenses and incomes</li>
                <li>All your categories and projects</li>
                <li>All your bank accounts and import history</li>
                <li>All workspace data (if you&apos;re the only member)</li>
              </ul>

              {deleteAccountError && (
                <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">
                  {deleteAccountError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Type <span className="font-mono bg-slate-100 px-1">DELETE MY ACCOUNT</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteAccountConfirmText}
                  onChange={(e) => setDeleteAccountConfirmText(e.target.value)}
                  placeholder="DELETE MY ACCOUNT"
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteAccountConfirm(false);
                    setDeleteAccountConfirmText("");
                    setDeleteAccountError("");
                  }}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeletingAccount || deleteAccountConfirmText !== "DELETE MY ACCOUNT"}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-white font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeletingAccount ? "Deleting..." : "Delete My Account"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
