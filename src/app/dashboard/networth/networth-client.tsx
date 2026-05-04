"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Wallet, Car, Building2, CreditCard, ArrowRight } from "lucide-react";
import { VehicleCard, type VehicleCardData } from "@/components/ui/vehicle-card";
import { formatCurrency } from "@/lib/currencies";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

type RealAsset = {
  id: string;
  name: string;
  type: "VEHICLE" | "PROPERTY";
  status: "ACTIVE" | "SOLD";
  imageUrl: string | null;
  purchasePriceEur: number;
  currentValueEur: number | null;
  salePriceEur: number | null;
  soldAt: string | null;
  vehicle: { brand: string; model: string; year: number } | null;
};

type Liability = {
  id: string;
  type: string;
  name: string;
  status: "ACTIVE" | "PAID_OFF" | "DEFAULTED";
  currentBalanceEur: number;
  principalEur: number;
  monthlyPayment: number | null;
  currency: string;
  realAsset: { id: string; name: string; type: string } | null;
};

type PortfolioAsset = {
  id: string;
  symbol: string;
  name: string;
  currentValueEur: number;
  totalCostEur: number;
  unrealizedPnlEur: number;
};

type Props = {
  realAssets: RealAsset[];
  liabilities: Liability[];
  portfolioAssets: PortfolioAsset[];
};

const LIABILITY_LABELS: Record<string, string> = {
  VEHICLE_LOAN: "Vehicle loan",
  MORTGAGE: "Mortgage",
  CREDIT_CARD: "Credit card",
  PERSONAL_LOAN: "Personal loan",
  STUDENT_LOAN: "Student loan",
  OTHER: "Other liability",
};

export default function NetworthClient({ realAssets, liabilities, portfolioAssets }: Props) {
  const [tab, setTab] = useState<"active" | "sold">("active");

  const activeAssets = useMemo(() => realAssets.filter((a) => a.status === "ACTIVE"), [realAssets]);
  const soldAssets = useMemo(() => realAssets.filter((a) => a.status === "SOLD"), [realAssets]);
  const activeLiabilities = useMemo(() => liabilities.filter((l) => l.status === "ACTIVE"), [liabilities]);

  const totals = useMemo(() => {
    const investments = portfolioAssets.reduce((s, a) => s + a.currentValueEur, 0);
    const rwas = activeAssets.reduce((s, a) => s + (a.currentValueEur ?? a.purchasePriceEur), 0);
    const liabs = activeLiabilities.reduce((s, l) => s + l.currentBalanceEur, 0);
    return {
      investments,
      rwas,
      liabilities: liabs,
      netWorth: investments + rwas - liabs,
    };
  }, [portfolioAssets, activeAssets, activeLiabilities]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-primary/80">Net Worth</p>
        <div className="flex items-baseline gap-3">
          <h1 className="text-4xl font-bold tabular-nums">{formatCurrency(totals.netWorth, "EUR")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Investments + real-world assets minus liabilities. Updates daily.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile
          label="Investments"
          value={totals.investments}
          icon={<TrendingUp className="h-4 w-4" />}
          tint="emerald"
          href="/dashboard/portfolio"
        />
        <SummaryTile
          label="Real-world assets"
          value={totals.rwas}
          icon={<Car className="h-4 w-4" />}
          tint="sky"
        />
        <SummaryTile
          label="Liabilities"
          value={-totals.liabilities}
          icon={<CreditCard className="h-4 w-4" />}
          tint="rose"
        />
      </div>

      <div className="flex gap-1 border-b border-border/60">
        <TabButton active={tab === "active"} onClick={() => setTab("active")}>
          Active{activeAssets.length > 0 && <span className="ml-1.5 text-xs text-muted-foreground">{activeAssets.length}</span>}
        </TabButton>
        <TabButton active={tab === "sold"} onClick={() => setTab("sold")}>
          Sold{soldAssets.length > 0 && <span className="ml-1.5 text-xs text-muted-foreground">{soldAssets.length}</span>}
        </TabButton>
      </div>

      {tab === "active" && (
        <div className="space-y-6">
          <Section title="Real-world assets" emptyText="No vehicles yet. Add one from the dashboard.">
            {activeAssets.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {activeAssets.map((a, i) => (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: EASE, delay: i * 0.05 }}
                  >
                    <VehicleCard vehicle={toCardData(a)} />
                  </motion.div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Liabilities" emptyText="No active liabilities. Nice.">
            {activeLiabilities.length > 0 && (
              <ul className="space-y-2">
                {activeLiabilities.map((l) => (
                  <LiabilityRow key={l.id} liability={l} />
                ))}
              </ul>
            )}
          </Section>

          <Section title="Investments" emptyText="No exchange portfolios connected.">
            {portfolioAssets.length > 0 && (
              <Link
                href="/dashboard/portfolio"
                className="flex items-center justify-between rounded-2xl border border-border/60 bg-card/80 p-4 transition-colors hover:border-border"
              >
                <div>
                  <p className="text-sm font-medium">{portfolioAssets.length} positions</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Cost basis {formatCurrency(portfolioAssets.reduce((s, a) => s + a.totalCostEur, 0), "EUR")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-base font-semibold tabular-nums">
                    {formatCurrency(totals.investments, "EUR")}
                  </p>
                  <PnLChip pnl={portfolioAssets.reduce((s, a) => s + a.unrealizedPnlEur, 0)} />
                </div>
                <ArrowRight className="ml-3 h-4 w-4 text-muted-foreground" />
              </Link>
            )}
          </Section>
        </div>
      )}

      {tab === "sold" && (
        <Section title="Closed positions" emptyText="No sold assets yet.">
          {soldAssets.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {soldAssets.map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: EASE, delay: i * 0.05 }}
                >
                  <VehicleCard vehicle={toCardData(a)} />
                </motion.div>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function toCardData(a: RealAsset): VehicleCardData {
  return {
    id: a.id,
    name: a.name,
    status: a.status,
    imageUrl: a.imageUrl,
    purchasePriceEur: a.purchasePriceEur,
    currentValueEur:
      a.status === "SOLD"
        ? a.salePriceEur ?? a.currentValueEur ?? a.purchasePriceEur
        : a.currentValueEur ?? a.purchasePriceEur,
    realizedPnLEur:
      a.status === "SOLD" && a.salePriceEur != null ? a.salePriceEur - a.purchasePriceEur : null,
    vehicle: a.vehicle,
  };
}

function SummaryTile({
  label,
  value,
  icon,
  tint,
  href,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tint: "emerald" | "sky" | "rose";
  href?: string;
}) {
  const tintClass =
    tint === "emerald"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : tint === "sky"
        ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
        : "bg-rose-500/10 text-rose-600 dark:text-rose-400";

  const inner = (
    <div className="flex items-start justify-between rounded-2xl border border-border/60 bg-card/80 p-4 transition-colors hover:border-border">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {value < 0 ? "-" : ""}
          {formatCurrency(Math.abs(value), "EUR")}
        </p>
      </div>
      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tintClass)}>{icon}</div>
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative px-4 py-2 text-sm font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
      {active && (
        <motion.div
          layoutId="networth-tab-underline"
          className="absolute -bottom-px left-0 right-0 h-0.5 bg-primary"
        />
      )}
    </button>
  );
}

function Section({
  title,
  emptyText,
  children,
}: {
  title: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const hasContent = !!children && (Array.isArray(children) ? children.length > 0 : true);
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-[0.8px] text-muted-foreground">{title}</h2>
      {hasContent ? children : <p className="text-sm text-muted-foreground">{emptyText}</p>}
    </section>
  );
}

function LiabilityRow({ liability }: { liability: Liability }) {
  const Icon = liability.realAsset?.type === "PROPERTY" ? Building2 : liability.type === "VEHICLE_LOAN" ? Car : Wallet;
  return (
    <li className="flex items-center justify-between rounded-xl border border-border/60 bg-card/80 p-3 transition-colors hover:border-border">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">{liability.name}</p>
          <p className="text-xs text-muted-foreground">{LIABILITY_LABELS[liability.type] ?? liability.type}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums text-rose-500">
          -{formatCurrency(liability.currentBalanceEur, "EUR")}
        </p>
        {liability.monthlyPayment != null && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatCurrency(liability.monthlyPayment, liability.currency)}/mo
          </p>
        )}
      </div>
    </li>
  );
}

function PnLChip({ pnl }: { pnl: number }) {
  const positive = pnl >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium tabular-nums", positive ? "text-emerald-500" : "text-rose-500")}>
      <Icon className="h-3 w-3" />
      {positive ? "+" : ""}
      {formatCurrency(pnl, "EUR")}
    </span>
  );
}
