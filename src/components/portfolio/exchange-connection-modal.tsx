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

const PROVIDERS: { id: Provider; name: string; accent: string; badgeBg: string; badgeText: string; badgeLetter: string; badgeLetterClass?: string }[] = [
  {
    id: "KRAKEN",
    name: "Kraken",
    accent: "border-amber-500 bg-amber-50 dark:bg-amber-950/30",
    badgeBg: "bg-amber-500",
    badgeText: "text-white",
    badgeLetter: "K",
  },
  {
    id: "TRADING212",
    name: "Trading 212",
    accent: "border-blue-500 bg-blue-50 dark:bg-blue-950/30",
    badgeBg: "bg-blue-500",
    badgeText: "text-white",
    badgeLetter: "T",
  },
  {
    id: "BINANCE",
    name: "Binance",
    accent: "border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30",
    badgeBg: "bg-yellow-400",
    badgeText: "text-slate-900",
    badgeLetter: "B",
  },
  {
    id: "BYBIT",
    name: "Bybit",
    accent: "border-orange-500 bg-orange-50 dark:bg-orange-950/30",
    badgeBg: "bg-orange-500",
    badgeText: "text-white",
    badgeLetter: "B",
  },
  {
    id: "BYBIT_EU",
    name: "Bybit.EU",
    accent: "border-orange-500 bg-orange-50 dark:bg-orange-950/30",
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
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {isEditing ? t("editConnection") : t("addExchange")}
          </h2>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Provider selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
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
                    "flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all",
                    provider === p.id
                      ? p.accent
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600",
                    isEditing ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                  ].join(" ")}
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
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                    {p.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Label */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("connectionLabel")}
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("connectionLabelPlaceholder")}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("apiKey")}
              {isEditing && (
                <span className="ml-1.5 text-xs font-normal text-slate-400 dark:text-slate-500">
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
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 pr-10 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
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
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("apiSecret")}
              {isEditing && (
                <span className="ml-1.5 text-xs font-normal text-slate-400 dark:text-slate-500">
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
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 pr-10 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowApiSecret((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
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
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
              <div className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
                {helpText}
              </div>
            )}
          </div>

          {/* Test result feedback */}
          {testResult && (
            <div
              className={[
                "rounded-lg px-4 py-3 text-sm font-medium",
                testResult.success
                  ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                  : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800",
              ].join(" ")}
            >
              {testResult.message}
            </div>
          )}

          {/* Save error */}
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
          {/* Test button (only when creating) */}
          <div className="flex gap-2">
            {!isEditing && (
              <button
                type="button"
                onClick={handleTest}
                disabled={!canTest || isTesting || isSaving}
                className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
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
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition"
            >
              {tCommon("cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || isSaving || isTesting}
              className="flex items-center gap-2 rounded-lg bg-[#0070f3] px-4 py-2 text-sm font-medium text-white hover:bg-[#0060d3] disabled:opacity-40 disabled:cursor-not-allowed transition"
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
