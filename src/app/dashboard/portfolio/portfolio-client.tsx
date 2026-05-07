"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import PortfolioSummaryCard from "@/components/portfolio/portfolio-summary-card";
import AssetCard from "@/components/portfolio/asset-card";
import { AllocationChart } from "@/components/portfolio/allocation-chart";
import { PerformanceChart } from "@/components/portfolio/performance-chart";
import { usePortfolioCurrency } from "@/components/portfolio/portfolio-currency-context";
import DisplayCurrencyToggle from "@/components/portfolio/display-currency-toggle";
import { aggregateAssetsBySymbol } from "@/lib/portfolio/aggregate-assets";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Connection {
  id: string;
  provider: string;
  label: string;
  syncStatus: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  freeCash: number | null;
  freeCashCurrency: string | null;
  freeCashEur: number | null;
  freeCashRateEurPerUnit: number | null;
  isActive: boolean;
  _count: { assets: number };
}

interface FxMeta {
  source: "live" | "static";
  sourceDate: string | null; // ECB date if live, e.g., "2026-04-30"
}

interface Asset {
  id: string;
  symbol: string;
  name: string;
  assetType: string;
  quantity: number;
  averageBuyPrice: number;
  averageBuyPriceEur: number;
  currentPrice: number;
  currentPriceEur: number;
  currentValue: number;
  currentValueEur: number;
  totalCost: number;
  totalCostEur: number;
  unrealizedPnl: number;
  unrealizedPnlEur: number;
  unrealizedPnlPct: number;
  currency: string;
  lockedQuantity?: number | null;
  realizedPnlEur?: number | null;
  isDust?: boolean;
  priceStatus?: string;
  priceUnavailableReason?: string | null;
  exchange: { id: string; provider: string; label: string };
}

interface Deposit {
  id: string;
  amount: number;
  currency: string;
  amountEur: number;
  date: string;
  exchange: { provider: string; label: string };
}

interface PortfolioClientProps {
  connections: Connection[];
  assets: Asset[];
  deposits: Deposit[];
  fxMeta: FxMeta;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

function isStale(lastSyncAt: string | null): boolean {
  if (!lastSyncAt) return true;
  return Date.now() - new Date(lastSyncAt).getTime() > STALE_THRESHOLD_MS;
}

function formatDepositDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PortfolioClient({
  connections,
  assets,
  deposits,
  fxMeta,
}: PortfolioClientProps) {
  const t = useTranslations("portfolio");
  const router = useRouter();
  const { formatAmount } = usePortfolioCurrency();

  // Sync is kicked off detached on the server. We poll /api/portfolio for
  // syncStatus transitions and reflect them locally. Initial value: true if
  // any connection is currently SYNCING (e.g., user reloaded mid-sync).
  const [isSyncing, setIsSyncing] = useState(() =>
    connections.some((c) => c.syncStatus === "SYNCING")
  );
  const [dismissedDeposits, setDismissedDeposits] = useState<Set<string>>(new Set());

  // Partition raw assets by priceStatus, then aggregate each side by symbol.
  // Hidden by default: dust positions (isDust = true). They're still in the
  // raw list (so the chart can include them in totals if needed) but excluded
  // from the user-visible asset cards.
  const { pricedAssetsRaw, pricedAggregated, unpricedAggregated } = useMemo(() => {
    const visible = assets.filter((a) => !a.isDust);
    const priced = visible.filter(
      (a) => (a.priceStatus ?? "OK") === "OK"
    );
    const unpriced = visible.filter(
      (a) => (a.priceStatus ?? "OK") !== "OK"
    );
    return {
      pricedAssetsRaw: priced,
      pricedAggregated: aggregateAssetsBySymbol(priced),
      unpricedAggregated: aggregateAssetsBySymbol(unpriced),
    };
  }, [assets]);

  // Poll /api/portfolio until no connection is in SYNCING state, then refresh.
  // Hard-capped at 10 min to defend against runaway polling if something is wrong.
  const pollUntilSynced = useCallback(async () => {
    const POLL_INTERVAL_MS = 2000;
    const POLL_TIMEOUT_MS = 10 * 60 * 1000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      try {
        const res = await fetch("/api/portfolio");
        if (!res.ok) continue;
        const data = (await res.json()) as {
          exchanges?: Array<{ syncStatus: string }>;
        };
        const stillSyncing = data.exchanges?.some(
          (e) => e.syncStatus === "SYNCING"
        );
        if (!stillSyncing) {
          setIsSyncing(false);
          router.refresh();
          return;
        }
      } catch {
        // Transient network error — keep polling
      }
    }
    // Timed out — give up on the spinner so the user isn't stuck
    setIsSyncing(false);
  }, [router]);

  const triggerSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await fetch("/api/portfolio/sync", { method: "POST" });
      // 409 means a sync was already in flight — fine, just poll for it
      if (!res.ok && res.status !== 409) {
        setIsSyncing(false);
        return;
      }
    } catch {
      setIsSyncing(false);
      return;
    }
    void pollUntilSynced();
  }, [isSyncing, pollUntilSynced]);

  // On mount: if any connection is already SYNCING (process is mid-sync) just
  // poll. If data is stale, trigger a fresh sync.
  useEffect(() => {
    if (isSyncing) {
      void pollUntilSynced();
      return;
    }
    const hasStaleConnection = connections.some((c) => isStale(c.lastSyncAt));
    if (hasStaleConnection) {
      triggerSync();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount — intentional

  const handleDismissDeposit = async (depositId: string) => {
    setDismissedDeposits((prev) => new Set(prev).add(depositId));
    try {
      await fetch(`/api/portfolio/deposits/${depositId}/dismiss`, { method: "POST" });
    } catch {
      // Revert optimistic update on failure
      setDismissedDeposits((prev) => {
        const next = new Set(prev);
        next.delete(depositId);
        return next;
      });
    }
  };

  const visibleDeposits = deposits.filter((d) => !dismissedDeposits.has(d.id));

  // ── Empty state: no connections ───────────────────────────────────────────
  if (connections.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {t("title")}
          </h1>
        </div>

        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-5">
            <svg
              className="w-8 h-8 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
            {t("noExchanges")}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mb-6">
            {t("noExchangesDescription")}
          </p>
          <Link href="/dashboard/portfolio/exchanges">
            <Button className="bg-[#0070f3] hover:bg-[#0060df] text-white">
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              {t("addExchange")}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // ── Connections exist but no assets yet (initial sync pending) ────────────
  if (assets.length === 0) {
    return (
      <div className="space-y-6">
        <PortfolioHeader
          t={t}
          isSyncing={isSyncing}
          onSync={triggerSync}
        />
        <div className="flex flex-col items-center justify-center py-20 text-center">
          {isSyncing ? (
            <>
              <div className="w-10 h-10 border-2 border-[#0070f3] border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("syncing")}</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-5">
                <svg
                  className="w-8 h-8 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 21V5a2 2 0 012-2h4a2 2 0 012 2v16"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                {t("noAssets")}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                {t("noAssetsDescription")}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Full portfolio view ───────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PortfolioHeader t={t} isSyncing={isSyncing} onSync={triggerSync} />

      {/* Sync indicator */}
      {isSyncing && (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <div className="w-3.5 h-3.5 border-2 border-[#0070f3] border-t-transparent rounded-full animate-spin" />
          {t("syncing")}
        </div>
      )}

      {/* Sync error banner */}
      {!isSyncing && connections.some((c) => c.syncStatus === "ERROR") && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50/80 dark:bg-red-900/10 border border-red-200/60 dark:border-red-700/30">
          <svg className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-red-700 dark:text-red-400">
            {t("syncError")} —{" "}
            <Link href="/dashboard/portfolio/exchanges" className="underline hover:no-underline">
              {t("manageExchanges")}
            </Link>
          </p>
        </div>
      )}

      {/* Summary Card */}
      <PortfolioSummaryCard
        connections={connections}
        assets={assets}
        fxMeta={fxMeta}
        t={t}
      />

      {/* Allocation Chart */}
      <AllocationChart assets={pricedAssetsRaw} />

      {/* Performance Chart */}
      <PerformanceChart />

      {/* Pending Deposits */}
      {visibleDeposits.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t("pendingDeposits")}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t("pendingDepositsDescription")}
            </p>
          </div>
          <div className="space-y-2">
            {visibleDeposits.map((deposit) => (
              <div
                key={deposit.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 bg-amber-50/80 dark:bg-amber-900/10 border border-amber-200/60 dark:border-amber-700/30 rounded-xl px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {formatAmount(deposit.amountEur)}
                    <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                      ({deposit.currency !== "EUR"
                        ? `${deposit.amount.toFixed(2)} ${deposit.currency} · `
                        : ""}
                      {t("depositOn")} {formatDepositDate(deposit.date)})
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {deposit.exchange.label} · {deposit.exchange.provider}
                  </p>
                </div>
                <div className="shrink-0 mt-2 sm:mt-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7 text-slate-500 hover:text-slate-700"
                    onClick={() => handleDismissDeposit(deposit.id)}
                  >
                    {t("dismiss")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Asset List — aggregated by symbol across exchanges */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t("assets")}
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {pricedAggregated.length} {pricedAggregated.length === 1 ? "asset" : "assets"}
          </span>
        </div>
        <div className="space-y-2">
          {pricedAggregated.map((asset) => (
            <AssetCard key={asset.symbol} asset={asset} t={t} />
          ))}
        </div>
      </div>

      {/* Unpriced section — collapsed by default */}
      {unpricedAggregated.length > 0 && (
        <UnpricedAssetsSection assets={unpricedAggregated} />
      )}
    </div>
  );
}

// ─── UnpricedAssetsSection ───────────────────────────────────────────────────

function UnpricedAssetsSection({
  assets,
}: {
  assets: ReturnType<typeof aggregateAssetsBySymbol>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-slate-200/60 dark:border-slate-700/40 bg-white/40 dark:bg-slate-900/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Holdings without price data
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
            ({assets.length})
          </span>
        </div>
        <motion.svg
          className="w-4 h-4 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2">
              {assets.map((a) => (
                <div
                  key={a.symbol}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/40"
                  title={a.priceUnavailableReason ?? "Price not available"}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {a.symbol}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      {a.positions.length === 1
                        ? a.positions[0].exchange.label
                        : `${a.positions.length} exchanges`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs tabular-nums text-slate-700 dark:text-slate-300">
                      {a.totalQuantity.toFixed(8).replace(/0+$/, "").replace(/\.$/, "")}
                    </p>
                    <p className="text-[10px] text-amber-600 dark:text-amber-500">
                      Price unavailable
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PortfolioHeader({
  t,
  isSyncing,
  onSync,
}: {
  t: ReturnType<typeof useTranslations<"portfolio">>;
  isSyncing: boolean;
  onSync: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        {t("title")}
      </h1>
      <div className="flex items-center gap-2">
        <DisplayCurrencyToggle />
        <Link href="/dashboard/portfolio/exchanges">
          <Button variant="outline" size="sm" className="hidden sm:inline-flex">
            {t("manageExchanges")}
          </Button>
          <Button variant="outline" size="sm" className="sm:hidden" aria-label={t("manageExchanges")}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Button>
        </Link>
        <Button
          size="sm"
          onClick={onSync}
          disabled={isSyncing}
          className="bg-[#0070f3] hover:bg-[#0060df] text-white disabled:opacity-60"
        >
          {isSyncing ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              {t("syncing")}
            </>
          ) : (
            <>
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {t("syncAll")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
