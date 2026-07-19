"use client";

import { useState, useEffect } from "react";

export default function IOSInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if already installed as PWA
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    // Check if iOS/iPadOS (including iPad with desktop Safari)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.userAgent.includes("Mac") && "ontouchend" in document);

    // Check if already dismissed
    const wasDismissed = localStorage.getItem("ios-install-dismissed");
    const dismissedAt = wasDismissed ? parseInt(wasDismissed, 10) : 0;
    const daysSinceDismissed = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);

    // Show prompt if iOS, not installed, and not recently dismissed (7 days)
    if (isIOS && !isStandalone && daysSinceDismissed > 7) {
      // Delay showing prompt to not interrupt user
      const timer = setTimeout(() => {
        setShowPrompt(true);
        // Trigger animation after mount
        requestAnimationFrame(() => setIsVisible(true));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => {
      setShowPrompt(false);
      setDismissed(true);
    }, 300);
    localStorage.setItem("ios-install-dismissed", Date.now().toString());
  };

  if (!showPrompt || dismissed) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 p-4 transition-all duration-300 ease-out ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
      }`}
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 max-w-md mx-auto">
        <div className="flex items-start gap-3">
          {/* App icon */}
          <div className="w-12 h-12 bg-[var(--accent)] rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-[var(--accent-fg)] font-bold text-xl">A</span>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900 text-sm">Install Amigo</h3>
            <p className="text-slate-500 text-xs mt-0.5">
              Add to your home screen for the best experience
            </p>
          </div>

          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-slate-600 p-1 -mr-1 -mt-1"
            aria-label="Dismiss"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Instructions */}
        <div className="mt-4 space-y-2">
          <div className="bg-slate-50 rounded-xl p-3">
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <span className="font-medium">1.</span>
                <span>Tap</span>
                {/* iOS Share icon */}
                <svg className="w-5 h-5 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v12m0-12l4 4m-4-4L8 7" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 14v5a2 2 0 002 2h12a2 2 0 002-2v-5" />
                </svg>
                <span>in Safari</span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm mt-2">
              <div className="flex items-center gap-2 text-slate-600">
                <span className="font-medium">2.</span>
                <span>Select</span>
                <span className="inline-flex items-center gap-1 bg-white px-2 py-0.5 rounded border text-xs font-medium">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add to Home Screen
                </span>
              </div>
            </div>
          </div>
          {/* iOS 18 Warning */}
          <div className="p-2 bg-[var(--accent-tint)] border border-[var(--accent-soft)] rounded-lg text-xs text-[var(--accent-strong)]">
            <p className="flex items-start gap-1.5">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Stay logged in before adding to Home Screen to avoid session issues on iOS 18.</span>
            </p>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="mt-3 w-full py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
