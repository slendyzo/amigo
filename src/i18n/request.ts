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
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
