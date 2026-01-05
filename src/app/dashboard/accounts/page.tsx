"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

type BankAccount = {
  id: string;
  name: string;
  bankName: string | null;
  accountType: string;
  currency: string;
  _count?: { expenses: number };
};

export default function BankAccountsPage() {
  const t = useTranslations("accounts");
  const tCommon = useTranslations("common");
  const tExpenses = useTranslations("expenses");

  const ACCOUNT_TYPES = [
    { value: "CHECKING", label: t("types.checking") },
    { value: "SAVINGS", label: t("types.savings") },
    { value: "CREDIT", label: t("types.credit") },
    { value: "CASH", label: t("types.cash") },
    { value: "INVESTMENT", label: t("types.investment") },
  ];

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountType, setAccountType] = useState("CHECKING");
  const [currency, setCurrency] = useState("EUR");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/bank-accounts");
      if (response.ok) {
        const data = await response.json();
        setAccounts(data.bankAccounts || []);
      }
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setBankName("");
    setAccountType("CHECKING");
    setCurrency("EUR");
    setEditingAccount(null);
    setError("");
  };

  const openModal = (account?: BankAccount) => {
    if (account) {
      setEditingAccount(account);
      setName(account.name);
      setBankName(account.bankName || "");
      setAccountType(account.accountType);
      setCurrency(account.currency);
    } else {
      resetForm();
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const body = {
        name,
        bankName: bankName || null,
        accountType,
        currency,
      };

      const url = editingAccount ? `/api/bank-accounts/${editingAccount.id}` : "/api/bank-accounts";
      const method = editingAccount ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save account");
      }

      setIsModalOpen(false);
      resetForm();
      fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/bank-accounts/${id}`, { method: "DELETE" });
      if (response.ok) {
        setAccounts(accounts.filter((a) => a.id !== id));
      } else {
        const data = await response.json();
        alert(data.error || "Failed to delete account");
      }
    } catch (error) {
      console.error("Failed to delete account:", error);
    }
    setDeleteId(null);
  };

  const getTypeLabel = (type: string) => {
    return ACCOUNT_TYPES.find((t) => t.value === type)?.label || type;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
          <p className="text-slate-500 text-sm mt-1">
            {t("trackExpenseSource")}
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 bg-[#0070f3] text-white px-4 py-2 rounded-lg hover:bg-[#0060df] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t("addAccount")}
        </button>
      </div>

      {/* Accounts Grid */}
      {isLoading ? (
        <div className="bg-white rounded-xl p-8 text-center text-slate-500 shadow-sm border border-slate-200">
          {tCommon("loading")}
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-slate-200">
          <div className="text-slate-400 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-slate-900 mb-1">{t("noAccountsYet")}</h3>
          <p className="text-slate-500 text-sm mb-4">{t("addToTrack")}</p>
          <button
            onClick={() => openModal()}
            className="text-[#0070f3] hover:underline text-sm font-medium"
          >
            {t("addAnAccount")}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{account.name}</h3>
                  {account.bankName && (
                    <p className="text-sm text-slate-500">{account.bankName}</p>
                  )}
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                  {getTypeLabel(account.accountType)}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">{t("currency")}</span>
                  <span className="font-medium text-slate-900">{account.currency}</span>
                </div>
                {account._count?.expenses !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">{tExpenses("title")}</span>
                    <span className="font-medium text-slate-900">{account._count.expenses}</span>
                  </div>
                )}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2">
                <button
                  onClick={() => openModal(account)}
                  className="flex-1 text-sm text-slate-600 hover:text-slate-900 py-1"
                >
                  {tCommon("edit")}
                </button>
                <button
                  onClick={() => setDeleteId(account.id)}
                  className="flex-1 text-sm text-red-500 hover:text-red-700 py-1"
                >
                  {tCommon("delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              {editingAccount ? t("editAccount") : t("newAccount")}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t("accountName")}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder={t("accountNamePlaceholder")}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t("bankName")}</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder={t("bankNamePlaceholder")}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t("type")}</label>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
                  >
                    {ACCOUNT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t("currency")}</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  {tCommon("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !name}
                  className="flex-1 px-4 py-2 rounded-lg bg-[#0070f3] text-white hover:bg-[#0060df] disabled:opacity-50"
                >
                  {isSubmitting ? t("saving") : tCommon("save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteId(null)} />
          <div className="relative bg-white rounded-xl p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{t("deleteAccountQuestion")}</h3>
            <p className="text-slate-600 text-sm mb-4">
              {t("expensesWillUnlink")}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                {tCommon("cancel")}
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600"
              >
                {tCommon("delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
