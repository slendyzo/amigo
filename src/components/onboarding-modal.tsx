"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type OnboardingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  existingData?: {
    monthlySalary?: number | null;
    monthlyBudget?: number | null;
  };
};

export default function OnboardingModal({
  isOpen,
  onClose,
  existingData,
}: OnboardingModalProps) {
  const router = useRouter();
  const t = useTranslations("onboarding");
  const tCommon = useTranslations("common");

  const [step, setStep] = useState(1);
  const [monthlySalary, setMonthlySalary] = useState(
    existingData?.monthlySalary?.toString() || ""
  );
  const [monthlyBudget, setMonthlyBudget] = useState(
    existingData?.monthlyBudget?.toString() || ""
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-500 to-blue-600">
          <h2 className="text-xl font-bold text-white">{t("welcome")}</h2>
          <p className="text-blue-100 text-sm mt-1">{t("welcomeSubtitle")}</p>
        </div>

        {/* Progress indicator */}
        <div className="px-6 pt-4">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`flex-1 h-1.5 rounded-full transition-colors ${
                  s <= step ? "bg-blue-500" : "bg-slate-200"
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {t("step", { current: step, total: 3 })}
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">
              {error}
            </div>
          )}

          {step === 1 && (
            /* Step 1: Monthly Salary */
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  {t("salaryTitle")}
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                  {t("salaryDescription")}
                </p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                    €
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={monthlySalary}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9.,-]/g, "");
                      setMonthlySalary(value);
                    }}
                    placeholder="2000.00"
                    className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-4 text-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  {t("salaryHint")}
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            /* Step 2: Monthly Budget */
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  {t("budgetTitle")}
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                  {t("budgetDescription")}
                </p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                    €
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={monthlyBudget}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9.,-]/g, "");
                      setMonthlyBudget(value);
                    }}
                    placeholder={monthlySalary || "1500.00"}
                    className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-4 text-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                {monthlySalary && !monthlyBudget && (
                  <button
                    type="button"
                    onClick={() => setMonthlyBudget(monthlySalary)}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                  >
                    {t("useSalaryAsBudget")}
                  </button>
                )}
                <p className="text-xs text-slate-400 mt-2">
                  {t("budgetHint")}
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            /* Step 3: Fixed Expenses */
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  {t("fixedExpensesTitle")}
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                  {t("fixedExpensesDescription")}
                </p>

                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {fixedExpenses.map((expense, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={expense.name}
                        onChange={(e) =>
                          handleFixedExpenseChange(index, "name", e.target.value)
                        }
                        placeholder={t("expenseNamePlaceholder")}
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="relative w-28">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                          €
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
                          className="w-full rounded-lg border border-slate-300 bg-white pl-7 pr-2 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      {fixedExpenses.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveFixedExpense(index)}
                          className="p-2 text-slate-400 hover:text-red-500"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
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
                  className="mt-3 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  {t("addAnother")}
                </button>

                <p className="text-xs text-slate-400 mt-4">
                  {t("fixedExpensesHint")}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={handleSkip}
            disabled={isLoading}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            {t("skipForNow")}
          </button>

          <div className="flex gap-3">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                disabled={isLoading}
                className="px-4 py-2 text-slate-600 hover:text-slate-900"
              >
                {tCommon("back")}
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {tCommon("next")}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isLoading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isLoading ? t("saving") : t("getStarted")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
