"use client";

/**
 * Shared "Calm Violet" auth-page primitives (ref 2n).
 * Used by signin, signup, forgot-password, reset-password,
 * setup-username and auth-error. Pure presentation — no logic.
 */

import { ReactNode } from "react";
import LanguageSwitcher from "@/components/language-switcher";

/* Page shell: soft violet → app-bg gradient, centered column, 20px gutters */
export function AuthShell({
  children,
  showLanguageSwitcher = true,
}: {
  children: ReactNode;
  showLanguageSwitcher?: boolean;
}) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center bg-[linear-gradient(180deg,#E9E4FC_0%,#F4F3F9_42%)] px-5 py-12 text-[var(--ink)] dark:bg-[linear-gradient(180deg,#241F45_0%,#131218_42%)]">
      {showLanguageSwitcher && (
        <div className="absolute right-4 top-4 z-10">
          <LanguageSwitcher />
        </div>
      )}
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}

/* Gradient logo tile with the lowercase "a" mark */
export function LogoTile({ size = 64 }: { size?: number }) {
  return (
    <div
      className="mx-auto flex items-center justify-center font-bold"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3125),
        fontSize: Math.round(size * 0.47),
        background: "linear-gradient(135deg, var(--accent-strong), var(--accent))",
        color: "var(--accent-fg)",
        boxShadow: "var(--shadow-fab)",
      }}
      aria-hidden="true"
    >
      a
    </div>
  );
}

/* Logo + title + tagline block */
export function AuthHeader({
  title,
  tagline,
  logoSize = 64,
}: {
  title: string;
  tagline?: ReactNode;
  logoSize?: number;
}) {
  return (
    <div className="text-center">
      <LogoTile size={logoSize} />
      <h1 className="mt-[18px] text-[26px] font-bold tracking-[-0.02em]">
        {title}
      </h1>
      {tagline && (
        <p className="mt-1.5 text-[13px] leading-normal text-[var(--ink-muted)]">
          {tagline}
        </p>
      )}
    </div>
  );
}

/* Floating-label input card: uppercase micro-label over a borderless input */
export function FieldCard({
  id,
  label,
  hint,
  rightSlot,
  ...inputProps
}: {
  id: string;
  label: string;
  hint?: string;
  rightSlot?: ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label
        htmlFor={id}
        className="flex cursor-text items-center rounded-[18px] border-[1.5px] border-transparent bg-[var(--surface)] px-[18px] py-[13px] shadow-[var(--shadow-card)] transition-colors duration-200 focus-within:border-[var(--accent)]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-semibold uppercase tracking-[.06em] text-[var(--ink-subtle)]">
            {label}
          </span>
          <input
            id={id}
            className="mt-0.5 block w-full bg-transparent text-[14px] font-medium text-[var(--ink)] outline-none placeholder:text-[var(--ink-subtle)]"
            {...inputProps}
          />
        </span>
        {rightSlot}
      </label>
      {hint && (
        <p className="mt-1.5 px-1 text-[11px] leading-normal text-[var(--ink-subtle)]">
          {hint}
        </p>
      )}
    </div>
  );
}

/* Show/hide password toggle for FieldCard's rightSlot */
export function EyeToggle({
  shown,
  onToggle,
}: {
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onToggle();
      }}
      className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-[var(--ink-subtle)] transition-colors hover:text-[var(--ink-muted)]"
      aria-pressed={shown}
      aria-label="Toggle password visibility"
    >
      {shown ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="3" />
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
        </svg>
      )}
    </button>
  );
}

/* Full-width accent CTA */
export function PrimaryButton({
  children,
  className = "",
  ...props
}: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`w-full rounded-[18px] bg-[var(--accent)] py-[15px] text-center text-[15px] font-semibold text-[var(--accent-fg)] shadow-[var(--shadow-fab)] transition-transform duration-200 active:scale-[.98] disabled:cursor-not-allowed disabled:bg-[var(--accent-faint)] disabled:shadow-none ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/* Neutral surface button (secondary actions) */
export function SurfaceButton({
  children,
  className = "",
  ...props
}: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`w-full rounded-[18px] bg-[var(--surface)] py-[14px] text-center text-[14px] font-semibold text-[var(--ink)] shadow-[var(--shadow-card)] transition-transform duration-200 active:scale-[.98] ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/* "or" divider */
export function OrDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-0.5">
      <div className="h-px flex-1 bg-[var(--line-strong)]" />
      <span className="text-[11px] text-[var(--ink-subtle)]">{label}</span>
      <div className="h-px flex-1 bg-[var(--line-strong)]" />
    </div>
  );
}

/* Inline status banner (error / success) */
export function StatusBanner({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: ReactNode;
}) {
  const color = tone === "error" ? "var(--negative)" : "var(--positive)";
  return (
    <div
      className="rounded-[14px] px-4 py-3 text-[13px] font-medium leading-normal"
      style={{
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        color,
      }}
    >
      {children}
    </div>
  );
}

/* Footer "muted text + accent link" line */
export function FooterLine({
  text,
  linkLabel,
  href,
}: {
  text: string;
  linkLabel: string;
  href: string;
}) {
  return (
    <p className="text-center text-[13px] text-[var(--ink-muted)]">
      {text}{" "}
      <a href={href} className="font-semibold text-[var(--accent)]">
        {linkLabel}
      </a>
    </p>
  );
}

/* Round icon badge for status screens (success / error) */
export function StatusIcon({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: ReactNode;
}) {
  const color = tone === "error" ? "var(--negative)" : "var(--positive)";
  return (
    <div
      className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
      style={{
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
      }}
    >
      {children}
    </div>
  );
}

/* Accent loading spinner */
export function Spinner({ size = 32 }: { size?: number }) {
  return (
    <div
      className="mx-auto animate-spin rounded-full border-4 border-[var(--accent)] border-t-transparent"
      style={{ width: size, height: size }}
    />
  );
}
