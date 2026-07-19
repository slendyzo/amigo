"use client";

import { useState, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

// Lazy-load all modals to avoid pulling tesseract.js (~300KB) and other heavy deps into initial bundle
const AddExpenseModal = lazy(() => import("./add-expense-modal"));
const AddIncomeModal = lazy(() => import("./add-income-modal"));
const ReceiptScannerModal = lazy(() => import("./receipt-scanner-modal"));
const AddVehicleModal = lazy(() => import("./add-vehicle-modal"));
const AddPropertyModal = lazy(() => import("./add-property-modal"));

type CreatedExpense = {
  id: string;
  name: string;
  date: string;
  type: string;
  amount: number;
  currency: string;
  amountEur: number;
  categoryName: string;
  projects: { id: string; name: string }[];
  excludeFromBudget: boolean;
  splitCount: number | null;
  splitData: string | null;
  status: string;
  createdAt: string;
};

type AddTypeSelectorProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onExpenseCreated?: (expense: CreatedExpense) => void;
};

export default function AddTypeSelector({ isOpen, onClose, onExpenseCreated }: AddTypeSelectorProps) {
  const router = useRouter();
  const t = useTranslations("common");
  const tScanner = useTranslations("receiptScanner");
  const tRwa = useTranslations("rwa");
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showReceiptScanner, setShowReceiptScanner] = useState(false);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showPropertyModal, setShowPropertyModal] = useState(false);

  // Only return null if not open AND no modals are showing
  // This prevents unmounting the modals when the selector closes
  const showSelector = isOpen && !showExpenseModal && !showIncomeModal && !showReceiptScanner && !showVehicleModal && !showPropertyModal;
  const isActive = isOpen || showExpenseModal || showIncomeModal || showReceiptScanner || showVehicleModal || showPropertyModal;

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

  const handleVehicleClick = () => {
    setShowVehicleModal(true);
  };

  const handlePropertyClick = () => {
    setShowPropertyModal(true);
  };

  const handleModalClose = () => {
    setShowExpenseModal(false);
    setShowIncomeModal(false);
    setShowReceiptScanner(false);
    setShowVehicleModal(false);
    setShowPropertyModal(false);
    onClose();
    // Don't call onSuccess here - modals call router.refresh() which
    // triggers server re-render. The parent syncs via useEffect on prop changes.
    // Calling both causes a race condition that makes the budget display go haywire.
  };

  return (
    <>
      {/* Selector UI - only show when selector is active and no modal is open */}
      {showSelector && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 transition-opacity"
            style={{ background: "rgba(23,22,31,.45)" }}
            onClick={onClose}
          />

          {/* Selector Menu - appears from bottom on mobile, centered on desktop */}
          <div className="fixed inset-x-0 bottom-0 z-50 md:inset-0 md:flex md:items-center md:justify-center">
            <div
              className="rounded-t-[28px] md:rounded-[28px] max-w-md w-full md:mx-4 animate-slide-up md:animate-none"
              style={{ background: "var(--app-bg)", boxShadow: "var(--shadow-pop)" }}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-[var(--line)]">
                <div className="flex items-center justify-between">
                  <h3 className="text-[17px] font-bold text-[var(--ink)]">{t("add")}</h3>
                  <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-full transition-colors text-[var(--ink-subtle)] hover:text-[var(--ink)]"
                    style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <p className="text-sm text-[var(--ink-muted)] mt-1">{t("selectType")}</p>
              </div>

              {/* Options */}
              <div className="p-4 space-y-3">
                {/* Expense Option */}
                <button
                  onClick={handleExpenseClick}
                  className="w-full flex items-center gap-4 p-4 rounded-[18px] border border-[var(--line)] transition-all tap-none active:scale-[0.98]"
                  style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "var(--surface-2)" }}>
                    <svg className="w-6 h-6 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <h4 className="font-semibold text-[var(--ink)]">{t("expense")}</h4>
                    <p className="text-sm text-[var(--ink-muted)]">{t("expenseDescription")}</p>
                  </div>
                  <svg className="w-5 h-5 text-[var(--ink-subtle)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Income Option */}
                <button
                  onClick={handleIncomeClick}
                  className="w-full flex items-center gap-4 p-4 rounded-[18px] border border-[var(--line)] transition-all tap-none active:scale-[0.98]"
                  style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#E7F5EE" }}>
                    <svg className="w-6 h-6 text-[var(--positive)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <h4 className="font-semibold text-[var(--ink)]">{t("income")}</h4>
                    <p className="text-sm text-[var(--ink-muted)]">{t("incomeDescription")}</p>
                  </div>
                  <svg className="w-5 h-5 text-[var(--ink-subtle)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Recurring / fixed expense Option (Nuno feedback: give fixed expenses a home) */}
                <button
                  onClick={() => { onClose(); router.push("/dashboard/recurring"); }}
                  className="w-full flex items-center gap-4 p-4 rounded-[18px] border border-[var(--line)] transition-all tap-none active:scale-[0.98]"
                  style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "var(--surface-2)" }}>
                    <svg className="w-6 h-6 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M19 9A8 8 0 006.3 5.3M5 15a8 8 0 0012.7 3.7" />
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <h4 className="font-semibold text-[var(--ink)]">{t("recurring")}</h4>
                    <p className="text-sm text-[var(--ink-muted)]">{t("recurringDescription")}</p>
                  </div>
                  <svg className="w-5 h-5 text-[var(--ink-subtle)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Receipt Scanner Option */}
                <button
                  onClick={handleReceiptClick}
                  className="w-full flex items-center gap-4 p-4 rounded-[18px] border border-[var(--line)] transition-all tap-none active:scale-[0.98]"
                  style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#E9F1FB" }}>
                    <svg className="w-6 h-6" style={{ color: "#3D74B8" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <h4 className="font-semibold text-[var(--ink)]">{tScanner("title")}</h4>
                    <p className="text-sm text-[var(--ink-muted)]">{tScanner("captureDescription")}</p>
                  </div>
                  <svg className="w-5 h-5 text-[var(--ink-subtle)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Vehicle Option */}
                <button
                  onClick={handleVehicleClick}
                  className="w-full flex items-center gap-4 p-4 rounded-[18px] border border-[var(--line)] transition-all tap-none active:scale-[0.98]"
                  style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "var(--surface-2)" }}>
                    <svg className="w-6 h-6 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 17H3v-5l2-5h11l4 5v5h-2M5 17h10M5 12h14" />
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <h4 className="font-semibold text-[var(--ink)]">{tRwa("addVehicle")}</h4>
                    <p className="text-sm text-[var(--ink-muted)]">{tRwa("addVehicleDescription")}</p>
                  </div>
                  <svg className="w-5 h-5 text-[var(--ink-subtle)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Property Option */}
                <button
                  onClick={handlePropertyClick}
                  className="w-full flex items-center gap-4 p-4 rounded-[18px] border border-[var(--line)] transition-all tap-none active:scale-[0.98]"
                  style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "var(--surface-2)" }}>
                    <svg className="w-6 h-6 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l9-9 9 9M5 10v10h14V10" />
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <h4 className="font-semibold text-[var(--ink)]">{tRwa("addProperty")}</h4>
                    <p className="text-sm text-[var(--ink-muted)]">{tRwa("addPropertyDescription")}</p>
                  </div>
                  <svg className="w-5 h-5 text-[var(--ink-subtle)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            onExpenseCreated={onExpenseCreated}
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
      {showVehicleModal && (
        <Suspense fallback={null}>
          <AddVehicleModal
            isOpen={showVehicleModal}
            onClose={handleModalClose}
            onSuccess={handleModalClose}
          />
        </Suspense>
      )}
      {showPropertyModal && (
        <Suspense fallback={null}>
          <AddPropertyModal
            isOpen={showPropertyModal}
            onClose={handleModalClose}
            onSuccess={handleModalClose}
          />
        </Suspense>
      )}
    </>
  );
}
