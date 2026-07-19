"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExchangeConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  editConnection?: {
    id: string;
    provider: string;
    label: string;
  } | null;
}

type Provider = "KRAKEN" | "TRADING212" | "BINANCE" | "BYBIT" | "BYBIT_EU";

const PROVIDERS: { id: Provider; name: string; badgeBg: string; badgeText: string; badgeLetter: string; badgeLetterClass?: string }[] = [
  {
    id: "KRAKEN",
    name: "Kraken",
    badgeBg: "bg-amber-500",
    badgeText: "text-white",
    badgeLetter: "K",
  },
  {
    id: "TRADING212",
    name: "Trading 212",
    badgeBg: "bg-blue-500",
    badgeText: "text-white",
    badgeLetter: "T",
  },
  {
    id: "BINANCE",
    name: "Binance",
    badgeBg: "bg-yellow-400",
    badgeText: "text-slate-900",
    badgeLetter: "B",
  },
  {
    id: "BYBIT",
    name: "Bybit",
    badgeBg: "bg-orange-500",
    badgeText: "text-white",
    badgeLetter: "B",
  },
  {
    id: "BYBIT_EU",
    name: "Bybit.EU",
    badgeBg: "bg-orange-500",
    badgeText: "text-white",
    badgeLetter: "EU",
    badgeLetterClass: "text-[11px] tracking-tight",
  },
];

const HELP_TEXT_KEY: Record<Provider, string> = {
  KRAKEN: "krakenSetupHelp",
  TRADING212: "trading212SetupHelp",
  BINANCE: "binanceSetupHelp",
  BYBIT: "bybitSetupHelp",
  BYBIT_EU: "bybitEuSetupHelp",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExchangeConnectionModal({
  isOpen,
  onClose,
  editConnection,
}: ExchangeConnectionModalProps) {
  const router = useRouter();
  const t = useTranslations("portfolio");
  const tCommon = useTranslations("common");

  const isEditing = !!editConnection;

  // Form state
  const [provider, setProvider] = useState<Provider>("KRAKEN");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Status state
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState("");

  // Pre-fill when editing
  useEffect(() => {
    if (editConnection) {
      setProvider(editConnection.provider as Provider);
      setLabel(editConnection.label);
      setApiKey("");
      setApiSecret("");
    } else {
      setProvider("KRAKEN");
      setLabel("");
      setApiKey("");
      setApiSecret("");
    }
    setShowApiKey(false);
    setShowApiSecret(false);
    setShowHelp(false);
    setTestResult(null);
    setError("");
  }, [editConnection, isOpen]);

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedProviderMeta = PROVIDERS.find((p) => p.id === provider)!;
  const helpText = t(HELP_TEXT_KEY[provider]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleTest = async () => {
    setTestResult(null);
    setError("");
    setIsTesting(true);
    try {
      const res = await fetch("/api/portfolio/exchanges?test=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, label: label || "test", apiKey, apiSecret }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ success: true, message: t("testSuccess") });
      } else {
        setTestResult({ success: false, message: data.error || t("testFailed") });
      }
    } catch {
      setTestResult({ success: false, message: t("testFailed") });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setError("");
    setIsSaving(true);
    try {
      let res: Response;
      if (isEditing && editConnection) {
        const body: Record<string, string> = { label };
        if (apiKey) body.apiKey = apiKey;
        if (apiSecret) body.apiSecret = apiSecret;
        res = await fetch(`/api/portfolio/exchanges/${editConnection.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/portfolio/exchanges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, label, apiKey, apiSecret }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || tCommon("error"));
        return;
      }

      router.refresh();
      onClose();
    } catch {
      setError(tCommon("error"));
    } finally {
      setIsSaving(false);
    }
  };

  const canTest = !isEditing && apiKey.trim().length > 0 && apiSecret.trim().length > 0;
  const canSave = isEditing
    ? label.trim().length > 0
    : label.trim().length > 0 && apiKey.trim().length > 0 && apiSecret.trim().length > 0;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-[24px] w-full max-w-lg overflow-hidden"
        style={{ background: "var(--surface)", boxShadow: "var(--shadow-pop)" }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: "var(--line)" }}>
          <h2 className="text-lg font-semibold" style={{ color: "var(--ink)" }}>
            {isEditing ? t("editConnection") : t("addExchange")}
          </h2>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Provider selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium" style={{ color: "var(--ink-muted)" }}>
              {t("provider")}
            </label>
            <div className="grid grid-cols-2 gap-3">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={isEditing}
                  onClick={() => { setProvider(p.id); setTestResult(null); }}
                  className={[
                    "flex items-center gap-3 rounded-[16px] border-2 px-4 py-3 text-left transition-all",
                    isEditing ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                  ].join(" ")}
                  style={
                    provider === p.id
                      ? { borderColor: "var(--accent)", background: "var(--accent-tint)" }
                      : { borderColor: "var(--line)", background: "var(--surface-2)" }
                  }
                >
                  <span
                    className={[
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold",
                      p.badgeLetterClass ?? "text-sm",
                      p.badgeBg,
                      p.badgeText,
                    ].join(" ")}
                  >
                    {p.badgeLetter}
                  </span>
                  <span className="text-sm font-medium truncate" style={{ color: "var(--ink)" }}>
                    {p.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--ink-muted)" }}>
              {t("connectionLabel")}
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("connectionLabelPlaceholder")}
              className="w-full rounded-[14px] border px-3 py-2.5 text-sm placeholder:text-[var(--ink-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition"
              style={{ background: "var(--surface-2)", borderColor: "var(--line)", color: "var(--ink)" }}
            />
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--ink-muted)" }}>
              {t("apiKey")}
              {isEditing && (
                <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--ink-subtle)" }}>
                  — leave blank to keep existing
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
                placeholder={isEditing ? "••••••••••••" : t("apiKey")}
                autoComplete="off"
                className="w-full rounded-[14px] border px-3 py-2.5 pr-10 text-sm placeholder:text-[var(--ink-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition"
                style={{ background: "var(--surface-2)", borderColor: "var(--line)", color: "var(--ink)" }}
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-subtle)] hover:text-[var(--ink)] transition"
                tabIndex={-1}
              >
                {showApiKey ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* API Secret */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--ink-muted)" }}>
              {t("apiSecret")}
              {isEditing && (
                <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--ink-subtle)" }}>
                  — leave blank to keep existing
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type={showApiSecret ? "text" : "password"}
                value={apiSecret}
                onChange={(e) => { setApiSecret(e.target.value); setTestResult(null); }}
                placeholder={isEditing ? "••••••••••••" : t("apiSecret")}
                autoComplete="off"
                className="w-full rounded-[14px] border px-3 py-2.5 pr-10 text-sm placeholder:text-[var(--ink-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition"
                style={{ background: "var(--surface-2)", borderColor: "var(--line)", color: "var(--ink)" }}
              />
              <button
                type="button"
                onClick={() => setShowApiSecret((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-subtle)] hover:text-[var(--ink)] transition"
                tabIndex={-1}
              >
                {showApiSecret ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Setup help collapsible */}
          <div className="rounded-[14px] border overflow-hidden" style={{ borderColor: "var(--line)" }}>
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition hover:bg-[var(--surface-2)]"
              style={{ color: "var(--ink-muted)" }}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" style={{ color: "var(--ink-subtle)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                Setup guide for {selectedProviderMeta.name}
              </span>
              <svg
                className={["w-4 h-4 transition-transform", showHelp ? "rotate-180" : ""].join(" ")}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {showHelp && (
              <div
                className="px-4 py-3 text-sm border-t"
                style={{ color: "var(--ink-muted)", background: "var(--surface-2)", borderColor: "var(--line)" }}
              >
                {helpText}
              </div>
            )}
          </div>

          {/* Test result feedback */}
          {testResult && (
            <div
              className="rounded-[14px] px-4 py-3 text-sm font-medium border"
              style={
                testResult.success
                  ? { background: "rgba(27,158,99,0.10)", color: "var(--positive)", borderColor: "rgba(27,158,99,0.25)" }
                  : { background: "rgba(214,69,80,0.10)", color: "var(--negative)", borderColor: "rgba(214,69,80,0.25)" }
              }
            >
              {testResult.message}
            </div>
          )}

          {/* Save error */}
          {error && (
            <div
              className="rounded-[14px] border px-4 py-3 text-sm"
              style={{ background: "rgba(214,69,80,0.10)", color: "var(--negative)", borderColor: "rgba(214,69,80,0.25)" }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex flex-col-reverse sm:flex-row sm:justify-between gap-3" style={{ borderColor: "var(--line)" }}>
          {/* Test button (only when creating) */}
          <div className="flex gap-2">
            {!isEditing && (
              <button
                type="button"
                onClick={handleTest}
                disabled={!canTest || isTesting || isSaving}
                className="flex items-center gap-2 rounded-[14px] border px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed transition"
                style={{ borderColor: "var(--line)", color: "var(--ink-muted)" }}
              >
                {isTesting && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {t("testConnection")}
              </button>
            )}
          </div>

          {/* Cancel + Save */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving || isTesting}
              className="rounded-[14px] border px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)] disabled:opacity-40 transition"
              style={{ borderColor: "var(--line)", color: "var(--ink-muted)" }}
            >
              {tCommon("cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || isSaving || isTesting}
              className="flex items-center gap-2 rounded-[14px] px-4 py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition hover:brightness-95"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              {isSaving && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {isEditing ? t("editConnection") : t("saveConnection")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
