"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Home,
  TrendingUp,
  TrendingDown,
  Wallet,
  Trash2,
  CheckCircle,
  Loader2,
  X,
  MoreVertical,
  Pencil,
  Bed,
  Bath,
  Ruler,
  Building2,
  Zap,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/currencies";
import { buildStaticMapUrl } from "@/lib/static-map";
import { cn } from "@/lib/utils";
import EditPropertyModal from "@/components/edit-property-modal";

const EASE = [0.16, 1, 0.3, 1] as const;

type Asset = {
  id: string;
  name: string;
  status: "ACTIVE" | "SOLD";
  imageUrl: string | null;
  notes: string | null;
  purchasePrice: number;
  purchasePriceEur: number;
  purchaseCurrency: string;
  purchaseDate: string;
  currentValueEur: number | null;
  currentValueSource: string | null;
  soldAt: string | null;
  salePriceEur: number | null;
};

type Property = {
  propertyType: "APARTMENT" | "HOUSE" | "LAND" | "COMMERCIAL" | "OTHER";
  address: string | null;
  postalCode: string | null;
  distrito: string | null;
  concelho: string | null;
  freguesia: string | null;
  country: string;
  livableAreaM2: number | null;
  totalAreaM2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  yearBuilt: number | null;
  floor: number | null;
  parkingSpaces: number | null;
  energyRating: "A_PLUS" | "A" | "B" | "B_MINUS" | "C" | "D" | "E" | "F" | null;
  condominiumFeeMonthly: number | null;
  latitude: number | null;
  longitude: number | null;
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
  property: Property;
  liabilities: Liability[];
  valuationHistory: ValuationPoint[];
  expenses: ExpenseRow[];
};

const ENERGY_LABEL: Record<NonNullable<Property["energyRating"]>, string> = {
  A_PLUS: "A+",
  A: "A",
  B: "B",
  B_MINUS: "B-",
  C: "C",
  D: "D",
  E: "E",
  F: "F",
};

export default function PropertyDetailClient({
  asset,
  property,
  liabilities,
  valuationHistory,
  expenses,
}: Props) {
  const router = useRouter();
  const t = useTranslations("rwa");
  const tDashboard = useTranslations("dashboard");
  const [showSell, setShowSell] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
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
    return Math.max(
      0,
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44)),
    );
  }, [asset.purchaseDate, asset.soldAt, sold]);

  const chartData = useMemo(() => {
    return [...valuationHistory]
      .reverse()
      .map((v) => ({ date: v.recordedAt.slice(0, 10), value: v.valueEur }));
  }, [valuationHistory]);

  const linkedExpensesTotal = expenses.reduce((s, e) => s + e.amountEur, 0);
  const monthlyTCO = monthsOwned > 0 ? linkedExpensesTotal / monthsOwned : 0;

  const subtitle =
    [property.address, property.concelho].filter(Boolean).join(" · ") ||
    property.distrito ||
    null;
  const purchaseDateLabel = formatMonthYear(asset.purchaseDate);

  const handleDelete = async () => {
    if (!confirm(t("deletePropertyConfirm"))) return;
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

      {/* Hero */}
      <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/80 backdrop-blur-sm">
        <div className="grid md:grid-cols-[1.2fr_1fr]">
          <PropertyImage
            src={asset.imageUrl}
            mapUrl={
              property.latitude != null && property.longitude != null
                ? buildStaticMapUrl({ lat: property.latitude, lon: property.longitude })
                : null
            }
            alt={asset.name}
            sold={sold}
          />

          <div className="flex flex-col justify-between p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t(`propertyTypeOption.${property.propertyType}`)}
                  {property.yearBuilt ? ` · ${property.yearBuilt}` : ""}
                </p>
                <h1 className="mt-1 text-3xl font-bold leading-tight">{asset.name}</h1>
                {subtitle && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
                )}

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {property.bedrooms != null && (
                    <Chip>
                      <Bed className="h-3 w-3" /> {t("bedroomsCount", { count: property.bedrooms })}
                    </Chip>
                  )}
                  {property.bathrooms != null && (
                    <Chip>
                      <Bath className="h-3 w-3" /> {t("bathroomsCount", { count: property.bathrooms })}
                    </Chip>
                  )}
                  {property.livableAreaM2 != null && (
                    <Chip>
                      <Ruler className="h-3 w-3" /> {property.livableAreaM2} m²
                    </Chip>
                  )}
                  {property.floor != null && (
                    <Chip>
                      <Building2 className="h-3 w-3" /> {t("floorLabel", { floor: property.floor })}
                    </Chip>
                  )}
                  {property.energyRating && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-500">
                      <Zap className="h-3 w-3" /> {ENERGY_LABEL[property.energyRating]}
                    </span>
                  )}
                </div>
              </div>

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
                        aria-hidden="true"
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
                        <button
                          onClick={() => {
                            setMenuOpen(false);
                            setShowEdit(true);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted"
                        >
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                          {t("editDetails")}
                        </button>
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
                          {t("deleteProperty")}
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {sold && asset.soldAt ? (
              <div className="mt-6">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <CheckCircle className="h-3 w-3" />
                  {t("soldOnLabel", { date: formatMonthYear(asset.soldAt) })}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t("costBasis")} value={formatCurrency(asset.purchasePriceEur, "EUR")} />
        <Stat
          label={sold ? t("salePrice") : t("estimatedValue")}
          value={formatCurrency(sold && asset.salePriceEur != null ? asset.salePriceEur : current, "EUR")}
          accent={sold ? null : <DeltaInline delta={delta} />}
        />
        <Stat
          label={sold ? t("ownedFor") : t("monthsOwned")}
          value={String(monthsOwned)}
        />
        {realizedPnL != null ? (
          <Stat
            label={t("realizedPnL")}
            value={`${realizedPnL > 0 ? "+" : ""}${formatCurrency(realizedPnL, "EUR")}`}
            valueClass={realizedPnL > 0 ? "text-emerald-500" : "text-rose-500"}
          />
        ) : (
          <Stat
            label={t("monthlyTCOLabel")}
            value={
              expenses.length === 0
                ? "—"
                : `${formatCurrency(monthlyTCO, "EUR")}${t("monthlySuffix")}`
            }
          />
        )}
      </div>

      {/* Value-over-time chart */}
      {!sold && (
        <section className="rounded-2xl border border-border/60 bg-card/80 p-5">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-xs font-bold uppercase tracking-[0.8px] text-muted-foreground">
              {t("valueOverTime")}
            </h2>
            {property.concelho && (
              <p className="text-xs text-muted-foreground">
                {t("ineIndex", { concelho: property.concelho })}
              </p>
            )}
          </div>

          {chartData.length > 1 ? (
            <div className="h-[220px] w-full">
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v) => [
                      formatCurrency(typeof v === "number" ? v : Number(v), "EUR"),
                      t("chartValueLabel"),
                    ]}
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
          ) : (
            <ChartEmptyState
              purchasePrice={asset.purchasePriceEur}
              purchaseDateLabel={purchaseDateLabel}
              caption={t("trackingFromCaption", { month: purchaseDateLabel })}
            />
          )}
        </section>
      )}

      {/* Loans */}
      {liabilities.length > 0 && !sold && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.8px] text-muted-foreground">
            {t("mortgage")}
          </h2>
          {liabilities.map((l) => (
            <LoanCard key={l.id} loan={l} />
          ))}
        </section>
      )}

      {/* TCO + linked expenses */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.8px] text-muted-foreground">
            {t("costOfOwnership")}
          </h2>
          <p className="text-xs text-muted-foreground tabular-nums">
            {expenses.length === 0
              ? t("noLinkedShort")
              : `${formatCurrency(monthlyTCO, "EUR")}${t("monthlySuffix")} · ${t("linkedSuffix", { count: expenses.length })}`}
          </p>
        </div>
        {expenses.length === 0 ? (
          <p className="rounded-2xl border border-border/60 bg-card/80 px-4 py-6 text-center text-sm text-muted-foreground">
            {t("noLinkedExpensesProperty")}
          </p>
        ) : (
          <ul className="divide-y divide-border/40 rounded-2xl border border-border/60 bg-card/80">
            {expenses.slice(0, 10).map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{e.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(e.date).toLocaleDateString()} ·{" "}
                    {e.categoryName ?? tDashboard("uncategorized")}
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
        {showEdit && (
          <EditPropertyModal
            asset={{
              id: asset.id,
              name: asset.name,
              notes: asset.notes,
              purchasePrice: asset.purchasePrice,
              purchasePriceEur: asset.purchasePriceEur,
              purchaseCurrency: asset.purchaseCurrency,
              purchaseDate: asset.purchaseDate,
            }}
            property={{
              propertyType: property.propertyType,
              address: property.address,
              postalCode: property.postalCode,
              concelho: property.concelho,
              freguesia: property.freguesia,
              country: property.country,
              livableAreaM2: property.livableAreaM2,
              bedrooms: property.bedrooms,
              bathrooms: property.bathrooms,
              yearBuilt: property.yearBuilt,
              energyRating: property.energyRating,
              latitude: property.latitude,
              longitude: property.longitude,
            }}
            onClose={() => setShowEdit(false)}
            onSaved={() => {
              setShowEdit(false);
              router.refresh();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PropertyImage({
  src,
  mapUrl,
  alt,
  sold,
}: {
  src: string | null;
  mapUrl: string | null;
  alt: string;
  sold: boolean;
}) {
  const url = src ?? mapUrl;
  if (!url) {
    return (
      <div
        className={cn(
          "flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-violet-500/10 to-violet-500/5 md:aspect-auto",
          sold && "opacity-60 grayscale",
        )}
      >
        <Home className="h-16 w-16 text-violet-500/50" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={cn(
        "aspect-[16/9] w-full object-cover md:aspect-auto",
        sold && "opacity-60 grayscale",
      )}
    />
  );
}

function ChartEmptyState({
  purchasePrice,
  purchaseDateLabel,
  caption,
}: {
  purchasePrice: number;
  purchaseDateLabel: string;
  caption: string;
}) {
  return (
    <div className="relative h-[220px] w-full">
      <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-border/60" />
      <div
        className="absolute"
        style={{ left: "16%", top: "50%", transform: "translate(-50%, -50%)" }}
      >
        <div className="h-3 w-3 rounded-full bg-primary shadow-[0_0_0_6px_hsl(var(--primary)/0.18)]" />
      </div>
      <p
        className="absolute whitespace-nowrap text-xs text-muted-foreground tabular-nums"
        style={{ left: "16%", top: "calc(50% - 32px)", transform: "translateX(-50%)" }}
      >
        {formatCurrency(purchasePrice, "EUR")} · {purchaseDateLabel}
      </p>
      <p
        className="absolute text-xs text-muted-foreground"
        style={{ left: "50%", top: "calc(50% + 28px)", transform: "translateX(-50%)" }}
      >
        {caption}
      </p>
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
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function DeltaInline({ delta }: { delta: number }) {
  const positive = delta > 0.1;
  const negative = delta < -0.1;
  const Icon = positive ? TrendingUp : negative ? TrendingDown : null;
  const color = positive
    ? "text-emerald-500"
    : negative
      ? "text-rose-500"
      : "text-muted-foreground";
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
  const progressPct =
    loan.principalEur > 0
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
                  {loan.monthlyPayment != null &&
                    `${formatCurrency(loan.monthlyPayment, loan.currency)}${t("monthlySuffix")}`}
                  {loan.interestRate != null &&
                    ` · ${t("aprSuffix", { rate: loan.interestRate })}`}
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
      role="dialog"
      aria-modal="true"
    >
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
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
          >
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
              placeholder="400000"
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
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
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

function formatMonthYear(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", year: "numeric" });
}
