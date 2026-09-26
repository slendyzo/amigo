"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

type Choice = { value: string; label: string; shortLabel?: string };

/** Direct choices for the common case; a searchable, keyboard-native list for the rest. */
export default function ExpenseChoicePicker({ label, value, choices, quickValues, onChange }: {
  label: string;
  value: string;
  choices: Choice[];
  quickValues?: string[];
  onChange: (value: string) => void;
}) {
  const t = useTranslations("modals.choices");
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const quick = useMemo(() => {
    const values = [...new Set([value, ...(quickValues ?? choices.slice(0, 3).map(c => c.value))])];
    return values.map(v => choices.find(c => c.value === v)).filter((c): c is Choice => !!c).slice(0, 3);
  }, [value, quickValues, choices]);
  const filtered = choices.filter(c => c.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const buttonClass = "h-11 min-w-0 w-full truncate rounded-[12px] px-3 text-[13px] font-medium text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
  const style = (selected: boolean) => ({ background: selected ? "var(--accent)" : "var(--surface-2)", color: selected ? "var(--accent-fg)" : "var(--ink-muted)" });
  return <fieldset className="min-w-0">
    <legend className="mb-2 text-[12px] font-medium text-[var(--ink-muted)]">{label}</legend>
    <div className={`grid gap-2 ${quick.length + (choices.length > quick.length ? 1 : 0) > 3 ? "grid-cols-2" : quick.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {quick.map(c => <button key={c.value} type="button" title={c.label} aria-pressed={value === c.value} className={buttonClass} style={style(value === c.value)} onClick={() => onChange(c.value)}>{c.shortLabel || c.label}</button>)}
      {choices.length > quick.length && <button ref={trigger} type="button" aria-expanded={expanded} className={buttonClass} style={style(false)} onClick={() => { setExpanded(!expanded); setQuery(""); }}>{expanded ? t("close") : t("all")}</button>}
    </div>
    {expanded && <div className="mt-3 space-y-2" onKeyDown={e => {
      if (e.key === "Escape") { e.stopPropagation(); setExpanded(false); trigger.current?.focus(); }
    }}>
      <input autoFocus type="search" aria-label={t("searchLabel", { label })} placeholder={t("searchLabel", { label })} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => {
        if (e.key === "Enter") { e.preventDefault(); if (filtered.length === 1) { onChange(filtered[0].value); setExpanded(false); trigger.current?.focus(); } }
      }} className="min-h-11 w-full rounded-[12px] border border-[var(--line)] bg-[var(--app-bg)] px-3 text-base outline-[var(--accent)]" />
      <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto p-1">
        {filtered.map(c => <button key={c.value} type="button" title={c.label} aria-pressed={value === c.value} className={buttonClass} style={style(value === c.value)} onClick={() => { onChange(c.value); setExpanded(false); trigger.current?.focus(); }}>{c.label}</button>)}
      </div>
      {!filtered.length && <p role="status" className="text-[13px] text-[var(--ink-muted)]">{t("noResults")}</p>}
    </div>}
  </fieldset>;
}
