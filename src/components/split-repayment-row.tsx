"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SplitPerson } from "@/lib/split-utils";
import type { Expense } from "@/types/models";

export function SplitRepaymentRow({ person, index, expense, onSaved }: {
  person: SplitPerson; index: number; expense: Expense; onSaved: (expense: Expense) => void;
}) {
  const t = useTranslations("expenses.repayment");
  const common = useTranslations("common");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const paid = person.repayment?.paid;

  async function save(repayment: NonNullable<SplitPerson["repayment"]>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/expenses/${expense.id}/repayments`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index, expectedSplitData: expense.splitData ?? null, repayment }),
      });
      if (!response.ok) throw new Error(t(response.status === 409 ? "conflict" : "failed"));
      const data = await response.json();
      onSaved(data.expense);
      setEditing(false);
    } catch (err) { setError(err instanceof Error ? err.message : t("failed")); }
    finally { setBusy(false); }
  }

  return <div className="mt-1.5 text-xs">
    <div className="flex flex-wrap items-center gap-2">
      <span className={paid ? "text-[var(--positive)]" : "text-[var(--ink-muted)]"}>{t(paid ? "paid" : "unpaid")}</span>
      <button type="button" disabled={busy} className="text-[var(--accent)] underline disabled:opacity-50" onClick={() => {
        setDate(person.repayment?.date || ""); setNote(person.repayment?.note || ""); setError(""); setEditing(true);
      }}>{t(paid ? "edit" : "mark")}</button>
      {paid && <button type="button" disabled={busy} className="text-[var(--ink-muted)] underline disabled:opacity-50" onClick={() => save({ paid: false })}>{t("undo")}</button>}
    </div>
    {!editing && paid && <div className="mt-1 text-[var(--ink-muted)] whitespace-pre-wrap break-words">
      {person.repayment?.date && <p>{new Date(`${person.repayment.date}T12:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC" })}</p>}
      {person.repayment?.note && <p>{person.repayment.note}</p>}
    </div>}
    {editing && <form className="mt-2 space-y-2 rounded-xl border border-[var(--line)] p-3" onSubmit={event => {
      event.preventDefault(); save({ paid: true, ...(date ? { date } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
    }}>
      <label className="block">{t("date")}<input type="date" value={date} disabled={busy} onChange={event => setDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2" /></label>
      <label className="block">{t("note")}<textarea value={note} maxLength={1000} disabled={busy} onChange={event => setNote(event.target.value)} placeholder={t("placeholder")} className="mt-1 block w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2" /></label>
      <div className="flex gap-3"><button type="submit" disabled={busy} className="rounded-lg bg-[var(--accent)] px-3 py-2 text-[var(--accent-fg)] disabled:opacity-50">{common("save")}</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>{common("cancel")}</button></div>
    </form>}
    {error && <p role="alert" className="mt-2 text-[var(--negative)]">{error}</p>}
  </div>;
}
