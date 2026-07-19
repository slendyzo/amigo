"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronLeft, Plus, ChevronRight } from "lucide-react";

type BankAccount = {
  id: string;
  name: string;
  currency: string;
  _count?: { expenses: number };
};

// Framer-motion entrance per the codebase pattern: fade + rise, 0.05s stagger
const EASE = [0.16, 1, 0.3, 1] as const;
const sectionMotion = (i: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: EASE, delay: i * 0.05 },
});

const cardShadow = { boxShadow: "var(--shadow-card)" };

// Decorative masked number from the account id (there is no card-number field)
const maskedNumber = (id: string) => {
  const last4 = id.length >= 4 ? id.slice(-4).toUpperCase() : "••••";
  return `•••• •••• •••• ${last4}`;
};

export default function BankAccountsPage() {
  const t = useTranslations("accounts");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
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
    setCurrency("EUR");
    setEditingAccount(null);
    setError("");
  };

  const openModal = (account?: BankAccount) => {
    if (account) {
      setEditingAccount(account);
      setName(account.name);
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

  const featured = accounts[0];
  const others = accounts.slice(1);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      {/* Pushed-page header */}
      <motion.div {...sectionMotion(0)} className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          aria-label={tCommon("back")}
          className="flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-95"
          style={{ background: "var(--surface)", ...cardShadow }}
        >
          <ChevronLeft size={20} strokeWidth={1.8} style={{ color: "var(--ink)" }} />
        </button>
        <h1 className="text-[16px] font-semibold" style={{ color: "var(--ink)" }}>
          {t("title")}
        </h1>
        <button
          onClick={() => openModal()}
          aria-label={t("addAccount")}
          className="flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-95"
          style={{ background: "var(--surface)", ...cardShadow }}
        >
          <Plus size={20} strokeWidth={1.8} style={{ color: "var(--ink)" }} />
        </button>
      </motion.div>

      {isLoading ? (
        <div
          className="rounded-[20px] p-8 text-center text-[13px]"
          style={{ background: "var(--surface)", color: "var(--ink-muted)", ...cardShadow }}
        >
          {tCommon("loading")}
        </div>
      ) : accounts.length === 0 ? (
        <motion.div
          {...sectionMotion(1)}
          className="rounded-[20px] p-8 text-center"
          style={{ background: "var(--surface)", ...cardShadow }}
        >
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[14px]"
            style={{ background: "var(--surface-2)", color: "var(--accent)" }}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <h3 className="mb-1 text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
            {t("noAccountsYet")}
          </h3>
          <p className="mb-4 text-[13px]" style={{ color: "var(--ink-muted)" }}>
            {t("addToTrack")}
          </p>
          <button
            onClick={() => openModal()}
            className="text-[13px] font-semibold"
            style={{ color: "var(--accent)" }}
          >
            {t("addAnAccount")}
          </button>
        </motion.div>
      ) : (
        <>
          {/* Featured (default) account — accent-gradient card */}
          <motion.div
            {...sectionMotion(1)}
            onClick={() => openModal(featured)}
            className="cursor-pointer rounded-[24px] px-[22px] py-5 text-white transition-transform active:scale-[.98]"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-soft))", boxShadow: "var(--shadow-fab)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[13px]" style={{ opacity: 0.8 }}>
                {featured.name}
              </span>
              <span
                className="rounded-[12px] px-[9px] py-[3px] text-[10.5px] font-semibold"
                style={{ background: "rgba(255,255,255,.2)" }}
              >
                {t("defaultBadge")}
              </span>
            </div>
            <div className="mt-[18px] text-[16px] font-semibold tabular-nums" style={{ letterSpacing: "0.12em" }}>
              {maskedNumber(featured.id)}
            </div>
            <div className="mt-4 flex items-center justify-between text-[11.5px]" style={{ opacity: 0.8 }}>
              <span>{t("types.checking")} · {featured.currency}</span>
              <span>{t("expensesLinked", { count: featured._count?.expenses ?? 0 })}</span>
            </div>
          </motion.div>

          {/* Other accounts — rows inside a surface card */}
          {others.length > 0 && (
            <motion.div
              {...sectionMotion(2)}
              className="rounded-[20px] px-4 py-1.5"
              style={{ background: "var(--surface)", ...cardShadow }}
            >
              {others.map((account, idx) => (
                <button
                  key={account.id}
                  onClick={() => openModal(account)}
                  className="flex w-full items-center gap-3 py-3 text-left transition-opacity active:opacity-70"
                  style={idx > 0 ? { borderTop: "1px solid var(--line)" } : undefined}
                >
                  <span
                    className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[12px] text-[13px] font-bold"
                    style={{ background: "var(--surface-2)", color: "var(--accent)" }}
                  >
                    {account.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold" style={{ color: "var(--ink)" }}>
                      {account.name}
                    </span>
                    <span className="block text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>
                      {account.currency} · {t("expensesCount", { count: account._count?.expenses ?? 0 })}
                    </span>
                  </span>
                  <ChevronRight size={18} strokeWidth={1.8} style={{ color: "var(--ink-subtle)" }} />
                </button>
              ))}
            </motion.div>
          )}

          {/* Add account — dashed affordance */}
          <motion.button
            {...sectionMotion(3)}
            onClick={() => openModal()}
            className="rounded-[20px] p-4 text-center text-[13px] font-semibold transition-opacity active:opacity-70"
            style={{ border: "1.5px dashed var(--accent-faint)", color: "var(--accent)" }}
          >
            + {t("addAccount")}
          </motion.button>
        </>
      )}

      {/* Add / Edit modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(23,22,31,.45)" }}
            onClick={() => setIsModalOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="relative mx-4 w-full max-w-md rounded-[24px] p-6"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow-pop)" }}
          >
            <h2 className="mb-4 text-[17px] font-semibold" style={{ color: "var(--ink)" }}>
              {editingAccount ? t("editAccount") : t("newAccount")}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div
                  className="rounded-[14px] p-3 text-[13px]"
                  style={{ background: "color-mix(in srgb, var(--negative) 12%, transparent)", color: "var(--negative)" }}
                >
                  {error}
                </div>
              )}
              <div>
                <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--ink-muted)" }}>
                  {t("accountName")}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder={t("accountNamePlaceholder")}
                  className="w-full rounded-[14px] px-4 py-2.5 text-[14px] outline-none focus:ring-2"
                  style={{ background: "var(--surface)", border: "1px solid var(--line-strong)", color: "var(--ink)", ["--tw-ring-color" as string]: "var(--accent)" }}
                />
              </div>
              <div>
                <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--ink-muted)" }}>
                  {t("currency")}
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-[14px] px-4 py-2.5 text-[14px] outline-none focus:ring-2"
                  style={{ background: "var(--surface)", border: "1px solid var(--line-strong)", color: "var(--ink)", ["--tw-ring-color" as string]: "var(--accent)" }}
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 rounded-[18px] px-4 py-2.5 text-[14px] font-medium transition-opacity active:opacity-70"
                  style={{ border: "1px solid var(--line-strong)", color: "var(--ink)" }}
                >
                  {tCommon("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !name}
                  className="flex-1 rounded-[18px] px-4 py-2.5 text-[14px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                >
                  {isSubmitting ? t("saving") : tCommon("save")}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(23,22,31,.45)" }}
            onClick={() => setDeleteId(null)}
          />
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="relative mx-4 w-full max-w-sm rounded-[24px] p-6"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow-pop)" }}
          >
            <h3 className="mb-2 text-[17px] font-semibold" style={{ color: "var(--ink)" }}>
              {t("deleteAccountQuestion")}
            </h3>
            <p className="mb-4 text-[13px]" style={{ color: "var(--ink-muted)" }}>
              {t("expensesWillUnlink")}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 rounded-[18px] px-4 py-2.5 text-[14px] font-medium transition-opacity active:opacity-70"
                style={{ border: "1px solid var(--line-strong)", color: "var(--ink)" }}
              >
                {tCommon("cancel")}
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="flex-1 rounded-[18px] px-4 py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: "var(--negative)" }}
              >
                {tCommon("delete")}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
