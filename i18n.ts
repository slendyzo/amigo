import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

const locales = ["en", "pt-PT", "fr-FR"] as const;
type Locale = (typeof locales)[number];

const defaultLocale: Locale = "en";
const LOCALE_COOKIE = "NEXT_LOCALE";

function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}

function getLocaleFromAcceptLanguage(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;

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

  for (const { code } of languages) {
    if (code === "pt-pt" || code === "pt") return "pt-PT";
    if (code === "fr-fr" || code === "fr") return "fr-FR";
    if (code === "en-gb" || code === "en-us" || code === "en") return "en";
    if (code.startsWith("pt")) return "pt-PT";
    if (code.startsWith("fr")) return "fr-FR";
    if (code.startsWith("en")) return "en";
  }

  return defaultLocale;
}

export default getRequestConfig(async () => {
  // Try to get locale from cookie first
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  let locale: Locale = defaultLocale;

  if (cookieLocale && isValidLocale(cookieLocale)) {
    locale = cookieLocale;
  } else {
    // Fall back to Accept-Language header detection
    const headersList = await headers();
    const acceptLanguage = headersList.get("accept-language");
    locale = getLocaleFromAcceptLanguage(acceptLanguage);
  }

  return {
    locale,
    messages: (await import(`./src/messages/${locale}.json`)).default,
  };
});
