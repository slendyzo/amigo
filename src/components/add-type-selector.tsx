"use client";

import { useState, lazy, Suspense } from "react";
import { useTranslations } from "next-intl";

// Lazy-load all modals to avoid pulling tesseract.js (~300KB) and other heavy deps into initial bundle
const AddExpenseModal = lazy(() => import("./add-expense-modal"));
const AddIncomeModal = lazy(() => import("./add-income-modal"));
const ReceiptScannerModal = lazy(() => import("./receipt-scanner-modal"));

type AddTypeSelectorProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export default function AddTypeSelector({ isOpen, onClose, onSuccess }: AddTypeSelectorProps) {
  const t = useTranslations("common");
  const tScanner = useTranslations("receiptScanner");
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showReceiptScanner, setShowReceiptScanner] = useState(false);

  // Only return null if not open AND no modals are showing
  // This prevents unmounting the modals when the selector closes
  const showSelector = isOpen && !showExpenseModal && !showIncomeModal && !showReceiptScanner;
  const isActive = isOpen || showExpenseModal || showIncomeModal || showReceiptScanner;

  if (!isActive) return null;

  const handleExpenseClick = () => {
    setShowExpenseModal(true);
  };

  const handleIncomeClick = () => {
    setShowIncomeModal(true);
  };

  const handleReceiptClick = () => {
    setShowReceiptScanner(true);
  };

  const handleModalClose = () => {
    setShowExpenseModal(false);
    setShowIncomeModal(false);
    setShowReceiptScanner(false);
    onClose();
    if (onSuccess) onSuccess();
  };

  return (
    <>
      {/* Selector UI - only show when selector is active and no modal is open */}
      {showSelector && (
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

                {/* Receipt Scanner Option */}
                <button
                  onClick={handleReceiptClick}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-[#0070f3] hover:bg-blue-50 transition-all tap-none active:scale-[0.98]"
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-[#0070f3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <h4 className="font-semibold text-slate-900">{tScanner("title")}</h4>
                    <p className="text-sm text-slate-500">{tScanner("captureDescription")}</p>
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
        </>
      )}

      {/* Modals - lazy loaded, only rendered when their state is true */}
      {showExpenseModal && (
        <Suspense fallback={null}>
          <AddExpenseModal
            isOpen={showExpenseModal}
            onClose={handleModalClose}
          />
        </Suspense>
      )}
      {showIncomeModal && (
        <Suspense fallback={null}>
          <AddIncomeModal
            isOpen={showIncomeModal}
            onClose={handleModalClose}
          />
        </Suspense>
      )}
      {showReceiptScanner && (
        <Suspense fallback={null}>
          <ReceiptScannerModal
            isOpen={showReceiptScanner}
            onClose={handleModalClose}
          />
        </Suspense>
      )}
    </>
  );
}
