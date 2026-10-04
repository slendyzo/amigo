"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ImagePlus, ShieldCheck, Trash2, X } from "lucide-react";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { useModalData } from "@/hooks/use-modal-data";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import { CURRENCIES, getCurrencySymbol } from "@/lib/currencies";
import { localDateString, parseScreenshotText, type ScreenshotExpense } from "@/lib/screenshot-parser";

// THESIS: Review a day's purchases together, with names and money always in reach.
// OWN-WORLD: Amigo's Calm Violet, quiet separators, generous controls, existing sheet.
// STORY: Choose screenshots, correct the read expenses, save the selected rows once.
// FIRST VIEWPORT: Local reading above compact rows; one pinned batch-save action below.
// FORM: An editable list inside the incumbent mobile sheet, with inline disclosure.

type Row = Omit<ScreenshotExpense, "amount"> & {
  clientId: string; sourceId: string; sourceIndex: number; amount: string; selected: boolean; expanded: boolean;
  dateEdited: boolean; categoryId: string; bankAccountId: string | null;
  type: string; projectIds: string[]; description: string; excludeFromBudget: boolean;
};
type Source = { id: string; name: string; url: string; captureDate: string; rawText: string; failed: boolean };
type BatchPayload = { expectedWorkspaceId: string; expenses: Array<{
  clientId: string; name: string; merchant: string | null; amount: number; currency: string;
  date: string; categoryId?: string; bankAccountId: string | null; type?: string;
  projectIds: string[]; description: string; excludeFromBudget: boolean;
}> };

const EASE = [0.16, 1, 0.3, 1] as const;
const field = "w-full min-w-0 min-h-11 rounded-xl border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-base text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-60";
const quietButton = "min-h-11 rounded-xl px-3 text-sm font-medium text-[var(--ink-muted)] transition-colors duration-200 hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50";

function amountValue(value: string): number {
  const normalized = value.trim().replace(",", ".");
  return /^\d+(?:\.\d{1,2})?$/.test(normalized) ? Number(normalized) : NaN;
}
function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) >= 1900 && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function pendingKey(workspaceId: string) { return `amigo:screenshot-pending:${workspaceId}`; }
function keepPending(payload: BatchPayload | null, workspaceId: string) {
  try {
    if (payload) sessionStorage.setItem(pendingKey(workspaceId), JSON.stringify(payload));
    else sessionStorage.removeItem(pendingKey(workspaceId));
  } catch { /* Retry still keeps the original payload in memory when storage is unavailable. */ }
}

export default function ScreenshotExpensesModal({ isOpen, onClose, onExpenseCreated }: {
  isOpen: boolean; onClose: () => void;
  onExpenseCreated?: (expense: {
    id: string; name: string; date: string; type: string; amount: number; currency: string;
    amountEur: number; categoryName: string; projects: { id: string; name: string }[];
    excludeFromBudget: boolean; splitCount: number | null; splitData: string | null;
    status: string; createdAt: string;
  }) => void;
}) {
  const router = useRouter();
  const t = useTranslations("screenshotExpenses");
  const tm = useTranslations("modals");
  const locale = useLocale();
  const reducedMotion = useReducedMotion();
  const { translateCategory } = useCategoryTranslation();
  const data = useModalData(isOpen);
  const [rows, setRows] = useState<Row[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [captureDate, setCaptureDate] = useState(localDateString);
  const [processing, setProcessing] = useState<{ name: string; index: number; total: number; progress: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [retryPayload, setRetryPayload] = useState<BatchPayload | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  const urls = useRef<string[]>([]);
  const rowCount = useRef(0);
  const sourceCount = useRef(0);
  const lastPayload = useRef<BatchPayload | null>(null);
  const workspaceAtStart = useRef<string | null>(null);
  const restored = useRef(false);
  const locked = saving || !!processing || !!retryPayload;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; urls.current.forEach(URL.revokeObjectURL); };
  }, []);
  useEffect(() => {
    if (data.workspaceId && !workspaceAtStart.current) workspaceAtStart.current = data.workspaceId;
  }, [data.workspaceId]);
  useEffect(() => {
    if (!data.workspaceId || restored.current) return;
    restored.current = true;
    try {
      const raw = sessionStorage.getItem(pendingKey(data.workspaceId));
      if (!raw) return;
      const payload = JSON.parse(raw) as BatchPayload;
      if (payload.expectedWorkspaceId !== data.workspaceId || !Array.isArray(payload.expenses) || !payload.expenses.length || payload.expenses.length > 50 ||
        payload.expenses.some(row => typeof row.clientId !== "string" || typeof row.name !== "string" || !Number.isFinite(row.amount) || !CURRENCIES.includes(row.currency as typeof CURRENCIES[number]) || !validDate(row.date))) return;
      setRows(payload.expenses.map((row, sourceIndex) => ({
        ...row, amount: row.amount.toFixed(2), sourceId: "pending", sourceIndex,
        selected: true, expanded: false, dateEdited: true, dateUncertain: false,
        confidence: 100, rawText: "", time: null, categoryId: row.categoryId || "",
        type: row.type || "", description: row.description || "",
      })));
      rowCount.current = payload.expenses.length;
      setRetryPayload(payload);
      setError(t("saveUnknown"));
    } catch { /* Ignore an invalid or unavailable local draft. */ }
  }, [data.workspaceId, t]);

  const update = (id: string, patch: Partial<Row>) => {
    if (locked) return;
    setRows(current => current.map(row => row.clientId === id ? { ...row, ...patch } : row));
    setError("");
  };

  const readFiles = useCallback(async (files: File[]) => {
    if (busy.current || retryPayload || data.isLoading || !data.workspaceId) return;
    if (!validDate(captureDate)) { setError(t("invalidCaptureDate")); return; }
    if (sourceCount.current + files.length > 10) { setError(t("imageLimit")); return; }
    if (files.some(file => !["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 12 * 1024 * 1024)) {
      setError(t("invalidFile")); return;
    }
    if (!files.length) return;
    busy.current = true;
    setError("");
    try {
      const { extractScreenshotExpenses } = await import("@/lib/screenshot-ocr");
      for (const [index, file] of files.entries()) {
        if (!mounted.current) break;
        const id = crypto.randomUUID();
        const url = URL.createObjectURL(file);
        urls.current.push(url);
        sourceCount.current++;
        setProcessing({ name: file.name, index: index + 1, total: files.length, progress: 0 });
        try {
          const result = await extractScreenshotExpenses(file, captureDate, data.defaultCurrency, progress => {
            if (mounted.current) setProcessing({ name: file.name, index: index + 1, total: files.length, progress });
          });
          if (!mounted.current) break;
          setSources(current => [...current, { id, name: file.name, url, captureDate, rawText: result.rawText, failed: !result.expenses.length }]);
          const available = Math.max(0, 50 - rowCount.current);
          const additions: Row[] = result.expenses.slice(0, available).map((expense, sourceIndex) => ({
            ...expense, clientId: crypto.randomUUID(), sourceId: id, sourceIndex, amount: expense.amount.toFixed(2),
            selected: true, expanded: false, dateEdited: false, categoryId: "",
            bankAccountId: data.defaultBankAccountId, type: "", projectIds: [], description: "", excludeFromBudget: false,
          }));
          rowCount.current += additions.length;
          setRows(current => [...current, ...additions]);
          if (result.expenses.length > available) setError(t("expenseLimit"));
        } catch {
          if (!mounted.current) break;
          setSources(current => [...current, { id, name: file.name, url, captureDate, rawText: "", failed: true }]);
          setError(t("readFailed"));
        }
      }
    } catch {
      if (mounted.current) setError(t("readFailed"));
    } finally {
      busy.current = false;
      if (mounted.current) setProcessing(null);
    }
  }, [captureDate, data.defaultBankAccountId, data.defaultCurrency, data.isLoading, data.workspaceId, retryPayload, t]);

  useEffect(() => {
    if (!isOpen || locked) return;
    const paste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.items || []).filter(item => item.type.startsWith("image/")).map(item => item.getAsFile()).filter((file): file is File => !!file);
      if (files.length) { event.preventDefault(); void readFiles(files); }
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [isOpen, locked, readFiles]);

  const changeSourceDate = (id: string, date: string) => {
    setSources(current => current.map(source => source.id === id ? { ...source, captureDate: date } : source));
    if (!validDate(date)) return;
    const source = sources.find(source => source.id === id);
    if (!source) return;
    const reparsed = parseScreenshotText(source.rawText, date, data.defaultCurrency);
    setRows(current => current.map(row => {
      if (row.sourceId !== id) return row;
      const original = reparsed[row.sourceIndex];
      return original && !row.dateEdited ? { ...row, date: original.date, dateUncertain: original.dateUncertain } : row;
    }));
  };

  const selected = useMemo(() => rows.filter(row => row.selected), [rows]);
  const totals = useMemo(() => {
    const values: Record<string, number> = {};
    for (const row of selected) {
      const value = amountValue(row.amount);
      if (Number.isFinite(value)) values[row.currency] = (values[row.currency] || 0) + Math.round(value * 100);
    }
    return Object.entries(values).map(([currency, cents]) => new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100)).join(" · ");
  }, [selected, locale]);
  const duplicates = useMemo(() => {
    const result = new Set<string>();
    for (const row of rows) {
      if (rows.some(other => other.sourceId !== row.sourceId && other.clientId !== row.clientId &&
        (other.merchant || other.name).toLocaleLowerCase() === (row.merchant || row.name).toLocaleLowerCase() &&
        amountValue(other.amount) === amountValue(row.amount) && other.currency === row.currency &&
        other.date === row.date && (!other.time || !row.time || other.time === row.time))) result.add(row.clientId);
    }
    return result;
  }, [rows]);
  const valid = selected.length > 0 && selected.every(row => row.name.trim() && amountValue(row.amount) > 0 && amountValue(row.amount) <= 999999999.99 && validDate(row.date));

  const save = async () => {
    if (busy.current || !data.workspaceId || (!retryPayload && !valid)) return;
    busy.current = true;
    setSaving(true);
    setError("");
    const payload = retryPayload || { expectedWorkspaceId: data.workspaceId, expenses: selected.map(row => ({
      clientId: row.clientId, name: row.name.trim(), merchant: row.merchant?.trim() || null,
      amount: amountValue(row.amount), currency: row.currency, date: row.date,
      categoryId: row.categoryId || undefined, bankAccountId: row.bankAccountId,
      type: row.type || undefined, projectIds: row.projectIds, description: row.description,
      excludeFromBudget: row.excludeFromBudget,
    })) };
    lastPayload.current = payload;
    // Only reviewed fields are kept, never screenshot pixels or raw OCR text.
    keepPending(payload, payload.expectedWorkspaceId);
    try {
      const response = await fetch("/api/expenses/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) {
        // A definite validation rejection is editable. An ambiguous server/network
        // result keeps the original request frozen so retry cannot duplicate a batch.
        if (response.status >= 500 || retryPayload) setRetryPayload(payload);
        else { setRetryPayload(null); keepPending(null, payload.expectedWorkspaceId); }
        if (response.status === 401) setError(t("signInAgain"));
        else if (response.status === 409) setError(t("workspaceChanged"));
        else setError(t(response.status >= 500 ? "saveUnknown" : "saveFailed"));
        return;
      }
      const result = await response.json();
      keepPending(null, payload.expectedWorkspaceId);
      setRetryPayload(null);
      try {
        for (const expense of result.expenses) {
          onExpenseCreated?.({ ...expense, amount: Number(expense.amount), amountEur: Number(expense.amountEur), categoryName: expense.category?.name || "" });
        }
      } catch { /* A refresh below reconciles the list if an optimistic callback fails. */ }
      router.refresh();
      onClose();
    } catch {
      setRetryPayload(lastPayload.current);
      setError(t("saveUnknown"));
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  return <Modal isOpen={isOpen} onClose={onClose} size="lg" dismissable={!saving}>
    <ModalHeader showClose={false}>
      <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-2">
        <div><h2 className="text-xl font-semibold text-[var(--ink)]">{t("title")}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--ink-muted)]"><ShieldCheck size={14} />{t("private")}</p></div>
        <button type="button" onClick={onClose} disabled={saving} aria-label={t("close")} className={`${quietButton} flex w-11 shrink-0 items-center justify-center px-0`}><X size={18} /></button>
      </div>
    </ModalHeader>
    <ModalBody className="px-4 pb-2">
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={event => { void readFiles(Array.from(event.target.files || [])); event.target.value = ""; }} />
      {!sources.length && !processing && !rows.length && <div className="pb-4">
        <p className="mb-4 text-sm leading-relaxed text-[var(--ink-muted)]">{t("intro")}</p>
        <label className="mb-4 block text-sm text-[var(--ink-muted)]">{t("captureDate")}<input type="date" value={captureDate} disabled={locked} onChange={event => setCaptureDate(event.target.value)} className={`${field} mt-1.5`} /></label>
        <button type="button" disabled={locked || data.isLoading || !!data.error || !data.workspaceId} onClick={() => inputRef.current?.click()}
          onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void readFiles(Array.from(event.dataTransfer.files)); }}
          className="flex min-h-40 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-6 text-[var(--accent)] transition-colors duration-200 hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50">
          <ImagePlus size={28} strokeWidth={1.5} /><span className="font-semibold">{t("choose")}</span><span className="text-xs text-[var(--ink-muted)]">{data.isLoading ? t("loading") : t("pasteHint")}</span>
        </button>
        <p className="mt-3 text-xs leading-relaxed text-[var(--ink-muted)]">{t("captureHint")}</p>
      </div>}
      {!!sources.length && <div className="mb-4 space-y-2">
        {sources.map(source => <div key={source.id} className="relative flex items-center gap-3 rounded-xl bg-[var(--surface-2)] p-3">
          {/* A blob URL stays on-device; notification screenshots are never uploaded. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={source.url} alt={t("screenshotPreview")} className="h-14 w-10 shrink-0 rounded-md object-cover" />
          <div className="min-w-0 flex-1"><p className="truncate pr-8 text-xs text-[var(--ink-muted)]" title={source.name}>{source.name}</p>
            <label className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[var(--ink-muted)]">{t("captureDate")}
              <input type="date" value={source.captureDate} disabled={locked} aria-label={`${t("captureDate")} ${source.name}`} onChange={event => changeSourceDate(source.id, event.target.value)} className="min-h-11 min-w-0 max-w-full rounded-lg bg-[var(--surface)] px-2 text-base text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" /></label>
            {source.failed && <p role="status" className="mt-1 text-xs text-[var(--warning)]">{t("noExpenses")}</p>}
          </div>
          <button type="button" disabled={locked} aria-label={t("removeScreenshot")} className={`${quietButton} absolute right-0 top-0 flex w-11 items-center justify-center px-0`} onClick={() => {
            setSources(current => current.filter(item => item.id !== source.id));
            setRows(current => current.filter(row => row.sourceId !== source.id));
            rowCount.current -= rows.filter(row => row.sourceId === source.id).length;
            sourceCount.current--;
            URL.revokeObjectURL(source.url);
            urls.current = urls.current.filter(url => url !== source.url);
            setError("");
          }}><X size={16} /></button>
        </div>)}
      </div>}
      {processing && <div role="status" aria-live="polite" className="mb-4 rounded-xl bg-[var(--surface-2)] p-4">
        <p className="text-sm font-medium text-[var(--ink)]">{t("reading", { current: processing.index, total: processing.total })}</p>
        <p className="mt-1 truncate text-xs text-[var(--ink-muted)]">{processing.name}</p>
        <progress value={processing.progress} max={100} aria-label={t("readingProgress")} className="mt-3 h-1.5 w-full accent-[var(--accent)]" />
      </div>}
      {!!rows.length && <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--ink)]">{t("found", { count: rows.length })}</h3>
        <button type="button" disabled={locked} className={quietButton} onClick={() => setRows(current => current.map(row => ({ ...row, selected: selected.length !== rows.length })))}>{t(selected.length === rows.length ? "deselectAll" : "selectAll")}</button>
      </div>}
      <fieldset disabled={locked} className="min-w-0 border-0 p-0">
        <AnimatePresence initial={false}>
          {rows.map(row => <motion.div key={row.clientId} initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion ? 0 : 8 }} transition={{ duration: reducedMotion ? 0 : 0.3, ease: EASE }} className={`border-b border-[var(--line)] py-3 ${row.selected ? "" : "opacity-60"}`}>
            <div className="grid grid-cols-[28px_minmax(0,1fr)_100px] items-center gap-2">
              <label className="flex min-h-11 items-center justify-center"><input type="checkbox" checked={row.selected} onChange={event => update(row.clientId, { selected: event.target.checked })} aria-label={t("selectExpense", { name: row.name })} className="h-5 w-5 accent-[var(--accent)]" /></label>
              <input aria-label={t("name")} value={row.name} maxLength={255} onChange={event => update(row.clientId, { name: event.target.value })} placeholder={t("namePlaceholder")} className={`${field} px-2 font-medium`} />
              <div className="relative"><span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-muted)]">{getCurrencySymbol(row.currency)}</span><input aria-label={t("amount")} inputMode="decimal" value={row.amount} onChange={event => update(row.clientId, { amount: event.target.value })} className={`${field} pl-6 pr-2 text-right tabular-nums`} /></div>
            </div>
            <div className="ml-9 mt-1 flex items-center justify-between gap-1">
              <div className="min-w-0 text-xs text-[var(--ink-muted)]"><p className="truncate" title={row.merchant || undefined}>{row.merchant || t("unknownVendor")}</p><p className="mt-0.5">{validDate(row.date) ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(row.date)) : t("checkDate")}{row.time && ` · ${row.time}`}</p></div>
              <button type="button" aria-expanded={row.expanded} aria-controls={`details-${row.clientId}`} onClick={() => update(row.clientId, { expanded: !row.expanded })} className={`${quietButton} flex shrink-0 items-center gap-1 px-2`}><span>{t("more")}</span><ChevronDown size={14} className={`transition-transform duration-300 ${row.expanded ? "rotate-180" : ""}`} /></button>
            </div>
            {(row.dateUncertain || row.confidence < 65 || duplicates.has(row.clientId)) && <p className="ml-9 mt-1 text-xs leading-relaxed text-[var(--warning)]">{duplicates.has(row.clientId) ? t("duplicate") : row.dateUncertain ? t("dateUncertain") : t("checkReading")}</p>}
            {row.selected && (!row.name.trim() || !(amountValue(row.amount) > 0) || amountValue(row.amount) > 999999999.99 || !validDate(row.date)) && <p className="ml-9 mt-1 text-xs text-[var(--negative)]">{t("rowInvalid")}</p>}
            <AnimatePresence initial={false}>{row.expanded && <motion.div id={`details-${row.clientId}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.2, ease: EASE }} className="ml-9 mt-3 space-y-3 pb-1">
              <label className="block text-xs text-[var(--ink-muted)]">{t("vendor")}<input value={row.merchant || ""} maxLength={255} onChange={event => update(row.clientId, { merchant: event.target.value })} className={`${field} mt-1`} /></label>
              <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-2">
                <label className="block min-w-0 text-xs text-[var(--ink-muted)]">{t("date")}<input type="date" value={row.date} onChange={event => update(row.clientId, { date: event.target.value, dateEdited: true, dateUncertain: false })} className={`${field} mt-1 px-2`} /></label>
                <label className="block text-xs text-[var(--ink-muted)]">{t("currency")}<select value={row.currency} onChange={event => update(row.clientId, { currency: event.target.value })} className={`${field} mt-1 px-2`}>{CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</select></label>
              </div>
              <label className="block text-xs text-[var(--ink-muted)]">{tm("category")}<select value={row.categoryId} onChange={event => update(row.clientId, { categoryId: event.target.value })} className={`${field} mt-1`}><option value="">{t("automatic")}</option>{data.categories.map(category => <option key={category.id} value={category.id}>{category.parent ? `${translateCategory(category.parent.name)} · ` : ""}{translateCategory(category.name)}</option>)}</select></label>
              <label className="block text-xs text-[var(--ink-muted)]">{tm("bankAccount")}<select value={row.bankAccountId || ""} onChange={event => update(row.clientId, { bankAccountId: event.target.value || null })} className={`${field} mt-1`}><option value="">{t("noAccount")}</option>{data.bankAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
              <label className="block text-xs text-[var(--ink-muted)]">{tm("expenseType")}<select value={row.type} onChange={event => update(row.clientId, { type: event.target.value })} className={`${field} mt-1`}><option value="">{t("automatic")}</option>{[["SURVIVAL_FIXED", tm("types.fixed")], ["SURVIVAL_VARIABLE", tm("types.variable")], ["LIFESTYLE", tm("types.lifestyle")], ["PROJECT", t("projectType")]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              {!!data.projects.length && <div><p className="text-xs text-[var(--ink-muted)]">{t("projects")}</p><div className="mt-1 flex flex-wrap gap-2">{data.projects.map(project => <label key={project.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--line-strong)] px-3 text-sm text-[var(--ink)]"><input type="checkbox" checked={row.projectIds.includes(project.id)} onChange={event => update(row.clientId, { projectIds: event.target.checked ? [...row.projectIds, project.id] : row.projectIds.filter(id => id !== project.id) })} className="accent-[var(--accent)]" />{project.name}</label>)}</div></div>}
              <label className="block text-xs text-[var(--ink-muted)]">{t("note")}<textarea value={row.description} maxLength={1000} onChange={event => update(row.clientId, { description: event.target.value })} rows={2} className={`${field} mt-1 py-2`} /></label>
              <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--ink-muted)]"><input type="checkbox" checked={row.excludeFromBudget} onChange={event => update(row.clientId, { excludeFromBudget: event.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />{t("excludeFromBudget")}</label>
              <button type="button" onClick={() => { setRows(current => current.filter(item => item.clientId !== row.clientId)); rowCount.current--; }} className={`${quietButton} flex items-center gap-2 px-0 text-[var(--negative)]`}><Trash2 size={15} />{t("remove")}</button>
            </motion.div>}</AnimatePresence>
          </motion.div>)}
        </AnimatePresence>
      </fieldset>
      {!!sources.length && !processing && <button type="button" disabled={locked || sourceCount.current >= 10 || rows.length >= 50} onClick={() => inputRef.current?.click()} className={`${quietButton} mt-2 flex w-full items-center justify-center gap-2`}><ImagePlus size={16} />{t("addMore")}</button>}
      {(error || data.error) && <p role="alert" className="my-3 text-sm leading-relaxed text-[var(--negative)]">{error || t("loadFailed")}</p>}
      {!!retryPayload && <p className="my-3 text-xs leading-relaxed text-[var(--ink-muted)]">{t("retryHint")}</p>}
      {workspaceAtStart.current && data.workspaceId !== workspaceAtStart.current && <p role="alert" className="my-3 text-sm text-[var(--negative)]">{t("workspaceChanged")}</p>}
    </ModalBody>
    {(sources.length > 0 || rows.length > 0) && <ModalFooter className="flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-sm text-[var(--ink-muted)]"><span>{t("selected", { count: selected.length })}</span><span className="text-right font-semibold tabular-nums text-[var(--ink)]">{totals}</span></div>
      <button type="button" onClick={() => void save()} disabled={saving || !!processing || data.isLoading || !!data.error || !data.workspaceId || data.workspaceId !== workspaceAtStart.current || (!retryPayload && !valid)} className="min-h-12 w-full rounded-2xl bg-[var(--accent)] px-4 text-base font-semibold text-[var(--accent-fg)] transition-colors duration-200 hover:bg-[var(--accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50">{saving ? t("saving") : retryPayload ? t("retrySave") : t("addExpenses", { count: selected.length })}</button>
    </ModalFooter>}
  </Modal>;
}
