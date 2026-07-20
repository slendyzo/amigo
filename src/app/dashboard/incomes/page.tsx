"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import MoneyHubTabs from "@/components/money-hub-tabs";
import MerchantAvatar from "@/components/ui/merchant-avatar";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { formatCurrency, getCurrencySymbol as currencySymbol } from "@/lib/currencies";

type BankAccount = { id: string; name: string };

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

const CURRENCIES = [
  { value: "EUR", label: "EUR", symbol: "€" },
  { value: "USD", label: "USD", symbol: "$" },
  { value: "GBP", label: "GBP", symbol: "£" },
  { value: "BRL", label: "BRL", symbol: "R$" },
  { value: "PLN", label: "PLN", symbol: "zł" },
];

const EASE = [0.16, 1, 0.3, 1] as const;
const sectionMotion = (i: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: EASE, delay: i * 0.05 },
});
const cardShadow = { boxShadow: "var(--shadow-card)" };

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

  const [filterMonth, setFilterMonth] = useState<number>(new Date().getMonth());
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [filterType, setFilterType] = useState<string>("all");

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: "", description: "", type: "OTHER", amount: "", currency: "EUR",
    date: new Date().toISOString().split("T")[0], hasDate: true, bankAccountId: "",
  });

  useEffect(() => {
    fetchIncomes();
    fetchBankAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMonth, filterYear, filterType]);

  const fetchIncomes = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("month", filterMonth.toString());
      params.set("year", filterYear.toString());
      if (filterType !== "all") params.set("type", filterType);
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
      if (response.ok) setBankAccounts((await response.json()).bankAccounts || []);
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
      const payload = {
        name: formData.name, description: formData.description, type: formData.type,
        amount: formData.amount, currency: formData.currency,
        date: formData.hasDate ? formData.date : null, bankAccountId: formData.bankAccountId,
      };
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (response.ok) { closeModal(); fetchIncomes(); }
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
      if (response.ok) fetchIncomes();
    } catch (error) {
      console.error("Failed to delete income:", error);
    }
  };

  const openEditModal = (income: Income) => {
    setEditingId(income.id);
    setFormData({
      name: income.name, description: income.description || "", type: income.type,
      amount: income.amount.toString(), currency: income.currency || "EUR",
      date: new Date(income.date).toISOString().split("T")[0], hasDate: true,
      bankAccountId: income.bankAccount?.id || "",
    });
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({
      name: "", description: "", type: "OTHER", amount: "", currency: "EUR",
      date: new Date().toISOString().split("T")[0], hasDate: true, bankAccountId: "",
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData({
      name: "", description: "", type: "OTHER", amount: "", currency: "EUR",
      date: new Date().toISOString().split("T")[0], hasDate: true, bankAccountId: "",
    });
  };

  const getTypeLabel = (type: string) => INCOME_TYPES.find((it) => it.value === type)?.label || type;

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

  const expectedMonthly = useMemo(
    () => incomes.filter((i) => i.isRecurring).reduce((s, i) => s + Number(i.amount), 0),
    [incomes]
  );
  const extra = total - expectedMonthly;

  return (
    <div className="flex flex-col gap-4 md:max-w-[640px]" style={{ color: "var(--ink)" }}>
      <MoneyHubTabs active="income" />

      {/* Green hero card */}
      <motion.div {...sectionMotion(1)}>
        <div
          className="rounded-[20px] px-[18px] py-4"
          style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--positive) 13%, var(--surface)) 0%, color-mix(in srgb, var(--positive) 26%, var(--surface)) 100%)" }}
        >
          <div className="text-[12px] font-medium text-[#2A6A4C] dark:text-[#9ad9b6]">
            {t("receivedIn", { month: MONTHS[filterMonth] })}
          </div>
          <div className="mt-0.5 text-[28px] font-bold tracking-[-0.02em] tabular-nums text-[#1f5c40] dark:text-[#d3f3e0]">
            {formatCurrency(total, "EUR")}
          </div>
          <div className="mt-1.5 text-[11.5px] tabular-nums text-[#2A6A4C] dark:text-[#9ad9b6]">
            {t("expectedMonthly", { amount: formatCurrency(expectedMonthly, "EUR") })}
            {extra > 0.005 ? ` · ${t("extraOverExpected", { amount: formatCurrency(extra, "EUR") })}` : ""}
          </div>
        </div>
      </motion.div>

      {/* Compact filter row */}
      <motion.div {...sectionMotion(2)} className="flex items-center gap-2">
        <select
          value={filterMonth}
          onChange={(e) => setFilterMonth(parseInt(e.target.value))}
          className="min-w-0 flex-1 rounded-[12px] px-3 py-2 text-[12.5px] outline-none"
          style={{ background: "var(--surface)", color: "var(--ink)", ...cardShadow }}
        >
          {MONTHS.map((month, index) => <option key={index} value={index}>{month}</option>)}
        </select>
        <input
          type="number"
          value={filterYear}
          onChange={(e) => setFilterYear(parseInt(e.target.value))}
          className="w-[76px] flex-none rounded-[12px] px-3 py-2 text-[12.5px] tabular-nums outline-none"
          style={{ background: "var(--surface)", color: "var(--ink)", ...cardShadow }}
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="min-w-0 flex-1 rounded-[12px] px-3 py-2 text-[12.5px] outline-none"
          style={{ background: "var(--surface)", color: filterType === "all" ? "var(--ink-muted)" : "var(--ink)", ...cardShadow }}
        >
          <option value="all">{t("allTypes")}</option>
          {INCOME_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
      </motion.div>

      {/* This month label + rows */}
      <motion.div {...sectionMotion(3)}>
        <div className="mb-2 px-1 text-[11.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--ink-subtle)" }}>
          {t("thisMonthLabel")}
        </div>
        {isLoading ? (
          <div className="rounded-[20px] p-8 text-center text-[13px]" style={{ background: "var(--surface)", color: "var(--ink-muted)", ...cardShadow }}>
            {tCommon("loading")}
          </div>
        ) : incomes.length === 0 ? (
          <div className="rounded-[20px] p-8 text-center" style={{ background: "var(--surface)", ...cardShadow }}>
            <p className="text-[13px]" style={{ color: "var(--ink-muted)" }}>{t("noIncomesForPeriod")}</p>
            <button onClick={openCreateModal} className="tap-none mt-1.5 text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
              {t("addFirstIncome")}
            </button>
          </div>
        ) : (
          <div className="rounded-[20px] px-4 py-1.5" style={{ background: "var(--surface)", ...cardShadow }}>
            {incomes.map((income, idx) => (
              <div
                key={income.id}
                className="tap-none flex items-center gap-3 py-[11px]"
                style={{ borderBottom: idx < incomes.length - 1 ? "1px solid var(--line)" : "none" }}
                onClick={() => openEditModal(income)}
              >
                <MerchantAvatar name={income.name} category="income" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold">{income.name}</div>
                  <div className="flex items-center truncate text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>
                    <span className="truncate">
                      {income.isRecurring ? tExpenses("recurring") : t("oneOff")} · {formatDate(income.date)}
                      {income.type !== "OTHER" ? ` · ${getTypeLabel(income.type)}` : ""}
                    </span>
                    {income.isRecurring && (
                      <span className="ml-1.5 inline-flex flex-none items-center rounded-[6px] px-1.5 py-[1px] text-[10px] font-semibold" style={{ background: "var(--surface-2)", color: "var(--accent)" }}>
                        {t("monthlyBadge")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-[13.5px] font-semibold tabular-nums" style={{ color: "var(--positive)" }}>
                  +{currencySymbol(income.currency)}{Number(income.amount).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Add income affordance row */}
      <motion.button
        {...sectionMotion(4)}
        type="button"
        onClick={openCreateModal}
        className="tap-none flex items-center gap-3 rounded-[20px] px-4 py-3.5 text-left"
        style={{ background: "var(--surface)", border: "1.5px dashed var(--line-strong)" }}
      >
        <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[12px]" style={{ background: "var(--surface-2)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8"><path d="M12 5v14M5 12h14" /></svg>
        </div>
        <div className="flex-1">
          <div className="text-[13.5px] font-semibold">{t("addIncomeAffordance")}</div>
          <div className="text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>{t("addIncomeAffordanceHint")}</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-subtle)" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
      </motion.button>

      {/* Add/Edit Modal — bottom sheet */}
      <Modal isOpen={showModal} onClose={closeModal} variant="sheet" size="lg" flush>
            <ModalHeader title={editingId ? t("editIncome") : t("addIncome")} />

            <ModalBody className="space-y-3 pb-6 pt-2">
              {/* Name + amount card */}
              <div className="space-y-3 rounded-[18px] p-4" style={{ background: "var(--surface)", ...cardShadow }}>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t("descriptionPlaceholder")}
                  className="w-full bg-transparent text-[17px] font-medium outline-none placeholder:text-[var(--ink-subtle)]"
                  style={{ color: "var(--ink)" }}
                />
                <div className="flex items-center gap-3">
                  <div className="flex flex-1 items-baseline gap-1">
                    <span className="text-[24px] font-light" style={{ color: "var(--positive)" }}>{currencySymbol(formData.currency)}</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      placeholder="0.00"
                      className="w-full bg-transparent text-[28px] font-bold tabular-nums outline-none placeholder:text-[var(--ink-subtle)]"
                      style={{ color: "var(--ink)" }}
                    />
                  </div>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="rounded-[10px] px-3 py-1.5 text-[13px] font-medium outline-none"
                    style={{ background: "var(--surface-2)", color: "var(--ink-muted)" }}
                  >
                    {CURRENCIES.map((cur) => <option key={cur.value} value={cur.value}>{cur.value}</option>)}
                  </select>
                </div>
              </div>

              {/* Type chips */}
              <div className="rounded-[18px] p-4" style={{ background: "var(--surface)", ...cardShadow }}>
                <div className="mb-2 text-[12px] font-medium" style={{ color: "var(--ink-muted)" }}>{t("type")}</div>
                <div className="flex flex-wrap gap-2">
                  {INCOME_TYPES.map((type) => {
                    const active = formData.type === type.value;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, type: type.value })}
                        className="tap-none rounded-[14px] px-3 py-1.5 text-[12px]"
                        style={active ? { background: "var(--ink)", color: "var(--accent-fg)", fontWeight: 600 } : { background: "var(--surface-2)", color: "var(--ink-muted)", fontWeight: 500 }}
                      >
                        {type.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Date + account */}
              <div className="space-y-3 rounded-[18px] p-4" style={{ background: "var(--surface)", ...cardShadow }}>
                <div className="flex items-center justify-between">
                  <label className="text-[12.5px] font-medium" style={{ color: "var(--ink-muted)" }}>{t("date")}</label>
                  <label className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--ink-subtle)" }}>
                    <input type="checkbox" checked={formData.hasDate} onChange={(e) => setFormData({ ...formData, hasDate: e.target.checked })} className="accent-[var(--accent)]" />
                    {t("hasSpecificDate")}
                  </label>
                </div>
                {formData.hasDate ? (
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full rounded-[12px] px-3 py-2 text-[13px] outline-none"
                    style={{ background: "var(--app-bg)", color: "var(--ink)", border: "1px solid var(--line)" }}
                  />
                ) : (
                  <div className="rounded-[12px] px-3 py-2 text-[13px]" style={{ background: "var(--app-bg)", color: "var(--ink-subtle)" }}>{t("noDateRecurring")}</div>
                )}
                {bankAccounts.length > 0 && (
                  <div>
                    <label className="mb-1 block text-[12.5px] font-medium" style={{ color: "var(--ink-muted)" }}>{t("bankAccount")}</label>
                    <select
                      value={formData.bankAccountId}
                      onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })}
                      className="w-full rounded-[12px] px-3 py-2 text-[13px] outline-none"
                      style={{ background: "var(--app-bg)", color: "var(--ink)", border: "1px solid var(--line)" }}
                    >
                      <option value="">{tCommon("none")}</option>
                      {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-[12.5px] font-medium" style={{ color: "var(--ink-muted)" }}>{t("notes")}</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t("notesPlaceholder")}
                    className="w-full rounded-[12px] px-3 py-2 text-[13px] outline-none"
                    style={{ background: "var(--app-bg)", color: "var(--ink)", border: "1px solid var(--line)" }}
                  />
                </div>
              </div>

              {editingId && (
                <button
                  onClick={() => { const id = editingId; closeModal(); handleDelete(id); }}
                  className="tap-none w-full rounded-[14px] py-2.5 text-[13px] font-semibold"
                  style={{ border: "1px solid color-mix(in srgb, var(--negative) 40%, transparent)", color: "var(--negative)" }}
                >
                  {t("deleteIncome")}
                </button>
              )}
            </ModalBody>

            {/* Footer */}
            <ModalFooter className="px-5">
              <button
                onClick={handleSubmit}
                disabled={isSaving || !formData.name || !formData.amount}
                className="tap-none w-full rounded-[18px] py-3.5 text-[15px] font-semibold text-white transition-opacity disabled:opacity-60"
                style={{ background: "var(--positive)", boxShadow: "var(--shadow-fab)" }}
              >
                {isSaving ? t("saving") : editingId ? t("update") : t("addIncome")}
              </button>
            </ModalFooter>
      </Modal>
    </div>
  );
}
