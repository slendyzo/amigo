"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

type ApiToken = {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  workspace?: { name: string };
};

/**
 * "iPhone Shortcuts" card for the Settings page.
 * Manages personal access tokens and shows the Wallet/Siri setup guide.
 */
export default function ShortcutsTokensCard() {
  const t = useTranslations("shortcuts");
  const tCommon = useTranslations("common");

  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [error, setError] = useState("");

  const fetchTokens = useCallback(async () => {
    try {
      const res = await fetch("/api/tokens");
      if (res.ok) {
        const data = await res.json();
        setTokens(data.tokens);
      }
    } catch {
      // Non-fatal: the card simply shows the empty state
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const handleCreate = async () => {
    const name = newTokenName.trim() || t("defaultTokenName");
    setIsCreating(true);
    setError("");
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("createError"));
        return;
      }
      setCreatedToken(data.token);
      setShowCreateForm(false);
      setNewTokenName("");
      fetchTokens();
    } catch {
      setError(t("createError"));
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (non-HTTPS or permissions) - user can select manually
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTokens((prev) => prev.filter((token) => token.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  };

  const apiBase = typeof window !== "undefined" ? window.location.origin : "";
  const expenseUrl = `${apiBase}/api/shortcuts/expense`;

  const formatDate = (value: string | null) => {
    if (!value) return t("neverUsed");
    return new Date(value).toLocaleDateString();
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("title")}</h2>
          <p className="text-sm text-slate-500">{t("description")}</p>
        </div>
        <button
          onClick={() => {
            setShowCreateForm(true);
            setCreatedToken(null);
            setError("");
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t("createToken")}
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {t("tokenNameLabel")}
          </label>
          <div className="flex gap-2">
            <input
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
              placeholder={t("defaultTokenName")}
              maxLength={100}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isCreating ? tCommon("loading") : tCommon("create")}
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              {tCommon("cancel")}
            </button>
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
      )}

      {/* One-time token reveal */}
      {createdToken && (
        <div className="mt-4 p-4 bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] rounded-lg border border-[color-mix(in_srgb,var(--warning)_35%,transparent)]">
          <p className="text-sm font-medium text-[var(--warning)] mb-2">{t("tokenCreatedWarning")}</p>
          <div className="flex gap-2 items-center">
            <code className="flex-1 px-3 py-2 bg-white border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] rounded-lg text-xs font-mono break-all select-all">
              {createdToken}
            </code>
            <button
              onClick={handleCopy}
              className="px-3 py-2 bg-[var(--warning)] text-white rounded-lg hover:bg-[color-mix(in_srgb,var(--warning)_85%,black)] transition-colors text-sm shrink-0"
            >
              {copied ? t("copied") : t("copy")}
            </button>
          </div>
        </div>
      )}

      {/* Token list */}
      {!isLoading && tokens.length > 0 && (
        <div className="mt-4 space-y-2">
          {tokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100"
            >
              <div className="min-w-0">
                <div className="font-medium text-slate-900 text-sm truncate">{token.name}</div>
                <div className="text-xs text-slate-500 font-mono">
                  {token.tokenPrefix}… · {t("lastUsed")}: {formatDate(token.lastUsedAt)}
                </div>
              </div>
              <button
                onClick={() => handleDelete(token.id)}
                disabled={deletingId === token.id}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-white rounded-lg disabled:opacity-50 shrink-0"
                title={t("revokeToken")}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {!isLoading && tokens.length === 0 && !showCreateForm && !createdToken && (
        <p className="mt-4 text-sm text-slate-500">{t("emptyState")}</p>
      )}

      {/* Setup guide */}
      <button
        onClick={() => setShowGuide((v) => !v)}
        className="mt-4 text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
      >
        {t("setupGuide")}
        <svg
          className={`w-4 h-4 transition-transform ${showGuide ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showGuide && (
        <div className="mt-3 space-y-4 text-sm text-slate-600">
          {/* A) Wallet auto-log */}
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
            <h3 className="font-semibold text-slate-900 mb-2">{t("walletGuideTitle")}</h3>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>{t("walletStep1")}</li>
              <li>{t("walletStep2")}</li>
              <li>
                {t("walletStep3")}
                <div className="mt-1.5 ml-4 p-2 bg-white rounded border border-slate-200 font-mono text-xs space-y-1 break-all">
                  <div>POST {expenseUrl}</div>
                  <div>Authorization: Bearer &lt;{t("yourToken")}&gt;</div>
                  <div>{"{ \"merchant\": [Merchant], \"amount\": [Amount] }"}</div>
                </div>
              </li>
              <li>{t("walletStep4")}</li>
              <li>{t("walletStep5")}</li>
            </ol>
          </div>

          {/* B) Siri / Action Button */}
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
            <h3 className="font-semibold text-slate-900 mb-2">{t("siriGuideTitle")}</h3>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>{t("siriStep1")}</li>
              <li>
                {t("siriStep2")}
                <div className="mt-1.5 ml-4 p-2 bg-white rounded border border-slate-200 font-mono text-xs space-y-1 break-all">
                  <div>POST {expenseUrl}</div>
                  <div>Authorization: Bearer &lt;{t("yourToken")}&gt;</div>
                  <div>{"{ \"text\": [Provided Input] }"}</div>
                </div>
              </li>
              <li>{t("siriStep3")}</li>
            </ol>
          </div>

          {/* C) Back Tap */}
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
            <h3 className="font-semibold text-slate-900 mb-2">{t("backTapGuideTitle")}</h3>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>{t("backTapStep1")}</li>
              <li>{t("backTapStep2")}</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
