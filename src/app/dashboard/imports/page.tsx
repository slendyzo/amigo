"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

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
          // No empty projects, proceed with simple confirmation
          const confirmMsg = `Delete this import batch?\n\nFile: ${log.fileName}\nExpenses: ${log.expenseCount}\n\nThis will permanently delete all ${log.expenseCount} expenses.`;
          if (confirm(confirmMsg)) {
            executeDelete(log.id, false);
          }
        }
      }
    } catch (error) {
      console.error("Failed to check import log:", error);
      alert("Failed to check import batch");
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
      } else {
        alert("Failed to delete import batch");
      }
    } catch (error) {
      console.error("Failed to delete import log:", error);
      alert("Failed to delete import batch");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Import History</h1>
          <p className="text-sm text-slate-500 mt-1">
            View and manage your imported expense batches
          </p>
        </div>
        <button
          onClick={() => router.push("/dashboard/import")}
          className="px-4 py-2 bg-[#0070f3] text-white rounded-lg hover:bg-[#0060df] transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          New Import
        </button>
      </div>

      {/* Import Logs List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : importLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <svg className="w-12 h-12 mx-auto mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p>No imports yet</p>
            <button
              onClick={() => router.push("/dashboard/import")}
              className="mt-4 text-[#0070f3] hover:text-[#0060df] font-medium"
            >
              Import your first file
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {importLogs.map((log) => (
              <div key={log.id} className="p-4 flex items-center gap-4 hover:bg-slate-50">
                {/* File Icon */}
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  log.fileType === "xlsx" ? "bg-green-100" : "bg-blue-100"
                }`}>
                  <svg className={`w-6 h-6 ${log.fileType === "xlsx" ? "text-green-600" : "text-blue-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900 truncate">{log.fileName}</span>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600 uppercase">
                      {log.fileType}
                    </span>
                  </div>
                  <div className="text-sm text-slate-500 mt-1">
                    {formatDate(log.createdAt)}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <div className="font-semibold text-slate-900">{log.expenseCount}</div>
                    <div className="text-slate-500">expenses</div>
                  </div>
                  {log.rowsFailed > 0 && (
                    <div className="text-center">
                      <div className="font-semibold text-amber-600">{log.rowsFailed}</div>
                      <div className="text-slate-500">failed</div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDeleteClick(log)}
                    disabled={deletingId === log.id}
                    className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {deletingId === log.id ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Deleting...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete Batch
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-amber-800">
            <p className="font-medium">About Import Batches</p>
            <p className="mt-1">
              Each import creates a batch that groups all expenses from that file.
              Deleting a batch will permanently remove all expenses that were imported together.
              This is useful if you accidentally imported the wrong file or duplicate data.
            </p>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal for Empty Projects */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Delete Import?</h3>
            </div>

            <p className="text-slate-600 mb-4">
              Deleting <strong>{deleteConfirmation.log.fileName}</strong> will remove{" "}
              <strong>{deleteConfirmation.log.expenseCount}</strong> expenses.
            </p>

            {deleteConfirmation.emptyProjects.length > 0 && (
              <div className="mb-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-sm font-medium text-slate-700 mb-2">
                  These projects will become empty:
                </p>
                <div className="flex flex-wrap gap-2">
                  {deleteConfirmation.emptyProjects.map((project) => (
                    <span
                      key={project.id}
                      className="px-2 py-1 text-sm rounded-full bg-amber-100 text-amber-700"
                    >
                      {project.name}
                    </span>
                  ))}
                </div>

                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deleteConfirmation.deleteEmptyProjects}
                    onChange={(e) =>
                      setDeleteConfirmation({
                        ...deleteConfirmation,
                        deleteEmptyProjects: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm text-slate-700">
                    Also delete these empty projects
                  </span>
                </label>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmation(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  executeDelete(
                    deleteConfirmation.log.id,
                    deleteConfirmation.deleteEmptyProjects
                  )
                }
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
