"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { Home, ChevronLeft, ChevronRight, X, Loader2, Check, AlertCircle } from "lucide-react";
import { CURRENCIES, getCurrencySymbol } from "@/lib/currencies";
import { detectSuspiciousAmount, formatEuro } from "@/lib/parse-amount";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

const PROPERTY_TYPES = ["APARTMENT", "HOUSE", "LAND", "COMMERCIAL", "OTHER"] as const;
const ENERGY_RATINGS = [
  "A_PLUS",
  "A",
  "B",
  "B_MINUS",
  "C",
  "D",
  "E",
  "F",
] as const;

type PropertyType = (typeof PROPERTY_TYPES)[number];
type EnergyRating = (typeof ENERGY_RATINGS)[number];

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

type AddPropertyModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export default function AddPropertyModal({ isOpen, onClose, onSuccess }: AddPropertyModalProps) {
  const router = useRouter();
  const t = useTranslations("rwa");
  const tCommon = useTranslations("common");
  const currentYear = new Date().getUTCFullYear();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — location + type
  const [propertyType, setPropertyType] = useState<PropertyType>("APARTMENT");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [concelho, setConcelho] = useState("");
  const [freguesia, setFreguesia] = useState("");
  const [yearBuilt, setYearBuilt] = useState<string>("");

  // Step 2 — physical + purchase
  const [livableAreaM2, setLivableAreaM2] = useState<string>("");
  const [bedrooms, setBedrooms] = useState<string>("");
  const [bathrooms, setBathrooms] = useState<string>("");
  const [energyRating, setEnergyRating] = useState<EnergyRating | "">("");
  const [purchaseDate, setPurchaseDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [purchasePrice, setPurchasePrice] = useState<string>("");
  const [purchaseCurrency, setPurchaseCurrency] = useState<string>("EUR");

  // Step 3 — financing (optional)
  const [financed, setFinanced] = useState(false);
  const [monthlyPayment, setMonthlyPayment] = useState<string>("");
  const [termMonths, setTermMonths] = useState<string>("");
  const [interestRate, setInterestRate] = useState<string>("");
  const [loanStart, setLoanStart] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Did-you-mean state for the price field — catches the 115.000 → 115 trap.
  const [priceConfirmed, setPriceConfirmed] = useState<number | null>(null);
  const priceCheck = useMemo(() => detectSuspiciousAmount(purchasePrice), [purchasePrice]);

  // Post-add prompts (mirror AddVehicleModal scaffolding from AMIGO-164/165)
  const [phase, setPhase] = useState<"form" | "templates" | "matching">("form");
  const [matchAssetId, setMatchAssetId] = useState<string | null>(null);
  const [matchCandidates, setMatchCandidates] = useState<ExpenseCandidate[]>([]);
  const [matchSelected, setMatchSelected] = useState<Set<string>>(new Set());
  const [matchSubmitting, setMatchSubmitting] = useState(false);

  const [liabilityId, setLiabilityId] = useState<string | null>(null);
  const [templateCandidates, setTemplateCandidates] = useState<TemplateCandidate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateSubmitting, setTemplateSubmitting] = useState(false);

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
      setPropertyType("APARTMENT");
      setAddress("");
      setPostalCode("");
      setConcelho("");
      setFreguesia("");
      setYearBuilt("");
      setLivableAreaM2("");
      setBedrooms("");
      setBathrooms("");
      setEnergyRating("");
      setPurchaseDate(new Date().toISOString().slice(0, 10));
      setPurchasePrice("");
      setPurchaseCurrency("EUR");
      setFinanced(false);
      setMonthlyPayment("");
      setTermMonths("");
      setInterestRate("");
      setLoanStart(new Date().toISOString().slice(0, 10));
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
      setPriceConfirmed(null);
    }
  }, [isOpen]);

  // If the user retypes the price after accepting a confirmation, drop the
  // confirmation so a new check runs.
  useEffect(() => {
    setPriceConfirmed(null);
  }, [purchasePrice]);

  const step1Ok = !!concelho.trim() && !!propertyType;
  const priceBlocked = priceCheck.suspicious && priceConfirmed !== priceCheck.suggestion;
  const step2Ok =
    step1Ok &&
    Number.isFinite(priceCheck.parsed) &&
    priceCheck.parsed > 0 &&
    !!purchaseDate &&
    !priceBlocked;
  const step3Ok =
    !financed || (parseFloat(monthlyPayment) > 0 && !!loanStart);

  const buildName = () => {
    const parts = [propertyType.charAt(0) + propertyType.slice(1).toLowerCase().replace("_", "+")];
    if (concelho.trim()) parts.push(concelho.trim());
    return parts.join(" — ");
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const finalPrice = priceConfirmed ?? priceCheck.parsed;
      const assetRes = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "PROPERTY",
          name: buildName(),
          purchasePrice: finalPrice,
          purchaseCurrency,
          purchaseDate,
          property: {
            propertyType,
            address: address.trim() || null,
            postalCode: postalCode.trim() || null,
            concelho: concelho.trim() || null,
            freguesia: freguesia.trim() || null,
            country: "PT",
            yearBuilt: yearBuilt ? parseInt(yearBuilt, 10) : null,
            livableAreaM2: livableAreaM2 ? parseInt(livableAreaM2, 10) : null,
            bedrooms: bedrooms ? parseInt(bedrooms, 10) : null,
            bathrooms: bathrooms ? parseInt(bathrooms, 10) : null,
            energyRating: energyRating || null,
          },
        }),
      });
      if (!assetRes.ok) {
        const err = await assetRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create property");
      }
      const { asset } = await assetRes.json();

      let autoLink: AutoLinkResult = { mode: "none" };
      let createdLiabilityId: string | null = null;
      if (financed && parseFloat(monthlyPayment) > 0) {
        const loanRes = await fetch("/api/liabilities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "MORTGAGE",
            name: `${buildName()} mortgage`.trim(),
            currency: purchaseCurrency,
            principal: parseFloat(purchasePrice),
            monthlyPayment: parseFloat(monthlyPayment),
            interestRate: interestRate ? parseFloat(interestRate) : null,
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
          console.warn("[add-property] loan creation failed");
        }
      }

      setMatchAssetId(asset.id);

      if (autoLink.mode === "candidates" && createdLiabilityId) {
        setLiabilityId(createdLiabilityId);
        setTemplateCandidates(autoLink.candidates);
        setSelectedTemplateId(autoLink.candidates[0]?.id ?? null);
        setPhase("templates");
        setSubmitting(false);
        return;
      }

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
      console.warn("[add-property] match-expenses check failed:", e);
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
        console.warn("[add-property] template link failed:", e);
      } finally {
        setTemplateSubmitting(false);
      }
    }
    if (matchAssetId) await advanceToMatchingOrClose(matchAssetId);
    else {
      onSuccess?.();
      router.refresh();
      onClose();
    }
  };

  const finishMatching = async (link: boolean) => {
    if (!matchAssetId || !link || matchSelected.size === 0) {
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
      console.warn("[add-property] retroactive link failed:", e);
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
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10">
              <Home className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">
                {phase === "templates"
                  ? t("templateHeader")
                  : phase === "matching"
                    ? t("matchHeader")
                    : t("addProperty")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {phase === "templates" || phase === "matching"
                  ? buildName()
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

        {phase === "form" && (
          <div className="px-5 pt-3">
            <StepDots step={step} />
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
                            checked ? "border-primary bg-primary" : "border-border bg-background",
                          )}
                          aria-hidden
                        >
                          {checked && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
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
                {t("matchSubheader", { count: matchCandidates.length, name: buildName() })}
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
                {step === 1 && (
                  <>
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
                        placeholder="Rua dos Anjos 12"
                        className={inputClass}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("concelho")}>
                        <input
                          type="text"
                          value={concelho}
                          onChange={(e) => setConcelho(e.target.value)}
                          placeholder="Lisboa"
                          autoFocus
                          className={inputClass}
                        />
                      </Field>
                      <Field label={t("freguesia")}>
                        <input
                          type="text"
                          value={freguesia}
                          onChange={(e) => setFreguesia(e.target.value)}
                          placeholder="Misericórdia"
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("postalCode")}>
                        <input
                          type="text"
                          value={postalCode}
                          onChange={(e) => setPostalCode(e.target.value)}
                          placeholder="1200-195"
                          className={inputClass}
                        />
                      </Field>
                      <Field label={t("yearBuilt")}>
                        <input
                          type="number"
                          min={1700}
                          max={currentYear + 1}
                          value={yearBuilt}
                          onChange={(e) => setYearBuilt(e.target.value)}
                          placeholder="1985"
                          className={inputClass}
                        />
                      </Field>
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("livableAreaM2")}>
                        <input
                          type="number"
                          min={0}
                          value={livableAreaM2}
                          onChange={(e) => setLivableAreaM2(e.target.value)}
                          placeholder="85"
                          className={inputClass}
                        />
                      </Field>
                      <Field label={t("energyRatingLabel")}>
                        <select
                          value={energyRating}
                          onChange={(e) => setEnergyRating(e.target.value as EnergyRating)}
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
                          placeholder="2"
                          className={inputClass}
                        />
                      </Field>
                      <Field label={t("bathrooms")}>
                        <input
                          type="number"
                          min={0}
                          value={bathrooms}
                          onChange={(e) => setBathrooms(e.target.value)}
                          placeholder="1"
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
                            placeholder="250000"
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
                        className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-500/15 transition-colors"
                      >
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{t("didYouMean", { amount: formatEuro(priceCheck.suggestion) })}</span>
                      </button>
                    )}
                  </>
                )}

                {step === 3 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setFinanced(!financed)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors",
                        financed
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:bg-muted/40",
                      )}
                    >
                      <div className="text-left">
                        <p className="font-medium">{t("financedToggle")}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("financedToggleDescription")}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full border",
                          financed
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background",
                        )}
                      >
                        {financed && <Check className="h-3 w-3" />}
                      </span>
                    </button>

                    {financed && (
                      <div className="space-y-3">
                        <Field label={t("monthlyPayment")}>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={monthlyPayment}
                            onChange={(e) => setMonthlyPayment(e.target.value)}
                            placeholder="850"
                            className={inputClass}
                          />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label={t("termMonths")}>
                            <input
                              type="number"
                              min={1}
                              value={termMonths}
                              onChange={(e) => setTermMonths(e.target.value)}
                              placeholder="360"
                              className={inputClass}
                            />
                          </Field>
                          <Field label={t("interestRate")}>
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              value={interestRate}
                              onChange={(e) => setInterestRate(e.target.value)}
                              placeholder="3.5"
                              className={inputClass}
                            />
                          </Field>
                        </div>
                        <Field label={t("loanStart")}>
                          <input
                            type="date"
                            value={loanStart}
                            onChange={(e) => setLoanStart(e.target.value)}
                            className={inputClass}
                          />
                        </Field>
                      </div>
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
                {submitting ? t("saving") : t("addProperty")}
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
            i <= step ? "bg-primary" : "bg-muted",
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

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
