"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AuthShell,
  AuthHeader,
  FieldCard,
  EyeToggle,
  PrimaryButton,
  StatusBanner,
  FooterLine,
} from "../signin/auth-ui";

type Step = "form" | "verify";

export default function SignUpPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const t = useTranslations("authPages");

  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Focus first code input when entering verify step
  useEffect(() => {
    if (step === "verify" && codeInputRefs.current[0]) {
      codeInputRefs.current[0].focus();
    }
  }, [step]);

  const handleSendVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || t("somethingWentWrong"));
        setIsLoading(false);
        return;
      }

      setStep("verify");
      setResendCooldown(60);
      setIsLoading(false);
    } catch {
      setError(t("somethingWentWrong"));
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    const code = verificationCode.join("");
    if (code.length !== 6) {
      setError(t("enterCompleteCode"));
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || t("invalidVerificationCode"));
        setIsLoading(false);
        // Clear code on error
        setVerificationCode(["", "", "", "", "", ""]);
        codeInputRefs.current[0]?.focus();
        return;
      }

      router.push("/signin?verified=true");
    } catch {
      setError(t("somethingWentWrong"));
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || t("failedToResendCode"));
        setIsLoading(false);
        return;
      }

      setResendCooldown(60);
      setVerificationCode(["", "", "", "", "", ""]);
      codeInputRefs.current[0]?.focus();
      setIsLoading(false);
    } catch {
      setError(t("somethingWentWrong"));
      setIsLoading(false);
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, "").slice(-1);

    const newCode = [...verificationCode];
    newCode[index] = digit;
    setVerificationCode(newCode);

    // Auto-focus next input
    if (digit && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (digit && index === 5 && newCode.every(d => d !== "")) {
      setTimeout(() => handleVerifyCode(), 100);
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !verificationCode[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
    if (e.key === "Enter" && verificationCode.every(d => d !== "")) {
      handleVerifyCode();
    }
  };

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pastedData.length === 6) {
      const newCode = pastedData.split("");
      setVerificationCode(newCode);
      codeInputRefs.current[5]?.focus();
      setTimeout(() => handleVerifyCode(), 100);
    }
  };

  const handleBackToForm = () => {
    setStep("form");
    setVerificationCode(["", "", "", "", "", ""]);
    setError("");
  };

  if (step === "verify") {
    return (
      <AuthShell>
        <AuthHeader
          title={t("verifyYourEmail")}
          tagline={
            <>
              {t("weSentCode")}
              <br />
              <span className="font-semibold text-[var(--ink)]">{email}</span>
            </>
          }
          logoSize={56}
        />

        <div className="mt-6 flex flex-col gap-5">
          {error && <StatusBanner tone="error">{error}</StatusBanner>}

          <div className="flex justify-center gap-2" onPaste={handleCodePaste}>
            {verificationCode.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { codeInputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleCodeChange(index, e.target.value)}
                onKeyDown={(e) => handleCodeKeyDown(index, e)}
                disabled={isLoading}
                className={`h-14 w-12 rounded-[14px] border-[1.5px] bg-[var(--surface)] text-center text-2xl font-bold tabular-nums text-[var(--ink)] shadow-[var(--shadow-card)] outline-none transition-colors duration-200 focus:border-[var(--accent)] disabled:opacity-50 ${
                  digit ? "border-[var(--accent)]" : "border-transparent"
                }`}
              />
            ))}
          </div>

          <PrimaryButton
            onClick={handleVerifyCode}
            disabled={isLoading || verificationCode.some(d => d === "")}
          >
            {isLoading ? t("verifying") : t("verifyEmail")}
          </PrimaryButton>

          <div className="space-y-3 text-center">
            <p className="text-[13px] text-[var(--ink-muted)]">
              {t("didntReceiveCode")}{" "}
              {resendCooldown > 0 ? (
                <span className="text-[var(--ink-subtle)]">
                  {t("resendIn", { seconds: resendCooldown })}
                </span>
              ) : (
                <button
                  onClick={handleResendCode}
                  disabled={isLoading}
                  className="font-semibold text-[var(--accent)] disabled:opacity-50"
                >
                  {t("resendCode")}
                </button>
              )}
            </p>

            <button
              onClick={handleBackToForm}
              disabled={isLoading}
              className="py-1 text-[13px] font-medium text-[var(--ink-subtle)] transition-colors hover:text-[var(--ink-muted)]"
            >
              ← {t("changeEmailAddress")}
            </button>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthHeader title={t("createYourAccount")} tagline={t("signInTagline")} />

      <form onSubmit={handleSendVerification} className="mt-6 flex flex-col gap-4">
        {error && <StatusBanner tone="error">{error}</StatusBanner>}

        <FieldCard
          id="name"
          label={t("name")}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder={t("namePlaceholder")}
        />

        <FieldCard
          id="username"
          label={t("username")}
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
          required
          minLength={3}
          maxLength={20}
          placeholder="johndoe"
          hint={t("usernameHint")}
        />

        <FieldCard
          id="email"
          label={t("email")}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder={t("emailPlaceholder")}
        />

        <FieldCard
          id="password"
          label={t("password")}
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          placeholder="••••••••"
          hint={t("passwordHint")}
          rightSlot={
            <EyeToggle
              shown={showPassword}
              onToggle={() => setShowPassword((s) => !s)}
            />
          }
        />

        <PrimaryButton type="submit" disabled={isLoading}>
          {isLoading ? t("sendingCode") : t("continue")}
        </PrimaryButton>
      </form>

      <div className="mt-6">
        <FooterLine
          text={t("alreadyHaveAccount")}
          linkLabel={t("signIn")}
          href="/signin"
        />
      </div>
    </AuthShell>
  );
}
