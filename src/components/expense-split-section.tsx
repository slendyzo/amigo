"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/currencies";
import {
  type SplitPerson,
  initializeSplit,
  recalculateSplit,
} from "@/lib/split-utils";

// Isolated per-person amount input. Keeps a local string while focused so
// the parent's `toFixed(2)` re-render can't clobber what the user is typing.
// Commits on blur / Enter. This is the only input that knows about locks,
// so we always mark the row locked on edit.
type SplitAmountInputProps = {
  amount: number;
  locked: boolean;
  onCommit: (numValue: number) => void;
};

function SplitAmountInput({ amount, locked, onCommit }: SplitAmountInputProps) {
  const [localValue, setLocalValue] = useState(amount.toFixed(2));
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) setLocalValue(amount.toFixed(2));
  }, [amount]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value.replace(/[^0-9.,]/g, ""))}
      onFocus={(e) => {
        isFocused.current = true;
        setLocalValue(amount.toFixed(2));
        e.currentTarget.select();
      }}
      onBlur={() => {
        isFocused.current = false;
        const n = parseFloat(localValue.replace(",", "."));
        if (!isNaN(n)) onCommit(n);
        else setLocalValue(amount.toFixed(2));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className={`w-full rounded-md border px-2.5 py-1.5 text-xs text-right font-mono focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-transparent ${
        locked
          ? "border-indigo-400 bg-indigo-50/50"
          : "border-slate-300 bg-white"
      }`}
    />
  );
}

type ExpenseSplitSectionProps = {
  amount: number;
  currency: string;
  splitEnabled: boolean;
  onSplitEnabledChange: (enabled: boolean) => void;
  splitCount: number;
  onSplitCountChange: (count: number) => void;
  splitPeople: SplitPerson[] | null;
  onSplitPeopleChange: (people: SplitPerson[] | null) => void;
  hideToggle?: boolean;
};

export default function ExpenseSplitSection({
  amount,
  currency,
  splitEnabled,
  onSplitEnabledChange,
  splitCount,
  onSplitCountChange,
  splitPeople,
  onSplitPeopleChange,
  hideToggle = false,
}: ExpenseSplitSectionProps) {
  const t = useTranslations("modals.split");
  const meLabel = t("meLabel");
  const [showCustomize, setShowCustomize] = useState(false);
  const [error, setError] = useState("");

  // Recalculate when amount or count changes
  useEffect(() => {
    if (!splitEnabled || amount <= 0) return;

    if (splitPeople && splitPeople.some((p) => p.locked)) {
      // Recalculate keeping locked amounts
      const adjusted =
        splitPeople.length === splitCount
          ? recalculateSplit(amount, splitPeople)
          : null;
      if (adjusted) {
        setError("");
        onSplitPeopleChange(adjusted);
      } else if (splitPeople.length !== splitCount) {
        // Count changed — reinitialize
        onSplitPeopleChange(initializeSplit(amount, splitCount, meLabel));
        setError("");
      } else {
        setError(t("lockedExceedsTotal"));
      }
    } else {
      // No locked amounts — equal split
      onSplitPeopleChange(initializeSplit(amount, splitCount, meLabel));
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, splitCount, splitEnabled]);

  const handleToggle = (enabled: boolean) => {
    onSplitEnabledChange(enabled);
    if (enabled && amount > 0) {
      onSplitPeopleChange(initializeSplit(amount, splitCount, meLabel));
      setError("");
    } else if (!enabled) {
      onSplitPeopleChange(null);
      setShowCustomize(false);
      setError("");
    }
  };

  const handleCountChange = (newCount: number) => {
    if (newCount < 2) newCount = 2;
    if (newCount > 20) newCount = 20;
    onSplitCountChange(newCount);
  };

  const handleToggleLock = useCallback(
    (index: number) => {
      if (!splitPeople) return;
      const updated = splitPeople.map((p, i) =>
        i === index ? { ...p, locked: !p.locked } : { ...p }
      );
      const result = recalculateSplit(amount, updated);
      if (result) {
        onSplitPeopleChange(result);
        setError("");
      } else {
        setError(t("lockedExceedsTotal"));
      }
    },
    [splitPeople, amount, onSplitPeopleChange, t]
  );

  const handleAmountChange = useCallback(
    (index: number, value: string) => {
      if (!splitPeople) return;
      const numValue = parseFloat(value) || 0;
      const updated = splitPeople.map((p, i) =>
        i === index ? { ...p, amount: numValue, locked: true } : { ...p }
      );
      const result = recalculateSplit(amount, updated);
      if (result) {
        onSplitPeopleChange(result);
        setError("");
      } else {
        setError(t("lockedExceedsTotal"));
      }
    },
    [splitPeople, amount, onSplitPeopleChange, t]
  );

  const handleLabelChange = useCallback(
    (index: number, value: string) => {
      if (!splitPeople) return;
      const updated = splitPeople.map((p, i) =>
        i === index ? { ...p, label: value } : { ...p }
      );
      onSplitPeopleChange(updated);
    },
    [splitPeople, onSplitPeopleChange]
  );

  const perPerson = splitCount > 0 ? amount / splitCount : 0;
  // Treat the split as customized when any row is locked or any amount diverges
  // from the equal share — in that case the "X/per person" line is misleading.
  const isCustomized =
    !!splitPeople &&
    splitPeople.some(
      (p) => p.locked || Math.abs(p.amount - perPerson) > 0.01
    );

  if (amount <= 0) return null;

  const splitContent = splitEnabled ? (
    <div className="space-y-3">
      {/* People count stepper */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-indigo-700">
          {t("numberOfPeople")}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleCountChange(splitCount - 1)}
            disabled={splitCount <= 2}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-indigo-300 bg-white text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
          >
            −
          </button>
          <span className="w-8 text-center text-sm font-semibold text-indigo-800">
            {splitCount}
          </span>
          <button
            type="button"
            onClick={() => handleCountChange(splitCount + 1)}
            disabled={splitCount >= 20}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-indigo-300 bg-white text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
          >
            +
          </button>
        </div>
      </div>

      {/* Per-person summary — show equal-split hint only when the split is even. */}
      <div className="text-sm text-indigo-600 font-medium">
        {splitPeople && splitPeople[0] ? (
          <>
            {t("yourShare")}: {formatCurrency(splitPeople[0].amount, currency)}
            {!isCustomized && (
              <span className="text-indigo-400 ml-1">
                ({formatCurrency(perPerson, currency)}/{t("perPersonUnit")} × {splitCount})
              </span>
            )}
            {isCustomized && (
              <span className="text-indigo-400 ml-1">
                {t("ofTotal", { total: formatCurrency(amount, currency) })}
              </span>
            )}
          </>
        ) : (
          <>
            {formatCurrency(perPerson, currency)}/{t("perPersonUnit")}{" "}
            <span className="text-indigo-400">× {splitCount}</span>
          </>
        )}
      </div>

      {/* Customize toggle */}
      <button
        type="button"
        onClick={() => setShowCustomize(!showCustomize)}
        className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${
            showCustomize ? "rotate-90" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 5l7 7-7 7"
          />
        </svg>
        {showCustomize ? t("hideSplit") : t("customizeSplit")}
      </button>

      {/* Custom per-person breakdown */}
      {showCustomize && splitPeople && (
        <div className="space-y-2">
          {splitPeople.map((person, i) => (
            <div key={i} className="flex items-center gap-2">
              {/* Label */}
              {i === 0 ? (
                <div className="flex-1 min-w-0 rounded-md border border-indigo-400 bg-indigo-100 px-2.5 py-1.5 text-xs text-indigo-800 font-semibold flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="truncate">{person.label}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-indigo-500 font-bold flex-shrink-0">{t("youTag")}</span>
                </div>
              ) : (
                <input
                  type="text"
                  value={person.label}
                  onChange={(e) => handleLabelChange(i, e.target.value)}
                  className="flex-1 min-w-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 focus:border-transparent"
                />
              )}
              {/* Amount */}
              <div className="relative w-24">
                <SplitAmountInput
                  amount={person.amount}
                  locked={person.locked}
                  onCommit={(n) => handleAmountChange(i, n.toString())}
                />
              </div>
              {/* Lock toggle */}
              <button
                type="button"
                onClick={() => handleToggleLock(i)}
                className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
                  person.locked
                    ? "bg-indigo-100 text-indigo-600 hover:bg-indigo-200"
                    : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                }`}
                title={person.locked ? t("unlockAmount") : t("lockAmount")}
              >
                {person.locked ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 019.9-1" />
                  </svg>
                )}
              </button>
            </div>
          ))}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-500 font-medium">{error}</p>
          )}
        </div>
      )}
    </div>
  ) : null;

  // When hideToggle is true, render just the split content (parent handles the card wrapper)
  if (hideToggle) {
    return splitContent;
  }

  return (
    <div>
      {/* Toggle */}
      <div
        className={`p-3 rounded-lg border transition-colors ${
          splitEnabled
            ? "bg-indigo-50 border-indigo-200"
            : "bg-slate-50 border-slate-200"
        }`}
      >
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={splitEnabled}
            onChange={(e) => handleToggle(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <div className="flex-1">
            <span
              className={`text-sm font-medium ${
                splitEnabled ? "text-indigo-800" : "text-slate-700"
              }`}
            >
              {t("splitExpense")}
            </span>
            {!splitEnabled && (
              <p className="text-xs text-slate-500 mt-0.5">{t("splitHint")}</p>
            )}
          </div>
        </label>

        {splitEnabled && <div className="mt-3">{splitContent}</div>}
      </div>
    </div>
  );
}
