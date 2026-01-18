"use client";

import { useEffect } from "react";

interface LocaleSyncProps {
  workspaceLanguage: string;
}

/**
 * Syncs the NEXT_LOCALE cookie with the workspace language setting.
 * This ensures the app displays in the correct language even if the
 * cookie was set to a different value (e.g., from browser detection).
 */
export function LocaleSync({ workspaceLanguage }: LocaleSyncProps) {
  useEffect(() => {
    if (!workspaceLanguage) return;

    // Get current locale cookie
    const cookies = document.cookie.split(";");
    const localeCookie = cookies.find((c) => c.trim().startsWith("NEXT_LOCALE="));
    const currentLocale = localeCookie?.split("=")[1]?.trim();

    // If cookie doesn't match workspace language, update it and reload
    if (currentLocale !== workspaceLanguage) {
      document.cookie = `NEXT_LOCALE=${workspaceLanguage}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      // Reload to apply the new locale
      window.location.reload();
    }
  }, [workspaceLanguage]);

  return null;
}
