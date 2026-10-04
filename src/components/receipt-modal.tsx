"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Check, Copy, Download, FileText, Share2, X } from "lucide-react";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { initializeSplit, parseSplitData } from "@/lib/split-utils";
import { buildReceipt, receiptFilename, type ReceiptContext, type ReceiptExpense } from "@/lib/receipt-data";
import { renderReceiptImages } from "@/lib/receipt-image";
import { isPlaceholderReceiptName, normalizeReceiptPersonName } from "@/lib/receipt-person-name";

/* Private paper tickets inside Amigo's existing Calm Violet controls. Naming is
 * sequential and persistent; selection leads to one recipient's preview at a time. */
const control = "min-h-11 rounded-xl border border-[var(--line)] px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50";
const secondary = `${control} inline-flex items-center justify-center gap-2 bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)]`;
const primary = `${control} inline-flex items-center justify-center gap-2 border-transparent bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90`;

function splitRows(expense: ReceiptExpense) {
  return parseSplitData(expense.splitData) || (!expense.splitData && expense.splitCount ? initializeSplit(expense.amount, expense.splitCount) : []);
}

export default function ReceiptModal({ isOpen, onClose, expenseId, projectId, onSaved }: {
  isOpen: boolean; onClose: () => void; expenseId?: string; projectId?: string; onSaved?: () => void;
}) {
  const t = useTranslations("receipts");
  const locale = useLocale();
  const reduced = useReducedMotion();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const savedRef = useRef(onSaved);
  useEffect(() => { savedRef.current = onSaved; }, [onSaved]);
  const [context, setContext] = useState<ReceiptContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [names, setNames] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const [active, setActive] = useState("");
  const [mode, setMode] = useState<"eur" | "original">("eur");
  const [discountValues, setDiscountValues] = useState<Record<string, string>>({});
  const [extraValues, setExtraValues] = useState<Record<string, { enabled: boolean; amount: string; reason: string }>>({});
  const [images, setImages] = useState<{ jpg: Blob[]; png: Blob[]; urls: string[] } | null>(null);
  const [imagePage, setImagePage] = useState(0);
  const scope = expenseId ? `expenseId=${encodeURIComponent(expenseId)}` : `projectId=${encodeURIComponent(projectId || "")}`;

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const timer = setTimeout(() => headingRef.current?.focus(), 50);
    return () => { clearTimeout(timer); if (previous?.isConnected) previous.focus(); };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const abort = new AbortController();
    setLoading(true); setError(""); setContext(null); setPreview(false); setSelected([]); setNotice(""); setDiscountValues({}); setExtraValues({});
    fetch("/api/receipts/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new URLSearchParams(scope))), signal: abort.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error === "AMBIGUOUS_RECEIPT_PEOPLE" || result.code === "AMBIGUOUS_RECEIPT_PEOPLE" ? t("ambiguousNames") : t("loadError"));
        if (result.resolved > 0) savedRef.current?.();
        return fetch(`/api/receipts/context?${scope}`, { signal: abort.signal, cache: "no-store" });
      })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(setContext)
      .catch(e => { if (e.name !== "AbortError") setError(e.message || t("loadError")); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [isOpen, scope, reload, t]);

  const pending = context?.expenses.filter(expense => splitRows(expense).slice(1).some(person => !person.personId || !context.people.some(p => p.id === person.personId))) || [];
  const current = pending[0];
  const people = current ? splitRows(current) : [];
  useEffect(() => {
    setAssignments({}); setNames({});
    headingRef.current?.focus();
  }, [current?.id]);
  const eligible = context?.people.filter(person => context.expenses.some(expense => splitRows(expense).slice(1).some(row => row.personId === person.id))) || [];
  const baseReceiptResult = useMemo(() => {
    if (!context || !preview || !active) return { receipt: null, failed: false, validation: "invalidData" };
    try { return { receipt: buildReceipt(context, active, mode, locale), failed: false, validation: "invalidData" }; }
    catch { return { receipt: null, failed: true, validation: "invalidData" }; }
  }, [context, preview, active, mode, locale]);
  const receiptResult = useMemo(() => {
    if (!baseReceiptResult.receipt || !context) return baseReceiptResult;
    try {
      const discounts = Object.fromEntries(baseReceiptResult.receipt.totals.map(total => {
        const raw = discountValues[`${active}:${mode}:${total.currency}`] || "";
        return [total.currency, raw.trim() === "" ? 0 : Number(raw.replace(",", "."))];
      }));
      const extras = Object.fromEntries(baseReceiptResult.receipt.totals.flatMap(total => {
        const value = extraValues[`${active}:${mode}:${total.currency}`];
        return value?.enabled ? [[total.currency, { amount: Number(value.amount.replace(",", ".")), reason: value.reason }]] : [];
      }));
      return { receipt: buildReceipt(context, active, mode, locale, discounts, extras), failed: false, validation: "invalidData" };
    } catch (e) { return { receipt: null, failed: true, validation: e instanceof Error && e.message === "INVALID_RECEIPT_EXTRA" ? "invalidExtra" : "invalidDiscount" }; }
  }, [baseReceiptResult, context, active, mode, locale, discountValues, extraValues]);
  const receipt = receiptResult.receipt;

  useEffect(() => {
    setImages(null); setImagePage(0); setNotice("");
    if (!receipt) return;
    let cancelled = false;
    let urls: string[] = [];
    Promise.all([renderReceiptImages(receipt), renderReceiptImages(receipt, "image/png")])
      .then(([jpg, png]) => {
        if (cancelled) return;
        urls = jpg.map(blob => URL.createObjectURL(blob));
        setImages({ jpg, png, urls });
      }).catch(e => { if (!cancelled) setError(t(e instanceof Error && e.message === "RECEIPT_TOO_TALL" ? "tooTall" : "imageError")); });
    return () => { cancelled = true; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [receipt, t]);

  async function saveNames() {
    if (!context || !current) return;
    setBusy(true); setError("");
    try {
      const chosen: { index: number; personId: string }[] = [];
      for (let index = 1; index < people.length; index++) {
        const value = assignments[index] ?? people[index].personId ?? "new";
        if (value === "new" && !(names[index] ?? (isPlaceholderReceiptName(people[index].label) ? "" : people[index].label)).trim()) throw new Error(t("nameRequired"));
      }
      for (let index = 1; index < people.length; index++) {
        let personId = assignments[index] ?? people[index].personId ?? "";
        if (!personId || personId === "new") {
          const name = (names[index] ?? (isPlaceholderReceiptName(people[index].label) ? "" : people[index].label)).trim();
          if (!name) throw new Error(t("nameRequired"));
          let person = context.people.find(p => normalizeReceiptPersonName(p.name) === normalizeReceiptPersonName(name));
          if (!person) {
            const response = await fetch("/api/receipts/people", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
            if (!response.ok) throw new Error(t("saveError"));
            person = await response.json();
          }
          if (!person) throw new Error(t("saveError"));
          personId = person.id;
          const savedPerson = person;
          setContext(previous => previous ? { ...previous, people: [...previous.people.filter(p => p.id !== savedPerson.id), savedPerson] } : previous);
          setAssignments(previous => ({ ...previous, [index]: personId }));
        }
        chosen.push({ index, personId });
      }
      if (new Set(chosen.map(p => p.personId)).size !== chosen.length) throw new Error(t("duplicate"));
      const response = await fetch("/api/receipts/naming", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expenseId: current.id, updatedAt: current.updatedAt, assignments: chosen }) });
      if (response.status === 409) throw new Error(t("conflict"));
      if (!response.ok) throw new Error(t("saveError"));
      const result = await response.json();
      setContext(previous => previous ? { ...previous, expenses: previous.expenses.map(expense => expense.id === current.id ? result.expense : expense) } : previous);
      onSaved?.();
    } catch (e) { setError(e instanceof Error ? e.message : t("saveError")); }
    finally { setBusy(false); }
  }

  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function pdf() {
    if (!receipt) return;
    setBusy(true); setError("");
    try {
      const discounts = Object.fromEntries(receipt.totals.map(total => [total.currency, total.discount]));
      const extras = Object.fromEntries(receipt.totals.flatMap(total => total.extra ? [[total.currency, total.extra]] : []));
      const rateQuery = context?.ratesToken ? `&ratesToken=${encodeURIComponent(context.ratesToken)}` : "";
      const response = await fetch(`/api/receipts/export?${scope}&personId=${encodeURIComponent(active)}&mode=${mode}&locale=${encodeURIComponent(locale)}&discounts=${encodeURIComponent(JSON.stringify(discounts))}&extras=${encodeURIComponent(JSON.stringify(extras))}${rateQuery}`);
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.code === "INVALID_RECEIPT_RATES_TOKEN" ? t("ratesExpired") : result.code === "INVALID_RECEIPT_EXTRA" ? t("invalidExtra") : t("exportError"));
      }
      download(await response.blob(), receiptFilename(receipt, "pdf"));
    } catch (e) { setError(e instanceof Error && e.message ? e.message : t("exportError")); }
    finally { setBusy(false); }
  }
  async function copyImage() {
    if (!images) return;
    setError(""); setNotice("");
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": images.png[imagePage] })]);
      setNotice(t("copied"));
    } catch { setError(t("copyError")); }
  }
  async function shareImage() {
    if (!images || !receipt) return;
    setError("");
    const file = new File([images.jpg[imagePage]], receiptFilename(receipt, "jpg", imagePage + 1), { type: "image/jpeg" });
    if (!navigator.canShare?.({ files: [file] })) {
      download(file, file.name); setNotice(t("shareFallback")); return;
    }
    try { await navigator.share({ files: [file] }); }
    catch (e) { if ((e as Error).name !== "AbortError") setError(t("shareError")); }
  }

  return <Modal isOpen={isOpen} onClose={onClose} size="xl" dismissable={!busy}>
    <header className="flex items-start justify-between gap-4 px-5 pb-4 pt-5">
      <div><h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">{t(current ? "namePeople" : preview ? "preview" : "create")}</h2><p className="mt-1 text-sm text-[var(--ink-muted)] break-words">{context?.title || t("subtitle")}</p></div>
      <button className={secondary} onClick={onClose} disabled={busy} aria-label={t("close")}><X size={18} /></button>
    </header>
    <ModalBody>
      {error && <div role="alert" className="mb-4 rounded-xl border border-[var(--negative)] p-3 text-sm text-[var(--negative)]">{error} <button className="underline min-h-11 px-2" onClick={() => setReload(n => n + 1)} disabled={busy}>{t("reload")}</button></div>}
      {notice && <p role="status" className="mb-3 text-sm text-[var(--positive)]">{notice}</p>}
      {loading ? <div aria-label={t("loading")} className="animate-pulse space-y-4 py-4"><div className="h-5 w-2/3 rounded bg-[var(--surface-3)]" /><div className="h-40 rounded-xl bg-[var(--surface-2)]" /></div> : context && <AnimatePresence mode="wait">
        <motion.div key={current?.id || (preview ? "preview" : "select")} initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -6 }} transition={{ duration: reduced ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}>
          {current ? <div>
            <p className="text-sm text-[var(--ink-muted)] mb-4">{t("namingHint")}</p>
            <div className="flex justify-between gap-3 border-b border-[var(--line)] pb-3 mb-4"><strong className="break-words">{current.description}</strong><span className="text-xs whitespace-nowrap text-[var(--ink-muted)]">{t("remaining", { count: pending.length })}</span></div>
            <div className="space-y-5">{people.slice(1).map((person, offset) => {
              const index = offset + 1;
              const value = assignments[index] ?? person.personId ?? "new";
              const draftName = names[index] ?? (isPlaceholderReceiptName(person.label) ? "" : person.label);
              const recognized = value === "new" ? context.people.find(p => normalizeReceiptPersonName(p.name) === normalizeReceiptPersonName(draftName)) : undefined;
              return <div key={index}>
                <label htmlFor={`receipt-person-${index}`} className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {person.repayment?.paid && <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: "color-mix(in srgb, var(--positive) 14%, var(--surface))", color: "color-mix(in srgb, var(--positive) 60%, var(--ink))" }}><Check size={16} strokeWidth={2.5} aria-hidden="true" />{t("paidBadge")}</span>}
                  <span className="break-words">{context.people.find(p => p.id === value)?.name || names[index]?.trim() || t("share", { index: index + 1 })}</span>
                  <span className={person.repayment?.paid ? "line-through text-[var(--ink-muted)]" : ""}>{new Intl.NumberFormat(locale, { style: "currency", currency: current.currency }).format(person.amount)}</span>
                </label>
                <p className="mb-2 text-sm font-semibold">{t("remainingAmount", { amount: new Intl.NumberFormat(locale, { style: "currency", currency: current.currency }).format(person.repayment?.paid ? 0 : person.amount) })}</p>
                <select id={`receipt-person-${index}`} value={value} onChange={e => setAssignments(p => ({ ...p, [index]: e.target.value }))} disabled={busy || (!!person.personId && !!person.repayment?.paid)} className={`${control} w-full bg-[var(--surface)]`}>
                  <option value="new">{t("newPerson")}</option>
                  {context.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {value === "new" && <input maxLength={100} aria-label={t("personName")} placeholder={t("personName")} value={draftName} onChange={e => setNames(p => ({ ...p, [index]: e.target.value }))} disabled={busy} className={`${control} mt-2 w-full bg-[var(--surface)]`} />}
                {recognized && <p className="mt-2 text-xs font-medium text-[var(--ink-muted)]" role="status">{t("recognizedName", { name: recognized.name })}</p>}
                {person.repayment?.paid && <p className="mt-1 text-xs text-[var(--ink-muted)]">{t("paidPreserved")}</p>}
              </div>;
            })}</div>
          </div> : !preview ? <div>
            <p className="text-sm text-[var(--ink-muted)] mb-4">{t("privacy")}</p>
            {!eligible.length ? <p className="py-8 text-center text-[var(--ink-muted)]">{t("empty")}</p> : <div className="divide-y divide-[var(--line)]">{eligible.map(person => <label key={person.id} className="flex min-h-14 cursor-pointer items-center gap-3 py-3"><input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={selected.includes(person.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, person.id] : ids.filter(id => id !== person.id))} /><span className="font-medium break-words">{person.name}</span></label>)}</div>}
          </div> : <div>
            <p className="text-sm text-[var(--ink-muted)] mb-4">{t("privacy")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              <div><label htmlFor="receipt-recipient" className="text-xs text-[var(--ink-muted)]">{t("recipient")}</label><select id="receipt-recipient" value={active} onChange={e => { setActive(e.target.value); setError(""); }} className={`${control} mt-1 w-full bg-[var(--surface)] text-[var(--ink)]`}>{eligible.filter(p => selected.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div><label htmlFor="receipt-currency" className="text-xs text-[var(--ink-muted)]">{t("currency")}</label><select id="receipt-currency" value={mode} onChange={e => { setMode(e.target.value as "eur" | "original"); setError(""); }} className={`${control} mt-1 w-full bg-[var(--surface)] text-[var(--ink)]`}><option value="eur">{t("eur")}</option><option value="original">{t("original")}</option></select></div>
            </div>
            {mode === "eur" && <p className="text-xs text-[var(--ink-muted)] mb-4">{t("conversion")}</p>}
            {baseReceiptResult.receipt && <fieldset className="mb-5 border-t border-[var(--line)] pt-4">
              <legend className="px-1 text-sm font-medium">{t("discount")}</legend>
              <p className="mb-3 text-xs text-[var(--ink-muted)]">{t("discountHint")}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{baseReceiptResult.receipt.totals.map(total => {
                const key = `${active}:${mode}:${total.currency}`;
                return <div key={key}>
                  <label htmlFor={`receipt-discount-${total.currency}`} className="block text-xs text-[var(--ink-muted)] mb-1">{t("discountCurrency", { currency: total.currency })}</label>
                  <input id={`receipt-discount-${total.currency}`} type="text" inputMode="decimal" maxLength={16} placeholder="0.00" value={discountValues[key] || ""} onChange={event => { setDiscountValues(values => ({ ...values, [key]: event.target.value })); setError(""); }} className={`${control} w-full bg-[var(--surface)] text-[var(--negative)]`} aria-invalid={receiptResult.failed} aria-describedby={`receipt-discount-limit-${total.currency}`} />
                  <p id={`receipt-discount-limit-${total.currency}`} className="mt-1 text-xs text-[var(--ink-muted)]">{t("discountLimit", { amount: new Intl.NumberFormat(locale, { style: "currency", currency: total.currency }).format(total.owed) })}</p>
                </div>;
              })}</div>
            </fieldset>}
            {baseReceiptResult.receipt && <fieldset className="mb-5 border-t border-[var(--line)] pt-4">
              <legend className="px-1 text-sm font-medium">{t("extraTitle")}</legend>
              <p className="mb-3 text-xs text-[var(--ink-muted)]">{t("extraHint")}</p>
              <div className="space-y-4">{baseReceiptResult.receipt.totals.map(total => {
                const key = `${active}:${mode}:${total.currency}`;
                const value = extraValues[key] || { enabled: false, amount: "", reason: "" };
                function update(patch: Partial<typeof value>) { setExtraValues(previous => ({ ...previous, [key]: { ...value, ...patch } })); setError(""); }
                return <div key={key}>
                  <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={value.enabled} onChange={event => update({ enabled: event.target.checked })} />{t("extraEnable", { currency: total.currency })}</label>
                  {value.enabled && <div className="grid gap-3 sm:grid-cols-2">
                    <div><label htmlFor={`receipt-extra-${total.currency}`} className="mb-1 block text-xs text-[var(--ink-muted)]">{t("extraAmount", { currency: total.currency })}</label><input id={`receipt-extra-${total.currency}`} inputMode="decimal" maxLength={16} placeholder="0.00" value={value.amount} onChange={event => update({ amount: event.target.value })} className={`${control} w-full bg-[var(--surface)]`} /></div>
                    <div><label htmlFor={`receipt-reason-${total.currency}`} className="mb-1 block text-xs text-[var(--ink-muted)]">{t("extraReason")}</label><input id={`receipt-reason-${total.currency}`} maxLength={200} value={value.reason} onChange={event => update({ reason: event.target.value })} className={`${control} w-full bg-[var(--surface)]`} /></div>
                  </div>}
                </div>;
              })}</div>
            </fieldset>}
            {receiptResult.failed && <p role="alert" className="text-[var(--negative)]">{t(receiptResult.validation)}</p>}
            {images ? <div>
              {images.urls.length > 1 && <label className="block text-sm mb-3">{t("page")} <select value={imagePage} onChange={e => setImagePage(Number(e.target.value))} className={`${control} bg-[var(--surface)]`}>{images.urls.map((_, index) => <option key={index} value={index}>{index + 1} / {images.urls.length}</option>)}</select><span className="block mt-2 text-xs text-[var(--ink-muted)]">{t("pagesHint")}</span></label>}
              {/* The preview is the actual exported image, so saved output matches exactly. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={images.urls[imagePage]} alt={t("imageAlt", { name: receipt?.recipient.name || "" })} className="mx-auto w-full max-w-[380px] shadow-lg" />
              <section className="sr-only" aria-label={t("imageAlt", { name: receipt?.recipient.name || "" })}>
                {receipt?.lines.map(line => <p key={line.expenseId}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(line.date))}. {line.description}: {line.paid > 0 && line.owed === 0 ? t("paid") : `${line.owed} ${line.currency}`}</p>)}
                {receipt?.totals.filter(total => total.total > total.paid || total.extra).map(total => <p key={total.currency}>{total.discount > 0 && <>{receipt.labels.discount}: −{total.discount} {total.currency}. </>}{receipt.labels.balance}: {total.owed} {total.currency}.</p>)}
                {receipt?.totals.filter(total => total.extra).map(total => <p key={`extra-${total.currency}`}>{receipt.labels.extraPayment}: {total.extra?.amount} {total.currency}. {total.extra?.reason}</p>)}
                {receipt?.mode === "eur" && <p>{receipt.labels.conversion}</p>}
                {receipt?.exchange ? <p>{receipt.labels.equivalents}: {receipt.exchange.amounts.map(value => new Intl.NumberFormat(locale, { style: "currency", currency: value.currency }).format(value.amount)).join("; ")}. {receipt.labels.ratesAsOf}: {receipt.exchange.date} ({receipt.exchange.source}).</p> : receipt && <p>{receipt.labels.ratesUnavailable}</p>}
              </section>
            </div> : receipt && <div role="status" className="mx-auto h-72 max-w-[380px] animate-pulse bg-[var(--surface-2)] rounded-xl"><span className="sr-only">{t("loading")}</span></div>}
          </div>}
        </motion.div>
      </AnimatePresence>}
    </ModalBody>
    {!loading && context && <ModalFooter className="flex-wrap gap-2">
      {current ? <button onClick={saveNames} disabled={busy} className={`${primary} w-full`}><Check size={17} />{t(busy ? "saving" : "saveNext")}</button> : !preview ? <button disabled={!selected.length} onClick={() => { setActive(selected[0]); setPreview(true); }} className={`${primary} w-full`}>{t("previewSelected", { count: selected.length })}</button> : <>
        <button className={secondary} onClick={() => { setPreview(false); setError(""); }} aria-label={t("back")}><ArrowLeft size={18} /></button>
        <button className={secondary} onClick={pdf} disabled={!receipt || busy}><FileText size={16} />PDF</button>
        <button className={primary} onClick={() => receipt && images && download(images.jpg[imagePage], receiptFilename(receipt, "jpg", imagePage + 1))} disabled={!images || busy}><Download size={16} />JPEG</button>
        <button className={secondary} onClick={copyImage} disabled={!images || busy}><Copy size={16} />{t("copy")}</button>
        <button className={secondary} onClick={shareImage} disabled={!images || busy}><Share2 size={16} />{t("shareImage")}</button>
      </>}
    </ModalFooter>}
  </Modal>;
}
