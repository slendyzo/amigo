"use client";

import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

/**
 * Wraps NextIntlClientProvider with graceful missing-key handling so a single
 * absent translation can never crash a whole page (next-intl throws on missing
 * keys by default, which bubbles to the error boundary as an "Application
 * error"). Missing keys are logged and rendered as a humanized fallback.
 */
export default function IntlClientProvider({
  locale,
  messages,
  children,
}: {
  locale: string;
  messages: Record<string, unknown>;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      onError={(error) => {
        if (error.code === "MISSING_MESSAGE") {
          if (process.env.NODE_ENV !== "production") console.warn(`[i18n] ${error.message}`);
          return; // swallow — do not crash the page
        }
        console.error(error);
      }}
      getMessageFallback={({ key }) => {
        const seg = key.split(".").pop() ?? key;
        return seg
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .replace(/^./, (c) => c.toUpperCase());
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
}
