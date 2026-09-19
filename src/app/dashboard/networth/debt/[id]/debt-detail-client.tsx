"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, Pencil } from "lucide-react";
import EditExpenseModal from "@/components/edit-expense-modal";
import { formatCurrency } from "@/lib/currencies";
import { computeLoanBalance } from "@/lib/loan-amortization";
import type { Expense } from "@/types/models";

type Debt = {
  id: string; name: string; type: string; currency: string; startDate: string;
  termMonths: number | null; monthlyPayment: number | null; principal: number;
  interestRate: number; status: string; hasTemplate: boolean;
  realAsset: { id: string; name: string; type: string } | null;
};
type Payment = { id: string; date: string; amount: number; currency: string; status: string };
const inputClass = "mt-1 min-w-0 w-full rounded-[14px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2.5 text-base text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--accent)]";
const cardClass = "min-w-0 rounded-[20px] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]";

export default function DebtDetailClient({ debt, payments, canEdit }: {
  debt: Debt; payments: Payment[]; canEdit: boolean;
}) {
  const t = useTranslations("debt");
  const common = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [name, setName] = useState(debt.name);
  const [startDate, setStartDate] = useState(debt.startDate);
  const [monthlyPayment, setMonthlyPayment] = useState(debt.monthlyPayment?.toString() ?? "");
  const [termMonths, setTermMonths] = useState(debt.termMonths?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Expense | null>(null);
  const validPreview = startDate && Number.isFinite(new Date(startDate).getTime()) && Number(monthlyPayment) > 0;
  const projection = computeLoanBalance({ ...debt, startDate: new Date(startDate),
    monthlyPayment: Number(monthlyPayment), termMonths: termMonths ? Number(termMonths) : null,
    firstPaymentAtStart: debt.type === "INSTALLMENT" });
  const paidCount = payments.filter(p => p.status === "PAID").length;

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/liabilities/${debt.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, startDate, monthlyPayment: Number(monthlyPayment),
          ...(termMonths ? { termMonths: Number(termMonths) } : {}) }),
      });
      if (!response.ok) throw new Error(t("saveError"));
      setMessage(t("saved")); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t("saveError")); }
    finally { setBusy(false); }
  }
  async function editPayment(id: string) {
    setError(""); setBusy(true);
    try {
      const response = await fetch(`/api/expenses/${id}`);
      if (!response.ok) throw new Error(t("loadError"));
      const { expense } = await response.json();
      setEditing({ ...expense, amount: Number(expense.amount), amountEur: Number(expense.amountEur) });
    } catch { setError(t("loadError")); }
    finally { setBusy(false); }
  }

  return <div className="finance-detail mx-auto min-w-0 w-full max-w-2xl space-y-4 pb-8 text-[var(--ink)]">
    <div className="flex items-center gap-3">
      <Link href="/dashboard/networth" aria-label={t("back")} className="shrink-0 rounded-full bg-[var(--surface)] p-3 shadow-[var(--shadow-card)]"><ChevronLeft className="h-5 w-5" /></Link>
      <div className="min-w-0"><p className="text-xs text-[var(--ink-muted)]">{t("title")}</p><h1 className="break-words text-[17px] leading-snug font-semibold">{debt.name}</h1></div>
    </div>
    {debt.realAsset && <Link className="block break-words text-[13px] text-[var(--accent)] underline underline-offset-4" href={`/dashboard/networth/${debt.realAsset.type === "PROPERTY" ? "property" : "vehicle"}/${debt.realAsset.id}`}>{debt.realAsset.name}</Link>}
    <div className="finance-summary-grid">
      <div className={cardClass}><p className="text-xs text-[var(--ink-muted)]">{t("recorded")}</p><p className="finance-summary-value mt-1 font-semibold tabular-nums tracking-tight">{paidCount}{debt.termMonths ? ` / ${debt.termMonths}` : ""}</p></div>
      <div className={cardClass}><p className="text-xs text-[var(--ink-muted)]">{t("projectedBalance")}</p><p className="finance-summary-value mt-1 font-semibold tabular-nums tracking-tight">{validPreview ? formatCurrency(projection.currentBalance, debt.currency) : "—"}</p></div>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="text-sm text-primary">{message}</p>}
    <form onSubmit={save} className={cardClass}>
      <h2 className="mb-4 font-semibold">{t("schedule")}</h2>
      <fieldset disabled={!canEdit || busy} className="min-w-0 disabled:opacity-70"
      >
      <div className="finance-form-grid">
        <label className="text-sm finance-form-wide">{t("name")}<input required value={name} onChange={e => setName(e.target.value)} className={inputClass} /></label>
        <label className="text-sm">{debt.type === "INSTALLMENT" ? t("firstPayment") : t("loanStart")}<input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} className={inputClass} /></label>
        <label className="text-sm">{t("monthlyPayment", { currency: debt.currency })}<input type="number" min="0.01" step="0.01" required value={monthlyPayment} onChange={e => setMonthlyPayment(e.target.value)} className={inputClass} /></label>
        <label className="text-sm">{t("term")}<input type="number" min="1" max="1200" step="1" required={debt.termMonths != null} value={termMonths} onChange={e => setTermMonths(e.target.value)} className={inputClass} /></label>
        <p className="text-sm text-[var(--ink-muted)] finance-form-wide">{t("scheduleHint")}</p>
        {!debt.hasTemplate && <p className="text-sm text-[var(--ink-muted)] finance-form-wide">{t("noTemplate")}</p>}
        {canEdit && <button type="submit" className="min-h-11 rounded-[14px] bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--accent-fg)] finance-form-wide">{busy ? t("saving") : common("save")}</button>}
      </div>
      </fieldset>
    </form>
    <section className={cardClass}>
      <h2 className="font-semibold">{t("history")}</h2>
      <p className="mb-3 mt-1 text-sm text-[var(--ink-muted)]">{t("historyHint")}</p>
      {!payments.length && <p className="py-4 text-sm text-[var(--ink-muted)]">{t("empty")}</p>}
      <ul className="divide-y divide-border">{payments.map(payment => <li key={payment.id} className="finance-payment-row py-3">
        <div className="min-w-0 flex-1"><p className="text-sm">{new Date(`${payment.date}T12:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC" })}</p><p className="text-xs text-[var(--ink-muted)]">{payment.status === "PAID" ? t("paid") : t("pending")}</p></div>
        <span className="finance-payment-amount text-sm font-semibold tabular-nums">{formatCurrency(payment.amount, payment.currency)}</span>
        {canEdit && <button type="button" disabled={busy} onClick={() => editPayment(payment.id)} aria-label={t("editPayment", { date: payment.date })} className="shrink-0 rounded-xl p-3 hover:bg-[var(--surface-2)]"><Pencil className="h-4 w-4" /></button>}
      </li>)}</ul>
    </section>
    {editing && <EditExpenseModal isOpen expense={editing} onClose={() => setEditing(null)} onSave={() => { setEditing(null); router.refresh(); }} />}
  </div>;
}
