"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import Image from "next/image";

type FeedbackType = "BUG" | "FEATURE" | null;

export default function FeedbackButton() {
  const t = useTranslations("feedback");
  const pathname = usePathname();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"select" | "form">("select");
  const [feedbackType, setFeedbackType] = useState<FeedbackType>(null);
  const [message, setMessage] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleTypeSelect = (type: FeedbackType) => {
    setFeedbackType(type);
    setStep("form");
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError(t("invalidImageType"));
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError(t("imageTooLarge"));
      return;
    }

    setImageFile(file);
    setError("");

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!feedbackType || !message.trim()) return;

    setIsSubmitting(true);
    setError("");

    try {
      let imageUrl: string | null = null;

      // Upload image if selected
      if (imageFile) {
        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", imageFile);

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          throw new Error("Failed to upload image");
        }

        const uploadData = await uploadRes.json();
        imageUrl = uploadData.imageUrl;
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
          imageUrl,
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

  const handleClose = () => {
    setIsOpen(false);
    // Reset after animation
    setTimeout(() => {
      setStep("select");
      setFeedbackType(null);
      setMessage("");
      setImageFile(null);
      setImagePreview(null);
      setSubmitted(false);
      setError("");
    }, 200);
  };

  return (
    <>
      {/* Floating Feedback Button - on mobile: left side above nav. On desktop: next to add button (right side) */}
      <button
        onClick={() => setIsOpen(true)}
        className="floating-nav-button fixed left-4 z-40 flex items-center justify-center w-12 h-12 rounded-full bg-slate-700 text-white shadow-lg hover:bg-slate-600 transition-all hover:scale-105 active:scale-95 md:w-14 md:h-14 md:bottom-24 md:right-[5.5rem] md:left-auto"
        style={{ bottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}
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
          <div className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
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
            <div className="p-6">
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
                    className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center gap-4 group"
                  >
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                          : "bg-blue-100 text-blue-700"
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
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3] resize-none"
                      autoFocus
                    />
                  </div>

                  {/* Image Upload (only for bugs) */}
                  {feedbackType === "BUG" && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        {t("attachScreenshot")}
                      </label>

                      {/* Hidden file input */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageSelect}
                        className="hidden"
                      />

                      {imagePreview ? (
                        /* Image Preview */
                        <div className="relative">
                          <div className="relative w-full h-32 rounded-xl overflow-hidden border border-slate-200">
                            <Image
                              src={imagePreview}
                              alt="Screenshot preview"
                              fill
                              className="object-cover"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={removeImage}
                            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        /* Upload Button */
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full p-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-slate-400 transition-colors flex flex-col items-center gap-2 text-slate-500 hover:text-slate-600"
                        >
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-sm">{t("clickToUpload")}</span>
                        </button>
                      )}
                    </div>
                  )}

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
                    className="w-full rounded-xl bg-[#0070f3] px-4 py-3 text-white font-medium hover:bg-[#0060df] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
