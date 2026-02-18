"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

type BankAccount = {
  id: string;
  name: string;
};

type Income = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  amount: number;
  currency: string;
  date: string;
  isRecurring: boolean;
  bankAccount: BankAccount | null;
};

const INCOME_TYPE_COLORS: Record<string, string> = {
  SALARY: "bg-green-100 text-green-800",
  FREELANCE: "bg-blue-100 text-blue-800",
  INVESTMENT: "bg-purple-100 text-purple-800",
  SALE: "bg-amber-100 text-amber-800",
  GIFT: "bg-pink-100 text-pink-800",
  REFUND: "bg-cyan-100 text-cyan-800",
  OTHER: "bg-slate-100 text-slate-800",
};

const CURRENCIES = [
  { value: "EUR", label: "EUR", symbol: "€" },
  { value: "USD", label: "USD", symbol: "$" },
  { value: "GBP", label: "GBP", symbol: "£" },
  { value: "BRL", label: "BRL", symbol: "R$" },
  { value: "PLN", label: "PLN", symbol: "zł" },
];

export default function IncomesPage() {
  const t = useTranslations("incomes");
  const tTime = useTranslations("time");
  const tCommon = useTranslations("common");
  const tExpenses = useTranslations("expenses");

  const MONTHS = [
    tTime("months.january"), tTime("months.february"), tTime("months.march"),
    tTime("months.april"), tTime("months.may"), tTime("months.june"),
    tTime("months.july"), tTime("months.august"), tTime("months.september"),
    tTime("months.october"), tTime("months.november"), tTime("months.december")
  ];

  const INCOME_TYPES = [
    { value: "SALARY", label: t("types.salary") },
    { value: "FREELANCE", label: t("types.freelance") },
    { value: "INVESTMENT", label: t("types.investment") },
    { value: "SALE", label: t("types.sale") },
    { value: "GIFT", label: t("types.gift") },
    { value: "REFUND", label: t("types.refund") },
    { value: "OTHER", label: t("types.other") },
  ];

  const [incomes, setIncomes] = useState<Income[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Filters
  const [filterMonth, setFilterMonth] = useState<number>(new Date().getMonth());
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [filterType, setFilterType] = useState<string>("all");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "OTHER",
    amount: "",
    currency: "EUR",
    date: new Date().toISOString().split("T")[0],
    hasDate: true,
    bankAccountId: "",
  });

  useEffect(() => {
    fetchIncomes();
    fetchBankAccounts();
  }, [filterMonth, filterYear, filterType]);

  const fetchIncomes = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("month", filterMonth.toString());
      params.set("year", filterYear.toString());
      if (filterType !== "all") {
        params.set("type", filterType);
      }

      const response = await fetch(`/api/incomes?${params}`);
      if (response.ok) {
        const data = await response.json();
        setIncomes(data.incomes || []);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error("Failed to fetch incomes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBankAccounts = async () => {
    try {
      const response = await fetch("/api/bank-accounts");
      if (response.ok) {
        const data = await response.json();
        setBankAccounts(data.bankAccounts || []);
      }
    } catch (error) {
      console.error("Failed to fetch bank accounts:", error);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.amount) return;

    setIsSaving(true);
    try {
      const method = editingId ? "PUT" : "POST";
      const url = editingId ? `/api/incomes/${editingId}` : "/api/incomes";

      // Build payload, only include date if hasDate is true
      const payload = {
        name: formData.name,
        description: formData.description,
        type: formData.type,
        amount: formData.amount,
        currency: formData.currency,
        date: formData.hasDate ? formData.date : null,
        bankAccountId: formData.bankAccountId,
      };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        closeModal();
        fetchIncomes();
      }
    } catch (error) {
      console.error("Failed to save income:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("deleteIncomeConfirm"))) return;

    try {
      const response = await fetch(`/api/incomes/${id}`, { method: "DELETE" });
      if (response.ok) {
        fetchIncomes();
      }
    } catch (error) {
      console.error("Failed to delete income:", error);
    }
  };

  const openEditModal = (income: Income) => {
    setEditingId(income.id);
    setFormData({
      name: income.name,
      description: income.description || "",
      type: income.type,
      amount: income.amount.toString(),
      currency: income.currency || "EUR",
      date: new Date(income.date).toISOString().split("T")[0],
      hasDate: true, // Existing incomes always have a date
      bankAccountId: income.bankAccount?.id || "",
    });
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({
      name: "",
      description: "",
      type: "OTHER",
      amount: "",
      currency: "EUR",
      date: new Date().toISOString().split("T")[0],
      hasDate: true,
      bankAccountId: "",
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData({
      name: "",
      description: "",
      type: "OTHER",
      amount: "",
      currency: "EUR",
      date: new Date().toISOString().split("T")[0],
      hasDate: true,
      bankAccountId: "",
    });
  };

  const getTypeStyle = (type: string) => {
    return INCOME_TYPE_COLORS[type] || "bg-slate-100 text-slate-800";
  };

  const getTypeLabel = (type: string) => {
    return INCOME_TYPES.find((it) => it.value === type)?.label || type;
  };

  const getCurrencySymbol = (currency: string) => {
    return CURRENCIES.find((c) => c.value === currency)?.symbol || "€";
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t("trackIncomeSources")}
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t("addIncome")}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2">
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(parseInt(e.target.value))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
          >
            {MONTHS.map((month, index) => (
              <option key={index} value={index}>{month}</option>
            ))}
          </select>
          <input
            type="number"
            value={filterYear}
            onChange={(e) => setFilterYear(parseInt(e.target.value))}
            className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
          />
        </div>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
        >
          <option value="all">{t("allTypes")}</option>
          {INCOME_TYPES.map((type) => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>

        <div className="ml-auto text-lg font-bold text-green-600">
          {t("total")}: €{total.toFixed(2)}
        </div>
      </div>

      {/* Incomes List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">{tCommon("loading")}</div>
        ) : incomes.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <svg className="w-12 h-12 mx-auto mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>{t("noIncomesForPeriod")}</p>
            <button
              onClick={openCreateModal}
              className="mt-4 text-green-600 hover:text-green-700 font-medium"
            >
              {t("addFirstIncome")}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {incomes.map((income) => (
              <div key={income.id} className="p-4 flex items-center gap-4 hover:bg-slate-50">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{income.name}</span>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getTypeStyle(income.type)}`}>
                      {getTypeLabel(income.type)}
                    </span>
                    {income.isRecurring && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
                        {tExpenses("recurring")}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-500">
                    {formatDate(income.date)}
                    {income.bankAccount && ` • ${income.bankAccount.name}`}
                    {income.description && ` • ${income.description}`}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-lg font-bold text-green-600">
                    +{getCurrencySymbol(income.currency)}{Number(income.amount).toFixed(2)}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(income)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(income.id)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeModal}
          />
          <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-green-50">
              <h2 className="text-lg font-semibold text-green-700">
                {editingId ? t("editIncome") : t("addIncome")}
              </h2>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t("description")}
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t("descriptionPlaceholder")}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t("type")}
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {INCOME_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t("amount")}
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={formData.currency}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                      className="w-24 rounded-lg border border-slate-300 px-2 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      {CURRENCIES.map((cur) => (
                        <option key={cur.value} value={cur.value}>{cur.symbol} {cur.label}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      placeholder="0.00"
                      className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-slate-700">
                      {t("date")}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.hasDate}
                        onChange={(e) => setFormData({ ...formData, hasDate: e.target.checked })}
                        className="rounded border-slate-300 text-green-600 focus:ring-green-500"
                      />
                      {t("hasSpecificDate")}
                    </label>
                  </div>
                  {formData.hasDate ? (
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  ) : (
                    <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-slate-400">
                      {t("noDateRecurring")}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t("bankAccount")} <span className="text-slate-400">({tCommon("optional")})</span>
                  </label>
                  <select
                    value={formData.bankAccountId}
                    onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">{tCommon("none")}</option>
                    {bankAccounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t("notes")} <span className="text-slate-400">({tCommon("optional")})</span>
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t("notesPlaceholder")}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeModal}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
                >
                  {tCommon("cancel")}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSaving || !formData.name || !formData.amount}
                  className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-white font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {isSaving ? t("saving") : editingId ? t("update") : t("addIncome")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
