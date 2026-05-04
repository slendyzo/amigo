"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Car,
  TrendingUp,
  TrendingDown,
  Wallet,
  Trash2,
  CheckCircle,
  Loader2,
  X,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/currencies";
import { cn } from "@/lib/utils";

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

type ValuationPoint = { id: string; valueEur: number; source: string; recordedAt: string };

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
  const [showSell, setShowSell] = useState(false);
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

  const chartData = useMemo(() => {
    return [...valuationHistory]
      .reverse()
      .map((v) => ({ date: v.recordedAt.slice(0, 10), value: v.valueEur }));
  }, [valuationHistory]);

  const linkedExpensesTotal = expenses.reduce((s, e) => s + e.amountEur, 0);
  const monthlyTCO = monthsOwned > 0 ? linkedExpensesTotal / monthsOwned : 0;

  const handleDelete = async () => {
    if (!confirm("Delete this vehicle? Linked expenses will be unlinked but kept.")) return;
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
        <ArrowLeft className="h-4 w-4" /> Net Worth
      </Link>

      {/* Hero */}
      <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/80 backdrop-blur-sm">
        <div className="grid md:grid-cols-[1.2fr_1fr]">
          {asset.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.imageUrl} alt={asset.name} className="aspect-[16/9] w-full object-cover md:aspect-auto" />
          ) : (
            <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-muted/40 to-muted/10 md:aspect-auto">
              <Car className="h-16 w-16 text-muted-foreground/40" strokeWidth={1.5} />
            </div>
          )}

          <div className="flex flex-col justify-between p-6">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{vehicle.year}</p>
              <h1 className="mt-1 text-3xl font-bold leading-tight">
                {vehicle.brand} {vehicle.model}
              </h1>
              {vehicle.trim && <p className="text-sm text-muted-foreground">{vehicle.trim}</p>}

              <div className="mt-4 flex flex-wrap gap-1.5">
                {vehicle.fuelType && <Chip>{vehicle.fuelType}</Chip>}
                {vehicle.bodyType && <Chip>{vehicle.bodyType}</Chip>}
                {vehicle.generation && <Chip>Gen {vehicle.generation}</Chip>}
                {vehicle.color && <Chip>{vehicle.color}</Chip>}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {!sold && (
                <button
                  onClick={() => setShowSell(true)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Mark as sold
                </button>
              )}
              <button
                onClick={handleDelete}
                disabled={busy}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:border-rose-500/40 hover:text-rose-500 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Cost basis" value={formatCurrency(asset.purchasePriceEur, "EUR")} />
        <Stat
          label={sold ? "Sale price" : "Estimated value"}
          value={formatCurrency(current, "EUR")}
          accent={
            sold ? null : (
              <DeltaInline delta={delta} />
            )
          }
        />
        <Stat label="Months owned" value={String(monthsOwned)} />
        {realizedPnL != null ? (
          <Stat
            label="Realized P&L"
            value={`${realizedPnL > 0 ? "+" : ""}${formatCurrency(realizedPnL, "EUR")}`}
            valueClass={realizedPnL > 0 ? "text-emerald-500" : "text-rose-500"}
          />
        ) : (
          <Stat label="Mileage" value={vehicle.mileage != null ? `${vehicle.mileage.toLocaleString()} km` : "—"} />
        )}
      </div>

      {/* Value-over-time chart */}
      {chartData.length > 1 && (
        <section className="rounded-2xl border border-border/60 bg-card/80 p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.8px] text-muted-foreground">Value over time</h2>
          <div className="mt-3 h-[220px] w-full">
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v) => [formatCurrency(typeof v === "number" ? v : Number(v), "EUR"), "Value"]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Loans */}
      {liabilities.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.8px] text-muted-foreground">Loan</h2>
          {liabilities.map((l) => (
            <LoanCard key={l.id} loan={l} />
          ))}
        </section>
      )}

      {/* TCO */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.8px] text-muted-foreground">Total cost of ownership</h2>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatCurrency(monthlyTCO, "EUR")}/mo · {expenses.length} linked
          </p>
        </div>
        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No linked expenses yet. Link receipts (fuel, tires, IUC) from the expense modal to track TCO.
          </p>
        ) : (
          <ul className="divide-y divide-border/40 rounded-2xl border border-border/60 bg-card/80">
            {expenses.slice(0, 10).map((e) => (
              <li key={e.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{e.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(e.date).toLocaleDateString()} · {e.categoryName ?? "Uncategorized"}
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
      </AnimatePresence>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  valueClass,
}: {
  label: string;
  value: string;
  accent?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className={cn("text-xl font-semibold tabular-nums", valueClass)}>{value}</p>
        {accent}
      </div>
    </div>
  );
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
                  <CheckCircle className="h-3 w-3" /> Paid off
                </span>
              ) : (
                <>
                  {loan.monthlyPayment != null && `${formatCurrency(loan.monthlyPayment, loan.currency)}/mo`}
                  {loan.interestRate != null && ` · ${loan.interestRate}% APR`}
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
            of {formatCurrency(loan.principalEur, "EUR")}
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
        throw new Error(e.error || "Failed to mark as sold");
      }
      onSold();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
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
            <h2 className="text-lg font-semibold">Mark as sold</h2>
            <p className="text-xs text-muted-foreground">{asset.name}</p>
          </div>
          <button onClick={onClose} disabled={busy} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sale price ({asset.purchaseCurrency})
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
              Sold on
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
              This sale will pay off the &ldquo;{activeLoan.name}&rdquo; loan ({formatCurrency(activeLoan.currentBalanceEur, "EUR")} outstanding) and stop the recurring payment.
            </p>
          )}
          {error && (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p>
          )}
        </div>

        <footer className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !salePrice || parseFloat(salePrice) < 0}
            className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Mark as sold
          </button>
        </footer>
      </motion.div>
    </div>
  );
}
