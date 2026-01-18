"use client";

import { getCurrencySymbol } from "@/lib/currencies";

type AmountInputProps = {
  value: string;
  onChange: (value: string) => void;
  currency: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  inputClassName?: string;
};

/**
 * Reusable amount input component with currency symbol prefix.
 * Handles decimal input with comma/dot support.
 */
export function AmountInput({
  value,
  onChange,
  currency,
  placeholder = "0.00",
  required = false,
  className = "",
  inputClassName = "",
}: AmountInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow digits, comma, dot, and minus (for refunds)
    const sanitized = e.target.value.replace(/[^0-9.,-]/g, "");
    onChange(sanitized);
  };

  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
        {getCurrencySymbol(currency)}
      </span>
      <input
        type="text"
        inputMode="decimal"
        pattern="[0-9]*[.,]?[0-9]*"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        required={required}
        className={`w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-transparent ${inputClassName}`}
      />
    </div>
  );
}
