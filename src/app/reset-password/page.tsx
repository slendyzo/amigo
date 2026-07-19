"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AuthShell,
  AuthHeader,
  FieldCard,
  EyeToggle,
  PrimaryButton,
  StatusBanner,
  StatusIcon,
  Spinner,
} from "../signin/auth-ui";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const t = useTranslations("authPages");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setIsValidating(false);
      setTokenError(t("noResetToken"));
      return;
    }

    // Validate token on mount
    const validateToken = async () => {
      try {
        const res = await fetch(`/api/auth/reset-password?token=${token}`);
        const data = await res.json();

        if (data.valid) {
          setTokenValid(true);
        } else {
          setTokenError(data.error || t("invalidResetLink"));
        }
      } catch {
        setTokenError(t("failedToValidateLink"));
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, [token, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(t("passwordsDontMatch"));
      return;
    }

    if (password.length < 8) {
      setError(t("passwordMinLength"));
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("somethingWentWrong"));
        return;
      }

      setSuccess(true);
    } catch {
      setError(t("failedToResetPassword"));
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state
  if (isValidating) {
    return (
      <AuthShell>
        <div className="text-center">
          <Spinner size={40} />
          <p className="mt-4 text-[13px] text-[var(--ink-muted)]">
            {t("validatingResetLink")}
          </p>
        </div>
      </AuthShell>
    );
  }

  // Invalid token
  if (!tokenValid) {
    return (
      <AuthShell>
        <div className="text-center">
          <StatusIcon tone="error">
            <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </StatusIcon>
          <h1 className="mt-5 text-[26px] font-bold tracking-[-0.02em]">
            {t("invalidResetLinkTitle")}
          </h1>
          <p className="mt-2 text-[13px] leading-normal text-[var(--ink-muted)]">
            {tokenError}
          </p>
          <div className="mt-6">
            <Link href="/forgot-password" className="block">
              <PrimaryButton type="button">{t("requestNewLink")}</PrimaryButton>
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  // Success state
  if (success) {
    return (
      <AuthShell>
        <div className="text-center">
          <StatusIcon tone="success">
            <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </StatusIcon>
          <h1 className="mt-5 text-[26px] font-bold tracking-[-0.02em]">
            {t("passwordResetSuccess")}
          </h1>
          <p className="mt-2 text-[13px] leading-normal text-[var(--ink-muted)]">
            {t("passwordResetSuccessMessage")}
          </p>
          <div className="mt-6">
            <Link href="/signin" className="block">
              <PrimaryButton type="button">{t("signIn")}</PrimaryButton>
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  // Reset form
  return (
    <AuthShell>
      <AuthHeader
        title={t("createNewPassword")}
        tagline={t("enterNewPasswordBelow")}
        logoSize={56}
      />

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        {error && <StatusBanner tone="error">{error}</StatusBanner>}

        <FieldCard
          id="password"
          label={t("newPassword")}
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("atLeast8Characters")}
          required
          minLength={8}
          rightSlot={
            <EyeToggle
              shown={showPassword}
              onToggle={() => setShowPassword((s) => !s)}
            />
          }
        />

        <FieldCard
          id="confirmPassword"
          label={t("confirmPassword")}
          type={showPassword ? "text" : "password"}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder={t("reenterPassword")}
          required
        />

        <PrimaryButton type="submit" disabled={isLoading}>
          {isLoading ? t("resetting") : t("resetPassword")}
        </PrimaryButton>
      </form>

      <div className="mt-6 text-center">
        <Link
          href="/signin"
          className="inline-block py-1 text-[13px] font-semibold text-[var(--accent)]"
        >
          {t("backToSignIn")}
        </Link>
      </div>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations("authPages");

  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh flex-col items-center justify-center bg-[linear-gradient(180deg,#E9E4FC_0%,#F4F3F9_42%)] px-5 dark:bg-[linear-gradient(180deg,#241F45_0%,#131218_42%)]">
          <Spinner size={40} />
          <p className="mt-4 text-[13px] text-[var(--ink-muted)]">{t("loading")}</p>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
