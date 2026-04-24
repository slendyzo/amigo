"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import ExchangeConnectionModal from "@/components/portfolio/exchange-connection-modal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Connection {
  id: string;
  provider: string;
  label: string;
  syncStatus: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  freeCash: number | null;
  freeCashCurrency: string | null;
  isActive: boolean;
  assetCount: number;
}

interface ExchangesClientProps {
  connections: Connection[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PROVIDER_META: Record<string, { name: string; badgeBg: string; badgeLetter: string; badgeLetterClass?: string }> = {
  KRAKEN: { name: "Kraken", badgeBg: "bg-amber-500", badgeLetter: "K" },
  TRADING212: { name: "Trading 212", badgeBg: "bg-blue-500", badgeLetter: "T" },
  BINANCE: { name: "Binance", badgeBg: "bg-yellow-400", badgeLetter: "B" },
  BYBIT: { name: "Bybit", badgeBg: "bg-orange-500", badgeLetter: "B" },
  BYBIT_EU: { name: "Bybit.EU", badgeBg: "bg-orange-500", badgeLetter: "EU", badgeLetterClass: "text-xs tracking-tight" },
};

const STATUS_DOT: Record<string, string> = {
  SUCCESS: "bg-emerald-500",
  SYNCING: "bg-yellow-400 animate-pulse",
  ERROR: "bg-red-500",
  IDLE: "bg-slate-300 dark:bg-slate-600",
};

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function formatCurrency(amount: number | null, currency: string | null): string {
  if (amount === null) return "—";
  const sym = currency === "EUR" ? "€" : currency === "USD" ? "$" : (currency ?? "");
  return `${sym}${amount.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExchangesClient({ connections }: ExchangesClientProps) {
  const router = useRouter();
  const t = useTranslations("portfolio");
  const tCommon = useTranslations("common");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<{
    id: string;
    provider: string;
    label: string;
  } | null>(null);

  // Confirm-delete state: stores the id being confirmed
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Syncing state: stores the id being synced
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditingConnection(null);
    setIsModalOpen(true);
  };

  const openEdit = (conn: Connection) => {
    setEditingConnection({ id: conn.id, provider: conn.provider, label: conn.label });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/portfolio/exchanges/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      // swallow
    } finally {
      setIsDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  const handleSync = async (id: string) => {
    setSyncingId(id);
    try {
      await fetch("/api/portfolio/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: id }),
      });
      router.refresh();
    } catch {
      // swallow
    } finally {
      setSyncingId(null);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/portfolio"
            className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {t("title")}
          </Link>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {t("exchangeConnections")}
          </h1>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="flex items-center gap-2 rounded-lg bg-[#0070f3] px-4 py-2 text-sm font-medium text-white hover:bg-[#0060d3] transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t("addExchange")}
        </button>
      </div>

      {/* Empty state */}
      {connections.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-14 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
            <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("noExchanges")}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("noExchangesDescription")}</p>
          <button
            type="button"
            onClick={openAdd}
            className="mt-5 rounded-lg bg-[#0070f3] px-5 py-2 text-sm font-medium text-white hover:bg-[#0060d3] transition"
          >
            {t("addExchange")}
          </button>
        </div>
      )}

      {/* Connection cards */}
      <div className="space-y-3">
        {connections.map((conn) => {
          const meta = PROVIDER_META[conn.provider] ?? {
            name: conn.provider,
            badgeBg: "bg-slate-500",
            badgeLetter: conn.provider.charAt(0),
          };
          const statusDot = STATUS_DOT[conn.syncStatus] ?? STATUS_DOT.IDLE;
          const isConfirmingDelete = confirmDeleteId === conn.id;
          const isSyncingThis = syncingId === conn.id;

          return (
            <div
              key={conn.id}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left: identity + status */}
                <div className="flex items-start gap-4 min-w-0">
                  {/* Provider badge */}
                  <span
                    className={[
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold text-white",
                      meta.badgeLetterClass ?? "text-base",
                      meta.badgeBg,
                    ].join(" ")}
                  >
                    {meta.badgeLetter}
                  </span>

                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {conn.label}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {meta.name}
                      </span>
                    </div>

                    {/* Status row */}
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className={["w-2 h-2 rounded-full shrink-0", statusDot].join(" ")} />
                      <span>
                        {conn.syncStatus === "SUCCESS" && conn.lastSyncAt
                          ? `${t("syncSuccess")} · ${formatRelativeTime(conn.lastSyncAt)}`
                          : conn.syncStatus === "SYNCING"
                          ? t("syncing")
                          : conn.syncStatus === "ERROR"
                          ? t("syncError")
                          : conn.lastSyncAt
                          ? `${t("lastSync")} ${formatRelativeTime(conn.lastSyncAt)}`
                          : t("neverSynced")}
                      </span>
                    </div>

                    {/* Error message */}
                    {conn.syncStatus === "ERROR" && conn.lastSyncError && (
                      <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">
                        {conn.lastSyncError}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: stats */}
                <div className="hidden sm:flex items-center gap-5 shrink-0 text-right">
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{t("assets")}</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {conn.assetCount}
                    </p>
                  </div>
                  {conn.freeCash !== null && (
                    <div>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{t("freeCash")}</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {formatCurrency(conn.freeCash, conn.freeCashCurrency)}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Mobile stats */}
              <div className="sm:hidden mt-3 flex gap-5 text-sm">
                <div>
                  <span className="text-slate-400 dark:text-slate-500 text-xs">{t("assets")}: </span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{conn.assetCount}</span>
                </div>
                {conn.freeCash !== null && (
                  <div>
                    <span className="text-slate-400 dark:text-slate-500 text-xs">{t("freeCash")}: </span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {formatCurrency(conn.freeCash, conn.freeCashCurrency)}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                {/* Sync Now */}
                <button
                  type="button"
                  onClick={() => handleSync(conn.id)}
                  disabled={isSyncingThis || conn.syncStatus === "SYNCING"}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  {isSyncingThis ? (
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                  )}
                  Sync Now
                </button>

                {/* Edit */}
                <button
                  type="button"
                  onClick={() => openEdit(conn)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                  {tCommon("edit")}
                </button>

                {/* Delete / confirm */}
                {isConfirmingDelete ? (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {t("deleteConnectionConfirm")}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(conn.id)}
                      disabled={isDeleting}
                      className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50 transition"
                    >
                      {isDeleting ? tCommon("loading") : tCommon("confirm")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={isDeleting}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                    >
                      {tCommon("cancel")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(conn.id)}
                    className="ml-auto flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                    {tCommon("delete")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      <ExchangeConnectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editConnection={editingConnection}
      />
    </div>
  );
}
