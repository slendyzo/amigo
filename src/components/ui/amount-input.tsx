"use client";

import { useState, useRef, useEffect } from "react";
import { getCurrencySymbol } from "@/lib/currencies";
import { evaluateExpression } from "@/lib/utils";

type AmountInputProps = {
  value: string;
  onChange: (value: string) => void;
  onExpressionChange?: (expression: string | null) => void;
  currency: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  inputClassName?: string;
  hideCurrencySymbol?: boolean;
};

/**
 * Reusable amount input component with currency symbol prefix.
 * Handles decimal input with comma/dot support.
 * Supports simple math expressions (e.g., "50+30" or "120*2").
 *
 * Uses internal state while focused to prevent parent re-renders
 * from clobbering the expression mid-typing.
 */
export function AmountInput({
  value,
  onChange,
  onExpressionChange,
  currency,
  placeholder = "0.00",
  required = false,
  className = "",
  inputClassName = "",
  hideCurrencySymbol = false,
}: AmountInputProps) {
  const [showCalculated, setShowCalculated] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const isFocusedRef = useRef(false);

  // Sync local value from prop only when NOT focused
  useEffect(() => {
    if (!isFocusedRef.current) {
      setLocalValue(value);
    }
  }, [value]);

  const displayValue = isFocused ? localValue : value;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow digits, comma, dot, minus (for refunds), and math operators (+, *, /)
    const sanitized = e.target.value.replace(/[^0-9.,+\-*/\s]/g, "");
    setLocalValue(sanitized);
    onChange(sanitized);
    setShowCalculated(false);
  };

  const handleFocus = () => {
    setIsFocused(true);
    isFocusedRef.current = true;
    setLocalValue(value);
  };

  const handleBlur = () => {
    setIsFocused(false);
    isFocusedRef.current = false;

    // Try to evaluate the expression on blur
    const result = evaluateExpression(localValue);
    if (result !== null) {
      // Store the original expression before replacing with result
      onExpressionChange?.(localValue);
      onChange(result.toString());
      setShowCalculated(true);
    } else {
      // Plain number — no expression to store
      onExpressionChange?.(null);
    }
  };

  // Check if current value looks like a math expression (not a plain negative number)
  const isExpression =
    /[+*/]/.test(displayValue) || /\d-\d/.test(displayValue);

  // Show a live preview of the result while typing an expression
  const previewResult = isExpression ? evaluateExpression(displayValue) : null;

  return (
    <div className={`relative ${className}`}>
      {!hideCurrencySymbol && (
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ink-subtle)]">
          {getCurrencySymbol(currency)}
        </span>
      )}
      <input
        type="text"
        inputMode="text"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        className={`w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] ${hideCurrencySymbol ? "pl-0" : "pl-10"} pr-4 py-3 text-[var(--ink)] placeholder-[var(--ink-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent ${inputClassName}`}
      />
      {isExpression && !showCalculated && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-subtle)]">
          = {previewResult !== null ? previewResult : "?"}
        </span>
      )}
    </div>
  );
}
