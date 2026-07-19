"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import Image from "next/image";

type FeedbackType = "BUG" | "FEATURE" | null;

const MAX_IMAGES = 5;

export default function FeedbackButton() {
  const t = useTranslations("feedback");
  const pathname = usePathname();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"select" | "form">("select");
  const [feedbackType, setFeedbackType] = useState<FeedbackType>(null);
  const [message, setMessage] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleTypeSelect = (type: FeedbackType) => {
    setFeedbackType(type);
    setStep("form");
  };

  // Shared function to process image files (from file input or clipboard paste)
  const processImageFiles = useCallback((files: File[]) => {
    // Check if we'd exceed the max images limit
    if (imageFiles.length + files.length > MAX_IMAGES) {
      setError(t("tooManyImages", { max: MAX_IMAGES }));
      return;
    }

    const newFiles: File[] = [];
    const newPreviews: string[] = [];

    files.forEach((file) => {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        setError(t("invalidImageType"));
        return;
      }

      // Validate file size (10MB max per file)
      if (file.size > 10 * 1024 * 1024) {
        setError(t("imageTooLarge"));
        return;
      }

      newFiles.push(file);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        newPreviews.push(reader.result as string);
        if (newPreviews.length === newFiles.length) {
          setImageFiles((prev) => [...prev, ...newFiles]);
          setImagePreviews((prev) => [...prev, ...newPreviews]);
        }
      };
      reader.readAsDataURL(file);
    });

    setError("");
  }, [imageFiles.length, t]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    processImageFiles(Array.from(files));

    // Reset file input to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Handle clipboard paste (Ctrl+V) for images
  useEffect(() => {
    if (!isOpen || step !== "form") return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        processImageFiles(imageFiles);
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [isOpen, step, processImageFiles]);

  const removeImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!feedbackType || !message.trim()) return;

    setIsSubmitting(true);
    setError("");

    try {
      let imageUrls: string[] = [];

      // Upload all images in parallel for faster upload
      if (imageFiles.length > 0) {
        setIsUploading(true);
        const uploadPromises = imageFiles.map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);

          const uploadRes = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });

          if (!uploadRes.ok) {
            throw new Error("Failed to upload image");
          }

          const uploadData = await uploadRes.json();
          return uploadData.imageUrl;
        });

        imageUrls = await Promise.all(uploadPromises);
        setIsUploading(false);
      }

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: feedbackType,
          message: message.trim(),
          pageUrl: pathname,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          // Send as array for new format, also send first as imageUrl for backward compatibility
          imageUrl: imageUrls.length > 0 ? imageUrls[0] : null,
          imageUrls: imageUrls.length > 0 ? imageUrls : null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit");
      }

      setSubmitted(true);
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch {
      setError(t("submitError"));
    } finally {
      setIsSubmitting(false);
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setStep("select");
    setFeedbackType(null);
    setMessage("");
    setImageFiles([]);
    setImagePreviews([]);
    setSubmitted(false);
    setError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleOpen = () => {
    resetForm();
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    // Reset after animation
    setTimeout(resetForm, 200);
  };

  return (
    <>
      {/* Floating Feedback Button - on mobile: left side above nav. On desktop: next to add button (right side) */}
      <button
        onClick={handleOpen}
        className="floating-nav-button fixed left-4 bottom-[calc(80px+env(safe-area-inset-bottom,0px))] z-40 flex items-center justify-center w-12 h-12 rounded-full bg-slate-700 text-white shadow-lg hover:bg-slate-600 transition-all hover:scale-105 active:scale-95 md:w-14 md:h-14 md:bottom-24 md:right-[6.5rem] md:left-auto"
        title={t("title")}
        aria-label={t("title")}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal Content */}
          <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-semibold text-slate-900">
                {t("title")}
              </h2>
              <button
                onClick={handleClose}
                className="p-1 rounded-full hover:bg-slate-200 transition-colors"
              >
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto">
              {submitted ? (
                /* Success State */
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    {t("thankYou")}
                  </h3>
                  <p className="text-slate-600">
                    {t("thankYouMessage")}
                  </p>
                </div>
              ) : step === "select" ? (
                /* Type Selection */
                <div className="space-y-4">
                  <p className="text-slate-600 text-center mb-6">
                    {t("selectType")}
                  </p>

                  <button
                    onClick={() => handleTypeSelect("BUG")}
                    className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-red-300 hover:bg-red-50 transition-all flex items-center gap-4 group"
                  >
                    <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center group-hover:bg-red-200 transition-colors">
                      <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-slate-900">{t("reportBug")}</h3>
                      <p className="text-sm text-slate-500">{t("reportBugDesc")}</p>
                    </div>
                  </button>

                  <button
                    onClick={() => handleTypeSelect("FEATURE")}
                    className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-[var(--accent-soft)] hover:bg-[var(--accent-tint)] transition-all flex items-center gap-4 group"
                  >
                    <div className="w-12 h-12 rounded-full bg-[var(--accent-tint)] flex items-center justify-center group-hover:bg-[var(--accent-soft)] transition-colors">
                      <svg className="w-6 h-6 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-slate-900">{t("requestFeature")}</h3>
                      <p className="text-sm text-slate-500">{t("requestFeatureDesc")}</p>
                    </div>
                  </button>
                </div>
              ) : (
                /* Form */
                <div className="space-y-4">
                  {/* Back button */}
                  <button
                    onClick={() => setStep("select")}
                    className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    {t("back")}
                  </button>

                  {/* Type Badge */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        feedbackType === "BUG"
                          ? "bg-red-100 text-red-700"
                          : "bg-[var(--accent-tint)] text-[var(--accent-strong)]"
                      }`}
                    >
                      {feedbackType === "BUG" ? t("reportBug") : t("requestFeature")}
                    </span>
                  </div>

                  {/* Message Input */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {feedbackType === "BUG" ? t("describeBug") : t("describeFeature")}
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={feedbackType === "BUG" ? t("bugPlaceholder") : t("featurePlaceholder")}
                      rows={4}
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
                      autoFocus
                    />
                  </div>

                  {/* Image Upload - Multiple Images */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t("attachScreenshots")}
                      <span className="text-slate-400 font-normal ml-1">
                        ({imagePreviews.length}/{MAX_IMAGES})
                      </span>
                    </label>

                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageSelect}
                      className="hidden"
                    />

                    {/* Image Previews Grid */}
                    {imagePreviews.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {imagePreviews.map((preview, index) => (
                          <div key={index} className="relative aspect-square">
                            <div className="relative w-full h-full rounded-lg overflow-hidden border border-slate-200">
                              <Image
                                src={preview}
                                alt={`Screenshot ${index + 1}`}
                                fill
                                className="object-cover"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeImage(index)}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add Image Button (if not at max) */}
                    {imagePreviews.length < MAX_IMAGES && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full p-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-slate-400 transition-colors flex flex-col items-center gap-2 text-slate-500 hover:text-slate-600"
                      >
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-sm">
                          {imagePreviews.length === 0 ? t("clickToUpload") : t("addMoreImages")}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">
                      {error}
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    onClick={handleSubmit}
                    disabled={!message.trim() || isSubmitting || isUploading}
                    className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-[var(--accent-fg)] font-medium hover:bg-[var(--accent-strong)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUploading ? t("uploading") : isSubmitting ? t("submitting") : t("submit")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
