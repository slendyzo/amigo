"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import AddExpenseModal from "./add-expense-modal";
import AddIncomeModal from "./add-income-modal";

type AddTypeSelectorProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function AddTypeSelector({ isOpen, onClose }: AddTypeSelectorProps) {
  const t = useTranslations("common");
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);

  if (!isOpen) return null;

  const handleExpenseClick = () => {
    setShowExpenseModal(true);
    onClose();
  };

  const handleIncomeClick = () => {
    setShowIncomeModal(true);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-50 transition-opacity"
        onClick={onClose}
      />

      {/* Selector Menu - appears from bottom on mobile, centered on desktop */}
      <div className="fixed inset-x-0 bottom-0 z-50 md:inset-0 md:flex md:items-center md:justify-center">
        <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-md w-full md:mx-4 animate-slide-up md:animate-none">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{t("add")}</h3>
              <button
                onClick={onClose}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-slate-500 mt-1">{t("selectType")}</p>
          </div>

          {/* Options */}
          <div className="p-4 space-y-3">
            {/* Expense Option */}
            <button
              onClick={handleExpenseClick}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-[#0070f3] hover:bg-blue-50 transition-all tap-none active:scale-[0.98]"
            >
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <h4 className="font-semibold text-slate-900">{t("expense")}</h4>
                <p className="text-sm text-slate-500">{t("expenseDescription")}</p>
              </div>
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Income Option */}
            <button
              onClick={handleIncomeClick}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-[#0070f3] hover:bg-blue-50 transition-all tap-none active:scale-[0.98]"
            >
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div className="flex-1 text-left">
                <h4 className="font-semibold text-slate-900">{t("income")}</h4>
                <p className="text-sm text-slate-500">{t("incomeDescription")}</p>
              </div>
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Safe area padding for mobile */}
          <div className="pb-safe" />
        </div>
      </div>

      {/* Modals */}
      <AddExpenseModal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
      />
      <AddIncomeModal
        isOpen={showIncomeModal}
        onClose={() => setShowIncomeModal(false)}
      />
    </>
  );
}
