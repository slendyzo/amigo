"use client";

import { WifiOff, RefreshCw } from "lucide-react";

export default function OfflinePage() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <WifiOff className="w-10 h-10 text-slate-400" />
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          You&apos;re Offline
        </h1>

        <p className="text-slate-600 mb-6">
          No internet connection. Don&apos;t worry - you can still add expenses and they&apos;ll sync when you&apos;re back online.
        </p>

        <div className="space-y-3">
          <button
            onClick={handleRetry}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[var(--accent)] text-[var(--accent-fg)] rounded-lg font-medium hover:bg-[var(--accent-strong)] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>

          <a
            href="/dashboard"
            className="block w-full px-4 py-3 border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
          >
            Go to Dashboard
          </a>
        </div>

        <p className="text-xs text-slate-400 mt-8">
          Expenses added while offline will automatically sync when you reconnect.
        </p>
      </div>
    </div>
  );
}
