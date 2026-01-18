"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

/**
 * Hook to translate category names based on the current locale.
 * Supports categories created in any of the supported languages (en, pt-PT, fr-FR).
 * If no translation is found, returns the original name.
 */
export function useCategoryTranslation() {
  const t = useTranslations("categoryNames");

  const translateCategory = useCallback(
    (categoryName: string): string => {
      try {
        // Try to find a translation for this category name
        const translated = t(categoryName);
        // If the translation key exists and returns something different than the key itself
        // (next-intl returns the key if not found when using `t()` directly)
        return translated;
      } catch {
        // If the translation doesn't exist, return the original name
        return categoryName;
      }
    },
    [t]
  );

  return { translateCategory };
}
