"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ChevronLeft, Plus, RefreshCw, Pencil, Trash2, AlertTriangle } from "lucide-react";
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

// Provider brand swatches — brand identity colours, intentionally kept.
const PROVIDER_META: Record<string, { name: string; badgeBg: string; badgeLetter: string; badgeLetterClass?: string }> = {
  KRAKEN: { name: "Kraken", badgeBg: "bg-amber-500", badgeLetter: "K" },
  TRADING212: { name: "Trading 212", badgeBg: "bg-blue-500", badgeLetter: "T" },
  BINANCE: { name: "Binance", badgeBg: "bg-yellow-400", badgeLetter: "B" },
  BYBIT: { name: "Bybit", badgeBg: "bg-orange-500", badgeLetter: "B" },
  BYBIT_EU: { name: "Bybit.EU", badgeBg: "bg-orange-500", badgeLetter: "EU", badgeLetterClass: "text-xs tracking-tight" },
  MANUAL: { name: "Manual", badgeBg: "bg-teal-500", badgeLetter: "M" },
};

const STATUS_DOT: Record<string, string> = {
  SUCCESS: "var(--positive)",
  SYNCING: "var(--accent)",
  ERROR: "var(--negative)",
  PARTIAL: "var(--warning)",
  IDLE: "var(--ink-subtle)",
};

const STATUS_LABEL: Record<string, string> = {
  SUCCESS: "Synced",
  SYNCING: "Syncing",
  ERROR: "Error",
  PARTIAL: "Synced (partial)",
  IDLE: "Idle",
};

const STATUS_TEXT_COLOR: Record<string, string> = {
  SUCCESS: "var(--positive)",
  SYNCING: "var(--accent)",
  ERROR: "var(--negative)",
  PARTIAL: "var(--warning)",
  IDLE: "var(--ink-subtle)",
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

const cardShadow = { boxShadow: "var(--shadow-card)" };

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

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
    setActionError(null);
    try {
      const res = await fetch(`/api/portfolio/exchanges/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      } else {
        setActionError(t("deleteFailed"));
      }
    } catch {
      setActionError(t("deleteFailed"));
    } finally {
      setIsDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  const pollConnectionSynced = async (id: string) => {
    const POLL_INTERVAL_MS = 2000;
    const POLL_TIMEOUT_MS = 10 * 60 * 1000;
    const startedAt = Date.now();
    while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      try {
        const res = await fetch("/api/portfolio");
        if (!res.ok) continue;
        const data = (await res.json()) as {
          exchanges?: Array<{ id: string; syncStatus: string }>;
        };
        const conn = data.exchanges?.find((e) => e.id === id);
        if (!conn || conn.syncStatus !== "SYNCING") return;
      } catch {
        // transient — keep polling
      }
    }
  };

  const handleSync = async (id: string) => {
    if (syncingId) return;
    setSyncingId(id);
    setActionError(null);
    try {
      const res = await fetch("/api/portfolio/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: id }),
      });
      if (!res.ok && res.status !== 409) {
        setActionError(t("syncFailed"));
        return;
      }
      await pollConnectionSynced(id);
      router.refresh();
    } catch {
      setActionError(t("syncFailed"));
    } finally {
      setSyncingId(null);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const pillBtn =
    "flex items-center gap-1.5 rounded-[14px] px-3 py-1.5 text-[12px] font-semibold transition-transform active:scale-[0.97]";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/portfolio"
            aria-label={t("title")}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-95"
            style={{ background: "var(--surface)", ...cardShadow }}
          >
            <ChevronLeft className="h-[18px] w-[18px]" style={{ color: "var(--ink)" }} strokeWidth={1.8} />
          </Link>
          <h1 className="text-[16px] font-semibold" style={{ color: "var(--ink)" }}>
            {t("exchangeConnections")}
          </h1>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className={pillBtn}
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          {t("addExchange")}
        </button>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div
          className="flex items-center gap-3 rounded-[16px] px-4 py-3"
          style={{ background: "var(--surface)", border: "1px solid var(--line-strong)" }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "var(--negative)" }} strokeWidth={1.8} />
          <p className="text-[13px]" style={{ color: "var(--ink)" }}>{actionError}</p>
        </div>
      )}

      {/* Empty state */}
      {connections.length === 0 && (
        <div
          className="rounded-[20px] px-6 py-14 text-center"
          style={{ background: "var(--surface)", border: "1.5px dashed var(--line-strong)" }}
        >
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[16px]"
            style={{ background: "var(--surface-2)", color: "var(--accent)" }}
          >
            <Plus className="h-6 w-6" strokeWidth={1.6} />
          </div>
          <p className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>{t("noExchanges")}</p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--ink-muted)" }}>{t("noExchangesDescription")}</p>
          <button
            type="button"
            onClick={openAdd}
            className="mt-5 inline-flex items-center gap-2 rounded-[18px] px-5 py-2.5 text-[13px] font-semibold transition-transform active:scale-[0.98]"
            style={{ background: "var(--accent)", color: "var(--accent-fg)", boxShadow: "var(--shadow-fab)" }}
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
          const isConfirmingDelete = confirmDeleteId === conn.id;
          const isSyncingThis = syncingId === conn.id;
          // Manual sources have no API behind them: nothing to sync, no
          // credentials to edit, and a sync timestamp would be meaningless.
          const isManual = conn.provider === "MANUAL";

          return (
            <div key={conn.id} className="rounded-[20px] p-5" style={{ background: "var(--surface)", ...cardShadow }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <span
                    className={[
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] font-bold text-white",
                      meta.badgeLetterClass ?? "text-base",
                      meta.badgeBg,
                    ].join(" ")}
                  >
                    {meta.badgeLetter}
                  </span>

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
                        {conn.label}
                      </span>
                      <span className="text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>
                        {meta.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11.5px]">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${conn.syncStatus === "SYNCING" && !isManual ? "animate-pulse" : ""}`}
                        style={{
                          background: isManual
                            ? "var(--ink-subtle)"
                            : (STATUS_DOT[conn.syncStatus] ?? STATUS_DOT.IDLE),
                        }}
                      />
                      <span style={{ color: isManual ? "var(--ink-subtle)" : (STATUS_TEXT_COLOR[conn.syncStatus] ?? STATUS_TEXT_COLOR.IDLE) }}>
                        {isManual
                          ? t("manualHoldingsCount", { count: conn.assetCount })
                          : conn.syncStatus === "SUCCESS" && conn.lastSyncAt
                          ? `${t("syncSuccess")} · ${formatRelativeTime(conn.lastSyncAt)}`
                          : conn.syncStatus === "PARTIAL" && conn.lastSyncAt
                          ? `${STATUS_LABEL.PARTIAL} · ${formatRelativeTime(conn.lastSyncAt)}`
                          : STATUS_LABEL[conn.syncStatus] ??
                            (conn.lastSyncAt
                              ? `${t("lastSync")} ${formatRelativeTime(conn.lastSyncAt)}`
                              : t("neverSynced"))}
                      </span>
                    </div>

                    {(conn.syncStatus === "ERROR" || conn.syncStatus === "PARTIAL") &&
                      conn.lastSyncError && (
                        <p
                          className="mt-0.5 text-[11.5px]"
                          style={{ color: conn.syncStatus === "PARTIAL" ? "var(--warning)" : "var(--negative)" }}
                        >
                          {conn.lastSyncError}
                        </p>
                      )}
                  </div>
                </div>

                <div className="hidden shrink-0 items-center gap-5 text-right sm:flex">
                  <div>
                    <p className="text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>{t("assets")}</p>
                    <p className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>{conn.assetCount}</p>
                  </div>
                  {conn.freeCash !== null && (
                    <div>
                      <p className="text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>{t("freeCash")}</p>
                      <p className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--ink)" }}>
                        {formatCurrency(conn.freeCash, conn.freeCashCurrency)}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Mobile stats */}
              <div className="mt-3 flex gap-5 text-[13px] sm:hidden">
                <div>
                  <span className="text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>{t("assets")}: </span>
                  <span className="font-semibold" style={{ color: "var(--ink)" }}>{conn.assetCount}</span>
                </div>
                {conn.freeCash !== null && (
                  <div>
                    <span className="text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>{t("freeCash")}: </span>
                    <span className="font-semibold tabular-nums" style={{ color: "var(--ink)" }}>
                      {formatCurrency(conn.freeCash, conn.freeCashCurrency)}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {isManual ? (
                  <span className="text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>
                    {t("manualSourceHint")}
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSync(conn.id)}
                      disabled={isSyncingThis || conn.syncStatus === "SYNCING"}
                      className={pillBtn + " disabled:opacity-40"}
                      style={{ background: "var(--surface-2)", color: "var(--accent-strong)" }}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isSyncingThis ? "animate-spin" : ""}`} strokeWidth={2} />
                      {t("syncAll")}
                    </button>

                    <button
                      type="button"
                      onClick={() => openEdit(conn)}
                      className={pillBtn}
                      style={{ background: "var(--app-bg)", color: "var(--ink-muted)" }}
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                      {tCommon("edit")}
                    </button>
                  </>
                )}

                {isConfirmingDelete ? (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[11.5px]" style={{ color: "var(--ink-muted)" }}>
                      {t("deleteConnectionConfirm")}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(conn.id)}
                      disabled={isDeleting}
                      className="rounded-[14px] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
                      style={{ background: "var(--negative)" }}
                    >
                      {isDeleting ? tCommon("loading") : tCommon("confirm")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={isDeleting}
                      className={pillBtn}
                      style={{ background: "var(--app-bg)", color: "var(--ink-muted)" }}
                    >
                      {tCommon("cancel")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(conn.id)}
                    className={pillBtn + " ml-auto"}
                    style={{ background: "var(--app-bg)", color: "var(--negative)" }}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                    {tCommon("delete")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ExchangeConnectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editConnection={editingConnection}
      />
    </div>
  );
}
