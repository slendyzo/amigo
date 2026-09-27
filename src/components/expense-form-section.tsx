"use client";

import { useId, type ReactNode } from "react";
import { Landmark, Tags } from "lucide-react";

export function ExpenseFormSection({ kind, title, hint, children }: {
  kind: "account" | "projects"; title: string; hint: string; children: ReactNode;
}) {
  const id = useId();
  const color = kind === "account" ? "var(--positive)" : "var(--accent)";
  const Icon = kind === "account" ? Landmark : Tags;
  return <section aria-labelledby={id} className="min-w-0 space-y-3 rounded-[18px] border p-4" style={{
    borderColor: `color-mix(in srgb, ${color} 28%, var(--line))`,
    background: `color-mix(in srgb, ${color} 5%, var(--surface))`,
  }}>
    <div className="flex items-start gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]" style={{ color, background: `color-mix(in srgb, ${color} 12%, var(--surface))` }}><Icon aria-hidden="true" size={17} /></span>
      <div><h3 id={id} className="text-[13px] font-semibold text-[var(--ink)]">{title}</h3><p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">{hint}</p></div>
    </div>
    {children}
  </section>;
}
