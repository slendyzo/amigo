"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

type ExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  currentFilters: {
    typeFilter: string;
    categoryFilter: string;
    selectedMonthFilter: string; // "YYYY-MM" or "all"
  };
};

type ExportFormat = "csv" | "xlsx" | "pdf" | "md";
type TimeRange = "all" | "last3" | "lastMonth" | "current";

const FORMAT_OPTIONS: { key: ExportFormat; icon: React.ReactNode }[] = [
  {
    key: "csv",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 2h8l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
        <path d="M12 2v4h4" />
        <path d="M6 10h8" />
        <path d="M6 13h8" />
        <path d="M6 16h4" />
      </svg>
    ),
  },
  {
    key: "xlsx",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="16" height="14" rx="1" />
        <path d="M2 7h16" />
        <path d="M2 11h16" />
        <path d="M2 15h16" />
        <path d="M7 3v14" />
        <path d="M12 3v14" />
      </svg>
    ),
  },
  {
    key: "pdf",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 2h8l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
        <path d="M12 2v4h4" />
        <path d="M10 14l-3-3m0 0l3-3m-3 3h6" />
      </svg>
    ),
  },
  {
    key: "md",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 7l-3 3 3 3" />
        <path d="M14 7l3 3-3 3" />
        <path d="M11 5l-2 10" />
      </svg>
    ),
  },
];

function getMonthName(date: Date): string {
  return date.toLocaleString("default", { month: "long", year: "numeric" });
}

function getShortMonthName(date: Date): string {
  return date.toLocaleString("default", { month: "short", year: "numeric" });
}

export default function ExportModal({
  isOpen,
  onClose,
  currentFilters,
}: ExportModalProps) {
  const t = useTranslations("exportModal");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [timeRange, setTimeRange] = useState<TimeRange>("current");
  const [isExporting, setIsExporting] = useState(false);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isExporting) {
        onClose();
      }
    },
    [isExporting, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormat("csv");
      setTimeRange("current");
      setIsExporting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Compute time range descriptions
  const now = new Date();

  const last3Start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const last3Desc = `${getShortMonthName(last3Start)} – ${getShortMonthName(now)}`;

  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthDesc = getMonthName(lastMonthDate);

  const currentViewDesc = (() => {
    const parts: string[] = [];
    if (
      currentFilters.selectedMonthFilter &&
      currentFilters.selectedMonthFilter !== "all"
    ) {
      const [year, month] = currentFilters.selectedMonthFilter.split("-");
      const d = new Date(parseInt(year), parseInt(month) - 1, 1);
      parts.push(getMonthName(d));
    } else {
      parts.push("All time");
    }
    if (currentFilters.typeFilter && currentFilters.typeFilter !== "all") {
      const label = currentFilters.typeFilter
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      parts.push(label);
    } else {
      parts.push("All types");
    }
    return parts.join(", ");
  })();

  const timeRangeOptions: {
    key: TimeRange;
    labelKey: string;
    desc: string;
  }[] = [
    { key: "all", labelKey: "allData", desc: t("allDataDesc") },
    { key: "last3", labelKey: "last3Months", desc: last3Desc },
    { key: "lastMonth", labelKey: "lastMonth", desc: lastMonthDesc },
    { key: "current", labelKey: "currentView", desc: currentViewDesc },
  ];

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("format", format);

      // Compute dates based on time range
      if (timeRange === "last3") {
        const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        params.set("startDate", start.toISOString().split("T")[0]);
        params.set("endDate", now.toISOString().split("T")[0]);
      } else if (timeRange === "lastMonth") {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        params.set("startDate", start.toISOString().split("T")[0]);
        params.set("endDate", end.toISOString().split("T")[0]);
      } else if (timeRange === "current") {
        if (
          currentFilters.selectedMonthFilter &&
          currentFilters.selectedMonthFilter !== "all"
        ) {
          const [year, month] = currentFilters.selectedMonthFilter.split("-");
          const start = new Date(parseInt(year), parseInt(month) - 1, 1);
          const end = new Date(parseInt(year), parseInt(month), 0);
          params.set("startDate", start.toISOString().split("T")[0]);
          params.set("endDate", end.toISOString().split("T")[0]);
        }
        if (
          currentFilters.typeFilter &&
          currentFilters.typeFilter !== "all"
        ) {
          params.set("type", currentFilters.typeFilter);
        }
        if (
          currentFilters.categoryFilter &&
          currentFilters.categoryFilter !== "all"
        ) {
          params.set("categoryId", currentFilters.categoryFilter);
        }
      }
      // "all" time range: no date params

      const response = await fetch(`/api/export?${params.toString()}`);
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext =
        format === "xlsx"
          ? "xlsx"
          : format === "pdf"
            ? "pdf"
            : format === "md"
              ? "md"
              : "csv";
      a.download = `amigo-export-${new Date().toISOString().split("T")[0]}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onClose();
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleBackdropClick = () => {
    if (!isExporting) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300" />

      {/* Modal Card */}
      <div
        className="relative mt-[15vh] mx-4 w-full max-w-md rounded-2xl bg-white shadow-xl p-6 transition-all duration-300 ease-out"
        style={{ animation: "exportModalSlideIn 0.3s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{t("title")}</h2>
          <button
            onClick={() => !isExporting && onClose()}
            className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-600"
            disabled={isExporting}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 4l10 10M14 4L4 14" />
            </svg>
          </button>
        </div>

        {/* Format Section */}
        <div className="mt-5">
          <label className="text-sm font-medium text-slate-700">
            {t("formatLabel")}
          </label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {FORMAT_OPTIONS.map((opt) => {
              const isSelected = format === opt.key;
              const labelKey = opt.key === "xlsx" ? "excel" : opt.key;
              const descKey =
                opt.key === "xlsx"
                  ? "excelDesc"
                  : opt.key === "csv"
                    ? "csvDesc"
                    : opt.key === "pdf"
                      ? "pdfDesc"
                      : "markdownDesc";
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setFormat(opt.key)}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`mt-0.5 shrink-0 ${
                      isSelected ? "text-blue-600" : "text-slate-400"
                    }`}
                  >
                    {opt.icon}
                  </span>
                  <div className="min-w-0">
                    <div
                      className={`text-sm font-medium ${
                        isSelected ? "text-blue-900" : "text-slate-900"
                      }`}
                    >
                      {t(labelKey as "csv" | "excel" | "pdf" | "markdown")}
                    </div>
                    <div
                      className={`text-xs mt-0.5 ${
                        isSelected ? "text-blue-600" : "text-slate-500"
                      }`}
                    >
                      {t(
                        descKey as
                          | "csvDesc"
                          | "excelDesc"
                          | "pdfDesc"
                          | "markdownDesc"
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Time Range Section */}
        <div className="mt-5">
          <label className="text-sm font-medium text-slate-700">
            {t("rangeLabel")}
          </label>
          <div className="mt-2 space-y-2">
            {timeRangeOptions.map((opt) => {
              const isSelected = timeRange === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setTimeRange(opt.key)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  {/* Radio dot */}
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200 ${
                      isSelected
                        ? "border-blue-500"
                        : "border-slate-300"
                    }`}
                  >
                    {isSelected && (
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-sm font-medium ${
                        isSelected ? "text-blue-900" : "text-slate-900"
                      }`}
                    >
                      {t(
                        opt.labelKey as
                          | "allData"
                          | "last3Months"
                          | "lastMonth"
                          | "currentView"
                      )}
                    </div>
                    <div
                      className={`text-xs mt-0.5 ${
                        isSelected ? "text-blue-600" : "text-slate-500"
                      }`}
                    >
                      {opt.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => !isExporting && onClose()}
            disabled={isExporting}
            className="px-4 py-2 text-sm text-slate-600 transition-colors duration-150 hover:text-slate-900 disabled:opacity-50"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting && (
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {isExporting ? t("exporting") : t("exportBtn")}
          </button>
        </div>
      </div>

      {/* Slide-in animation */}
      <style jsx>{`
        @keyframes exportModalSlideIn {
          from {
            opacity: 0;
            transform: translateY(-12px) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
