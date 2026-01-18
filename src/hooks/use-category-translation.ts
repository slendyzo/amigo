"use client";

import { useTranslations, useMessages } from "next-intl";
import { useCallback } from "react";

/**
 * Hook to translate category names based on the current locale.
 * Supports categories created in any of the supported languages (en, pt-PT, fr-FR).
 * If no translation is found, returns the original name.
 */
export function useCategoryTranslation() {
  const t = useTranslations("categoryNames");
  const messages = useMessages();
  const categoryNames = (messages.categoryNames || {}) as Record<string, string>;

  const translateCategory = useCallback(
    (categoryName: string): string => {
      // Check if the translation key exists in the messages
      if (categoryName in categoryNames) {
        return t(categoryName);
      }
      // If no translation exists, return the original name
      return categoryName;
    },
    [t, categoryNames]
  );

  return { translateCategory };
}
