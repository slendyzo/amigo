// i18n configuration for VibeFinance
// Supports: English (en), Portuguese (pt-PT), French (fr-FR)

export const locales = ["en", "pt-PT", "fr-FR"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const localeNames: Record<Locale, string> = {
  en: "English",
  "pt-PT": "Português (Portugal)",
  "fr-FR": "Français (France)",
};

export const localeFlags: Record<Locale, string> = {
  en: "🇬🇧",
  "pt-PT": "🇵🇹",
  "fr-FR": "🇫🇷",
};

// Cookie name for storing user's language preference
export const LOCALE_COOKIE = "NEXT_LOCALE";

// Map Accept-Language header values to our supported locales
export function getLocaleFromAcceptLanguage(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;

  // Parse Accept-Language header
  const languages = acceptLanguage
    .split(",")
    .map((lang) => {
      const [code, q = "q=1"] = lang.trim().split(";");
      return {
        code: code.trim().toLowerCase(),
        quality: parseFloat(q.replace("q=", "")) || 1,
      };
    })
    .sort((a, b) => b.quality - a.quality);

  // Find matching locale
  for (const { code } of languages) {
    // Exact match
    if (code === "pt-pt" || code === "pt") return "pt-PT";
    if (code === "fr-fr" || code === "fr") return "fr-FR";
    if (code === "en-gb" || code === "en-us" || code === "en") return "en";

    // Prefix match
    if (code.startsWith("pt")) return "pt-PT";
    if (code.startsWith("fr")) return "fr-FR";
    if (code.startsWith("en")) return "en";
  }

  return defaultLocale;
}

// Validate if a string is a valid locale
export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}
