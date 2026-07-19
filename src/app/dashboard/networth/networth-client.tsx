"use client";

import { lazy, Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  Plus,
  Car,
  Building2,
  Home,
  CreditCard,
  Wallet,
  ChevronRight,
} from "lucide-react";
import { formatCurrency } from "@/lib/currencies";

const AddVehicleModal = lazy(() => import("@/components/add-vehicle-modal"));
const AddPropertyModal = lazy(() => import("@/components/add-property-modal"));

const EASE = [0.16, 1, 0.3, 1] as const;
const cardShadow = { boxShadow: "var(--shadow-card)" };
const STRIPES =
  "repeating-linear-gradient(45deg,#EEEBFD,#EEEBFD 6px,#E3DEFA 6px,#E3DEFA 12px)";

type RealAsset = {
  id: string;
  name: string;
  type: "VEHICLE" | "PROPERTY";
  status: "ACTIVE" | "SOLD";
  imageUrl: string | null;
  purchasePriceEur: number;
  currentValueEur: number | null;
  currentValueSource: string | null;
  currentValueUpdatedAt: string | null;
  salePriceEur: number | null;
  soldAt: string | null;
  vehicle: {
    brand: string;
    model: string;
    year: number;
    vehicleClass?: "CAR" | "MOTORCYCLE" | "BICYCLE";
    bodyType?: string | null;
  } | null;
  property: {
    propertyType: string;
    concelho: string | null;
    address: string | null;
    livableAreaM2: number | null;
    bedrooms: number | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
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

export default function NetworthClient({ realAssets, liabilities, portfolioAssets }: Props) {
  const t = useTranslations("rwa");
  const router = useRouter();
  const [tab, setTab] = useState<"active" | "sold">("active");
  const [addMenu, setAddMenu] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showAddProperty, setShowAddProperty] = useState(false);

  const activeAssets = useMemo(() => realAssets.filter((a) => a.status === "ACTIVE"), [realAssets]);
  const soldAssets = useMemo(() => realAssets.filter((a) => a.status === "SOLD"), [realAssets]);
  const activeLiabilities = useMemo(() => liabilities.filter((l) => l.status === "ACTIVE"), [liabilities]);

  const totals = useMemo(() => {
    const investments = portfolioAssets.reduce((s, a) => s + a.currentValueEur, 0);
    const rwas = activeAssets.reduce((s, a) => s + (a.currentValueEur ?? a.purchasePriceEur), 0);
    const liabs = activeLiabilities.reduce((s, l) => s + l.currentBalanceEur, 0);
    const investPnl = portfolioAssets.reduce((s, a) => s + a.unrealizedPnlEur, 0);
    return {
      investments,
      rwas,
      liabilities: liabs,
      netWorth: investments + rwas - liabs,
      investPnl,
    };
  }, [portfolioAssets, activeAssets, activeLiabilities]);

  // Composition bar widths — proportional to absolute magnitudes
  const barTotal = Math.abs(totals.investments) + Math.abs(totals.rwas) + Math.abs(totals.liabilities) || 1;
  const wInvested = (Math.abs(totals.investments) / barTotal) * 100;
  const wAssets = (Math.abs(totals.rwas) / barTotal) * 100;
  const wDebt = (Math.abs(totals.liabilities) / barTotal) * 100;

  const handleAdded = () => {
    setShowAddVehicle(false);
    setShowAddProperty(false);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* Nav row */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          aria-label={t("backToNetWorth")}
          className="flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-95"
          style={{ background: "var(--surface)", ...cardShadow }}
        >
          <ChevronLeft className="h-[18px] w-[18px]" style={{ color: "var(--ink)" }} strokeWidth={1.8} />
        </Link>
        <div className="text-[16px] font-semibold" style={{ color: "var(--ink)" }}>
          {t("totalNetWorth")}
        </div>
        <div className="relative">
          <button
            type="button"
            aria-label={t("addAnother")}
            onClick={() => setAddMenu((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-95"
            style={{ background: "var(--surface)", ...cardShadow }}
          >
            <Plus className="h-[18px] w-[18px]" style={{ color: "var(--ink)" }} strokeWidth={1.8} />
          </button>
          <AnimatePresence>
            {addMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setAddMenu(false)} aria-hidden />
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: EASE }}
                  className="absolute right-0 top-12 z-40 min-w-[190px] overflow-hidden rounded-[14px] p-1"
                  style={{ background: "var(--surface)", boxShadow: "var(--shadow-pop)" }}
                >
                  <AddMenuItem
                    icon={<Building2 className="h-4 w-4" strokeWidth={1.8} />}
                    label={t("addProperty")}
                    onClick={() => {
                      setAddMenu(false);
                      setShowAddProperty(true);
                    }}
                  />
                  <AddMenuItem
                    icon={<Car className="h-4 w-4" strokeWidth={1.8} />}
                    label={t("addVehicle")}
                    onClick={() => {
                      setAddMenu(false);
                      setShowAddVehicle(true);
                    }}
                  />
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Total + delta */}
      <div className="py-1 text-center">
        <div
          className="text-[38px] font-bold tabular-nums leading-none"
          style={{ color: "var(--ink)", letterSpacing: "-0.03em" }}
        >
          {formatCurrency(totals.netWorth, "EUR")}
        </div>
        {totals.investPnl !== 0 && (
          <div
            className="mt-1.5 text-[13px] font-semibold tabular-nums"
            style={{ color: totals.investPnl >= 0 ? "var(--positive)" : "var(--negative)" }}
          >
            {totals.investPnl >= 0 ? "▲ " : "▼ "}
            {formatCurrency(Math.abs(totals.investPnl), "EUR")} {t("netWorthChangeCaption")}
          </div>
        )}
      </div>

      {/* Composition bar */}
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-[5px]">
        <div style={{ width: `${wInvested}%`, background: "var(--accent)" }} />
        <div style={{ width: `${wAssets}%`, background: "var(--accent-soft)" }} />
        <div style={{ width: `${wDebt}%`, background: "var(--accent-fainter)" }} />
      </div>

      {/* Three tiles */}
      <div className="flex gap-2.5">
        <StatTile swatch="var(--accent)" label={t("investments")} value={totals.investments} />
        <StatTile swatch="var(--accent-soft)" label={t("realWorldAssets")} value={totals.rwas} />
        <StatTile
          swatch="var(--accent-fainter)"
          label={t("liabilities")}
          value={-totals.liabilities}
          negative
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1" style={{ borderBottom: "1px solid var(--line)" }}>
        <TabButton active={tab === "active"} onClick={() => setTab("active")}>
          {t("active")}
          {activeAssets.length > 0 && (
            <span className="ml-1.5 text-[11px]" style={{ color: "var(--ink-subtle)" }}>
              {activeAssets.length}
            </span>
          )}
        </TabButton>
        <TabButton active={tab === "sold"} onClick={() => setTab("sold")}>
          {t("sold")}
          {soldAssets.length > 0 && (
            <span className="ml-1.5 text-[11px]" style={{ color: "var(--ink-subtle)" }}>
              {soldAssets.length}
            </span>
          )}
        </TabButton>
      </div>

      {tab === "active" && (
        <div className="space-y-5">
          {/* Real assets */}
          <GroupLabel label={t("realWorldAssets")} />
          {activeAssets.length > 0 ? (
            <div className="space-y-2.5">
              {activeAssets.map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: EASE, delay: i * 0.05 }}
                >
                  <AssetCard asset={a} t={t} />
                </motion.div>
              ))}
            </div>
          ) : (
            <EmptyLine text={t("noActiveAssets")} />
          )}

          {/* Liabilities */}
          <GroupLabel label={t("liabilities")} />
          {activeLiabilities.length > 0 ? (
            <div className="rounded-[20px] px-4" style={{ background: "var(--surface)", ...cardShadow }}>
              {activeLiabilities.map((l, i) => (
                <LiabilityRow
                  key={l.id}
                  liability={l}
                  t={t}
                  divider={i < activeLiabilities.length - 1}
                />
              ))}
            </div>
          ) : (
            <EmptyLine text={t("noLiabilities")} />
          )}

          {/* Investments */}
          <GroupLabel label={t("investments")} />
          {portfolioAssets.length > 0 ? (
            <Link
              href="/dashboard/portfolio"
              className="flex items-center gap-3 rounded-[20px] p-4 transition-transform active:scale-[0.99]"
              style={{ background: "var(--surface)", ...cardShadow }}
            >
              <div
                className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px]"
                style={{ background: "var(--surface-2)", color: "var(--accent)" }}
              >
                <Wallet className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold" style={{ color: "var(--ink)" }}>
                  {t("positionsCount", { count: portfolioAssets.length })}
                </div>
                <div className="text-[11.5px] tabular-nums" style={{ color: "var(--ink-subtle)" }}>
                  {t("costBasis")}{" "}
                  {formatCurrency(portfolioAssets.reduce((s, a) => s + a.totalCostEur, 0), "EUR")}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[14px] font-bold tabular-nums" style={{ color: "var(--ink)" }}>
                  {formatCurrency(totals.investments, "EUR")}
                </div>
                <div
                  className="text-[11px] font-semibold tabular-nums"
                  style={{ color: totals.investPnl >= 0 ? "var(--positive)" : "var(--negative)" }}
                >
                  {totals.investPnl >= 0 ? "▲ " : "▼ "}
                  {formatCurrency(Math.abs(totals.investPnl), "EUR")}
                </div>
              </div>
              <ChevronRight className="h-4 w-4" style={{ color: "var(--ink-subtle)" }} />
            </Link>
          ) : (
            <EmptyLine text={t("noInvestments")} />
          )}
        </div>
      )}

      {tab === "sold" && (
        <div className="space-y-2.5">
          <GroupLabel label={t("closedPositions")} />
          {soldAssets.length > 0 ? (
            soldAssets.map((a, i) => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: EASE, delay: i * 0.05 }}
              >
                <AssetCard asset={a} t={t} />
              </motion.div>
            ))
          ) : (
            <EmptyLine text={t("noSold")} />
          )}
        </div>
      )}

      <Suspense fallback={null}>
        {showAddVehicle && (
          <AddVehicleModal isOpen={showAddVehicle} onClose={() => setShowAddVehicle(false)} onSuccess={handleAdded} />
        )}
        {showAddProperty && (
          <AddPropertyModal isOpen={showAddProperty} onClose={() => setShowAddProperty(false)} onSuccess={handleAdded} />
        )}
      </Suspense>
    </div>
  );
}

function AddMenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors"
      style={{ color: "var(--ink)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ color: "var(--accent)" }}>{icon}</span>
      {label}
    </button>
  );
}

function StatTile({
  swatch,
  label,
  value,
  negative,
}: {
  swatch: string;
  label: string;
  value: number;
  negative?: boolean;
}) {
  return (
    <div
      className="flex-1 rounded-[18px] px-3.5 py-[13px]"
      style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--ink-muted)" }}>
        <span className="h-2 w-2 rounded-[2px]" style={{ background: swatch }} />
        {label}
      </div>
      <div
        className="mt-1 text-[16px] font-bold tabular-nums"
        style={{ color: negative ? "var(--negative)" : "var(--ink)" }}
      >
        {negative ? "−" : ""}
        {formatCurrency(Math.abs(value), "EUR")}
      </div>
    </div>
  );
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
      className="relative px-3 py-2 text-[13px] font-semibold transition-colors"
      style={{ color: active ? "var(--ink)" : "var(--ink-subtle)" }}
    >
      {children}
      {active && (
        <motion.div
          layoutId="networth-tab-underline"
          className="absolute -bottom-px left-0 right-0 h-0.5"
          style={{ background: "var(--accent)" }}
        />
      )}
    </button>
  );
}

function GroupLabel({ label }: { label: string }) {
  return (
    <div
      className="text-[11.5px] font-semibold uppercase"
      style={{ color: "var(--ink-subtle)", letterSpacing: "0.06em" }}
    >
      {label}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className="text-[13px]" style={{ color: "var(--ink-muted)" }}>
      {text}
    </p>
  );
}

function assetSubtitle(a: RealAsset, t: ReturnType<typeof useTranslations>): string {
  const kind = a.type === "PROPERTY" ? t("kindProperty") : t("kindVehicle");
  let qualifier: string;
  if (a.currentValueEur == null) qualifier = t("valuationPurchase");
  else if (a.currentValueSource === "manual") qualifier = t("valuationManual");
  else if (a.type === "PROPERTY") qualifier = t("valuationIndex");
  else qualifier = t("valuationMarket");
  return `${kind} · ${qualifier}`;
}

function AssetCard({ asset, t }: { asset: RealAsset; t: ReturnType<typeof useTranslations> }) {
  const sold = asset.status === "SOLD";
  const value = sold
    ? asset.salePriceEur ?? asset.currentValueEur ?? asset.purchasePriceEur
    : asset.currentValueEur ?? asset.purchasePriceEur;
  const delta = value - asset.purchasePriceEur;
  const href =
    asset.type === "PROPERTY"
      ? `/dashboard/networth/property/${asset.id}`
      : `/dashboard/networth/vehicle/${asset.id}`;
  const AssetIcon = asset.type === "PROPERTY" ? Home : Car;

  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 rounded-[20px] p-3.5 transition-transform active:scale-[0.99]"
      style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[14px]">
        {asset.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.imageUrl} alt={asset.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center" style={{ background: STRIPES }}>
            <AssetIcon className="h-5 w-5" style={{ color: "var(--accent)" }} strokeWidth={1.8} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold" style={{ color: "var(--ink)" }}>
          {asset.name}
        </div>
        <div className="truncate text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>
          {assetSubtitle(asset, t)}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[14px] font-bold tabular-nums" style={{ color: "var(--ink)" }}>
          {formatCurrency(value, "EUR")}
        </div>
        {!sold && delta !== 0 && (
          <div
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: delta >= 0 ? "var(--positive)" : "var(--negative)" }}
          >
            {delta >= 0 ? "▲ " : "▼ "}
            {formatCurrency(Math.abs(delta), "EUR")}
          </div>
        )}
      </div>
    </Link>
  );
}

function LiabilityRow({
  liability,
  t,
  divider,
}: {
  liability: Liability;
  t: ReturnType<typeof useTranslations>;
  divider: boolean;
}) {
  const Icon =
    liability.realAsset?.type === "PROPERTY"
      ? Building2
      : liability.type === "VEHICLE_LOAN"
        ? Car
        : CreditCard;
  const meta: string[] = [];
  if (liability.realAsset) meta.push(t("linkedToAsset", { name: liability.realAsset.name }));
  if (liability.monthlyPayment != null)
    meta.push(`${formatCurrency(liability.monthlyPayment, liability.currency)}${t("monthlySuffix")}`);

  return (
    <div
      className="flex items-center gap-3 py-[11px]"
      style={divider ? { borderBottom: "1px solid var(--line)" } : undefined}
    >
      <div
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px]"
        style={{ background: "var(--app-bg)" }}
      >
        <Icon className="h-4 w-4" style={{ color: "var(--ink-muted)" }} strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold" style={{ color: "var(--ink)" }}>
          {liability.name}
        </div>
        {meta.length > 0 && (
          <div className="truncate text-[11.5px] tabular-nums" style={{ color: "var(--ink-subtle)" }}>
            {meta.join(" · ")}
          </div>
        )}
      </div>
      <div className="text-[13.5px] font-semibold tabular-nums" style={{ color: "var(--negative)" }}>
        −{formatCurrency(liability.currentBalanceEur, "EUR")}
      </div>
    </div>
  );
}
