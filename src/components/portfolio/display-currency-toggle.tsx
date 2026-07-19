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
      className="relative inline-flex items-center rounded-[20px] p-0.5 text-[12px] font-semibold tabular-nums"
      style={{ background: "var(--surface-2)" }}
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
            className="relative rounded-[18px] px-3 py-1 transition-colors focus:outline-none"
            style={{ color: isActive ? "var(--accent-strong)" : "var(--ink-muted)" }}
          >
            {isActive && (
              <motion.span
                layoutId="display-currency-toggle-pill"
                className="absolute inset-0 rounded-[18px]"
                style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
                aria-hidden="true"
              />
            )}
            <span className="relative z-10">{option === "EUR" ? "€ EUR" : "$ USD"}</span>
          </button>
        );
      })}
    </div>
  );
}
