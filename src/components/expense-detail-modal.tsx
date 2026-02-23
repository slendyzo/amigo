"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import { useModalBodyClass } from "@/hooks/use-modal-body-class";
import { formatCurrency, getCurrencySymbol } from "@/lib/currencies";
import { EXPENSE_TYPE_BADGE_CLASSES } from "@/lib/expense-types";
import type { Expense } from "@/types/models";

type ExpenseDetailModalProps = {
  isOpen: boolean;
  onClose: () => void;
  expense: Expense | null;
  onEdit?: () => void;
  onDelete?: () => void;
};

// Soft gradient backgrounds per expense type
const TYPE_HERO_GRADIENTS: Record<string, string> = {
  LIFESTYLE: "linear-gradient(135deg, #ede9fe 0%, #e0e7ff 40%, #f8fafc 100%)",
  SURVIVAL_FIXED: "linear-gradient(135deg, #dbeafe 0%, #e0e7ff 40%, #f8fafc 100%)",
  SURVIVAL_VARIABLE: "linear-gradient(135deg, #cffafe 0%, #e0f2fe 40%, #f8fafc 100%)",
  PROJECT: "linear-gradient(135deg, #fef3c7 0%, #fef9c3 40%, #f8fafc 100%)",
};

// Badge classes for status pills (using /80 opacity variants)
const STATUS_PILL_CLASSES = {
  paid: "bg-green-100/80 text-green-700",
  pending: "bg-blue-100/80 text-blue-700",
  recurring: "bg-sky-100/80 text-sky-700",
  excluded: "bg-slate-200/80 text-slate-600",
};

export default function ExpenseDetailModal({
  isOpen,
  onClose,
  expense,
  onEdit,
  onDelete,
}: ExpenseDetailModalProps) {
  const t = useTranslations("expenses");
  const tCommon = useTranslations("common");
  const { translateCategory } = useCategoryTranslation();
  const [showMetadata, setShowMetadata] = useState(false);
  const [fullExpense, setFullExpense] = useState<Expense | null>(null);
  const [isLoadingFull, setIsLoadingFull] = useState(false);

  useModalBodyClass(isOpen);

  // Fetch full expense data when modal opens (for fields not in list endpoint)
  useEffect(() => {
    if (isOpen && expense?.id) {
      setShowMetadata(false);
      setFullExpense(null);
      setIsLoadingFull(true);
      fetch(`/api/expenses/${expense.id}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.expense) {
            setFullExpense(data.expense);
          }
        })
        .catch(() => {})
        .finally(() => setIsLoadingFull(false));
    }
  }, [isOpen, expense?.id]);

  if (!isOpen || !expense) return null;

  // Merge: prefer full data if available, fall back to prop data
  const e = fullExpense || expense;

  const amount = Number(e.amount);
  const amountEur = e.amountEur != null ? Number(e.amountEur) : null;
  const exchangeRate = e.exchangeRate != null ? Number(e.exchangeRate) : null;
  const isNonEur = e.currency && e.currency !== "EUR" && amountEur != null;
  const isRefund = amount < 0;

  const typeLabels: Record<string, string> = {
    SURVIVAL_FIXED: t("types.fixed"),
    SURVIVAL_VARIABLE: t("types.variable"),
    LIFESTYLE: t("types.lifestyle"),
    PROJECT: t("types.project"),
  };

  const formatDate = (dateString: string, includeTime = false) => {
    const date = new Date(dateString);
    const options: Intl.DateTimeFormatOptions = {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    };
    if (includeTime) {
      options.hour = "2-digit";
      options.minute = "2-digit";
    }
    return date.toLocaleDateString("en-GB", options);
  };

  const formatShortDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  };

  const formatTimestamp = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const heroGradient = TYPE_HERO_GRADIENTS[e.type] || TYPE_HERO_GRADIENTS.LIFESTYLE;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/35 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-popup"
        style={{ maxHeight: "75vh" }}
      >
        {/* ==============================
            HERO SECTION
            ============================== */}
        <div
          className="flex-shrink-0 relative px-4 pt-3.5 pb-4 md:px-5 md:pt-4 md:pb-4"
          style={{ background: heroGradient }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-white/60 text-slate-400 hover:bg-white/80 hover:text-slate-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Pills row */}
          <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
            {/* Type badge */}
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${EXPENSE_TYPE_BADGE_CLASSES[e.type] || "bg-slate-100 text-slate-700"}`} style={{ opacity: 0.8 }}>
              {typeLabels[e.type]}
            </span>

            {/* Paid/Pending */}
            {e.status === "PAID" && (
              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_PILL_CLASSES.paid}`}>
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {t("paid")}
              </span>
            )}
            {e.status === "PENDING" && (
              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_PILL_CLASSES.pending}`}>
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t("scheduled")}
              </span>
            )}

            {/* Recurring */}
            {e.isRecurring && (
              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_PILL_CLASSES.recurring}`}>
                <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                {t("recurringLabel")}
              </span>
            )}

            {/* Excluded from budget */}
            {e.excludeFromBudget && (
              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_PILL_CLASSES.excluded}`}>
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M3 3l18 18" />
                </svg>
                {t("excludedFromBudget")}
              </span>
            )}
          </div>

          {/* Desktop: Name + Amount side by side. Mobile: stacked */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between md:gap-4">
            <div className="min-w-0 md:flex-1">
              {/* Name */}
              <p className="text-base font-semibold text-slate-900 pr-8 md:pr-0 mb-1 md:truncate">
                {e.name}
              </p>
              {/* Forex subtitle (mobile: below name, desktop: below name) */}
              {isNonEur && (
                <p className="text-xs text-slate-500 hidden md:block">
                  ≈ <span className="font-medium text-slate-600">EUR {Math.abs(amountEur!).toFixed(2)}</span>
                  <span className="mx-0.5 text-slate-300">&middot;</span>
                  1 {e.currency} = {exchangeRate?.toFixed(4) ?? "—"} EUR
                </p>
              )}
            </div>
            {/* Amount */}
            <p className={`text-3xl font-extrabold tracking-tight leading-none mb-1 md:mb-0 flex-shrink-0 ${isRefund ? "text-green-600" : "text-slate-900"}`}>
              {formatCurrency(amount, e.currency)}
            </p>
          </div>

          {/* Forex subtitle (mobile only, below amount) */}
          {isNonEur && (
            <p className="text-xs text-slate-500 md:hidden">
              ≈ <span className="font-medium text-slate-600">EUR {Math.abs(amountEur!).toFixed(2)}</span>
              <span className="mx-0.5 text-slate-300">&middot;</span>
              1 {e.currency} = {exchangeRate?.toFixed(4) ?? "—"} EUR
            </p>
          )}
        </div>

        {/* ==============================
            SCROLLABLE BODY
            ============================== */}
        <div className="flex-1 overflow-y-auto scroll-touch">

          {/* Forex strip */}
          {isNonEur && (
            <div className="px-4 py-2.5 md:px-5 bg-slate-50/80 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5 flex-1">
                  <span className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-600">
                    {getCurrencySymbol(e.currency!)}
                  </span>
                  <span className="text-xs font-medium text-slate-600">
                    {Math.abs(amount).toFixed(2)} {e.currency}
                  </span>
                </div>
                <svg className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
                <div className="flex items-center gap-1.5 flex-1 justify-end">
                  <span className="text-xs font-semibold text-slate-900">
                    {Math.abs(amountEur!).toFixed(2)} EUR
                  </span>
                  <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[9px] font-bold text-blue-600">
                    &euro;
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 text-center">
                {t("rateFrom", { date: formatShortDate(e.date) })}
              </p>
            </div>
          )}

          {/* Photo gallery */}
          {(() => {
            const images: string[] = e.imageUrls ? JSON.parse(e.imageUrls) : [];
            if (images.length === 0) return null;
            return (
              <div className="px-4 py-3 md:px-5 border-b border-slate-100">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">{t("photos")}</p>
                <div className="grid grid-cols-3 gap-2">
                  {images.map((url, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => window.open(url, "_blank")}
                      className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 hover:border-slate-300 transition-colors"
                    >
                      <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Detail rows */}
          <div className="px-4 py-3 md:px-5 md:py-4 space-y-3">

            {/* ---- Classification ---- */}
            <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-x-6 md:gap-y-3 md:space-y-0">
              {/* Type */}
              <DetailRow
                icon={<svg className="w-3.5 h-3.5 text-purple-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>}
                iconBg="bg-purple-50"
                label={t("type")}
                value={typeLabels[e.type]}
              />

              {/* Category */}
              {e.category && (
                <DetailRow
                  icon={<svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>}
                  iconBg="bg-slate-50"
                  label={t("category")}
                  value={translateCategory(e.category.name)}
                />
              )}

              {/* Bank Account */}
              {e.bankAccount && (
                <DetailRow
                  icon={<svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>}
                  iconBg="bg-slate-50"
                  label={t("bankAccount")}
                  value={e.bankAccount.name}
                />
              )}

              {/* Date (desktop grid) */}
              <div className="hidden md:flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide leading-none">{t("date")}</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{formatDate(e.date)}</p>
                </div>
              </div>

              {/* Projects (full width on desktop) */}
              {e.projects && e.projects.length > 0 && (
                <div className="flex items-start gap-2.5 md:col-span-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide leading-none">{t("projects")}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {e.projects.map((project) => (
                        <span key={project.id} className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                          {project.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="h-px bg-slate-100" />

            {/* ---- Timeline ---- */}
            <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-x-6 md:gap-y-3 md:space-y-0">
              {/* Date (mobile only) */}
              <div className="flex items-center gap-2.5 md:hidden">
                <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide leading-none">{t("date")}</p>
                  <p className="text-sm font-medium text-slate-900 mt-0.5">{formatDate(e.date)}</p>
                </div>
              </div>

              {/* Due Date */}
              {e.dueDate && (
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide leading-none">{t("dueDate")}</p>
                    <p className="text-sm font-medium text-slate-900 mt-0.5">{formatDate(e.dueDate)}</p>
                  </div>
                </div>
              )}

              {/* Paid At */}
              {e.paidAt && (
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide leading-none">{t("paidAt")}</p>
                    <p className="text-sm font-medium text-slate-900 mt-0.5">{formatDate(e.paidAt, true)}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            {(e.notes || e.description) && (
              <>
                <div className="h-px bg-slate-100" />
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1.5">{t("notes")}</p>
                  <div className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-lg p-2.5 border-l-[3px] border-slate-200">
                    {e.notes || e.description}
                  </div>
                </div>
              </>
            )}

            {/* ---- Metadata (collapsible) ---- */}
            {!isLoadingFull && (
              <>
                <button
                  onClick={() => setShowMetadata(!showMetadata)}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${showMetadata ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  {showMetadata ? t("hideDetails") : t("showDetails")}
                </button>

                <div
                  className={`overflow-hidden transition-all duration-250 ease-in-out ${
                    showMetadata ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <div className="space-y-1.5 pl-4 border-l-2 border-slate-100 ml-0.5 md:grid md:grid-cols-2 md:gap-x-6 md:gap-y-1.5 md:space-y-0">
                    {e.rawInput && (
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">{t("rawInput")}</p>
                        <p className="text-xs font-mono text-slate-500 mt-0.5">{e.rawInput}</p>
                      </div>
                    )}
                    {e.merchant && (
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">{t("merchant")}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{e.merchant}</p>
                      </div>
                    )}
                    {e.createdAt && (
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">{t("createdAt")}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{formatTimestamp(e.createdAt)}</p>
                      </div>
                    )}
                    {e.updatedAt && (
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">{t("updatedAt")}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{formatTimestamp(e.updatedAt)}</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="h-1" />
          </div>
        </div>

        {/* ==============================
            FOOTER ACTIONS
            ============================== */}
        {(onEdit || onDelete) && (
          <div className="flex-shrink-0 px-4 py-2.5 md:px-5 border-t border-slate-100 flex gap-2.5 bg-white pb-safe">
            {onEdit && (
              <button
                onClick={() => {
                  onEdit();
                  onClose();
                }}
                className="flex-1 py-2 rounded-lg bg-[#0070f3] text-white text-sm font-semibold hover:bg-[#0060df] transition-colors"
              >
                {tCommon("edit")}
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => {
                  onDelete();
                  onClose();
                }}
                className="py-2 px-4 rounded-lg border border-red-200 text-red-500 text-sm font-semibold hover:bg-red-50 transition-colors"
              >
                {tCommon("delete")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ==============================
   DETAIL ROW HELPER
   ============================== */
function DetailRow({
  icon,
  iconBg,
  label,
  value,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-400 uppercase tracking-wide leading-none">{label}</p>
        <p className="text-sm font-medium text-slate-900 mt-0.5">{value}</p>
      </div>
    </div>
  );
}
