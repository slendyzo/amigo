"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { Car, Sparkles, ChevronLeft, ChevronRight, X, Loader2, Check } from "lucide-react";
import { CURRENCIES, getCurrencySymbol } from "@/lib/currencies";
import { cn } from "@/lib/utils";
import { CascadingVehiclePicker } from "@/components/cascading-vehicle-picker";

const EASE = [0.16, 1, 0.3, 1] as const;

const FUEL_OPTIONS = ["PETROL", "DIESEL", "HYBRID", "EV", "OTHER"] as const;
const CAR_BODY_OPTIONS = [
  "SEDAN",
  "HATCHBACK",
  "SUV",
  "WAGON",
  "COUPE",
  "CONVERTIBLE",
  "TRUCK",
  "OTHER",
] as const;
const MOTO_BODY_OPTIONS = [
  "NAKED",
  "SPORT",
  "CRUISER",
  "TOURING",
  "ADVENTURE",
  "SCOOTER",
  "OFF_ROAD",
  "OTHER",
] as const;
// Bicycle "body type" stores the discipline.
const BIKE_BODY_OPTIONS = ["ROAD", "GRAVEL", "MTB", "HYBRID", "E_BIKE", "OTHER"] as const;

type VehicleClass = "CAR" | "MOTORCYCLE" | "BICYCLE";
type FuelType = (typeof FUEL_OPTIONS)[number];
type BodyType =
  | (typeof CAR_BODY_OPTIONS)[number]
  | (typeof MOTO_BODY_OPTIONS)[number]
  | (typeof BIKE_BODY_OPTIONS)[number];

type SpecResult = {
  originalMsrpEur: number | null;
  fuelType: FuelType | null;
  bodyType: BodyType | null;
  generation: string | null;
  imageHint: string | null;
};

type ImageResult = { url: string; source: string; pageTitle: string } | null;

type ExpenseCandidate = {
  id: string;
  name: string;
  amountEur: number;
  date: string;
  matchScore: number;
  matchReasons: string[];
};

type TemplateCandidate = {
  id: string;
  name: string;
  amount: number | null;
  matchScore: number;
};

type AutoLinkResult =
  | { mode: "none" }
  | { mode: "linked"; templateId: string }
  | { mode: "candidates"; candidates: TemplateCandidate[] };

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
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [vehicleClass, setVehicleClass] = useState<VehicleClass | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Post-add: template-candidate prompt (AMIGO-165) then retroactive expense
  // match (AMIGO-164). Phases run in order: form → templates? → matching? → close.
  const [phase, setPhase] = useState<"form" | "templates" | "matching">("form");
  const [matchAssetId, setMatchAssetId] = useState<string | null>(null);
  const [matchCandidates, setMatchCandidates] = useState<ExpenseCandidate[]>([]);
  const [matchSelected, setMatchSelected] = useState<Set<string>>(new Set());
  const [matchSubmitting, setMatchSubmitting] = useState(false);

  const [liabilityId, setLiabilityId] = useState<string | null>(null);
  const [templateCandidates, setTemplateCandidates] = useState<TemplateCandidate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateSubmitting, setTemplateSubmitting] = useState(false);

  // Step 1 — cascading dropdown picker (Year → Make → Model → Trim) for cars.
  // `pick` is the canonical car state; for motorcycles we use the freeText
  // state below since the taxonomy table is car-only.
  const [pick, setPick] = useState<{
    year?: number;
    make?: string;
    model?: string;
    trim?: string | null;
  }>({});
  // Step 1 — free-text fields for motorcycles (no taxonomy data to seed a
  // cascading picker, so user types brand + model + year directly).
  const [freeText, setFreeText] = useState<{ brand: string; model: string; year: string; trim: string }>({
    brand: "",
    model: "",
    year: "",
    trim: "",
  });
  const isMoto = vehicleClass === "MOTORCYCLE";
  const isBike = vehicleClass === "BICYCLE";
  const brand = isMoto ? freeText.brand.trim() : (pick.make ?? "");
  const model = isMoto ? freeText.model.trim() : (pick.model ?? "");
  const year = isMoto
    ? freeText.year
    : pick.year != null
      ? String(pick.year)
      : "";
  const trim = isMoto ? freeText.trim.trim() : (pick.trim ?? "");
  const yearAsNumber = isMoto ? parseInt(freeText.year, 10) : pick.year ?? NaN;
  const BODY_OPTIONS: readonly BodyType[] = isBike
    ? BIKE_BODY_OPTIONS
    : isMoto
      ? MOTO_BODY_OPTIONS
      : CAR_BODY_OPTIONS;
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
      setStep(0);
      setVehicleClass(null);
      setPick({});
      setFreeText({ brand: "", model: "", year: "", trim: "" });
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
      setPhase("form");
      setMatchAssetId(null);
      setMatchCandidates([]);
      setMatchSelected(new Set());
      setMatchSubmitting(false);
      setLiabilityId(null);
      setTemplateCandidates([]);
      setSelectedTemplateId(null);
      setTemplateSubmitting(false);
    }
  }, [isOpen, currentYear]);

  // Reset bodyType when class changes — moto bodies aren't valid for cars
  // and vice versa.
  useEffect(() => {
    setBodyType("");
    setSpec(null);
  }, [vehicleClass]);

  const yearNum = yearAsNumber;
  const canLookup = !!brand && !!model && Number.isFinite(yearNum);
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
        body: JSON.stringify({
        brand,
        model,
        year: yearNum,
        trim: trim || null,
        vehicleClass: vehicleClass ?? "CAR",
      }),
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
    if (!brand || !model) return;
    try {
      const res = await fetch("/api/vehicle/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, model, generation: generation || null }),
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
          name: `${brand} ${model}`.trim(),
          purchasePrice: parseFloat(purchasePrice),
          purchaseCurrency,
          purchaseDate,
          imageUrl: imageData?.url ?? null,
          vehicle: {
            vehicleClass: vehicleClass ?? "CAR",
            brand,
            model,
            year: yearNum,
            trim: trim || null,
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

      let autoLink: AutoLinkResult = { mode: "none" };
      let createdLiabilityId: string | null = null;
      if (financed && parseFloat(monthlyPayment) > 0) {
        const loanRes = await fetch("/api/liabilities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: isBike ? "INSTALLMENT" : "VEHICLE_LOAN",
            name: isBike ? `${brand} ${model} installments`.trim() : `${brand} ${model} loan`.trim(),
            currency: purchaseCurrency,
            principal: parseFloat(purchasePrice),
            monthlyPayment: parseFloat(monthlyPayment),
            interestRate: interestRate ? parseFloat(interestRate) : isBike ? 0 : null,
            termMonths: termMonths ? parseInt(termMonths, 10) : null,
            startDate: loanStart,
            realAssetId: asset.id,
          }),
        });
        if (loanRes.ok) {
          const loanJson = (await loanRes.json()) as {
            liability?: { id: string };
            autoLink?: AutoLinkResult;
          };
          createdLiabilityId = loanJson.liability?.id ?? null;
          if (loanJson.autoLink) autoLink = loanJson.autoLink;
        } else {
          const err = await loanRes.json().catch(() => ({}));
          console.warn("[add-vehicle] loan creation failed:", err);
        }
      }

      setMatchAssetId(asset.id);

      // Phase 1: template candidates (only when smart-detect found existing
      // templates that look like a match — backend already created nothing).
      if (autoLink.mode === "candidates" && createdLiabilityId) {
        setLiabilityId(createdLiabilityId);
        setTemplateCandidates(autoLink.candidates);
        setSelectedTemplateId(autoLink.candidates[0]?.id ?? null);
        setPhase("templates");
        setSubmitting(false);
        return;
      }

      // Phase 2: retroactive expense matches.
      await advanceToMatchingOrClose(asset.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const advanceToMatchingOrClose = async (assetId: string) => {
    try {
      const matchRes = await fetch(`/api/assets/${assetId}/match-expenses`);
      if (matchRes.ok) {
        const { candidates } = (await matchRes.json()) as { candidates?: ExpenseCandidate[] };
        if (candidates && candidates.length > 0) {
          setMatchCandidates(candidates);
          setMatchSelected(new Set(candidates.map((c) => c.id)));
          setPhase("matching");
          return;
        }
      }
    } catch (e) {
      console.warn("[add-vehicle] match-expenses check failed:", e);
    }
    onSuccess?.();
    router.refresh();
    onClose();
  };

  const finishTemplates = async (link: boolean) => {
    if (link && liabilityId && selectedTemplateId) {
      setTemplateSubmitting(true);
      try {
        await fetch(`/api/liabilities/${liabilityId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recurringTemplateId: selectedTemplateId }),
        });
      } catch (e) {
        console.warn("[add-vehicle] template link failed:", e);
      } finally {
        setTemplateSubmitting(false);
      }
    }
    if (matchAssetId) {
      await advanceToMatchingOrClose(matchAssetId);
    } else {
      onSuccess?.();
      router.refresh();
      onClose();
    }
  };

  const finishMatching = async (link: boolean) => {
    if (!matchAssetId) {
      onSuccess?.();
      router.refresh();
      onClose();
      return;
    }
    if (!link || matchSelected.size === 0) {
      onSuccess?.();
      router.refresh();
      onClose();
      return;
    }
    setMatchSubmitting(true);
    try {
      await fetch(`/api/assets/${matchAssetId}/match-expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenseIds: [...matchSelected] }),
      });
    } catch (e) {
      console.warn("[add-vehicle] retroactive link failed:", e);
    } finally {
      setMatchSubmitting(false);
      onSuccess?.();
      router.refresh();
      onClose();
    }
  };

  const toggleMatch = (id: string) => {
    setMatchSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
              {isMoto ? (
                <span className="text-lg leading-none" aria-hidden>🏍️</span>
              ) : isBike ? (
                <span className="text-lg leading-none" aria-hidden>🚲</span>
              ) : (
                <Car className="h-5 w-5 text-primary" />
              )}
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">
                {phase === "templates"
                  ? t("templateHeader")
                  : phase === "matching"
                    ? t("matchHeader")
                    : isMoto
                      ? t("addMotorcycle")
                      : isBike
                        ? t("addBicycle")
                        : t("addVehicle")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {phase === "templates" || phase === "matching"
                  ? `${brand} ${model}`
                  : step === 0
                    ? t("vehicleClassChoiceTitle")
                    : t("stepCountOf", { current: step, total: 3 })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting || matchSubmitting || templateSubmitting}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {phase === "form" && step > 0 && (
          <div className="px-5 pt-3">
            <StepDots step={step as 1 | 2 | 3} />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {phase === "templates" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("templateSubheader", { count: templateCandidates.length })}
              </p>
              <ul className="divide-y divide-border/40 rounded-2xl border border-border/60 bg-card/80">
                {templateCandidates.map((c) => {
                  const checked = selectedTemplateId === c.id;
                  return (
                    <li
                      key={c.id}
                      onClick={() => setSelectedTemplateId(c.id)}
                      className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                            checked
                              ? "border-primary bg-primary"
                              : "border-border bg-background",
                          )}
                          aria-hidden
                        >
                          {checked && (
                            <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                          )}
                        </span>
                        <p className="truncate font-medium">{c.name}</p>
                      </div>
                      {c.amount != null && (
                        <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {c.amount.toLocaleString(undefined, {
                            style: "currency",
                            currency: purchaseCurrency,
                            maximumFractionDigits: 0,
                          })}
                          {t("monthlySuffix")}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : phase === "matching" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("matchSubheader", {
                  count: matchCandidates.length,
                  name: `${brand} ${model}`.trim(),
                })}
              </p>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setMatchSelected(new Set(matchCandidates.map((c) => c.id)))}
                  className="text-primary hover:underline"
                >
                  {t("matchSelectAll")}
                </button>
                <button
                  type="button"
                  onClick={() => setMatchSelected(new Set())}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {t("matchClear")}
                </button>
              </div>
              <ul className="divide-y divide-border/40 rounded-2xl border border-border/60 bg-card/80">
                {matchCandidates.map((c) => {
                  const checked = matchSelected.has(c.id);
                  return (
                    <li
                      key={c.id}
                      onClick={() => toggleMatch(c.id)}
                      className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background",
                          )}
                          aria-hidden
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(c.date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <p className="shrink-0 tabular-nums">
                        {c.amountEur.toLocaleString(undefined, {
                          style: "currency",
                          currency: "EUR",
                          maximumFractionDigits: 0,
                        })}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="space-y-4"
            >
              {step === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{t("vehicleClassChoiceTitle")}</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => {
                        setVehicleClass("CAR");
                        setStep(1);
                      }}
                      className="flex flex-col items-start gap-2 rounded-2xl border border-border/60 bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Car className="h-5 w-5" />
                      </span>
                      <span className="font-semibold leading-tight">{t("vehicleClassCar")}</span>
                      <span className="text-xs text-muted-foreground">{t("vehicleClassCarDescription")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setVehicleClass("MOTORCYCLE");
                        setStep(1);
                      }}
                      className="flex flex-col items-start gap-2 rounded-2xl border border-border/60 bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-2xl leading-none" aria-hidden>
                        🏍️
                      </span>
                      <span className="font-semibold leading-tight">{t("vehicleClassMotorcycle")}</span>
                      <span className="text-xs text-muted-foreground">{t("vehicleClassMotorcycleDescription")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setVehicleClass("BICYCLE");
                        setStep(1);
                      }}
                      className="flex flex-col items-start gap-2 rounded-2xl border border-border/60 bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-2xl leading-none" aria-hidden>
                        🚲
                      </span>
                      <span className="font-semibold leading-tight">{t("vehicleClassBicycle")}</span>
                      <span className="text-xs text-muted-foreground">{t("vehicleClassBicycleDescription")}</span>
                    </button>
                  </div>
                </div>
              )}

              {step === 1 && (
                <>
                  {isMoto ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("brand")}>
                        <input
                          type="text"
                          value={freeText.brand}
                          onChange={(e) => setFreeText((f) => ({ ...f, brand: e.target.value }))}
                          placeholder="Yamaha"
                          className={inputClass}
                        />
                      </Field>
                      <Field label={t("model")}>
                        <input
                          type="text"
                          value={freeText.model}
                          onChange={(e) => setFreeText((f) => ({ ...f, model: e.target.value }))}
                          placeholder="MT-07"
                          className={inputClass}
                        />
                      </Field>
                      <Field label={t("year")}>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1900}
                          max={currentYear + 1}
                          value={freeText.year}
                          onChange={(e) => setFreeText((f) => ({ ...f, year: e.target.value }))}
                          placeholder={String(currentYear)}
                          className={inputClass}
                        />
                      </Field>
                      <Field label={t("trim")}>
                        <input
                          type="text"
                          value={freeText.trim}
                          onChange={(e) => setFreeText((f) => ({ ...f, trim: e.target.value }))}
                          placeholder="ABS, World GP…"
                          className={inputClass}
                        />
                      </Field>
                    </div>
                  ) : (
                    <CascadingVehiclePicker
                      value={pick}
                      onChange={setPick}
                      vehicleClass={vehicleClass ?? "CAR"}
                      copy={{
                        year: t("year"),
                        make: t("brand"),
                        model: t("model"),
                        trim: isBike ? t("build") : t("trim"),
                      }}
                    />
                  )}

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
                      {!isBike && spec.fuelType && (
                        <ChipRow label={t("fuelType")}>{t(`fuelTypeOption.${spec.fuelType}`)}</ChipRow>
                      )}
                      {spec.bodyType && (
                        <ChipRow label={isBike ? t("discipline") : t("bodyType")}>{t(`bodyTypeOption.${spec.bodyType}`)}</ChipRow>
                      )}
                      {!isBike && spec.generation && (
                        <ChipRow label={t("generation")}>{spec.generation}</ChipRow>
                      )}
                      {spec.originalMsrpEur && (
                        <ChipRow label={isBike ? t("originalRetail") : t("originalMsrp")}>
                          €{spec.originalMsrpEur.toLocaleString()}
                        </ChipRow>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        {t("aiSuggestedHint")}
                      </p>
                    </div>
                  )}

                  <details className="rounded-xl border border-border/40 px-3 py-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">{t("moreDetails")}</summary>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      {!isBike && (
                        <Field label={t("fuelType")}>
                          <select
                            value={fuelType}
                            onChange={(e) => setFuelType(e.target.value as FuelType)}
                            className={inputClass}
                          >
                            <option value="">—</option>
                            {FUEL_OPTIONS.map((f) => (
                              <option key={f} value={f}>
                                {t(`fuelTypeOption.${f}`)}
                              </option>
                            ))}
                          </select>
                        </Field>
                      )}
                      <Field label={isBike ? t("discipline") : t("bodyType")}>
                        <select
                          value={bodyType}
                          onChange={(e) => setBodyType(e.target.value as BodyType)}
                          className={inputClass}
                        >
                          <option value="">—</option>
                          {BODY_OPTIONS.map((b) => (
                            <option key={b} value={b}>
                              {t(`bodyTypeOption.${b}`)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {!isBike && (
                        <Field label={t("generation")}>
                          <input
                            type="text"
                            value={generation}
                            onChange={(e) => setGeneration(e.target.value)}
                            placeholder="ND, F30…"
                            className={inputClass}
                          />
                        </Field>
                      )}
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

                  {!isBike && (
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
                  )}

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
          )}

          {error && phase === "form" && (
            <p className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p>
          )}
        </div>

        {phase === "templates" ? (
          <footer className="flex items-center justify-between gap-3 border-t border-border/50 bg-card px-5 py-3">
            <button
              type="button"
              onClick={() => finishTemplates(false)}
              disabled={templateSubmitting}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {t("matchSkip")}
            </button>
            <button
              type="button"
              onClick={() => finishTemplates(true)}
              disabled={templateSubmitting || !selectedTemplateId}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
            >
              {templateSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {templateSubmitting ? t("matchLinking") : t("templateLink")}
            </button>
          </footer>
        ) : phase === "matching" ? (
          <footer className="flex items-center justify-between gap-3 border-t border-border/50 bg-card px-5 py-3">
            <button
              type="button"
              onClick={() => finishMatching(false)}
              disabled={matchSubmitting}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {t("matchSkip")}
            </button>
            <button
              type="button"
              onClick={() => finishMatching(true)}
              disabled={matchSubmitting || matchSelected.size === 0}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
            >
              {matchSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {matchSubmitting
                ? t("matchLinking")
                : t("matchLink", { count: matchSelected.size })}
            </button>
          </footer>
        ) : (
          <footer className="flex items-center justify-between gap-3 border-t border-border/50 bg-card px-5 py-3">
            <button
              type="button"
              onClick={() => {
                if (step === 0) {
                  onClose();
                } else if (step === 1) {
                  // Back from step 1 returns to the class picker so the user
                  // can change their mind without losing the rest of the form.
                  setStep(0);
                } else {
                  setStep((s) => (s === 3 ? 2 : 1));
                }
              }}
              disabled={submitting}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {step === 0 ? tCommon("cancel") : (
                <>
                  <ChevronLeft className="h-4 w-4" /> {t("back")}
                </>
              )}
            </button>
            {step === 0 ? null : step < 3 ? (
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
                {submitting ? t("saving") : isMoto ? t("addMotorcycle") : isBike ? t("addBicycle") : t("addVehicle")}
              </button>
            )}
          </footer>
        )}
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
