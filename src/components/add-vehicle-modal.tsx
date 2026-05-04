"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { Car, Sparkles, ChevronLeft, ChevronRight, X, Loader2, Check } from "lucide-react";
import { CURRENCIES, getCurrencySymbol } from "@/lib/currencies";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

const FUEL_OPTIONS = ["PETROL", "DIESEL", "HYBRID", "EV", "OTHER"] as const;
const BODY_OPTIONS = [
  "SEDAN",
  "HATCHBACK",
  "SUV",
  "WAGON",
  "COUPE",
  "CONVERTIBLE",
  "TRUCK",
  "OTHER",
] as const;

type FuelType = (typeof FUEL_OPTIONS)[number];
type BodyType = (typeof BODY_OPTIONS)[number];

type SpecResult = {
  originalMsrpEur: number | null;
  fuelType: FuelType | null;
  bodyType: BodyType | null;
  generation: string | null;
  imageHint: string | null;
};

type ImageResult = { url: string; source: string; pageTitle: string } | null;

type AddVehicleModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export default function AddVehicleModal({ isOpen, onClose, onSuccess }: AddVehicleModalProps) {
  const router = useRouter();
  const t = useTranslations("rwa");
  const tCommon = useTranslations("common");
  const currentYear = new Date().getUTCFullYear();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<string>(String(currentYear));
  const [trim, setTrim] = useState("");
  const [fuelType, setFuelType] = useState<FuelType | "">("");
  const [bodyType, setBodyType] = useState<BodyType | "">("");
  const [generation, setGeneration] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [spec, setSpec] = useState<SpecResult | null>(null);

  // Step 2
  const [mileage, setMileage] = useState<string>("");
  const [purchaseDate, setPurchaseDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [purchasePrice, setPurchasePrice] = useState<string>("");
  const [purchaseCurrency, setPurchaseCurrency] = useState<string>("EUR");
  const [plate, setPlate] = useState("");
  const [color, setColor] = useState("");
  const [imageData, setImageData] = useState<ImageResult>(null);

  // Step 3
  const [financed, setFinanced] = useState(false);
  const [monthlyPayment, setMonthlyPayment] = useState<string>("");
  const [termMonths, setTermMonths] = useState<string>("");
  const [interestRate, setInterestRate] = useState<string>("");
  const [loanStart, setLoanStart] = useState<string>(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setBrand("");
      setModel("");
      setYear(String(currentYear));
      setTrim("");
      setFuelType("");
      setBodyType("");
      setGeneration("");
      setSpec(null);
      setMileage("");
      setPurchasePrice("");
      setPurchaseCurrency("EUR");
      setPlate("");
      setColor("");
      setImageData(null);
      setFinanced(false);
      setMonthlyPayment("");
      setTermMonths("");
      setInterestRate("");
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen, currentYear]);

  const yearNum = useMemo(() => parseInt(year, 10), [year]);
  const canLookup = brand.trim() && model.trim() && Number.isFinite(yearNum);
  const step1Ok = canLookup;
  const step2Ok = step1Ok && parseFloat(purchasePrice) > 0 && purchaseDate;
  const step3Ok =
    !financed ||
    (parseFloat(monthlyPayment) > 0 && loanStart);

  const fetchSpec = async () => {
    if (!canLookup) return;
    setLookingUp(true);
    try {
      const res = await fetch("/api/vehicle/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brand.trim(), model: model.trim(), year: yearNum, trim: trim.trim() || null }),
      });
      const data = await res.json();
      const s: SpecResult | null = data.spec ?? null;
      setSpec(s);
      if (s) {
        if (s.fuelType && !fuelType) setFuelType(s.fuelType);
        if (s.bodyType && !bodyType) setBodyType(s.bodyType);
        if (s.generation && !generation) setGeneration(s.generation);
        if (s.originalMsrpEur && !purchasePrice) setPurchasePrice(String(s.originalMsrpEur));
      }
    } catch (e) {
      console.error("[add-vehicle] spec lookup failed:", e);
    } finally {
      setLookingUp(false);
    }
  };

  const fetchImage = async () => {
    if (!brand.trim() || !model.trim()) return;
    try {
      const res = await fetch("/api/vehicle/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brand.trim(), model: model.trim(), generation: generation || null }),
      });
      const data = await res.json();
      setImageData(data.image ?? null);
    } catch (e) {
      console.error("[add-vehicle] image lookup failed:", e);
    }
  };

  // Auto-fetch image when entering step 2
  useEffect(() => {
    if (step === 2 && !imageData && brand && model) {
      fetchImage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const assetRes = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "VEHICLE",
          name: `${brand.trim()} ${model.trim()}`.trim(),
          purchasePrice: parseFloat(purchasePrice),
          purchaseCurrency,
          purchaseDate,
          imageUrl: imageData?.url ?? null,
          vehicle: {
            brand: brand.trim(),
            model: model.trim(),
            year: yearNum,
            trim: trim.trim() || null,
            mileage: mileage ? parseInt(mileage, 10) : null,
            plate: plate.trim() || null,
            color: color.trim() || null,
            fuelType: fuelType || null,
            bodyType: bodyType || null,
            generation: generation.trim() || null,
          },
        }),
      });
      if (!assetRes.ok) {
        const err = await assetRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create vehicle");
      }
      const { asset } = await assetRes.json();

      if (financed && parseFloat(monthlyPayment) > 0) {
        const loanRes = await fetch("/api/liabilities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "VEHICLE_LOAN",
            name: `${brand.trim()} ${model.trim()} loan`.trim(),
            currency: purchaseCurrency,
            principal: parseFloat(purchasePrice),
            monthlyPayment: parseFloat(monthlyPayment),
            interestRate: interestRate ? parseFloat(interestRate) : null,
            termMonths: termMonths ? parseInt(termMonths, 10) : null,
            startDate: loanStart,
            realAssetId: asset.id,
          }),
        });
        if (!loanRes.ok) {
          const err = await loanRes.json().catch(() => ({}));
          console.warn("[add-vehicle] loan creation failed:", err);
        }
      }

      onSuccess?.();
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true">
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
        className="relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-card shadow-2xl md:max-h-[84vh] md:max-w-md md:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-border/50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Car className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">{t("addVehicle")}</h2>
              <p className="text-xs text-muted-foreground">
                {t("stepCountOf", { current: step, total: 3 })}
              </p>
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

        <div className="px-5 pt-3">
          <StepDots step={step} />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="space-y-4"
            >
              {step === 1 && (
                <>
                  <Field label={t("brand")}>
                    <input
                      autoFocus
                      type="text"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      placeholder="BMW"
                      className={inputClass}
                    />
                  </Field>
                  <Field label={t("model")}>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="M340i"
                      className={inputClass}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t("year")}>
                      <input
                        type="number"
                        min={1900}
                        max={currentYear + 1}
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        className={inputClass}
                      />
                    </Field>
                    <Field label={t("trim")}>
                      <input
                        type="text"
                        value={trim}
                        onChange={(e) => setTrim(e.target.value)}
                        placeholder="xDrive"
                        className={inputClass}
                      />
                    </Field>
                  </div>

                  <button
                    type="button"
                    disabled={!canLookup || lookingUp}
                    onClick={fetchSpec}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                  >
                    {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {lookingUp ? t("lookingUpSpecs") : spec ? t("refetchSpecs") : t("autoFillSpecs")}
                  </button>

                  {spec && (
                    <div className="space-y-3 rounded-xl border border-border/50 bg-muted/30 p-3">
                      {spec.fuelType && <ChipRow label="Fuel">{spec.fuelType}</ChipRow>}
                      {spec.bodyType && <ChipRow label="Body">{spec.bodyType}</ChipRow>}
                      {spec.generation && <ChipRow label="Generation">{spec.generation}</ChipRow>}
                      {spec.originalMsrpEur && (
                        <ChipRow label="Original MSRP">€{spec.originalMsrpEur.toLocaleString()}</ChipRow>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        Suggested by AI · you can override anything below.
                      </p>
                    </div>
                  )}

                  <details className="rounded-xl border border-border/40 px-3 py-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">{t("moreDetails")}</summary>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <Field label={t("fuelType")}>
                        <select
                          value={fuelType}
                          onChange={(e) => setFuelType(e.target.value as FuelType)}
                          className={inputClass}
                        >
                          <option value="">—</option>
                          {FUEL_OPTIONS.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t("bodyType")}>
                        <select
                          value={bodyType}
                          onChange={(e) => setBodyType(e.target.value as BodyType)}
                          className={inputClass}
                        >
                          <option value="">—</option>
                          {BODY_OPTIONS.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t("generation")}>
                        <input
                          type="text"
                          value={generation}
                          onChange={(e) => setGeneration(e.target.value)}
                          placeholder="ND, F30…"
                          className={inputClass}
                        />
                      </Field>
                      <Field label={t("color")}>
                        <input
                          type="text"
                          value={color}
                          onChange={(e) => setColor(e.target.value)}
                          className={inputClass}
                        />
                      </Field>
                    </div>
                  </details>
                </>
              )}

              {step === 2 && (
                <>
                  {imageData?.url ? (
                    <div className="overflow-hidden rounded-xl border border-border/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageData.url} alt="" className="aspect-[16/9] w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex aspect-[16/9] w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/20">
                      <Car className="h-10 w-10 text-muted-foreground/50" strokeWidth={1.5} />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t("mileageKm")}>
                      <input
                        type="number"
                        min={0}
                        value={mileage}
                        onChange={(e) => setMileage(e.target.value)}
                        placeholder="60000"
                        className={inputClass}
                      />
                    </Field>
                    <Field label={t("licensePlate")}>
                      <input
                        type="text"
                        value={plate}
                        onChange={(e) => setPlate(e.target.value.toUpperCase())}
                        placeholder="00-AA-00"
                        className={inputClass}
                      />
                    </Field>
                  </div>

                  <Field label={t("purchaseDate")}>
                    <input
                      type="date"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      className={inputClass}
                    />
                  </Field>

                  <div className="grid grid-cols-[1fr_5.5rem] gap-3">
                    <Field label={t("purchasePrice")}>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          {getCurrencySymbol(purchaseCurrency)}
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={purchasePrice}
                          onChange={(e) => setPurchasePrice(e.target.value)}
                          placeholder="35000"
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
                </>
              )}

              {step === 3 && (
                <>
                  <button
                    type="button"
                    onClick={() => setFinanced((v) => !v)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border p-4 text-left transition-colors",
                      financed
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/60 bg-card hover:bg-muted/40"
                    )}
                  >
                    <div>
                      <p className="font-medium text-sm">{t("isFinanced")}</p>
                      <p className="text-xs text-muted-foreground">{t("isFinancedDescription")}</p>
                    </div>
                    <div
                      className={cn(
                        "ml-3 h-5 w-5 shrink-0 rounded-full border-2 transition-colors",
                        financed ? "border-primary bg-primary" : "border-muted-foreground/40"
                      )}
                    >
                      {financed && <Check className="h-4 w-4 text-primary-foreground" strokeWidth={3} />}
                    </div>
                  </button>

                  {financed && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="space-y-3"
                    >
                      <Field label={t("monthlyPayment")}>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            {getCurrencySymbol(purchaseCurrency)}
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={monthlyPayment}
                            onChange={(e) => setMonthlyPayment(e.target.value)}
                            placeholder="350"
                            className={cn(inputClass, "pl-8")}
                          />
                        </div>
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label={t("termMonths")}>
                          <input
                            type="number"
                            min={1}
                            value={termMonths}
                            onChange={(e) => setTermMonths(e.target.value)}
                            placeholder="60"
                            className={inputClass}
                          />
                        </Field>
                        <Field label={t("interestRatePct")}>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={interestRate}
                            onChange={(e) => setInterestRate(e.target.value)}
                            placeholder="6.5"
                            className={inputClass}
                          />
                        </Field>
                      </div>
                      <Field label={t("loanStartDate")}>
                        <input
                          type="date"
                          value={loanStart}
                          onChange={(e) => setLoanStart(e.target.value)}
                          className={inputClass}
                        />
                      </Field>
                      <p className="text-[11px] text-muted-foreground">{t("fillingHelpText")}</p>
                    </motion.div>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>

          {error && (
            <p className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border/50 bg-card px-5 py-3">
          <button
            type="button"
            onClick={() => (step === 1 ? onClose() : setStep((s) => (s === 3 ? 2 : 1)))}
            disabled={submitting}
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {step === 1 ? tCommon("cancel") : (
              <>
                <ChevronLeft className="h-4 w-4" /> {t("back")}
              </>
            )}
          </button>
          {step < 3 ? (
            <button
              type="button"
              disabled={(step === 1 && !step1Ok) || (step === 2 && !step2Ok)}
              onClick={() => setStep((s) => (s === 1 ? 2 : 3))}
              className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
            >
              {t("next")} <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={!step3Ok || submitting}
              onClick={submit}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? t("saving") : t("addVehicle")}
            </button>
          )}
        </footer>
      </motion.div>
    </div>
  );
}

function StepDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={cn(
            "h-1 flex-1 rounded-full transition-colors",
            i <= step ? "bg-primary" : "bg-muted"
          )}
        />
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="rounded-md bg-card/80 px-2 py-0.5 text-xs font-medium">{children}</span>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
