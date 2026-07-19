"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AmountInput } from "./ui/amount-input";
import { useModalBodyClass } from "@/hooks/use-modal-body-class";
import { CURRENCIES, getCurrencySymbol } from "@/lib/currencies";
import { parseAmount, getTodayDateString } from "@/lib/utils";
import type { BankAccount } from "@/types/models";

type AddIncomeModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const INCOME_TYPE_VALUES = [
  "SALARY",
  "FREELANCE",
  "INVESTMENT",
  "SALE",
  "GIFT",
  "REFUND",
  "OTHER",
] as const;

type IncomeType = (typeof INCOME_TYPE_VALUES)[number];

function getIncomeTypeButtonClass(isSelected: boolean): string {
  if (isSelected) {
    return "bg-[var(--ink)] text-white font-semibold";
  }
  return "bg-[var(--surface)] text-[var(--ink-muted)] border border-[var(--line)]";
}

export default function AddIncomeModal({ isOpen, onClose }: AddIncomeModalProps) {
  const router = useRouter();
  const t = useTranslations("incomes");
  const tCommon = useTranslations("common");
  const inputRef = useRef<HTMLInputElement>(null);

  useModalBodyClass(isOpen);

  // Data
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  // Form state
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [date, setDate] = useState(getTodayDateString());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [incomeType, setIncomeType] = useState<IncomeType>("OTHER");
  const [bankAccountId, setBankAccountId] = useState("");
  const [description, setDescription] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const INCOME_TYPES = INCOME_TYPE_VALUES.map((value) => ({
    value,
    label: t(`types.${value.toLowerCase()}`),
  }));

  const prevIsOpenRef = useRef(false);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Fetch bank accounts
  useEffect(() => {
    if (isOpen) {
      fetch("/api/bank-accounts")
        .then((res) => res.ok ? res.json() : { bankAccounts: [] })
        .then((data) => setBankAccounts(data.bankAccounts || []))
        .catch(() => {});
    }
  }, [isOpen]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setName("");
      setAmount("");
      setCurrency("EUR");
      setDate(getTodayDateString());
      setShowDatePicker(false);
      setIncomeType("OTHER");
      setBankAccountId("");
      setDescription("");
      setShowDetails(false);
      setShowNotes(false);
      setError("");
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const parsedAmount = parseAmount(amount);

      if (isNaN(parsedAmount)) {
        setError("Invalid amount");
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/incomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          amount: parsedAmount,
          currency,
          type: incomeType,
          date,
          bankAccountId: bankAccountId || undefined,
          description: description || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add income");
      }

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const isToday = date === getTodayDateString();

  // Derive display values for collapsed details card
  const typeLabel = t(`types.${incomeType.toLowerCase()}`);
  const selectedAccount = bankAccounts.find((a) => a.id === bankAccountId);
  const accountLabel = selectedAccount ? selectedAccount.name : t("none");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: "rgba(23,22,31,.45)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <form
        onSubmit={handleSubmit}
        className="relative w-full md:max-w-md md:mx-4 rounded-t-[28px] md:rounded-[28px] overflow-hidden max-h-[90vh] flex flex-col"
        style={{ background: "var(--app-bg)", boxShadow: "var(--shadow-pop)" }}
      >
        {/* Drag handle (mobile) + Header */}
        <div className="flex-shrink-0">
          <div className="flex justify-center pt-2.5 pb-0 md:hidden">
            <div className="rounded-full" style={{ width: 40, height: 4, background: "rgba(23,22,31,.15)" }} />
          </div>
          <div className="px-4 md:px-5 py-2 md:py-3 flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-[var(--ink)]">
              {t("addIncome")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--ink-subtle)] active:text-[var(--ink)] md:hover:text-[var(--ink)] tap-none"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body - Scrollable cards */}
        <div className="px-3 md:px-4 pb-3 space-y-2.5 overflow-y-auto scroll-touch flex-1">
          {error && (
            <div className="p-3 rounded-[14px] text-sm" style={{ background: "rgba(214,69,80,.1)", color: "var(--negative)" }}>
              {error}
            </div>
          )}

          {/* CARD 1: Essentials (Name + Amount + Date) */}
          <div className="rounded-[18px] border border-[var(--line)] p-4 space-y-3" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
            {/* Name */}
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("whatDidYouReceivePlaceholder")}
              required
              className="w-full text-[17px] font-medium text-[var(--ink)] placeholder-[var(--ink-subtle)] bg-transparent outline-none"
            />

            {/* Amount + Currency */}
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-baseline gap-1">
                <span className="text-[var(--positive)] text-2xl font-light">{getCurrencySymbol(currency)}</span>
                <AmountInput
                  value={amount}
                  onChange={setAmount}
                  currency={currency}
                  required
                  hideCurrencySymbol
                  className="flex-1"
                  inputClassName="!border-0 !ring-0 !shadow-none !py-0 text-[28px] font-bold tabular-nums !text-[var(--ink)] !placeholder-[var(--ink-subtle)]"
                />
              </div>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="px-3 py-1.5 rounded-[14px] text-sm font-medium text-[var(--ink-muted)] border-0 outline-none cursor-pointer"
                style={{ background: "var(--surface-2)" }}
              >
                {CURRENCIES.map((curr) => (
                  <option key={curr} value={curr}>
                    {curr}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div className="flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-[var(--ink-subtle)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-[var(--ink-muted)]">
                {isToday ? t("today") : new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
              </span>
              <button
                type="button"
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="text-[var(--accent)] text-xs"
              >
                {t("change")}
              </button>
            </div>

            {showDatePicker && (
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-[14px] border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                style={{ background: "var(--surface)" }}
              />
            )}
          </div>

          {/* CARD 2: Details (collapsed/expanded) */}
          {showDetails ? (
            <div className="rounded-[18px] border border-[var(--line-strong)] p-4 space-y-4" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--ink)]">{tCommon("details")}</span>
                <button
                  type="button"
                  onClick={() => setShowDetails(false)}
                  className="p-1"
                >
                  <svg className="w-4 h-4 text-[var(--ink-subtle)] rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Income Type */}
              <div>
                <label className="text-xs font-medium text-[var(--ink-muted)] mb-1.5 block">{t("type")}</label>
                <div className="flex flex-wrap gap-2">
                  {INCOME_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setIncomeType(type.value)}
                      className={`px-3 py-1.5 text-xs rounded-[14px] font-medium transition-colors ${getIncomeTypeButtonClass(incomeType === type.value)}`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bank Account */}
              {bankAccounts.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-[var(--ink-muted)] mb-1 block">{t("bankAccount")}</label>
                  <select
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                    className="w-full rounded-[14px] border border-[var(--line)] px-3 py-2.5 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                    style={{ background: "var(--surface)" }}
                  >
                    <option value="">{t("none")}</option>
                    {bankAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : (
            /* Collapsed details card */
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="w-full rounded-[18px] border border-[var(--line)] px-4 py-3 text-left"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--ink-subtle)]">{tCommon("details")}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] px-2 py-0.5 rounded-md font-medium" style={{ background: "#E7F5EE", color: "var(--positive)" }}>{typeLabel}</span>
                  {bankAccounts.length > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-md font-medium" style={{ background: "var(--surface-2)", color: "var(--accent)" }}>{accountLabel}</span>
                  )}
                  <svg className="w-4 h-4 text-[var(--ink-subtle)] ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </button>
          )}

          {/* CARD 3: Notes */}
          {showNotes ? (
            <div className="rounded-[18px] border border-[var(--line)] p-4" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <svg className="w-[18px] h-[18px] text-[var(--ink-subtle)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="text-xs font-medium text-[var(--ink-muted)]">{t("addNote")}</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setDescription(""); setShowNotes(false); }}
                  className="p-1 text-[var(--ink-subtle)] hover:text-[var(--ink)]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("notesPlaceholder")}
                rows={2}
                maxLength={1000}
                autoFocus
                className="w-full text-sm text-[var(--ink)] placeholder-[var(--ink-subtle)] rounded-[14px] p-2.5 border border-[var(--line)] outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent resize-none"
                style={{ background: "var(--surface-2)" }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="w-full rounded-[18px] border border-[var(--line)] px-4 py-3 text-left"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <svg className="w-[18px] h-[18px] text-[var(--ink-subtle)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="text-sm text-[var(--ink-subtle)]">{t("addNote")}</span>
                </div>
                <svg className="w-4 h-4 text-[var(--ink-subtle)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-3 md:px-4 py-3 md:py-4 border-t border-[var(--line)] pb-safe flex gap-3" style={{ background: "var(--surface)" }}>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[14px] border border-[var(--line-strong)] px-4 py-3 md:py-2.5 text-[var(--ink-muted)] font-medium active:bg-[var(--surface-2)] md:hover:bg-[var(--surface-2)] transition-colors tap-none"
          >
            {tCommon("cancel")}
          </button>
          <button
            type="submit"
            disabled={isLoading || !name || !amount}
            className="flex-1 rounded-[18px] px-4 py-3 md:py-2.5 text-white text-[15px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed tap-none"
            style={{ background: "var(--positive)", boxShadow: "0 8px 20px rgba(27,158,99,.30)" }}
          >
            {isLoading ? t("adding") : tCommon("add")}
          </button>
        </div>
      </form>
    </div>
  );
}
