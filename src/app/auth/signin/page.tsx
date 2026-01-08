"use client";

import { signIn } from "next-auth/react";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import LanguageSwitcher from "@/components/language-switcher";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verified = searchParams.get("verified") === "true";
  const registered = searchParams.get("registered") === "true";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const t = useTranslations("authPages");

  const handleCredentialsSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("timeout")), 30000);
      });

      const signInPromise = signIn("credentials", {
        identifier,
        password,
        redirect: false,
      });

      const result = await Promise.race([signInPromise, timeoutPromise]) as Awaited<ReturnType<typeof signIn>>;

      if (result?.error) {
        setError(t("invalidCredentials"));
        setIsLoading(false);
      } else if (result?.ok) {
        router.push("/dashboard");
      } else {
        setError(t("somethingWentWrong"));
        setIsLoading(false);
      }
    } catch (err) {
      if (err instanceof Error && err.message === "timeout") {
        setError(t("signInTimeout"));
      } else {
        setError(t("errorOccurred"));
      }
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col md:flex-row items-center justify-center p-6 bg-white dark:bg-slate-950 relative">
      {/* Language Switcher */}
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>

      {/* Left side - Info (hidden on mobile, shown on desktop) */}
      <div className="hidden md:flex md:flex-col md:items-center md:justify-center md:flex-1 md:pr-12 md:max-w-md">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-3">
          Amigo
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-400 mb-8 text-center">
          {t("tagline")}
        </p>

        {/* Feature list */}
        <div className="space-y-4 w-full">
          <div className="flex items-start gap-3">
            <div className="text-2xl">📊</div>
            <div>
              <div className="font-medium text-slate-900 dark:text-white">{t("infoTrack")}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">{t("infoTrackDesc")}</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="text-2xl">🔒</div>
            <div>
              <div className="font-medium text-slate-900 dark:text-white">{t("infoPrivate")}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">{t("infoPrivateDesc")}</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="text-2xl">🌐</div>
            <div>
              <div className="font-medium text-slate-900 dark:text-white">{t("infoOpenSource")}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">{t("infoOpenSourceDesc")}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Vertical divider (desktop only) */}
      <div className="hidden md:block w-px h-96 bg-slate-200 dark:bg-slate-800 mx-8" />

      {/* Right side - Login form */}
      <div className="w-full max-w-md md:flex-1 md:max-w-sm md:pl-4">
        {/* Mobile header */}
        <div className="md:hidden text-center mb-6">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Amigo
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            {t("tagline")}
          </p>
        </div>

        {/* Desktop header */}
        <h2 className="hidden md:block text-2xl font-bold text-slate-900 dark:text-white mb-6">
          {t("signInToAccount")}
        </h2>

        {/* Google Sign In - Disabled with Coming Soon badge */}
        <div className="mb-6">
          <button
            type="button"
            disabled
            className="w-full flex items-center justify-center gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 px-4 py-3 text-slate-400 dark:text-slate-500 font-medium cursor-not-allowed relative"
          >
            <svg className="w-5 h-5 opacity-50" viewBox="0 0 24 24">
              <path
                fill="#9CA3AF"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#9CA3AF"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#9CA3AF"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#9CA3AF"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span>{t("continueWithGoogle")}</span>
            <span className="absolute -top-2 -right-2 px-2 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 rounded-full">
              {t("comingSoon")}
            </span>
          </button>
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-300 dark:border-slate-700"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white dark:bg-slate-950 text-slate-500">
              {t("orContinueWithCredentials")}
            </span>
          </div>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleCredentialsSignIn} className="space-y-4">
          {(verified || registered) && (
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm">
              {verified ? t("emailVerifiedSuccess") : t("accountCreatedSuccess")}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="identifier"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              {t("usernameOrEmail")}
            </label>
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-transparent"
              placeholder={t("usernameOrEmailPlaceholder")}
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                {t("password")}
              </label>
              <a
                href="/auth/forgot-password"
                className="text-sm text-[#0070f3] hover:underline"
              >
                {t("forgotPassword")}
              </a>
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-[#0070f3] px-4 py-3 text-white font-medium hover:bg-[#0060df] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? t("signingIn") : t("signIn")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
          {t("noAccount")}{" "}
          <a
            href="/auth/signup"
            className="text-[#0070f3] hover:underline font-medium"
          >
            {t("signUp")}
          </a>
        </p>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950">
        <div className="w-8 h-8 border-4 border-[#0070f3] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SignInForm />
    </Suspense>
  );
}
