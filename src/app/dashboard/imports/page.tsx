"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, FileSpreadsheet, FileText, Trash2, Loader2, AlertTriangle, Info } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

type ImportLog = {
  id: string;
  fileName: string;
  fileType: string;
  rowsTotal: number;
  rowsSuccess: number;
  rowsFailed: number;
  expenseCount: number;
  createdAt: string;
};

type EmptyProject = {
  id: string;
  name: string;
};

type DeleteConfirmation = {
  log: ImportLog;
  emptyProjects: EmptyProject[];
  deleteEmptyProjects: boolean;
} | null;

export default function ImportsPage() {
  const t = useTranslations("imports");
  const tCommon = useTranslations("common");

  const router = useRouter();
  const [importLogs, setImportLogs] = useState<ImportLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation>(null);

  useEffect(() => {
    fetchImportLogs();
  }, []);

  const fetchImportLogs = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/import-logs");
      if (response.ok) {
        const data = await response.json();
        setImportLogs(data.importLogs || []);
      }
    } catch (error) {
      console.error("Failed to fetch import logs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClick = async (log: ImportLog) => {
    // First, check what would be affected
    try {
      const response = await fetch(`/api/import-logs/${log.id}?checkOnly=true`, {
        method: "DELETE",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.hasEmptyProjects) {
          // Show confirmation modal with empty projects info
          setDeleteConfirmation({
            log,
            emptyProjects: data.emptyProjects,
            deleteEmptyProjects: false,
          });
        } else {
          // No empty projects, show simple confirmation modal
          setDeleteConfirmation({
            log,
            emptyProjects: [],
            deleteEmptyProjects: false,
          });
        }
      }
    } catch (error) {
      console.error("Failed to check import log:", error);
    }
  };

  const executeDelete = async (logId: string, deleteEmptyProjects: boolean) => {
    setDeletingId(logId);
    setDeleteConfirmation(null);

    try {
      const url = `/api/import-logs/${logId}${deleteEmptyProjects ? "?deleteEmptyProjects=true" : ""}`;
      const response = await fetch(url, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchImportLogs();
      }
    } catch (error) {
      console.error("Failed to delete import log:", error);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--ink)" }}>{t("title")}</h1>
          <p className="text-[13.5px] mt-1" style={{ color: "var(--ink-muted)" }}>
            {t("subtitle")}
          </p>
        </div>
        <button
          onClick={() => router.push("/dashboard/import")}
          className="px-4 py-2.5 rounded-[14px] text-[14px] font-semibold flex items-center gap-2 shrink-0 transition-transform active:scale-[0.98]"
          style={{ background: "var(--accent)", color: "var(--accent-fg)", boxShadow: "var(--shadow-fab)" }}
        >
          <UploadCloud className="w-[18px] h-[18px]" strokeWidth={1.8} />
          {t("newImport")}
        </button>
      </div>

      {/* Import Logs List */}
      {isLoading ? (
        <div
          className="p-8 text-center text-[14px] rounded-[20px]"
          style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)", color: "var(--ink-muted)" }}
        >
          {tCommon("loading")}
        </div>
      ) : importLogs.length === 0 ? (
        <div
          className="p-12 text-center rounded-[20px]"
          style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
        >
          <div
            className="w-14 h-14 mx-auto mb-4 rounded-[18px] flex items-center justify-center"
            style={{ background: "var(--accent-tint)" }}
          >
            <UploadCloud className="w-7 h-7" strokeWidth={1.8} style={{ color: "var(--accent)" }} />
          </div>
          <p className="text-[14px]" style={{ color: "var(--ink-muted)" }}>{t("noImportsYet")}</p>
          <button
            onClick={() => router.push("/dashboard/import")}
            className="mt-4 text-[14px] font-semibold"
            style={{ color: "var(--accent)" }}
          >
            {t("importFirstFile")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {importLogs.map((log, i) => {
            const isXlsx = log.fileType === "xlsx" || log.fileType === "xls";
            return (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: EASE, delay: i * 0.05 }}
                className="p-4 rounded-[20px] flex items-center gap-3.5"
                style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
              >
                {/* File Icon */}
                <div
                  className="w-12 h-12 rounded-[12px] flex items-center justify-center shrink-0"
                  style={{ background: "var(--surface-2)" }}
                >
                  {isXlsx ? (
                    <FileSpreadsheet className="w-6 h-6" strokeWidth={1.8} style={{ color: "var(--positive)" }} />
                  ) : (
                    <FileText className="w-6 h-6" strokeWidth={1.8} style={{ color: "var(--accent)" }} />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold truncate" style={{ color: "var(--ink)" }}>{log.fileName}</span>
                    <span
                      className="px-2 py-0.5 text-[10.5px] font-semibold rounded-full uppercase shrink-0"
                      style={{ background: "var(--surface-2)", color: "var(--ink-muted)" }}
                    >
                      {log.fileType}
                    </span>
                  </div>
                  <div className="text-[12px] mt-1" style={{ color: "var(--ink-subtle)" }}>
                    {formatDate(log.createdAt)}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-5 text-center shrink-0">
                  <div>
                    <div className="text-[15px] font-bold tabular-nums" style={{ color: "var(--ink)" }}>{log.expenseCount}</div>
                    <div className="text-[11px]" style={{ color: "var(--ink-subtle)" }}>{t("expenses")}</div>
                  </div>
                  {log.rowsFailed > 0 && (
                    <div>
                      <div className="text-[15px] font-bold tabular-nums" style={{ color: "var(--warning)" }}>{log.rowsFailed}</div>
                      <div className="text-[11px]" style={{ color: "var(--ink-subtle)" }}>{t("failed")}</div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <button
                  onClick={() => handleDeleteClick(log)}
                  disabled={deletingId === log.id}
                  aria-label={t("deleteBatch")}
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors disabled:opacity-50 active:scale-95"
                  style={{ background: "color-mix(in srgb, var(--negative) 10%, transparent)", color: "var(--negative)" }}
                >
                  {deletingId === log.id ? (
                    <Loader2 className="w-[18px] h-[18px] animate-spin" strokeWidth={1.8} />
                  ) : (
                    <Trash2 className="w-[18px] h-[18px]" strokeWidth={1.8} />
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Info Box */}
      <div className="p-4 rounded-[20px]" style={{ background: "var(--surface-2)" }}>
        <div className="flex gap-3">
          <Info className="w-5 h-5 shrink-0 mt-0.5" strokeWidth={1.8} style={{ color: "var(--accent)" }} />
          <div className="text-[13px]" style={{ color: "var(--ink-muted)" }}>
            <p className="font-semibold" style={{ color: "var(--ink)" }}>{t("aboutImportBatches")}</p>
            <p className="mt-1">
              {t("aboutImportBatchesDescription")}
            </p>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmation && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center z-50 p-4"
            style={{ background: "rgba(23,22,31,0.5)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            onClick={() => setDeleteConfirmation(null)}
          >
            <motion.div
              className="rounded-[24px] max-w-md w-full p-6"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-pop)" }}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.25, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "color-mix(in srgb, var(--negative) 12%, transparent)" }}
                >
                  <AlertTriangle className="w-5 h-5" strokeWidth={1.8} style={{ color: "var(--negative)" }} />
                </div>
                <h3 className="text-[17px] font-semibold" style={{ color: "var(--ink)" }}>{t("deleteImportQuestion")}</h3>
              </div>

              <p className="text-[13.5px] mb-4 leading-relaxed" style={{ color: "var(--ink-muted)" }}>
                {t("deletingWillRemove", {
                  fileName: deleteConfirmation.log.fileName,
                  count: deleteConfirmation.log.expenseCount
                })}
              </p>

              {deleteConfirmation.emptyProjects.length > 0 && (
                <div className="mb-4 p-3.5 rounded-[16px]" style={{ background: "var(--surface-2)" }}>
                  <p className="text-[13px] font-semibold mb-2" style={{ color: "var(--ink)" }}>
                    {t("projectsWillBecomeEmpty")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {deleteConfirmation.emptyProjects.map((project) => (
                      <span
                        key={project.id}
                        className="px-2.5 py-1 text-[12.5px] rounded-full"
                        style={{ background: "color-mix(in srgb, var(--warning) 14%, transparent)", color: "var(--warning)" }}
                      >
                        {project.name}
                      </span>
                    ))}
                  </div>

                  <label className="flex items-center gap-2.5 mt-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deleteConfirmation.deleteEmptyProjects}
                      onChange={(e) =>
                        setDeleteConfirmation({
                          ...deleteConfirmation,
                          deleteEmptyProjects: e.target.checked,
                        })
                      }
                      className="w-4 h-4 rounded"
                      style={{ accentColor: "var(--negative)" }}
                    />
                    <span className="text-[13px]" style={{ color: "var(--ink)" }}>
                      {t("alsoDeleteEmptyProjects")}
                    </span>
                  </label>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmation(null)}
                  className="flex-1 px-4 py-3 rounded-[14px] text-[14px] font-semibold transition-colors active:scale-[0.99]"
                  style={{ background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line-strong)" }}
                >
                  {tCommon("cancel")}
                </button>
                <button
                  onClick={() =>
                    executeDelete(
                      deleteConfirmation.log.id,
                      deleteConfirmation.deleteEmptyProjects
                    )
                  }
                  className="flex-1 px-4 py-3 rounded-[14px] text-[14px] font-semibold text-white transition-transform active:scale-[0.99]"
                  style={{ background: "var(--negative)" }}
                >
                  {tCommon("delete")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
