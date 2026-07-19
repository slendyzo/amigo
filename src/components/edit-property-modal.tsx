"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Home, Loader2, X, AlertCircle } from "lucide-react";
import { CURRENCIES, getCurrencySymbol } from "@/lib/currencies";
import { detectSuspiciousAmount, formatEuro } from "@/lib/parse-amount";
import { buildStaticMap } from "@/lib/static-map";
import { StaticMapView } from "@/components/ui/static-map-view";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

const PROPERTY_TYPES = ["APARTMENT", "HOUSE", "LAND", "COMMERCIAL", "OTHER"] as const;
const ENERGY_RATINGS = ["A_PLUS", "A", "B", "B_MINUS", "C", "D", "E", "F"] as const;

type PropertyType = (typeof PROPERTY_TYPES)[number];
type EnergyRating = (typeof ENERGY_RATINGS)[number];

export type EditPropertyModalAsset = {
  id: string;
  name: string;
  notes: string | null;
  purchasePrice: number;
  purchasePriceEur: number;
  purchaseCurrency: string;
  purchaseDate: string; // ISO date
};

export type EditPropertyModalProperty = {
  propertyType: PropertyType;
  address: string | null;
  postalCode: string | null;
  concelho: string | null;
  freguesia: string | null;
  country: string;
  livableAreaM2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  yearBuilt: number | null;
  energyRating: EnergyRating | null;
  latitude: number | null;
  longitude: number | null;
};

type Props = {
  asset: EditPropertyModalAsset;
  property: EditPropertyModalProperty;
  onClose: () => void;
  onSaved: () => void;
};

export default function EditPropertyModal({ asset, property, onClose, onSaved }: Props) {
  const t = useTranslations("rwa");
  const tCommon = useTranslations("common");
  const currentYear = new Date().getUTCFullYear();

  // Form state — pre-filled from props.
  const [propertyType, setPropertyType] = useState<PropertyType>(property.propertyType);
  const [address, setAddress] = useState(property.address ?? "");
  const [postalCode, setPostalCode] = useState(property.postalCode ?? "");
  const [concelho, setConcelho] = useState(property.concelho ?? "");
  const [freguesia, setFreguesia] = useState(property.freguesia ?? "");
  const [yearBuilt, setYearBuilt] = useState<string>(
    property.yearBuilt != null ? String(property.yearBuilt) : "",
  );
  const [livableAreaM2, setLivableAreaM2] = useState<string>(
    property.livableAreaM2 != null ? String(property.livableAreaM2) : "",
  );
  const [bedrooms, setBedrooms] = useState<string>(
    property.bedrooms != null ? String(property.bedrooms) : "",
  );
  const [bathrooms, setBathrooms] = useState<string>(
    property.bathrooms != null ? String(property.bathrooms) : "",
  );
  const [energyRating, setEnergyRating] = useState<EnergyRating | "">(
    property.energyRating ?? "",
  );

  const [purchasePrice, setPurchasePrice] = useState<string>(String(asset.purchasePrice));
  const [purchaseCurrency, setPurchaseCurrency] = useState<string>(asset.purchaseCurrency);
  const [purchaseDate, setPurchaseDate] = useState<string>(asset.purchaseDate.slice(0, 10));
  const [name, setName] = useState(asset.name);
  const [notes, setNotes] = useState(asset.notes ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  // Did-you-mean state for the price field (handles the 115.000 → 115 bug).
  const [priceConfirmed, setPriceConfirmed] = useState<number | null>(null);
  const priceCheck = useMemo(() => detectSuspiciousAmount(purchasePrice), [purchasePrice]);

  // Lock scroll while modal open.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // If the user edits the postal code, clear any prior geocode error so the
  // next save attempt isn't shown the stale message.
  useEffect(() => {
    setGeocodeError(null);
  }, [postalCode]);

  // If the user retypes the price after accepting a confirmation, drop the
  // confirmation so a new check runs.
  useEffect(() => {
    setPriceConfirmed(null);
  }, [purchasePrice]);

  const map =
    property.latitude != null && property.longitude != null
      ? buildStaticMap({ lat: property.latitude, lon: property.longitude })
      : null;

  const submit = async () => {
    setError(null);
    setGeocodeError(null);

    // Did-you-mean gate. If suspicious and the user hasn't accepted the
    // suggestion (by clicking the confirmation pill), block submit.
    if (priceCheck.suspicious && priceConfirmed !== priceCheck.suggestion) {
      return;
    }
    const finalPrice = priceConfirmed ?? priceCheck.parsed;
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
      setError(t("invalidPrice"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || asset.name,
          notes: notes.trim(),
          purchasePrice: finalPrice,
          purchaseCurrency,
          purchaseDate,
          property: {
            propertyType,
            address: address.trim(),
            postalCode: postalCode.trim(),
            concelho: concelho.trim(),
            freguesia: freguesia.trim(),
            country: property.country,
            yearBuilt: yearBuilt ? parseInt(yearBuilt, 10) : null,
            livableAreaM2: livableAreaM2 ? parseInt(livableAreaM2, 10) : null,
            bedrooms: bedrooms ? parseInt(bedrooms, 10) : null,
            bathrooms: bathrooms ? parseInt(bathrooms, 10) : null,
            energyRating: energyRating || null,
          },
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || t("editSaveFailed"));
      }
      const json = (await res.json()) as { geocodeError?: string };
      if (json.geocodeError) {
        // Save succeeded but the postal code couldn't be located — keep the
        // modal open so the user can fix or clear the postal code.
        setGeocodeError(json.geocodeError);
        setSubmitting(false);
        return;
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("genericError"));
      setSubmitting(false);
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
        transition={{ duration: 0.25 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={submitting ? undefined : onClose}
      />
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-card shadow-2xl md:max-h-[88vh] max-w-md md:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-border/50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10">
              <Home className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">{t("editProperty")}</h2>
              <p className="truncate text-xs text-muted-foreground">{asset.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-6">
            {/* Location */}
            <Section title={t("editSectionLocation")}>
              <Field label={t("propertyType")}>
                <select
                  value={propertyType}
                  onChange={(e) => setPropertyType(e.target.value as PropertyType)}
                  className={inputClass}
                >
                  {PROPERTY_TYPES.map((p) => (
                    <option key={p} value={p}>
                      {t(`propertyTypeOption.${p}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("address")}>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("concelho")}>
                  <input
                    type="text"
                    value={concelho}
                    onChange={(e) => setConcelho(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label={t("freguesia")}>
                  <input
                    type="text"
                    value={freguesia}
                    onChange={(e) => setFreguesia(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("postalCode")} error={geocodeError ? t("postalCodeNotFound") : null}>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className={cn(
                      inputClass,
                      geocodeError && "border-rose-500/60 focus:border-rose-500",
                    )}
                  />
                </Field>
                <Field label={t("yearBuilt")}>
                  <input
                    type="number"
                    min={1700}
                    max={currentYear + 1}
                    value={yearBuilt}
                    onChange={(e) => setYearBuilt(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
            </Section>

            {/* Physical */}
            <Section title={t("editSectionPhysical")}>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("livableAreaM2")}>
                  <input
                    type="number"
                    min={0}
                    value={livableAreaM2}
                    onChange={(e) => setLivableAreaM2(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label={t("energyRatingLabel")}>
                  <select
                    value={energyRating}
                    onChange={(e) => setEnergyRating(e.target.value as EnergyRating | "")}
                    className={inputClass}
                  >
                    <option value="">—</option>
                    {ENERGY_RATINGS.map((r) => (
                      <option key={r} value={r}>
                        {r === "A_PLUS" ? "A+" : r === "B_MINUS" ? "B-" : r}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("bedrooms")}>
                  <input
                    type="number"
                    min={0}
                    value={bedrooms}
                    onChange={(e) => setBedrooms(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label={t("bathrooms")}>
                  <input
                    type="number"
                    min={0}
                    value={bathrooms}
                    onChange={(e) => setBathrooms(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
            </Section>

            {/* Purchase */}
            <Section title={t("editSectionPurchase")}>
              <Field label={t("editName")}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label={t("purchaseDate")}>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <div className="grid grid-cols-[1fr_120px] gap-3">
                <Field label={t("purchasePrice")}>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      {getCurrencySymbol(purchaseCurrency)}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      className={cn(inputClass, "pl-8")}
                    />
                  </div>
                </Field>
                <Field label={t("currency")}>
                  <select
                    value={purchaseCurrency}
                    onChange={(e) => setPurchaseCurrency(e.target.value)}
                    className={inputClass}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {priceCheck.suspicious && priceConfirmed !== priceCheck.suggestion && (
                <button
                  type="button"
                  onClick={() => {
                    setPurchasePrice(String(priceCheck.suggestion));
                    setPriceConfirmed(priceCheck.suggestion);
                  }}
                  className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-2 text-left text-xs text-[var(--warning)]  hover:bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] transition-colors"
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {t("didYouMean", { amount: formatEuro(priceCheck.suggestion) })}
                  </span>
                </button>
              )}
              <Field label={t("editNotes")}>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={cn(inputClass, "resize-none py-2")}
                />
              </Field>
            </Section>

            {/* Media (read-only map preview) */}
            <Section title={t("editSectionMedia")}>
              <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/40">
                {map ? (
                  <div className="relative aspect-[16/9] w-full">
                    <StaticMapView map={map} />
                  </div>
                ) : (
                  <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-violet-500/10 to-violet-500/5">
                    <Home className="h-10 w-10 text-violet-500/50" strokeWidth={1.5} />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t("mapPreviewCaption")}</p>
            </Section>

            {error && (
              <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border/50 bg-card px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {tCommon("cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || (priceCheck.suspicious && priceConfirmed !== priceCheck.suggestion)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? t("saving") : t("editSave")}
          </button>
        </footer>
      </motion.div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-[0.8px] text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string | null;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-rose-500">{error}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
