"use client";

import { useState } from "react";
import { getCurrencySymbol } from "@/lib/currencies";

type AmountInputProps = {
  value: string;
  onChange: (value: string) => void;
  currency: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  inputClassName?: string;
  hideCurrencySymbol?: boolean;
};

/**
 * Safely evaluate a simple math expression.
 * Supports: +, -, *, / with numbers (including decimals with comma or dot)
 * Returns null if the expression is invalid or not a math expression.
 */
function evaluateExpression(expr: string): number | null {
  if (!expr || expr.trim() === "") return null;

  // Normalize: replace commas with dots for decimal
  const normalized = expr.replace(/,/g, ".");

  // Check if it contains any math operators (not just a plain number)
  const hasMathOps = /[+\-*/]/.test(normalized.replace(/^-/, "")); // Ignore leading minus
  if (!hasMathOps) return null;

  // Only allow safe characters: digits, dots, and math operators
  if (!/^[\d.+\-*/\s]+$/.test(normalized)) return null;

  try {
    // Split into tokens and validate each
    const tokens = normalized.split(/([+\-*/])/).filter((t) => t.trim() !== "");
    let result = 0;
    let currentOp = "+";

    for (const token of tokens) {
      const trimmed = token.trim();
      if (["+", "-", "*", "/"].includes(trimmed)) {
        currentOp = trimmed;
      } else {
        const num = parseFloat(trimmed);
        if (isNaN(num)) return null;

        switch (currentOp) {
          case "+":
            result += num;
            break;
          case "-":
            result -= num;
            break;
          case "*":
            result *= num;
            break;
          case "/":
            if (num === 0) return null; // Avoid division by zero
            result /= num;
            break;
        }
      }
    }

    // Round to 2 decimal places to avoid floating point issues
    return Math.round(result * 100) / 100;
  } catch {
    return null;
  }
}

/**
 * Reusable amount input component with currency symbol prefix.
 * Handles decimal input with comma/dot support.
 * Supports simple math expressions (e.g., "50+30" or "120*2").
 */
export function AmountInput({
  value,
  onChange,
  currency,
  placeholder = "0.00",
  required = false,
  className = "",
  inputClassName = "",
  hideCurrencySymbol = false,
}: AmountInputProps) {
  const [showCalculated, setShowCalculated] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow digits, comma, dot, minus (for refunds), and math operators (+, *, /)
    const sanitized = e.target.value.replace(/[^0-9.,+\-*/\s]/g, "");
    onChange(sanitized);
    setShowCalculated(false);
  };

  const handleBlur = () => {
    // Try to evaluate the expression on blur
    const result = evaluateExpression(value);
    if (result !== null) {
      onChange(result.toString());
      setShowCalculated(true);
    }
  };

  // Check if current value looks like a math expression
  const isExpression = /[+*/]/.test(value) || /\d-\d/.test(value);

  return (
    <div className={`relative ${className}`}>
      {!hideCurrencySymbol && (
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
          {getCurrencySymbol(currency)}
        </span>
      )}
      <input
        type="text"
        inputMode="text"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        className={`w-full rounded-lg border border-slate-300 bg-white ${hideCurrencySymbol ? "pl-0" : "pl-10"} pr-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-transparent ${inputClassName}`}
      />
      {isExpression && !showCalculated && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
          = ?
        </span>
      )}
    </div>
  );
}
