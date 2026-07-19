import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, LOCALE_COOKIE, getLocaleFromAcceptLanguage, isValidLocale, type Locale } from "./config";

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
    timeZone: "Europe/Lisbon",
    messages: (await import(`../messages/${locale}.json`)).default,
    onError(error) {
      // Never let a missing translation crash a server-rendered page.
      if (error.code === "MISSING_MESSAGE") return;
      console.error(error);
    },
    getMessageFallback({ key }) {
      const seg = key.split(".").pop() ?? key;
      return seg.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
    },
  };
});
