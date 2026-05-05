"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Car,
  TrendingUp,
  TrendingDown,
  Wallet,
  Trash2,
  CheckCircle,
  Loader2,
  MoreVertical,
  X,
} from "lucide-react";
import { formatCurrency } from "@/lib/currencies";
import { cn } from "@/lib/utils";
import {
  ValueOverTimeChart,
  type ValuePoint,
  type ValuePointSource,
} from "@/components/ui/value-over-time-chart";
import { AddValuationModal } from "@/components/add-valuation-modal";
import { ValueSourceHint } from "@/components/ui/value-source-hint";

const EASE = [0.16, 1, 0.3, 1] as const;

type Asset = {
  id: string;
  name: string;
  status: "ACTIVE" | "SOLD";
  imageUrl: string | null;
  notes: string | null;
  purchasePriceEur: number;
  purchaseCurrency: string;
  purchaseDate: string;
  currentValueEur: number | null;
  currentValueSource: string | null;
  soldAt: string | null;
  salePriceEur: number | null;
  backfillStatus: string | null;
  backfillProgress: number | null;
};

type Vehicle = {
  brand: string;
  model: string;
  year: number;
  trim: string | null;
  generation: string | null;
  mileage: number | null;
  plate: string | null;
  color: string | null;
  fuelType: string | null;
  bodyType: string | null;
};

type Liability = {
  id: string;
  name: string;
  type: string;
  status: string;
  currency: string;
  principalEur: number;
  currentBalanceEur: number;
  monthlyPayment: number | null;
  termMonths: number | null;
  interestRate: number | null;
  startDate: string;
};

type ValuationPoint = {
  id: string;
  valueEur: number;
  source: string;
  sampleSize: number | null;
  metadata: Record<string, unknown> | null;
  recordedAt: string;
};

const KNOWN_SOURCES: ValuePointSource[] = [
  "purchase",
  "web_archive",
  "live_scrape",
  "ai_estimate",
  "manual",
];

function normalizeSource(s: string): ValuePointSource {
  return (KNOWN_SOURCES as string[]).includes(s) ? (s as ValuePointSource) : "ai_estimate";
}

type ExpenseRow = {
  id: string;
  name: string;
  amount: number;
  amountEur: number;
  currency: string;
  date: string;
  categoryName: string | null;
};

type Props = {
  asset: Asset;
  vehicle: Vehicle;
  liabilities: Liability[];
  valuationHistory: ValuationPoint[];
  expenses: ExpenseRow[];
};

export default function VehicleDetailClient({ asset, vehicle, liabilities, valuationHistory, expenses }: Props) {
  const router = useRouter();
  const t = useTranslations("rwa");
  const tDashboard = useTranslations("dashboard");
  const [showSell, setShowSell] = useState(false);
  const [showAddValuation, setShowAddValuation] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const sold = asset.status === "SOLD";
  const current = asset.currentValueEur ?? asset.purchasePriceEur;
  const delta = ((current - asset.purchasePriceEur) / asset.purchasePriceEur) * 100;
  const realizedPnL =
    sold && asset.salePriceEur != null ? asset.salePriceEur - asset.purchasePriceEur : null;
  const monthsOwned = useMemo(() => {
    const start = new Date(asset.purchaseDate);
    const end = sold && asset.soldAt ? new Date(asset.soldAt) : new Date();
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
  }, [asset.purchaseDate, asset.soldAt, sold]);

  const chartPoints: ValuePoint[] = useMemo(
    () =>
      valuationHistory.map((v) => ({
        date: v.recordedAt.slice(0, 10),
        value: v.valueEur,
        source: normalizeSource(v.source),
        sampleSize: v.sampleSize,
        note:
          v.metadata && typeof v.metadata === "object" && "note" in v.metadata
            ? String(v.metadata.note)
            : null,
      })),
    [valuationHistory],
  );

  // Poll the asset endpoint while backfill is running so the chart densifies live.
  const [backfillStatus, setBackfillStatus] = useState<string | null>(asset.backfillStatus);
  const [backfillProgress, setBackfillProgress] = useState<number | null>(asset.backfillProgress);

  useEffect(() => {
    if (backfillStatus !== "queued" && backfillStatus !== "running") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/assets/${asset.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { asset?: { backfillStatus: string | null; backfillProgress: number | null } };
        if (cancelled || !json.asset) return;
        setBackfillStatus(json.asset.backfillStatus);
        setBackfillProgress(json.asset.backfillProgress);
        if (json.asset.backfillStatus === "done" || json.asset.backfillStatus === "no_data") {
          router.refresh();
        }
      } catch {
        // ignore
      }
    };
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [asset.id, backfillStatus, router]);

  const chartStatus: "loading" | "done" | "no_data" =
    backfillStatus === "queued" || backfillStatus === "running"
      ? "loading"
      : backfillStatus === "no_data"
      ? "no_data"
      : "done";

  const linkedExpensesTotal = expenses.reduce((s, e) => s + e.amountEur, 0);
  const monthlyTCO = monthsOwned > 0 ? linkedExpensesTotal / monthsOwned : 0;

  const handleDelete = async () => {
    if (!confirm(t("deleteVehicleConfirm"))) return;
    setBusy(true);
    const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/dashboard/networth");
      router.refresh();
    }
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/networth"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("backToNetWorth")}
      </Link>

      {/* Hero — capped image left, packed info right */}
      <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/80 backdrop-blur-sm">
        <div className="grid md:grid-cols-[1.4fr_1fr] md:max-h-[360px]">
          {/* Image */}
          <div
            className={cn(
              "relative aspect-[16/10] w-full md:aspect-auto md:h-full",
              "bg-gradient-to-br from-muted/40 to-muted/10",
              sold && "opacity-70 grayscale",
            )}
          >
            {asset.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={asset.imageUrl} alt={asset.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Car className="h-16 w-16 text-muted-foreground/40" strokeWidth={1.5} />
              </div>
            )}
            {sold && asset.soldAt && (
              <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-card/95 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm backdrop-blur-sm">
                <CheckCircle className="h-3 w-3" />
                {t("soldOnLabel", { date: formatMonthYear(asset.soldAt) })}
              </span>
            )}
          </div>

          {/* Info column */}
          <div className="flex min-w-0 flex-col justify-between p-5 md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{vehicle.year}</p>
                <h1 className="mt-0.5 text-2xl font-bold leading-tight md:text-[26px]">
                  {vehicle.brand} {vehicle.model}
                </h1>
                {vehicle.trim && <p className="text-sm text-muted-foreground">{vehicle.trim}</p>}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {vehicle.fuelType && <Chip>{vehicle.fuelType}</Chip>}
                  {vehicle.bodyType && <Chip>{vehicle.bodyType}</Chip>}
                  {vehicle.generation && <Chip>{vehicle.generation}</Chip>}
                  {vehicle.color && <Chip>{vehicle.color}</Chip>}
                </div>
              </div>

              {/* Kebab menu — sell + delete actions */}
              <div className="relative shrink-0">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="rounded-lg border border-border/60 bg-card/60 p-2 text-muted-foreground hover:border-border hover:text-foreground"
                  aria-label={t("actionsMenu")}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                <AnimatePresence>
                  {menuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setMenuOpen(false)}
                        aria-hidden
                      />
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.18, ease: EASE }}
                        className="absolute right-0 top-11 z-40 min-w-[200px] rounded-xl border border-border/80 bg-card p-1 shadow-2xl backdrop-blur-md"
                      >
                        {!sold && (
                          <button
                            onClick={() => {
                              setMenuOpen(false);
                              setShowSell(true);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted"
                          >
                            <CheckCircle className="h-4 w-4 text-muted-foreground" />
                            {t("markAsSold")}
                          </button>
                        )}
                        <div className="my-1 h-px bg-border/60" />
                        <button
                          onClick={() => {
                            setMenuOpen(false);
                            handleDelete();
                          }}
                          disabled={busy}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-500 hover:bg-rose-500/10 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          {t("deleteVehicle") ?? "Delete vehicle"}
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Stats grid 2x2, packed inside the hero */}
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/40 pt-4 md:mt-3 md:pt-3">
              <HeroStat
                label={t("costBasis")}
                value={formatCurrency(asset.purchasePriceEur, "EUR")}
              />
              <HeroStat
                label={sold ? t("salePrice") : t("estimatedValue")}
                value={formatCurrency(current, "EUR")}
                hint={
                  sold ? null : (
                    <ValueSourceHint
                      source={asset.currentValueSource}
                      updatedAt={null}
                      assetType="vehicle"
                    />
                  )
                }
                accent={sold ? null : <DeltaInline delta={delta} />}
                valueClass={sold ? undefined : undefined}
              />
              {realizedPnL != null ? (
                <HeroStat
                  label={t("realizedPnL")}
                  value={`${realizedPnL > 0 ? "+" : ""}${formatCurrency(realizedPnL, "EUR")}`}
                  valueClass={realizedPnL > 0 ? "text-emerald-500" : "text-rose-500"}
                />
              ) : (
                <HeroStat
                  label={t("mileage")}
                  value={vehicle.mileage != null ? `${vehicle.mileage.toLocaleString()} km` : "—"}
                />
              )}
              <HeroStat
                label={t("monthsOwned")}
                value={String(monthsOwned)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Value-over-time chart */}
      <ValueOverTimeChart
        points={chartPoints}
        status={chartStatus}
        progress={
          chartStatus === "loading" && backfillProgress != null
            ? { current: backfillProgress, total: 100 }
            : undefined
        }
        onAddValuation={() => setShowAddValuation(true)}
        copy={{ title: t("valueOverTime") }}
      />

      {/* Loans */}
      {liabilities.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.8px] text-muted-foreground">{t("loan")}</h2>
          {liabilities.map((l) => (
            <LoanCard key={l.id} loan={l} />
          ))}
        </section>
      )}

      {/* TCO */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.8px] text-muted-foreground">{t("totalCostOfOwnership")}</h2>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatCurrency(monthlyTCO, "EUR")}{t("monthlySuffix")} · {t("linkedSuffix", { count: expenses.length })}
          </p>
        </div>
        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("noLinkedExpenses")}
          </p>
        ) : (
          <ul className="divide-y divide-border/40 rounded-2xl border border-border/60 bg-card/80">
            {expenses.slice(0, 10).map((e) => (
              <li key={e.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{e.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(e.date).toLocaleDateString()} · {e.categoryName ?? tDashboard("uncategorized")}
                  </p>
                </div>
                <p className="ml-3 tabular-nums">{formatCurrency(e.amountEur, "EUR")}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AnimatePresence>
        {showSell && (
          <SellModal
            asset={asset}
            liabilities={liabilities}
            onClose={() => setShowSell(false)}
            onSold={() => {
              setShowSell(false);
              router.refresh();
            }}
          />
        )}
        {showAddValuation && (
          <AddValuationModal
            assetId={asset.id}
            defaultCurrency={asset.purchaseCurrency}
            onClose={() => setShowAddValuation(false)}
            onSaved={() => {
              setShowAddValuation(false);
              router.refresh();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function HeroStat({
  label,
  value,
  accent,
  hint,
  valueClass,
}: {
  label: string;
  value: string;
  accent?: React.ReactNode;
  hint?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {hint}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <p className={cn("truncate text-base font-semibold tabular-nums md:text-lg", valueClass)}>{value}</p>
        {accent}
      </div>
    </div>
  );
}

function formatMonthYear(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", year: "numeric" });
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{children}</span>
  );
}

function DeltaInline({ delta }: { delta: number }) {
  const positive = delta > 0.1;
  const negative = delta < -0.1;
  const Icon = positive ? TrendingUp : negative ? TrendingDown : null;
  const color = positive ? "text-emerald-500" : negative ? "text-rose-500" : "text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", color)}>
      {Icon && <Icon className="h-3 w-3" />}
      {delta > 0 ? "+" : ""}
      {delta.toFixed(1)}%
    </span>
  );
}

function LoanCard({ loan }: { loan: Liability }) {
  const t = useTranslations("rwa");
  const paidOff = loan.status === "PAID_OFF";
  const progressPct = loan.principalEur > 0
    ? Math.min(100, ((loan.principalEur - loan.currentBalanceEur) / loan.principalEur) * 100)
    : 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Wallet className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium">{loan.name}</p>
            <p className="text-xs text-muted-foreground">
              {paidOff ? (
                <span className="inline-flex items-center gap-1 text-emerald-500">
                  <CheckCircle className="h-3 w-3" /> {t("paidOff")}
                </span>
              ) : (
                <>
                  {loan.monthlyPayment != null && `${formatCurrency(loan.monthlyPayment, loan.currency)}${t("monthlySuffix")}`}
                  {loan.interestRate != null && ` · ${t("aprSuffix", { rate: loan.interestRate })}`}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-base font-semibold tabular-nums">
            {formatCurrency(loan.currentBalanceEur, "EUR")}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {t("ofAmount", { amount: formatCurrency(loan.principalEur, "EUR") })}
          </p>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.8, ease: EASE }}
          className="h-full bg-primary"
        />
      </div>
    </div>
  );
}

function SellModal({
  asset,
  liabilities,
  onClose,
  onSold,
}: {
  asset: Asset;
  liabilities: Liability[];
  onClose: () => void;
  onSold: () => void;
}) {
  const t = useTranslations("rwa");
  const tCommon = useTranslations("common");
  const [salePrice, setSalePrice] = useState("");
  const [soldAt, setSoldAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeLoan = liabilities.find((l) => l.status === "ACTIVE");
  const willCloseLoan = activeLoan && parseFloat(salePrice) >= activeLoan.currentBalanceEur;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/assets/${asset.id}/sell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salePrice: parseFloat(salePrice),
          salePriceCurrency: asset.purchaseCurrency,
          soldAt,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || t("failedToMarkSold"));
      }
      onSold();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={busy ? undefined : onClose}
      />
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="relative z-10 w-full max-w-md rounded-t-3xl bg-card p-6 shadow-2xl md:rounded-2xl"
      >
        <header className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("markAsSold")}</h2>
            <p className="text-xs text-muted-foreground">{asset.name}</p>
          </div>
          <button onClick={onClose} disabled={busy} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("salePriceWithCurrency", { currency: asset.purchaseCurrency })}
            </span>
            <input
              type="number"
              step="0.01"
              min={0}
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="20000"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("soldOn")}
            </span>
            <input
              type="date"
              value={soldAt}
              onChange={(e) => setSoldAt(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </label>

          {willCloseLoan && activeLoan && (
            <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              {t("willCloseLoan", {
                name: activeLoan.name,
                balance: formatCurrency(activeLoan.currentBalanceEur, "EUR"),
              })}
            </p>
          )}
          {error && (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p>
          )}
        </div>

        <footer className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            {tCommon("cancel")}
          </button>
          <button
            onClick={submit}
            disabled={busy || !salePrice || parseFloat(salePrice) < 0}
            className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("markAsSold")}
          </button>
        </footer>
      </motion.div>
    </div>
  );
}
