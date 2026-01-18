"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { getTodayDateString } from "@/lib/utils";
import type { BankAccount } from "@/types/models";

type AddIncomeModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function AddIncomeModal({ isOpen, onClose }: AddIncomeModalProps) {
  const router = useRouter();
  const t = useTranslations("incomes");
  const tCommon = useTranslations("common");

  const INCOME_TYPES = [
    { value: "SALARY", label: t("types.salary") },
    { value: "FREELANCE", label: t("types.freelance") },
    { value: "INVESTMENT", label: t("types.investment") },
    { value: "SALE", label: t("types.sale") },
    { value: "GIFT", label: t("types.gift") },
    { value: "REFUND", label: t("types.refund") },
    { value: "OTHER", label: t("types.other") },
  ];

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "OTHER",
    amount: "",
    currency: "EUR",
    date: getTodayDateString(),
    bankAccountId: "",
  });

  useEffect(() => {
    if (isOpen) {
      fetchBankAccounts();
    }
  }, [isOpen]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.amount) return;

    setIsLoading(true);
    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        type: formData.type,
        amount: parseFloat(formData.amount),
        currency: formData.currency,
        date: formData.date,
        bankAccountId: formData.bankAccountId || undefined,
      };

      const response = await fetch("/api/incomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        router.refresh();
        handleClose();
      }
    } catch (error) {
      console.error("Failed to add income:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: "",
      description: "",
      type: "OTHER",
      amount: "",
      currency: "EUR",
      date: getTodayDateString(),
      bankAccountId: "",
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 rounded-t-2xl md:rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">{t("addIncome")}</h2>
            <button
              onClick={handleClose}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t("name")}</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
              placeholder={t("namePlaceholder")}
              required
            />
          </div>

          {/* Amount and Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t("amount")}</label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t("currency")}</label>
              <select
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
              >
                {CURRENCY_OPTIONS.map((curr) => (
                  <option key={curr.value} value={curr.value}>
                    {curr.label} ({curr.symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t("type")}</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
            >
              {INCOME_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t("date")}</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
              required
            />
          </div>

          {/* Bank Account */}
          {bankAccounts.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t("bankAccount")}</label>
              <select
                value={formData.bankAccountId}
                onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
              >
                <option value="">{t("selectBankAccount")}</option>
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t("description")}</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3] resize-none"
              rows={3}
              placeholder={t("descriptionPlaceholder")}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
              disabled={isLoading}
            >
              {tCommon("cancel")}
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || !formData.name || !formData.amount}
            >
              {isLoading ? t("saving") : tCommon("add")}
            </button>
          </div>
        </form>

        {/* Safe area padding for mobile */}
        <div className="pb-safe" />
      </div>
    </div>
  );
}
