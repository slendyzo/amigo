"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type DisplayCurrency = "EUR" | "USD";

interface PortfolioCurrencyContextValue {
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (c: DisplayCurrency) => void;
  // EUR per 1 USD (e.g., 0.85). Server-supplied, today's rate.
  eurPerUsd: number;
  // Helpers — every consumer uses these instead of formatting EUR directly.
  formatAmount: (eurAmount: number, opts?: { compact?: boolean; sign?: boolean }) => string;
  // For per-unit prices (BTC price, DCA average) — uses extra decimals when small.
  formatPrice: (eurPrice: number) => string;
  // For chart axis labels: short form like "€16K" / "$19K".
  formatAxis: (eurAmount: number) => string;
  fromEur: (eurAmount: number) => number;
}

const PortfolioCurrencyContext = createContext<PortfolioCurrencyContextValue | null>(null);

const STORAGE_KEY = "amigo:portfolio:displayCurrency";

interface ProviderProps {
  children: React.ReactNode;
  // EUR per 1 USD from server (today's Frankfurter rate). 0.85 fallback if API failed.
  eurPerUsd: number;
  // Workspace default — used as the initial value when localStorage is empty.
  workspaceDefault: DisplayCurrency;
}

export function PortfolioCurrencyProvider({
  children,
  eurPerUsd,
  workspaceDefault,
}: ProviderProps) {
  // Lazy initialiser reads localStorage synchronously to avoid first-paint flash.
  // We're a client component so window exists in the browser.
  const [displayCurrency, setDisplayCurrencyState] = useState<DisplayCurrency>(() => {
    if (typeof window === "undefined") return workspaceDefault;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "EUR" || stored === "USD") return stored;
    return workspaceDefault;
  });

  const setDisplayCurrency = useCallback((c: DisplayCurrency) => {
    setDisplayCurrencyState(c);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, c);
    }
  }, []);

  // Sync across tabs (rare but cheap)
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && (e.newValue === "EUR" || e.newValue === "USD")) {
        setDisplayCurrencyState(e.newValue);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<PortfolioCurrencyContextValue>(() => {
    const fromEur = (eurAmount: number): number =>
      displayCurrency === "EUR" ? eurAmount : eurAmount / eurPerUsd;

    const formatAmount = (
      eurAmount: number,
      opts: { compact?: boolean; sign?: boolean } = {}
    ): string => {
      const amount = fromEur(eurAmount);
      const formatted = new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: displayCurrency,
        notation: opts.compact ? "compact" : "standard",
        maximumFractionDigits: opts.compact ? 1 : 2,
      }).format(amount);

      if (opts.sign && eurAmount > 0) return `+${formatted}`;
      return formatted;
    };

    const formatPrice = (eurPrice: number): string => {
      const price = fromEur(eurPrice);
      const decimals = price < 0.01 ? { min: 4, max: 6 } : { min: 2, max: 4 };
      return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: displayCurrency,
        minimumFractionDigits: decimals.min,
        maximumFractionDigits: decimals.max,
      }).format(price);
    };

    const formatAxis = (eurAmount: number): string => {
      const amount = fromEur(eurAmount);
      const symbol = displayCurrency === "EUR" ? "€" : "$";
      const abs = Math.abs(amount);
      if (abs >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`;
      if (abs >= 1_000) return `${symbol}${(amount / 1_000).toFixed(0)}K`;
      return `${symbol}${amount.toFixed(0)}`;
    };

    return {
      displayCurrency,
      setDisplayCurrency,
      eurPerUsd,
      formatAmount,
      formatPrice,
      formatAxis,
      fromEur,
    };
  }, [displayCurrency, setDisplayCurrency, eurPerUsd]);

  return (
    <PortfolioCurrencyContext.Provider value={value}>
      {children}
    </PortfolioCurrencyContext.Provider>
  );
}

export function usePortfolioCurrency(): PortfolioCurrencyContextValue {
  const ctx = useContext(PortfolioCurrencyContext);
  if (!ctx) {
    throw new Error(
      "usePortfolioCurrency must be used inside PortfolioCurrencyProvider"
    );
  }
  return ctx;
}
