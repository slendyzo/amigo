"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstallPrompt() {
  const t = useTranslations("install");

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    // Check if dismissed recently (don't show for 7 days)
    const dismissed = localStorage.getItem("installPromptDismissed");
    if (dismissed) {
      const dismissedDate = new Date(dismissed);
      const daysSinceDismissed = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        return;
      }
    }

    // Detect iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
    setIsIOS(isIOSDevice);

    // For iOS, show the manual instructions prompt
    if (isIOSDevice && !standalone) {
      setTimeout(() => setShowPrompt(true), 2000);
      return;
    }

    // For Android/Chrome, listen for the beforeinstallprompt event
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShowPrompt(true), 2000);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setShowPrompt(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("installPromptDismissed", new Date().toISOString());
  };

  // Don't show if already installed or prompt not ready
  if (isStandalone || !showPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-slide-up">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-4 max-w-md mx-auto">
        <div className="flex items-start gap-4">
          {/* App Icon */}
          <div className="w-14 h-14 rounded-xl bg-[#0070f3] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-2xl font-bold">A</span>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900">{t("title")}</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              {isIOS ? t("descriptionIOS") : t("descriptionAndroid")}
            </p>

            {isIOS ? (
              <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                <p className="flex items-center gap-2">
                  <span>{t("iosStep1")}</span>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span>{t("iosStep1Share")}</span>
                </p>
                <p className="mt-1">{t("iosStep2")}</p>
              </div>
            ) : (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleInstall}
                  className="flex-1 px-4 py-2 bg-[#0070f3] text-white text-sm font-medium rounded-lg hover:bg-[#0060df] transition-colors"
                >
                  {t("install")}
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-4 py-2 text-slate-500 text-sm font-medium hover:bg-slate-100 rounded-lg transition-colors"
                >
                  {t("notNow")}
                </button>
              </div>
            )}
          </div>

          {/* Close button for iOS */}
          {isIOS && (
            <button
              onClick={handleDismiss}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
