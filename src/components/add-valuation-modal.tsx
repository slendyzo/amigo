"use client";

// Modal for the "Add valuation" CTA on RWA detail pages. Lets the user log
// an independent appraisal, insurance value, or offer received. Persists
// as a manual ValuationHistory row → diamond dot on the chart.

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

export type AddValuationModalProps = {
  assetId: string;
  defaultCurrency?: string;
  onClose: () => void;
  onSaved: () => void;
  copy?: Partial<{
    title: string;
    subtitle: string;
    valueLabel: string;
    dateLabel: string;
    noteLabel: string;
    notePlaceholder: string;
    cancel: string;
    save: string;
    genericError: string;
  }>;
};

const DEFAULT_COPY = {
  title: "Add valuation",
  subtitle:
    "Log an independent appraisal, insurance value, or an offer you received.",
  valueLabel: "Value",
  dateLabel: "Date",
  noteLabel: "Note (optional)",
  notePlaceholder: "Where this number comes from…",
  cancel: "Cancel",
  save: "Save valuation",
  genericError: "Something went wrong",
};

export function AddValuationModal({
  assetId,
  defaultCurrency = "EUR",
  onClose,
  onSaved,
  copy: copyOverrides,
}: AddValuationModalProps) {
  const copy = { ...DEFAULT_COPY, ...copyOverrides };
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [recordedAt, setRecordedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const num = parseFloat(value);
    if (!Number.isFinite(num) || num <= 0) {
      setError("Value must be a positive number");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/assets/${assetId}/valuations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: num, currency, recordedAt, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error || copy.genericError);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.genericError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} variant="sheet" size="md" dismissable={!busy}>
      <ModalHeader showClose={false} className="px-6 pt-4">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{copy.title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{copy.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
      </ModalHeader>

      <ModalBody className="px-6 pb-4">
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {copy.valueLabel}
              </span>
              <input
                type="number"
                step="0.01"
                min={0}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                placeholder="20000"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                &nbsp;
              </span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="rounded-lg border border-border bg-background px-2 py-2 text-sm focus:border-primary focus:outline-none"
              >
                <option>EUR</option>
                <option>USD</option>
                <option>GBP</option>
                <option>BRL</option>
                <option>PLN</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {copy.dateLabel}
            </span>
            <input
              type="date"
              value={recordedAt}
              onChange={(e) => setRecordedAt(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {copy.noteLabel}
            </span>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder={copy.notePlaceholder}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </label>

          {error && (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p>
          )}
        </div>
      </ModalBody>

      <ModalFooter className="items-center justify-end gap-2 px-6 md:px-6">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {copy.cancel}
          </button>
          <button
            onClick={submit}
            disabled={busy || !value}
            className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {copy.save}
          </button>
      </ModalFooter>
    </Modal>
  );
}
