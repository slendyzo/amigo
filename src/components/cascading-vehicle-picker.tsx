"use client";

// Cascading vehicle picker: Year → Make → Model → Trim.
//
// Each level is locked until the previous one is set. Make/Model/Trim are
// fetched lazily from /api/taxonomy/vehicle (which AI-builds the catalog
// the first time a (year, make, ...) tuple is requested and caches forever).
//
// Solves the original bug: forcing the user to pick a known trim from a
// dropdown means an MX-5 RF can never accidentally be saved as a soft-top.

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

export type VehiclePick = {
  year: number;
  make: string;
  model: string;
  trim: string | null; // null = "Base / no trim"
};

export type CascadingVehiclePickerProps = {
  value: Partial<VehiclePick>;
  onChange: (next: Partial<VehiclePick>) => void;
  copy?: Partial<{
    year: string;
    make: string;
    model: string;
    trim: string;
    pickFirst: string;
    loading: string;
    noTrim: string;
    noResults: string;
    yearPlaceholder: string;
  }>;
};

const DEFAULT_COPY = {
  year: "Year",
  make: "Make",
  model: "Model",
  trim: "Trim",
  pickFirst: "Pick the previous field first",
  loading: "Loading options…",
  noTrim: "Base / no trim",
  noResults: "No options found — try refreshing or pick a different parent.",
  yearPlaceholder: "2019",
};

const MIN_YEAR = 1990;

export function CascadingVehiclePicker({
  value,
  onChange,
  copy: copyOverrides,
}: CascadingVehiclePickerProps) {
  const copy = { ...DEFAULT_COPY, ...copyOverrides };
  const currentYear = new Date().getUTCFullYear();
  const maxYear = currentYear + 1;

  const yearStr = value.year != null ? String(value.year) : "";

  const [makes, setMakes] = useState<string[] | null>(null);
  const [makesLoading, setMakesLoading] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [trims, setTrims] = useState<string[] | null>(null);
  const [trimsLoading, setTrimsLoading] = useState(false);

  // Reset downstream when year changes
  useEffect(() => {
    setMakes(null);
    setModels(null);
    setTrims(null);
    if (value.year == null) return;
    let cancelled = false;
    setMakesLoading(true);
    fetchTaxonomy({ year: value.year })
      .then((vals) => {
        if (cancelled) return;
        setMakes(vals);
      })
      .finally(() => !cancelled && setMakesLoading(false));
    return () => {
      cancelled = true;
    };
  }, [value.year]);

  // Reset downstream when make changes
  useEffect(() => {
    setModels(null);
    setTrims(null);
    if (value.year == null || !value.make) return;
    let cancelled = false;
    setModelsLoading(true);
    fetchTaxonomy({ year: value.year, make: value.make })
      .then((vals) => {
        if (cancelled) return;
        setModels(vals);
      })
      .finally(() => !cancelled && setModelsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [value.year, value.make]);

  // Reset downstream when model changes
  useEffect(() => {
    setTrims(null);
    if (value.year == null || !value.make || !value.model) return;
    let cancelled = false;
    setTrimsLoading(true);
    fetchTaxonomy({ year: value.year, make: value.make, model: value.model })
      .then((vals) => {
        if (cancelled) return;
        setTrims(vals);
      })
      .finally(() => !cancelled && setTrimsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [value.year, value.make, value.model]);

  return (
    <div className="space-y-3">
      {/* Year — number input. Stays simple; no AI call needed. */}
      <Field label={copy.year}>
        <input
          type="number"
          min={MIN_YEAR}
          max={maxYear}
          value={yearStr}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            const valid = Number.isFinite(n) && n >= MIN_YEAR && n <= maxYear;
            onChange({ year: valid ? n : undefined, make: undefined, model: undefined, trim: undefined });
          }}
          placeholder={copy.yearPlaceholder}
          autoFocus
          className={inputClass}
        />
      </Field>

      <DropdownField
        label={copy.make}
        options={makes}
        loading={makesLoading}
        disabled={value.year == null}
        value={value.make ?? ""}
        onSelect={(v) =>
          onChange({ ...value, make: v, model: undefined, trim: undefined })
        }
        emptyHint={copy.pickFirst}
        loadingHint={copy.loading}
        noResultsHint={copy.noResults}
      />

      <DropdownField
        label={copy.model}
        options={models}
        loading={modelsLoading}
        disabled={!value.make}
        value={value.model ?? ""}
        onSelect={(v) =>
          onChange({ ...value, model: v, trim: undefined })
        }
        emptyHint={copy.pickFirst}
        loadingHint={copy.loading}
        noResultsHint={copy.noResults}
      />

      <DropdownField
        label={copy.trim}
        options={trims}
        loading={trimsLoading}
        disabled={!value.model}
        value={value.trim ?? ""}
        onSelect={(v) =>
          onChange({ ...value, trim: v === "__base__" ? null : v })
        }
        emptyHint={copy.pickFirst}
        loadingHint={copy.loading}
        noResultsHint={copy.noResults}
        extraOption={{ value: "__base__", label: copy.noTrim }}
      />
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

type DropdownFieldProps = {
  label: string;
  options: string[] | null;
  loading: boolean;
  disabled: boolean;
  value: string;
  onSelect: (v: string) => void;
  emptyHint: string;
  loadingHint: string;
  noResultsHint: string;
  extraOption?: { value: string; label: string };
};

function DropdownField({
  label,
  options,
  loading,
  disabled,
  value,
  onSelect,
  emptyHint,
  loadingHint,
  noResultsHint,
  extraOption,
}: DropdownFieldProps) {
  const [open, setOpen] = useState(false);

  // Close when disabled
  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  const visibleLabel = value || (disabled ? emptyHint : loading ? loadingHint : "—");

  return (
    <Field label={label}>
      <div className="relative">
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-left text-sm transition-colors",
            "focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
            "disabled:cursor-not-allowed disabled:bg-muted/30 disabled:text-muted-foreground",
            !value && "text-muted-foreground/70",
          )}
        >
          <span className="truncate">{visibleLabel}</span>
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          )}
        </button>

        <AnimatePresence>
          {open && options && (
            <>
              {/* Click-outside catcher */}
              <div
                className="fixed inset-0 z-30"
                onClick={() => setOpen(false)}
                aria-hidden
              />
              <motion.ul
                initial={{ opacity: 0, y: -4, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.99 }}
                transition={{ duration: 0.18, ease: EASE }}
                className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border/80 bg-card p-1 shadow-2xl backdrop-blur-md"
              >
                {options.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-muted-foreground">
                    {noResultsHint}
                  </li>
                ) : (
                  <>
                    {extraOption && (
                      <li>
                        <button
                          type="button"
                          onClick={() => {
                            onSelect(extraOption.value);
                            setOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm italic text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {extraOption.label}
                        </button>
                      </li>
                    )}
                    {options.map((opt) => (
                      <li key={opt}>
                        <button
                          type="button"
                          onClick={() => {
                            onSelect(opt);
                            setOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted",
                            value === opt && "bg-primary/10 font-medium text-primary",
                          )}
                        >
                          {opt}
                        </button>
                      </li>
                    ))}
                  </>
                )}
              </motion.ul>
            </>
          )}
        </AnimatePresence>
      </div>
    </Field>
  );
}

// ─── Helper ─────────────────────────────────────────────────────────────────

async function fetchTaxonomy(query: { year: number; make?: string; model?: string }): Promise<string[]> {
  const params = new URLSearchParams();
  params.set("year", String(query.year));
  if (query.make) params.set("make", query.make);
  if (query.model) params.set("model", query.model);
  try {
    const res = await fetch(`/api/taxonomy/vehicle?${params.toString()}`, {
      cache: "force-cache",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { values?: unknown };
    return Array.isArray(json.values) ? json.values.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
