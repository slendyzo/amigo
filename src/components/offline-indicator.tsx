"use client";

import { useOnlineStatus } from "@/hooks/use-online-status";
import { WifiOff, Cloud, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

export function OfflineIndicator() {
  const t = useTranslations("offline");
  const { isOnline, pendingCount, isSyncing, sync } = useOnlineStatus();

  // Don't show anything if online and no pending
  if (isOnline && pendingCount === 0) {
    return null;
  }

  return (
    <div
      className={`fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 p-3 rounded-md shadow-lg z-50 transition-all ${
        isOnline ? "bg-amber-tint border border-amber" : "bg-forest text-paper"
      }`}
    >
      <div className="flex items-center gap-3">
        {!isOnline ? (
          <WifiOff className="w-5 h-5 flex-shrink-0" />
        ) : isSyncing ? (
          <Loader2 className="w-5 h-5 flex-shrink-0 animate-spin text-amber" />
        ) : (
          <Cloud className="w-5 h-5 flex-shrink-0 text-amber" />
        )}

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${isOnline ? "text-amber" : "text-paper"}`}>
            {!isOnline
              ? t("youreOffline")
              : isSyncing
              ? t("syncing")
              : t("pendingExpenses", { count: pendingCount })}
          </p>
          <p className={`text-xs ${isOnline ? "text-amber" : "text-paper/80"}`}>
            {!isOnline
              ? t("expensesSavedLocally")
              : isSyncing
              ? t("pleaseWait")
              : t("tapToSync")}
          </p>
        </div>

        {isOnline && pendingCount > 0 && !isSyncing && (
          <button
            onClick={() => sync()}
            className="px-3 py-1.5 bg-amber text-paper text-sm font-medium rounded-md hover:bg-amber/90 transition-colors"
          >
            {t("sync")}
          </button>
        )}
      </div>
    </div>
  );
}
