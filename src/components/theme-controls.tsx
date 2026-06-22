"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export type Theme = "light" | "dark" | "system";
const KEY = "amigo-theme";

function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Reads/writes the persisted theme and keeps `.dark` in sync (incl. live system changes). */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as Theme | null) || "system";
    setThemeState(stored);
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(KEY, t);
    applyTheme(t);
  }, []);

  return { theme, setTheme };
}

const sun = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="4" strokeWidth={1.5} />
    <path strokeLinecap="round" strokeWidth={1.5} d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
  </svg>
);
const moon = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
  </svg>
);
const auto = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="3" y="4" width="18" height="12" rx="2" strokeWidth={1.5} />
    <path strokeLinecap="round" strokeWidth={1.5} d="M8 20h8M12 16v4" />
  </svg>
);

/** Segmented Light / Dark / System control, used in the profile popover and mobile drawer. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("nav");
  const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: t("themeLight"), icon: sun },
    { value: "dark", label: t("themeDark"), icon: moon },
    { value: "system", label: t("themeSystem"), icon: auto },
  ];

  return (
    <div className="flex p-1 rounded-lg bg-[var(--surface-3)] gap-1">
      {options.map((o) => {
        const on = theme === o.value;
        return (
          <button
            key={o.value}
            onClick={() => setTheme(o.value)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[12px] font-medium transition-colors duration-200"
            style={
              on
                ? { background: "var(--surface)", color: "var(--ink)", boxShadow: "0 1px 3px rgba(0,0,0,.18)" }
                : { color: "var(--ink-muted)" }
            }
            aria-pressed={on}
          >
            {o.icon}
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
