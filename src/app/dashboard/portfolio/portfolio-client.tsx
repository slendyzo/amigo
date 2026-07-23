"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { RefreshCw, Settings2, Plus, TrendingUp, AlertTriangle, ChevronDown } from "lucide-react";
import PortfolioSummaryCard from "@/components/portfolio/portfolio-summary-card";
import AssetCard from "@/components/portfolio/asset-card";
import { AllocationChart } from "@/components/portfolio/allocation-chart";
import { PerformanceChart } from "@/components/portfolio/performance-chart";
import { usePortfolioCurrency } from "@/components/portfolio/portfolio-currency-context";
import DisplayCurrencyToggle from "@/components/portfolio/display-currency-toggle";
import { aggregateAssetsBySymbol } from "@/lib/portfolio/aggregate-assets";
import { isCashSymbol } from "@/lib/portfolio/cash";

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
  sourceDate: string | null;
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
const cardShadow = { boxShadow: "var(--shadow-card)" };

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

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
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

  const [isSyncing, setIsSyncing] = useState(() =>
    connections.some((c) => c.syncStatus === "SYNCING")
  );
  const [dismissedDeposits, setDismissedDeposits] = useState<Set<string>>(new Set());

  // View controls: filter by a single exchange (or "all"), and show/hide cash.
  const [selectedExchange, setSelectedExchange] = useState<string>("all");
  const [showCash, setShowCash] = useState(true);

  const isCashAsset = (a: Asset) => a.assetType === "CASH" || isCashSymbol(a.symbol);

  const { pricedAssetsRaw, pricedAggregated, unpricedAggregated } = useMemo(() => {
    let scoped = assets.filter((a) => !a.isDust);
    if (selectedExchange !== "all") {
      scoped = scoped.filter((a) => a.exchange.id === selectedExchange);
    }
    if (!showCash) {
      scoped = scoped.filter(
        (a) => !(a.assetType === "CASH" || isCashSymbol(a.symbol))
      );
    }
    const priced = scoped.filter((a) => (a.priceStatus ?? "OK") === "OK");
    const unpriced = scoped.filter((a) => (a.priceStatus ?? "OK") !== "OK");
    return {
      pricedAssetsRaw: priced,
      pricedAggregated: aggregateAssetsBySymbol(priced),
      unpricedAggregated: aggregateAssetsBySymbol(unpriced),
    };
  }, [assets, selectedExchange, showCash]);

  // Whether any cash exists at all (in the current exchange scope) — drives
  // showing the cash toggle. No point offering it if there's nothing to hide.
  const hasCash = useMemo(() => {
    const scoped =
      selectedExchange === "all"
        ? assets
        : assets.filter((a) => a.exchange.id === selectedExchange);
    return scoped.some((a) => !a.isDust && isCashAsset(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, selectedExchange]);

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
        const stillSyncing = data.exchanges?.some((e) => e.syncStatus === "SYNCING");
        if (!stillSyncing) {
          setIsSyncing(false);
          router.refresh();
          return;
        }
      } catch {
        // Transient network error — keep polling
      }
    }
    setIsSyncing(false);
  }, [router]);

  const triggerSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await fetch("/api/portfolio/sync", { method: "POST" });
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
      <div className="space-y-5">
        <PortfolioHeader t={t} isSyncing={isSyncing} onSync={triggerSync} showActions={false} />
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div
            className="mb-5 flex h-16 w-16 items-center justify-center rounded-[20px]"
            style={{ background: "var(--surface-2)", color: "var(--accent)" }}
          >
            <TrendingUp className="h-8 w-8" strokeWidth={1.6} />
          </div>
          <h2 className="mb-2 text-[17px] font-semibold" style={{ color: "var(--ink)" }}>
            {t("noExchanges")}
          </h2>
          <p className="mb-6 max-w-xs text-[13px]" style={{ color: "var(--ink-muted)" }}>
            {t("noExchangesDescription")}
          </p>
          <Link
            href="/dashboard/portfolio/exchanges"
            className="inline-flex items-center gap-2 rounded-[18px] px-5 py-2.5 text-[14px] font-semibold transition-transform active:scale-[0.98]"
            style={{ background: "var(--accent)", color: "var(--accent-fg)", boxShadow: "var(--shadow-fab)" }}
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            {t("addExchange")}
          </Link>
        </div>
      </div>
    );
  }

  // ── Connections exist but no assets yet (initial sync pending) ────────────
  if (assets.length === 0) {
    return (
      <div className="space-y-5">
        <PortfolioHeader t={t} isSyncing={isSyncing} onSync={triggerSync} />
        <div className="flex flex-col items-center justify-center py-20 text-center">
          {isSyncing ? (
            <>
              <div
                className="mb-4 h-10 w-10 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
              />
              <p className="text-[13px]" style={{ color: "var(--ink-muted)" }}>
                {t("syncing")}
              </p>
            </>
          ) : (
            <>
              <div
                className="mb-5 flex h-16 w-16 items-center justify-center rounded-[20px]"
                style={{ background: "var(--surface-2)", color: "var(--accent)" }}
              >
                <TrendingUp className="h-8 w-8" strokeWidth={1.6} />
              </div>
              <h2 className="mb-2 text-[17px] font-semibold" style={{ color: "var(--ink)" }}>
                {t("noAssets")}
              </h2>
              <p className="max-w-xs text-[13px]" style={{ color: "var(--ink-muted)" }}>
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
    <div className="space-y-4">
      <PortfolioHeader t={t} isSyncing={isSyncing} onSync={triggerSync} />

      {isSyncing && (
        <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--ink-muted)" }}>
          <div
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          />
          {t("syncing")}
        </div>
      )}

      {!isSyncing && connections.some((c) => c.syncStatus === "ERROR") && (
        <div
          className="flex items-center gap-3 rounded-[16px] px-4 py-3"
          style={{ background: "var(--surface)", border: "1px solid var(--line-strong)" }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "var(--negative)" }} strokeWidth={1.8} />
          <p className="text-[13px]" style={{ color: "var(--ink)" }}>
            {t("syncError")} —{" "}
            <Link href="/dashboard/portfolio/exchanges" className="font-semibold underline" style={{ color: "var(--accent)" }}>
              {t("manageExchanges")}
            </Link>
          </p>
        </div>
      )}

      {/* Exchange filter + cash toggle */}
      <PortfolioControls
        connections={connections}
        selected={selectedExchange}
        onSelect={setSelectedExchange}
        showCash={showCash}
        onToggleCash={() => setShowCash((v) => !v)}
        hasCash={hasCash}
        t={t}
      />

      {/* Hero */}
      <PortfolioSummaryCard connections={connections} assets={pricedAssetsRaw} fxMeta={fxMeta} t={t} />

      {/* Allocation bar */}
      <AllocationChart assets={pricedAssetsRaw} />

      {/* Performance chart */}
      <PerformanceChart />

      {/* Pending deposits */}
      {visibleDeposits.length > 0 && (
        <div className="space-y-2">
          <GroupLabel>{t("pendingDeposits")}</GroupLabel>
          <div className="space-y-2">
            {visibleDeposits.map((deposit) => (
              <div
                key={deposit.id}
                className="flex items-center justify-between gap-3 rounded-[16px] px-4 py-3"
                style={{ background: "var(--surface-2)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--ink)" }}>
                    {formatAmount(deposit.amountEur)}
                    <span className="ml-2 text-[11.5px] font-normal" style={{ color: "var(--ink-muted)" }}>
                      ({deposit.currency !== "EUR"
                        ? `${deposit.amount.toFixed(2)} ${deposit.currency} · `
                        : ""}
                      {t("depositOn")} {formatDepositDate(deposit.date)})
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>
                    {deposit.exchange.label} · {deposit.exchange.provider}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDismissDeposit(deposit.id)}
                  className="shrink-0 text-[12px] font-semibold"
                  style={{ color: "var(--accent)" }}
                >
                  {t("dismiss")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Holdings */}
      <div className="space-y-2">
        <GroupLabel>{t("assets")}</GroupLabel>
        <div className="rounded-[20px] px-4" style={{ background: "var(--surface)", ...cardShadow }}>
          {pricedAggregated.map((asset, i) => (
            <AssetCard
              key={asset.symbol}
              asset={asset}
              t={t}
              divider={i < pricedAggregated.length - 1}
            />
          ))}
        </div>
      </div>

      {/* Unpriced */}
      {unpricedAggregated.length > 0 && <UnpricedAssetsSection assets={unpricedAggregated} />}

      {/* Sync status row */}
      <SyncRow connections={connections} isSyncing={isSyncing} onSync={triggerSync} t={t} />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11.5px] font-semibold uppercase"
      style={{ color: "var(--ink-subtle)", letterSpacing: "0.06em" }}
    >
      {children}
    </div>
  );
}

// Brand dot colours per provider — matches the exchanges page swatches.
const PROVIDER_DOT: Record<string, string> = {
  KRAKEN: "#f59e0b",
  TRADING212: "#3b82f6",
  BINANCE: "#facc15",
  BYBIT: "#f97316",
  BYBIT_EU: "#f97316",
  WALLET_ETH: "#6b7280",
  WALLET_SOL: "#14b8a6",
};

function PortfolioControls({
  connections,
  selected,
  onSelect,
  showCash,
  onToggleCash,
  hasCash,
  t,
}: {
  connections: Connection[];
  selected: string;
  onSelect: (id: string) => void;
  showCash: boolean;
  onToggleCash: () => void;
  hasCash: boolean;
  t: ReturnType<typeof useTranslations<"portfolio">>;
}) {
  // Only worth showing the exchange filter when there's more than one to pick.
  const showChips = connections.length > 1;
  if (!showChips && !hasCash) return null;

  const chips: { id: string; label: string; dot?: string }[] = [
    { id: "all", label: t("filterAll") },
    ...connections.map((c) => ({
      id: c.id,
      label: c.label || c.provider,
      dot: PROVIDER_DOT[c.provider] ?? "var(--ink-subtle)",
    })),
  ];

  return (
    <div className="flex items-center gap-2">
      {showChips && (
        <div className="-mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map((chip) => {
            const active = selected === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => onSelect(chip.id)}
                className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-transform active:scale-[0.97]"
                style={
                  active
                    ? { background: "var(--accent)", color: "var(--accent-fg)" }
                    : { background: "var(--surface)", color: "var(--ink-muted)", boxShadow: "var(--shadow-card)" }
                }
              >
                {chip.dot && (
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: active ? "var(--accent-fg)" : chip.dot }}
                  />
                )}
                {chip.label}
              </button>
            );
          })}
        </div>
      )}

      {hasCash && (
        <button
          type="button"
          role="switch"
          aria-checked={showCash}
          onClick={onToggleCash}
          className={`flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-3 pr-2 text-[12px] font-semibold transition-transform active:scale-[0.97] ${showChips ? "" : "ml-auto"}`}
          style={{ background: "var(--surface)", color: "var(--ink-muted)", boxShadow: "var(--shadow-card)" }}
        >
          {t("allocationCash")}
          <span
            className="relative inline-flex h-[16px] w-[28px] items-center rounded-full transition-colors"
            style={{ background: showCash ? "var(--accent)" : "var(--line-strong)" }}
          >
            <motion.span
              className="absolute h-[12px] w-[12px] rounded-full bg-white"
              animate={{ x: showCash ? 14 : 2 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          </span>
        </button>
      )}
    </div>
  );
}

function SyncRow({
  connections,
  isSyncing,
  onSync,
  t,
}: {
  connections: Connection[];
  isSyncing: boolean;
  onSync: () => void;
  t: ReturnType<typeof useTranslations<"portfolio">>;
}) {
  const hasError = connections.some((c) => c.syncStatus === "ERROR");
  const mostRecent = connections
    .map((c) => c.lastSyncAt)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
  const rel = formatRelativeTime(mostRecent ?? null);

  return (
    <div
      className="flex items-center gap-2.5 rounded-[16px] px-4 py-3"
      style={{ background: "var(--surface)", ...cardShadow }}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: hasError ? "var(--negative)" : "var(--positive)" }}
      />
      <span className="flex-1 text-[12px] tabular-nums" style={{ color: "var(--ink-muted)" }}>
        {t("connectionsSynced", { count: connections.length })}
        {rel ? ` · ${rel}` : ""}
      </span>
      <button
        type="button"
        onClick={onSync}
        disabled={isSyncing}
        className="shrink-0 text-[12px] font-semibold disabled:opacity-50"
        style={{ color: "var(--accent)" }}
      >
        {t("syncNow")}
      </button>
    </div>
  );
}

function UnpricedAssetsSection({
  assets,
}: {
  assets: ReturnType<typeof aggregateAssetsBySymbol>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[16px]" style={{ background: "var(--surface)", ...cardShadow }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" style={{ color: "var(--warning)" }} strokeWidth={1.8} />
          <span className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
            Holdings without price data
          </span>
          <span className="text-[11.5px] tabular-nums" style={{ color: "var(--ink-subtle)" }}>
            ({assets.length})
          </span>
        </div>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <ChevronDown className="h-4 w-4" style={{ color: "var(--ink-subtle)" }} />
        </motion.span>
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
            <div className="space-y-2 px-4 pb-4">
              {assets.map((a) => (
                <div
                  key={a.symbol}
                  className="flex items-center justify-between gap-3 rounded-[12px] px-3 py-2"
                  style={{ background: "var(--app-bg)" }}
                  title={a.priceUnavailableReason ?? "Price not available"}
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
                      {a.symbol}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--ink-subtle)" }}>
                      {a.positions.length === 1
                        ? a.positions[0].exchange.label
                        : `${a.positions.length} exchanges`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[12px] tabular-nums" style={{ color: "var(--ink)" }}>
                      {a.totalQuantity.toFixed(8).replace(/0+$/, "").replace(/\.$/, "")}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--warning)" }}>
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

function PortfolioHeader({
  t,
  isSyncing,
  onSync,
  showActions = true,
}: {
  t: ReturnType<typeof useTranslations<"portfolio">>;
  isSyncing: boolean;
  onSync: () => void;
  showActions?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-[20px] font-bold" style={{ color: "var(--ink)", letterSpacing: "-0.02em" }}>
        {t("title")}
      </h1>
      <div className="flex items-center gap-2">
        <DisplayCurrencyToggle />
        {showActions && (
          <>
            <Link
              href="/dashboard/portfolio/exchanges"
              aria-label={t("manageExchanges")}
              className="flex h-9 items-center gap-1.5 rounded-[18px] px-3 text-[12px] font-semibold transition-transform active:scale-[0.97]"
              style={{ background: "var(--surface)", color: "var(--ink-muted)", ...cardShadow }}
            >
              <Settings2 className="h-4 w-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">{t("manageExchanges")}</span>
            </Link>
            <button
              type="button"
              onClick={onSync}
              disabled={isSyncing}
              className="flex h-9 items-center gap-1.5 rounded-[18px] px-3.5 text-[12px] font-semibold transition-transform active:scale-[0.97] disabled:opacity-60"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              {isSyncing ? (
                <>
                  <div
                    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                  />
                  <span className="hidden sm:inline">{t("syncing")}</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
                  {t("syncAll")}
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
