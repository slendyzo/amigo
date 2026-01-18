"use client";

import { useTranslations } from "next-intl";
import { useCategoryTranslation } from "@/hooks/use-category-translation";

type Expense = {
  id: string;
  name: string;
  amount: number;
  currency?: string;
  amountEur?: number;
  type: "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT";
  date: string;
  isRecurring?: boolean;
  recurringTemplateId?: string | null;
  category: { id: string; name: string } | null;
  bankAccount: { id: string; name: string } | null;
  projects: { id: string; name: string }[];
  notes?: string;
  status?: string;
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  BRL: "R$",
  PLN: "zł",
};

function formatAmount(amount: number, currency?: string): string {
  const symbol = CURRENCY_SYMBOLS[currency || "EUR"] || "€";
  const absAmount = Math.abs(amount);
  if (amount < 0) {
    return `(${symbol}${absAmount.toFixed(2)})`;
  }
  return `${symbol}${amount.toFixed(2)}`;
}

type ExpenseDetailModalProps = {
  isOpen: boolean;
  onClose: () => void;
  expense: Expense | null;
  onEdit?: () => void;
  onDelete?: () => void;
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

  if (!isOpen || !expense) return null;

  const typeColors: Record<string, string> = {
    SURVIVAL_FIXED: "bg-blue-100 text-blue-700",
    SURVIVAL_VARIABLE: "bg-cyan-100 text-cyan-700",
    LIFESTYLE: "bg-purple-100 text-purple-700",
    PROJECT: "bg-amber-100 text-amber-700",
  };

  const typeLabels: Record<string, string> = {
    SURVIVAL_FIXED: t("types.fixed"),
    SURVIVAL_VARIABLE: t("types.variable"),
    LIFESTYLE: t("types.lifestyle"),
    PROJECT: t("types.project"),
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between rounded-t-xl">
          <h2 className="text-lg font-semibold text-slate-900">{t("expenseDetails")}</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Name */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{t("description")}</p>
            <p className="text-lg font-semibold text-slate-900">{expense.name}</p>
          </div>

          {/* Amount */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{t("amount")}</p>
            <p className={`text-2xl font-bold ${Number(expense.amount) < 0 ? 'text-green-600' : 'text-slate-900'}`}>
              {formatAmount(Number(expense.amount), expense.currency)}
            </p>
            {expense.currency && expense.currency !== "EUR" && expense.amountEur && (
              <p className="text-sm text-slate-500 mt-1">≈ €{expense.amountEur.toFixed(2)} EUR</p>
            )}
          </div>

          {/* Date & Time */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{t("date")}</p>
            <div className="flex items-center gap-2">
              {expense.isRecurring && (
                <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
              )}
              <p className="text-sm text-slate-900">{formatDate(expense.date)}</p>
            </div>
          </div>

          {/* Type */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{t("type")}</p>
            <span className={`inline-block text-xs px-2.5 py-1 rounded-full ${typeColors[expense.type]}`}>
              {typeLabels[expense.type]}
            </span>
          </div>

          {/* Category */}
          {expense.category && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{t("category")}</p>
              <p className="text-sm text-slate-900">{translateCategory(expense.category.name)}</p>
            </div>
          )}

          {/* Bank Account */}
          {expense.bankAccount && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{t("bankAccount")}</p>
              <p className="text-sm text-slate-900">{expense.bankAccount.name}</p>
            </div>
          )}

          {/* Projects */}
          {expense.projects && expense.projects.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{t("projects")}</p>
              <div className="flex flex-wrap gap-1.5">
                {expense.projects.map((project) => (
                  <span
                    key={project.id}
                    className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700"
                  >
                    {project.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {expense.notes && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{t("notes")}</p>
              <p className="text-sm text-slate-900 whitespace-pre-wrap">{expense.notes}</p>
            </div>
          )}

          {/* Status */}
          {expense.status && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{t("status")}</p>
              <p className="text-sm text-slate-900">{expense.status}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        {(onEdit || onDelete) && (
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-4 py-3 flex gap-3 rounded-b-xl">
            {onEdit && (
              <button
                onClick={() => {
                  onEdit();
                  onClose();
                }}
                className="flex-1 px-4 py-2.5 bg-[#0070f3] text-white rounded-lg hover:bg-[#0060df] transition-colors font-medium"
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
                className="px-4 py-2.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium"
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
