"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";

type OnboardingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  existingData?: {
    monthlySalary?: number | null;
    monthlyBudget?: number | null;
    defaultCurrency?: string;
  };
};

const CURRENCIES = [
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "PLN", symbol: "zł", name: "Polish Zloty" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "MAD", symbol: "د.م.", name: "Moroccan Dirham" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "MXN", symbol: "MX$", name: "Mexican Peso" },
  { code: "TRY", symbol: "₺", name: "Turkish Lira" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona" },
  { code: "KRW", symbol: "₩", name: "South Korean Won" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan" },
];

const SALARY_PRESETS = [1500, 2000, 2500, 3000];
const BUDGET_PRESETS = [1000, 1500, 2000, 2500];

/* Horizontal scrolling currency chip row */
function CurrencyChips({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: string;
  onSelect: (code: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.06em] text-[var(--ink-subtle)]">
        {label}
      </p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CURRENCIES.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => onSelect(c.code)}
            className={`flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-[20px] px-3.5 text-[12px] font-semibold transition-colors duration-200 ${
              selected === c.code
                ? "bg-[var(--surface-2)] text-[var(--accent)]"
                : "bg-[var(--surface)] text-[var(--ink-muted)] shadow-[var(--shadow-card)]"
            }`}
          >
            <span>{c.symbol}</span>
            <span className="text-[10.5px] font-medium opacity-70">{c.code}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* Giant centered amount card (accent border, 36px tabular value) */
function AmountCard({
  symbol,
  value,
  onChange,
  placeholder,
  caption,
}: {
  symbol: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  caption: string;
}) {
  const shown = value || "";
  const widthCh = Math.min(Math.max(shown.length || placeholder.length, 1) + 0.5, 12);

  return (
    <label className="block cursor-text rounded-[18px] border-[1.5px] border-[var(--accent)] bg-[var(--surface)] px-5 py-5 text-center shadow-[var(--shadow-card)]">
      <span className="flex items-baseline justify-center">
        <span className="mr-1 text-[24px] font-bold text-[var(--ink-subtle)]">
          {symbol}
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.,-]/g, ""))}
          placeholder={placeholder}
          className="max-w-full bg-transparent text-center text-[36px] font-bold tracking-[-0.02em] tabular-nums text-[var(--ink)] outline-none placeholder:text-[var(--ink-subtle)]"
          style={{ width: `${widthCh}ch` }}
        />
      </span>
      <span className="mt-1 block text-[12px] text-[var(--ink-subtle)]">
        {caption}
      </span>
    </label>
  );
}

/* Preset amount chips */
function PresetChips({
  presets,
  symbol,
  value,
  onSelect,
}: {
  presets: number[];
  symbol: string;
  value: string;
  onSelect: (v: number) => void;
}) {
  const current = parseFloat((value || "").replace(",", "."));
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {presets.map((p) => {
        const selected = current === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onSelect(p)}
            className={`min-h-[40px] rounded-[20px] px-3.5 text-[12px] font-semibold tabular-nums transition-colors duration-200 ${
              selected
                ? "bg-[var(--surface-2)] text-[var(--accent)]"
                : "bg-[var(--surface)] text-[var(--ink-muted)] shadow-[var(--shadow-card)]"
            }`}
          >
            {symbol}
            {p.toLocaleString()}
          </button>
        );
      })}
    </div>
  );
}

export default function OnboardingModal({
  isOpen,
  onClose,
  existingData,
}: OnboardingModalProps) {
  const router = useRouter();
  const t = useTranslations("onboarding");
  const tCommon = useTranslations("common");

  const [step, setStep] = useState(1);
  const [currency, setCurrency] = useState(
    existingData?.defaultCurrency || "EUR"
  );
  const [budgetCurrency, setBudgetCurrency] = useState(
    existingData?.defaultCurrency || "EUR"
  );
  const [expensesCurrency, setExpensesCurrency] = useState(
    existingData?.defaultCurrency || "EUR"
  );
  const [monthlySalary, setMonthlySalary] = useState(
    existingData?.monthlySalary?.toString() || ""
  );
  const [monthlyBudget, setMonthlyBudget] = useState(
    existingData?.monthlyBudget?.toString() || ""
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const getCurrencySymbol = (code: string) => {
    return CURRENCIES.find((c) => c.code === code)?.symbol || "€";
  };

  // Fixed expenses step
  const [fixedExpenses, setFixedExpenses] = useState<
    Array<{ name: string; amount: string }>
  >([{ name: "", amount: "" }]);

  const handleAddFixedExpense = () => {
    setFixedExpenses([...fixedExpenses, { name: "", amount: "" }]);
  };

  const handleRemoveFixedExpense = (index: number) => {
    setFixedExpenses(fixedExpenses.filter((_, i) => i !== index));
  };

  const handleFixedExpenseChange = (
    index: number,
    field: "name" | "amount",
    value: string
  ) => {
    const updated = [...fixedExpenses];
    updated[index][field] = value;
    setFixedExpenses(updated);
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError("");

    try {
      // Save workspace settings
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency,
          budgetCurrency,
          expensesCurrency,
          monthlySalary: monthlySalary
            ? parseFloat(monthlySalary.replace(",", "."))
            : null,
          monthlyBudget: monthlyBudget
            ? parseFloat(monthlyBudget.replace(",", "."))
            : null,
          fixedExpenses: fixedExpenses
            .filter((e) => e.name.trim() && e.amount.trim())
            .map((e) => ({
              name: e.name.trim(),
              amount: parseFloat(e.amount.replace(",", ".")),
            })),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save");
      }

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = async () => {
    setIsLoading(true);
    try {
      // Mark onboarding as complete without saving data
      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipOnboarding: true }),
      });
      router.refresh();
      onClose();
    } catch {
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleNext = () => {
    // Cascade currencies: Step 1 → Step 2 → Step 3
    if (step === 1) {
      setBudgetCurrency(currency);
    } else if (step === 2) {
      setExpensesCurrency(budgetCurrency);
    }
    setStep(step + 1);
  };

  if (!isOpen) return null;

  const stepTitles: Record<number, { title: string; helper: string }> = {
    1: { title: t("salaryTitle"), helper: t("salaryDescription") },
    2: { title: t("budgetTitle"), helper: t("budgetDescription") },
    3: { title: t("fixedExpensesTitle"), helper: t("fixedExpensesDescription") },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: "rgba(23, 22, 31, 0.45)" }}
      />

      {/* Modal */}
      <div className="relative flex max-h-[92dvh] w-full max-w-md flex-col overflow-y-auto rounded-[24px] bg-[var(--app-bg)] p-6 text-[var(--ink)] shadow-[var(--shadow-pop)]">
        {/* 3-bar stepper */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]"
            >
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-[400ms]"
                style={{
                  width: s <= step ? "100%" : "0%",
                  transitionTimingFunction: "var(--ease)",
                }}
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] font-medium text-[var(--ink-subtle)]">
          {t("step", { current: step, total: 3 })}
        </p>

        {/* Step content */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 flex flex-col gap-5"
          >
            {step === 1 && (
              <p className="text-[11.5px] font-semibold uppercase tracking-[.06em] text-[var(--accent)]">
                {t("welcome")}
              </p>
            )}

            <div>
              <h2 className="max-w-[22ch] text-[24px] font-bold leading-[1.2] tracking-[-0.02em]">
                {stepTitles[step].title}
              </h2>
              <p className="mt-2 text-[13px] leading-normal text-[var(--ink-muted)]">
                {stepTitles[step].helper}
              </p>
            </div>

            {step === 1 && (
              <>
                <CurrencyChips
                  label={t("selectCurrency")}
                  selected={currency}
                  onSelect={setCurrency}
                />
                <AmountCard
                  symbol={getCurrencySymbol(currency)}
                  value={monthlySalary}
                  onChange={setMonthlySalary}
                  placeholder="2,000"
                  caption={t("perMonth")}
                />
                <PresetChips
                  presets={SALARY_PRESETS}
                  symbol={getCurrencySymbol(currency)}
                  value={monthlySalary}
                  onSelect={(v) => setMonthlySalary(String(v))}
                />
                <p className="text-center text-[11px] leading-normal text-[var(--ink-subtle)]">
                  {t("salaryHint")}
                </p>
              </>
            )}

            {step === 2 && (
              <>
                <CurrencyChips
                  label={t("selectCurrency")}
                  selected={budgetCurrency}
                  onSelect={setBudgetCurrency}
                />
                <AmountCard
                  symbol={getCurrencySymbol(budgetCurrency)}
                  value={monthlyBudget}
                  onChange={setMonthlyBudget}
                  placeholder={monthlySalary || "1,500"}
                  caption={t("perMonth")}
                />
                <PresetChips
                  presets={BUDGET_PRESETS}
                  symbol={getCurrencySymbol(budgetCurrency)}
                  value={monthlyBudget}
                  onSelect={(v) => setMonthlyBudget(String(v))}
                />
                {monthlySalary && !monthlyBudget && (
                  <button
                    type="button"
                    onClick={() => setMonthlyBudget(monthlySalary)}
                    className="mx-auto py-1 text-[12px] font-semibold text-[var(--accent)]"
                  >
                    {t("useSalaryAsBudget")}
                  </button>
                )}
                <p className="text-center text-[11px] leading-normal text-[var(--ink-subtle)]">
                  {t("budgetHint")}
                </p>
              </>
            )}

            {step === 3 && (
              <>
                <CurrencyChips
                  label={t("selectCurrency")}
                  selected={expensesCurrency}
                  onSelect={setExpensesCurrency}
                />

                <div className="flex max-h-[240px] flex-col gap-2.5 overflow-y-auto">
                  {fixedExpenses.map((expense, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 rounded-[14px] border-[1.5px] border-transparent bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-card)] transition-colors duration-200 focus-within:border-[var(--accent)]"
                    >
                      <input
                        type="text"
                        value={expense.name}
                        onChange={(e) =>
                          handleFixedExpenseChange(index, "name", e.target.value)
                        }
                        placeholder={t("expenseNamePlaceholder")}
                        className="min-w-0 flex-1 bg-transparent text-[14px] font-medium text-[var(--ink)] outline-none placeholder:text-[var(--ink-subtle)]"
                      />
                      <div className="flex shrink-0 items-baseline gap-1">
                        <span className="text-[12px] font-semibold text-[var(--ink-subtle)]">
                          {getCurrencySymbol(expensesCurrency)}
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={expense.amount}
                          onChange={(e) => {
                            const value = e.target.value.replace(
                              /[^0-9.,-]/g,
                              ""
                            );
                            handleFixedExpenseChange(index, "amount", value);
                          }}
                          placeholder="0.00"
                          className="w-16 bg-transparent text-right text-[14px] font-semibold tabular-nums text-[var(--ink)] outline-none placeholder:text-[var(--ink-subtle)]"
                        />
                      </div>
                      {fixedExpenses.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveFixedExpense(index)}
                          className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--ink-subtle)] transition-colors hover:text-[var(--negative)]"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.8}
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleAddFixedExpense}
                  className="flex items-center gap-1.5 py-1 text-[13px] font-semibold text-[var(--accent)]"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  {t("addAnother")}
                </button>

                <p className="text-[11px] leading-normal text-[var(--ink-subtle)]">
                  {t("fixedExpensesHint")}
                </p>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Error */}
        {error && (
          <div
            className="mt-4 rounded-[14px] px-4 py-3 text-[13px] font-medium"
            style={{
              background: "color-mix(in srgb, var(--negative) 10%, transparent)",
              color: "var(--negative)",
            }}
          >
            {error}
          </div>
        )}

        {/* Footer: CTA + back/skip */}
        <div className="mt-6 flex flex-col gap-2.5">
          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              className="w-full rounded-[18px] bg-[var(--accent)] py-[15px] text-center text-[15px] font-semibold text-[var(--accent-fg)] shadow-[var(--shadow-fab)] transition-transform duration-200 active:scale-[.98]"
            >
              {tCommon("next")}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading}
              className="w-full rounded-[18px] bg-[var(--accent)] py-[15px] text-center text-[15px] font-semibold text-[var(--accent-fg)] shadow-[var(--shadow-fab)] transition-transform duration-200 active:scale-[.98] disabled:cursor-not-allowed disabled:bg-[var(--accent-faint)] disabled:shadow-none"
            >
              {isLoading ? t("saving") : t("getStarted")}
            </button>
          )}

          <div className="flex items-center justify-center gap-6">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                disabled={isLoading}
                className="py-2.5 text-[13px] font-medium text-[var(--ink-subtle)] transition-colors hover:text-[var(--ink-muted)]"
              >
                {tCommon("back")}
              </button>
            )}
            <button
              type="button"
              onClick={handleSkip}
              disabled={isLoading}
              className="py-2.5 text-[13px] font-medium text-[var(--ink-subtle)] transition-colors hover:text-[var(--ink-muted)]"
            >
              {t("skipForNow")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
