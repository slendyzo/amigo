"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type AnnouncementModalProps = {
  isOpen: boolean;
  onClose: () => void;
  announcementId: string;
};

export default function AnnouncementModal({
  isOpen,
  onClose,
  announcementId,
}: AnnouncementModalProps) {
  const router = useRouter();
  const t = useTranslations("announcement");
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleDismiss = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/user/dismiss-announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ announcementId }),
      });
      onClose();
      router.refresh();
    } catch (error) {
      console.error("Failed to dismiss announcement:", error);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleExplore = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/user/dismiss-announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ announcementId }),
      });
      onClose();
      router.push("/dashboard/workspace");
    } catch (error) {
      console.error("Failed to dismiss announcement:", error);
      router.push("/dashboard/workspace");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-300">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-8 text-white text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2">{t("workspaces.title")}</h2>
          <p className="text-blue-100">{t("workspaces.subtitle")}</p>
        </div>

        {/* Features */}
        <div className="px-6 py-6 space-y-4">
          {/* Feature 1: Shared Workspaces */}
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">{t("workspaces.feature1.title")}</h3>
              <p className="text-sm text-slate-600">{t("workspaces.feature1.description")}</p>
            </div>
          </div>

          {/* Feature 2: Invite Family */}
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">{t("workspaces.feature2.title")}</h3>
              <p className="text-sm text-slate-600">{t("workspaces.feature2.description")}</p>
            </div>
          </div>

          {/* Feature 3: Role-based Permissions */}
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">{t("workspaces.feature3.title")}</h3>
              <p className="text-sm text-slate-600">{t("workspaces.feature3.description")}</p>
            </div>
          </div>

          {/* Feature 4: Easy Switching */}
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">{t("workspaces.feature4.title")}</h3>
              <p className="text-sm text-slate-600">{t("workspaces.feature4.description")}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleDismiss}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium disabled:opacity-50 transition-colors"
          >
            {t("workspaces.dismiss")}
          </button>
          <button
            onClick={handleExplore}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 transition-colors"
          >
            {t("workspaces.explore")}
          </button>
        </div>
      </div>
    </div>
  );
}
