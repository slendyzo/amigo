"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { extractReceiptData, type ExtractedReceiptData } from "@/lib/receipt-ocr";
import { AmountInput } from "./ui/amount-input";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { CURRENCIES, getCurrencySymbol } from "@/lib/currencies";
import { parseAmount, getTodayDateString } from "@/lib/utils";
import type { Category } from "@/types/models";

type ReceiptScannerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  categories?: Category[];
};

type ScanStep = "capture" | "processing" | "review";

export default function ReceiptScannerModal({
  isOpen,
  onClose,
  categories: propCategories,
}: ReceiptScannerModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("receiptScanner");
  const tCommon = useTranslations("common");
  const tModals = useTranslations("modals");

  // Step state
  const [step, setStep] = useState<ScanStep>("capture");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [extractedData, setExtractedData] = useState<ExtractedReceiptData | null>(null);

  // Form state for review step
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [date, setDate] = useState(getTodayDateString());
  const [categoryId, setCategoryId] = useState("");

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [localCategories, setLocalCategories] = useState<Category[]>(propCategories || []);

  // Fetch categories if not provided
  useEffect(() => {
    if (isOpen && !propCategories) {
      fetch("/api/categories")
        .then((res) => res.json())
        .then((data) => {
          if (data.categories) setLocalCategories(data.categories);
        })
        .catch(console.error);
    }
  }, [isOpen, propCategories]);

  // Reset modal state when closed
  useEffect(() => {
    if (!isOpen) {
      setStep("capture");
      setImagePreview(null);
      setOcrProgress(0);
      setExtractedData(null);
      setName("");
      setAmount("");
      setCurrency("EUR");
      setDate(getTodayDateString());
      setCategoryId("");
      setError("");
    }
  }, [isOpen]);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError(t("invalidFileType"));
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      setStep("processing");
      setError("");

      try {
        // Run OCR
        const data = await extractReceiptData(dataUrl, (progress) => {
          setOcrProgress(progress);
        });

        setExtractedData(data);

        // Pre-fill form with extracted data
        if (data.merchantName) setName(data.merchantName);
        if (data.totalAmount) setAmount(data.totalAmount.toFixed(2));
        if (data.currency) setCurrency(data.currency);
        if (data.date) setDate(data.date);

        setStep("review");
      } catch (err) {
        console.error("OCR failed:", err);
        setError(t("ocrFailed"));
        setStep("capture");
      }
    };
    reader.readAsDataURL(file);
  }, [t]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Handle clipboard paste (Ctrl+V)
  useEffect(() => {
    if (!isOpen || step !== "capture") return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            handleFileSelect(file);
          }
          return;
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [isOpen, step, handleFileSelect]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const parsedAmount = parseAmount(amount);

      if (isNaN(parsedAmount)) {
        setError(tModals("invalidAmount") || "Invalid amount");
        setIsLoading(false);
        return;
      }

      // Upload receipt image for attachment
      let imageUrls: string | undefined;
      if (imagePreview) {
        try {
          const blob = await fetch(imagePreview).then(r => r.blob());
          const formData = new FormData();
          formData.append("file", blob, "receipt.webp");
          const uploadRes = await fetch("/api/upload?purpose=expense", {
            method: "POST",
            body: formData,
          });
          if (uploadRes.ok) {
            const { imageUrl } = await uploadRes.json();
            imageUrls = JSON.stringify([imageUrl]);
          }
        } catch {
          // Continue without image if upload fails
        }
      }

      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          amount: parsedAmount,
          currency,
          type: "LIFESTYLE",
          categoryId: categoryId || undefined,
          date,
          imageUrls,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add expense");
      }

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    setStep("capture");
    setImagePreview(null);
    setOcrProgress(0);
    setExtractedData(null);
    setError("");
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      variant="sheet"
      size="lg"
      as="form"
      onSubmit={handleSubmit}
      className="rounded-t-2xl md:rounded-2xl"
      style={{ background: "var(--surface)" }}
    >
        {/* Header */}
        <ModalHeader
          className="border-b border-[var(--line)]"
          title={
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <h2 className="text-base md:text-lg font-semibold text-[var(--ink)]">
                {t("title")}
              </h2>
            </div>
          }
        />

        {/* Body */}
        <ModalBody className="p-4 md:p-6">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Capture */}
          {step === "capture" && (
            <div
              className="border-2 border-dashed border-[var(--line-strong)] rounded-xl p-8 text-center cursor-pointer hover:border-[var(--accent)] hover:bg-[var(--accent-tint)] transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--accent-tint)] flex items-center justify-center">
                <svg className="w-8 h-8 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-lg font-medium text-[var(--ink)] mb-1">
                {t("captureTitle")}
              </p>
              <p className="text-sm text-[var(--ink-subtle)]">
                {t("captureDescription")}
              </p>
            </div>
          )}

          {/* Step 2: Processing */}
          {step === "processing" && (
            <div className="text-center py-8">
              {imagePreview && (
                <div className="mb-6">
                  <img
                    src={imagePreview}
                    alt="Receipt"
                    className="max-h-48 mx-auto rounded-lg shadow-lg"
                  />
                </div>
              )}
              <div className="w-16 h-16 mx-auto mb-4 relative">
                <svg className="w-16 h-16 animate-spin text-[var(--accent)]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <p className="text-lg font-medium text-[var(--ink)] mb-2">
                {t("processing")}
              </p>
              <div className="w-48 h-2 mx-auto bg-[var(--surface-3)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)] transition-all duration-300"
                  style={{ width: `${ocrProgress}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-[var(--ink-subtle)]">{ocrProgress}%</p>
            </div>
          )}

          {/* Step 3: Review */}
          {step === "review" && (
            <div className="space-y-4">
              {/* Confidence indicator */}
              {extractedData && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--surface-2)]">
                  <div className={`w-2 h-2 rounded-full ${
                    extractedData.confidence > 70 ? "bg-green-500" :
                    extractedData.confidence > 50 ? "bg-yellow-500" : "bg-red-500"
                  }`} />
                  <span className="text-sm text-[var(--ink-muted)]">
                    {t("confidence")}: {Math.round(extractedData.confidence)}%
                  </span>
                  {extractedData.confidence < 70 && (
                    <span className="text-xs text-[var(--ink-subtle)]">
                      ({t("pleaseVerify")})
                    </span>
                  )}
                </div>
              )}

              {/* Thumbnail preview */}
              {imagePreview && (
                <div className="flex items-start gap-3">
                  <img
                    src={imagePreview}
                    alt="Receipt"
                    className="w-20 h-20 object-cover rounded-lg shadow"
                  />
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="text-sm text-[var(--accent)] hover:underline"
                  >
                    {t("scanAnother")}
                  </button>
                </div>
              )}

              {/* Merchant/Name */}
              <div>
                <label className="block text-sm font-medium text-[var(--ink-muted)] mb-1">
                  {tModals("whatDidYouBuy")}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={tModals("whatDidYouBuyPlaceholder")}
                  required
                  className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-4 py-3 text-[var(--ink)] placeholder-[var(--ink-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                />
              </div>

              {/* Amount + Currency */}
              <div>
                <label className="block text-sm font-medium text-[var(--ink-muted)] mb-1">
                  {tModals("howMuch")}
                </label>
                <div className="flex gap-2">
                  <AmountInput
                    value={amount}
                    onChange={setAmount}
                    currency={currency}
                    required
                    className="flex-1"
                  />
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-24 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-3 text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                  >
                    {CURRENCIES.map((curr) => (
                      <option key={curr} value={curr}>
                        {curr}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-[var(--ink-muted)] mb-1">
                  {tModals("date")}
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-4 py-3 text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-[var(--ink-muted)] mb-1">
                  {tModals("category")}
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-4 py-3 text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
                >
                  <option value="">{tModals("auto")}</option>
                  {localCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Extracted line items preview (read-only) */}
              {extractedData && extractedData.items.length > 0 && (
                <details className="group">
                  <summary className="text-sm text-[var(--ink-subtle)] cursor-pointer hover:text-[var(--ink-muted)]">
                    {t("extractedItems")} ({extractedData.items.length})
                  </summary>
                  <div className="mt-2 p-3 bg-[var(--surface-2)] rounded-lg text-sm">
                    {extractedData.items.slice(0, 5).map((item, i) => (
                      <div key={i} className="flex justify-between py-1">
                        <span className="text-[var(--ink-muted)] truncate">{item.name}</span>
                        <span className="text-[var(--ink)] font-medium">
                          {getCurrencySymbol(currency)}{item.amount.toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {extractedData.items.length > 5 && (
                      <p className="text-[var(--ink-subtle)] text-xs mt-1">
                        +{extractedData.items.length - 5} {t("moreItems")}
                      </p>
                    )}
                  </div>
                </details>
              )}
            </div>
          )}
        </ModalBody>

        {/* Single pinned action row — contents switch on scan stage.
            Processing has no actions, so no footer at all. */}
        {step !== "processing" && (
          <ModalFooter className="px-4 md:px-6 md:pt-4">
            {step === "capture" ? (
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-lg border border-[var(--line-strong)] px-4 py-3 text-[var(--ink-muted)] font-medium hover:bg-[var(--surface-2)] transition-colors"
              >
                {tCommon("cancel")}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="flex-1 rounded-lg border border-[var(--line-strong)] px-4 py-3 text-[var(--ink-muted)] font-medium hover:bg-[var(--surface-2)] transition-colors"
                >
                  {t("rescan")}
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !name || !amount}
                  className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-3 text-[var(--accent-fg)] font-medium hover:bg-[var(--accent-strong)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? tModals("adding") : tCommon("add")}
                </button>
              </>
            )}
          </ModalFooter>
        )}
    </Modal>
  );
}
