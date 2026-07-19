"use client";

import { signIn } from "next-auth/react";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AuthShell,
  AuthHeader,
  FieldCard,
  EyeToggle,
  PrimaryButton,
  OrDivider,
  StatusBanner,
  FooterLine,
  Spinner,
} from "./auth-ui";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verified = searchParams.get("verified") === "true";
  const registered = searchParams.get("registered") === "true";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <AuthShell>
      <AuthHeader title={t("welcomeBack")} tagline={t("signInTagline")} />

      <form onSubmit={handleCredentialsSignIn} className="mt-6 flex flex-col gap-4">
        {(verified || registered) && (
          <StatusBanner tone="success">
            {verified ? t("emailVerifiedSuccess") : t("accountCreatedSuccess")}
          </StatusBanner>
        )}

        {error && <StatusBanner tone="error">{error}</StatusBanner>}

        <FieldCard
          id="identifier"
          label={t("usernameOrEmail")}
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
          placeholder={t("usernameOrEmailPlaceholder")}
        />

        <div>
          <FieldCard
            id="password"
            label={t("password")}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            rightSlot={
              <EyeToggle
                shown={showPassword}
                onToggle={() => setShowPassword((s) => !s)}
              />
            }
          />
          <div className="mt-2 text-right">
            <a
              href="/forgot-password"
              className="inline-block py-1 text-[12px] font-semibold text-[var(--accent)]"
            >
              {t("forgotPassword")}
            </a>
          </div>
        </div>

        <PrimaryButton type="submit" disabled={isLoading}>
          {isLoading ? t("signingIn") : t("signIn")}
        </PrimaryButton>

        <OrDivider label={t("or")} />

        {/* Google OAuth — not enabled yet, kept as a disabled affordance */}
        <button
          type="button"
          disabled
          className="relative flex w-full cursor-not-allowed items-center justify-center gap-2.5 rounded-[18px] bg-[var(--surface)] py-[14px] text-[14px] font-semibold text-[var(--ink-subtle)] shadow-[var(--shadow-card)]"
        >
          <svg className="h-[18px] w-[18px] opacity-50" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span>{t("continueWithGoogle")}</span>
          <span className="absolute -right-1.5 -top-2 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
            {t("comingSoon")}
          </span>
        </button>
      </form>

      <div className="mt-6">
        <FooterLine text={t("noAccount")} linkLabel={t("signUp")} href="/signup" />
      </div>
    </AuthShell>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[linear-gradient(180deg,#E9E4FC_0%,#F4F3F9_42%)] dark:bg-[linear-gradient(180deg,#241F45_0%,#131218_42%)]">
          <Spinner />
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}
