"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

interface AiConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AiConsentModal({ isOpen, onClose }: AiConsentModalProps) {
  const t = useTranslations("aiAdvisor");
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleChoice = async (action: "enable" | "decline") => {
    setIsLoading(true);
    try {
      await fetch("/api/user/ai-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } catch (err) {
      console.error("Failed to save AI consent:", err);
    } finally {
      setIsLoading(false);
      onClose();
      router.refresh();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-xl animate-in fade-in zoom-in-95 duration-300">
        <div className="p-6 space-y-5">
          {/* Title */}
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
            {t("consent.title")}
          </h2>

          {/* Description */}
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {t("consent.description")}
          </p>

          {/* Privacy disclosure block */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {t("consent.privacy")}
            </p>
            <Link
              href="/terms"
              className="inline-block mt-2 text-xs text-slate-500 dark:text-slate-400 underline underline-offset-2 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              {t("consent.viewTerms")}
            </Link>
          </div>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              onClick={() => handleChoice("decline")}
              disabled={isLoading}
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("consent.decline")}
            </button>
            <button
              onClick={() => handleChoice("enable")}
              disabled={isLoading}
              className="flex-1 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("consent.enable")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
