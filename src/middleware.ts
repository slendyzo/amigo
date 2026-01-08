import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simple middleware without auth import to avoid edge runtime issues
// Auth checks will be done in individual pages/API routes

const LOCALE_COOKIE = "NEXT_LOCALE";
const locales = ["en", "pt-PT", "fr-FR"] as const;
type Locale = (typeof locales)[number];
const defaultLocale: Locale = "en";

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths that don't require authentication
  const publicPaths = ["/", "/auth/signin", "/auth/signup", "/auth/setup-username", "/auth/forgot-password", "/auth/reset-password", "/api/auth", "/terms"];

  const isPublicPath = publicPaths.some(
    (path) => pathname === path || pathname.startsWith("/api/auth")
  );

  // Set locale cookie if not present (for browser detection)
  const response = NextResponse.next();
  const existingLocale = request.cookies.get(LOCALE_COOKIE)?.value;

  if (!existingLocale || !locales.includes(existingLocale as Locale)) {
    const detectedLocale = getLocaleFromAcceptLanguage(
      request.headers.get("accept-language")
    );
    response.cookies.set(LOCALE_COOKIE, detectedLocale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: "lax",
    });
  }

  // Allow public paths and static files
  if (isPublicPath) {
    return response;
  }

  // For protected routes, check for session token
  const token = request.cookies.get("authjs.session-token")?.value;

  if (!token && pathname.startsWith("/dashboard")) {
    const signInUrl = new URL("/auth/signin", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
