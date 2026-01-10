"use client";

import { useState, useEffect, useCallback } from "react";
import {
  syncPendingExpenses,
  getPendingCount,
  isOfflineStorageAvailable,
} from "@/lib/offline-storage";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  // Update pending count
  const updatePendingCount = useCallback(async () => {
    if (isOfflineStorageAvailable()) {
      const count = await getPendingCount();
      setPendingCount(count);
    }
  }, []);

  // Sync pending expenses
  const sync = useCallback(async () => {
    if (!isOnline || isSyncing || pendingCount === 0) return;

    setIsSyncing(true);
    try {
      const result = await syncPendingExpenses();
      await updatePendingCount();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, pendingCount, updatePendingCount]);

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine);
    updatePendingCount();

    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync when coming back online
      sync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    // Listen for service worker messages
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "SYNC_EXPENSES") {
        sync();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    navigator.serviceWorker?.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      navigator.serviceWorker?.removeEventListener("message", handleMessage);
    };
  }, [sync, updatePendingCount]);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    sync,
    updatePendingCount,
  };
}
