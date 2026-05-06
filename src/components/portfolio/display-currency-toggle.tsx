"use client";

import { motion } from "framer-motion";
import { usePortfolioCurrency, DisplayCurrency } from "./portfolio-currency-context";

const OPTIONS: DisplayCurrency[] = ["EUR", "USD"];

export default function DisplayCurrencyToggle() {
  const { displayCurrency, setDisplayCurrency } = usePortfolioCurrency();

  return (
    <div
      role="radiogroup"
      aria-label="Display currency"
      className="relative inline-flex items-center bg-slate-100 rounded-lg p-0.5 text-xs font-medium tabular-nums"
    >
      {OPTIONS.map((option) => {
        const isActive = displayCurrency === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => setDisplayCurrency(option)}
            className={[
              "relative px-3 py-1 rounded-md transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0070f3]/40",
              isActive
                ? "text-slate-900"
                : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            {isActive && (
              <motion.span
                layoutId="display-currency-toggle-pill"
                className="absolute inset-0 bg-white rounded-md shadow-sm"
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
                aria-hidden="true"
              />
            )}
            <span className="relative z-10">
              {option === "EUR" ? "€ EUR" : "$ USD"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
