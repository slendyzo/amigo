"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { extractReceiptData, type ExtractedReceiptData } from "@/lib/receipt-ocr";

type Category = {
  id: string;
  name: string;
};

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
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [categoryId, setCategoryId] = useState("");

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [localCategories, setLocalCategories] = useState<Category[]>(propCategories || []);

  const CURRENCIES = ["EUR", "USD", "GBP", "BRL", "PLN"];
  const CURRENCY_SYMBOLS: Record<string, string> = {
    EUR: "€",
    USD: "$",
    GBP: "£",
    BRL: "R$",
    PLN: "zł",
  };

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
      setDate(new Date().toISOString().split("T")[0]);
      setCategoryId("");
      setError("");
    }
  }, [isOpen]);

  // Add/remove modal-open class
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => document.body.classList.remove("modal-open");
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
      const normalizedAmount = amount.replace(",", ".");
      const parsedAmount = parseFloat(normalizedAmount);

      if (isNaN(parsedAmount)) {
        setError(tModals("invalidAmount") || "Invalid amount");
        setIsLoading(false);
        return;
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
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full md:max-w-lg md:mx-4 bg-white rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-4 md:px-6 py-3 md:py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-[#0070f3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h2 className="text-base md:text-lg font-semibold text-slate-900">
              {t("title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 text-slate-400 active:text-slate-600 md:hover:text-slate-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 md:p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Capture */}
          {step === "capture" && (
            <div
              className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-[#0070f3] hover:bg-blue-50/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-[#0070f3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-lg font-medium text-slate-900 mb-1">
                {t("captureTitle")}
              </p>
              <p className="text-sm text-slate-500">
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
                <svg className="w-16 h-16 animate-spin text-[#0070f3]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <p className="text-lg font-medium text-slate-900 mb-2">
                {t("processing")}
              </p>
              <div className="w-48 h-2 mx-auto bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0070f3] transition-all duration-300"
                  style={{ width: `${ocrProgress}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-slate-500">{ocrProgress}%</p>
            </div>
          )}

          {/* Step 3: Review */}
          {step === "review" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Confidence indicator */}
              {extractedData && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50">
                  <div className={`w-2 h-2 rounded-full ${
                    extractedData.confidence > 70 ? "bg-green-500" :
                    extractedData.confidence > 50 ? "bg-yellow-500" : "bg-red-500"
                  }`} />
                  <span className="text-sm text-slate-600">
                    {t("confidence")}: {Math.round(extractedData.confidence)}%
                  </span>
                  {extractedData.confidence < 70 && (
                    <span className="text-xs text-slate-500">
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
                    className="text-sm text-[#0070f3] hover:underline"
                  >
                    {t("scanAnother")}
                  </button>
                </div>
              )}

              {/* Merchant/Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {tModals("whatDidYouBuy")}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={tModals("whatDidYouBuyPlaceholder")}
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-transparent"
                />
              </div>

              {/* Amount + Currency */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {tModals("howMuch")}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                      {CURRENCY_SYMBOLS[currency]}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*[.,]?[0-9]*"
                      value={amount}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9.,-]/g, "");
                        setAmount(value);
                      }}
                      placeholder="0.00"
                      required
                      className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-transparent"
                    />
                  </div>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-transparent"
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
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {tModals("date")}
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-transparent"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {tModals("category")}
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-transparent"
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
                  <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-700">
                    {t("extractedItems")} ({extractedData.items.length})
                  </summary>
                  <div className="mt-2 p-3 bg-slate-50 rounded-lg text-sm">
                    {extractedData.items.slice(0, 5).map((item, i) => (
                      <div key={i} className="flex justify-between py-1">
                        <span className="text-slate-600 truncate">{item.name}</span>
                        <span className="text-slate-900 font-medium">
                          {CURRENCY_SYMBOLS[currency]}{item.amount.toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {extractedData.items.length > 5 && (
                      <p className="text-slate-400 text-xs mt-1">
                        +{extractedData.items.length - 5} {t("moreItems")}
                      </p>
                    )}
                  </div>
                </details>
              )}

              {/* Footer */}
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleRetry}
                  className="flex-1 rounded-lg border border-slate-300 px-4 py-3 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
                >
                  {t("rescan")}
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !name || !amount}
                  className="flex-1 rounded-lg bg-[#0070f3] px-4 py-3 text-white font-medium hover:bg-[#0060df] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? tModals("adding") : tCommon("add")}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer for capture step */}
        {step === "capture" && (
          <div className="flex-shrink-0 px-4 md:px-6 py-3 md:py-4 border-t border-slate-200 pb-safe bg-white">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
            >
              {tCommon("cancel")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
