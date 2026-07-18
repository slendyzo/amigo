"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AuthShell,
  AuthHeader,
  FieldCard,
  PrimaryButton,
  StatusBanner,
  StatusIcon,
} from "../signin/auth-ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const t = useTranslations("authPages");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("somethingWentWrong"));
        return;
      }

      setSubmitted(true);
    } catch {
      setError(t("failedToSendRequest"));
    } finally {
      setIsLoading(false);
    }
  };

  if (submitted) {
    return (
      <AuthShell>
        <div className="text-center">
          <StatusIcon tone="success">
            <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </StatusIcon>
          <h1 className="mt-5 text-[26px] font-bold tracking-[-0.02em]">
            {t("checkYourEmail")}
          </h1>
          <p className="mt-2 text-[13px] leading-normal text-[var(--ink-muted)]">
            {t("ifAccountExists")}{" "}
            <strong className="font-semibold text-[var(--ink)]">{email}</strong>
          </p>
          <p className="mt-4 text-[12px] leading-normal text-[var(--ink-subtle)]">
            {t("linkExpiresIn")}
          </p>
          <Link
            href="/signin"
            className="mt-6 inline-block py-2 text-[13px] font-semibold text-[var(--accent)]"
          >
            {t("backToSignIn")}
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthHeader
        title={t("forgotYourPassword")}
        tagline={t("enterEmailForReset")}
        logoSize={56}
      />

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        {error && <StatusBanner tone="error">{error}</StatusBanner>}

        <FieldCard
          id="email"
          label={t("emailAddress")}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailPlaceholder")}
          required
        />

        <PrimaryButton type="submit" disabled={isLoading}>
          {isLoading ? t("sending") : t("sendResetLink")}
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
