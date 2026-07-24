"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoinResult {
  id: string;
  symbol: string;
  name: string;
  thumb: string | null;
  marketCapRank: number | null;
  priceUsd: number | null;
  priceEur: number | null;
}

interface AddHoldingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EASE = [0.16, 1, 0.3, 1] as const;

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Add a position no API reports — staked, locked or vesting tokens that have
 * left the wallet and so are invisible to a balance scan.
 *
 * Four fields on purpose. Unlock dates and APY were considered and cut: they
 * rot silently, and a stale projection is worse than none.
 */
export default function AddHoldingModal({ isOpen, onClose }: AddHoldingModalProps) {
  const router = useRouter();
  const t = useTranslations("portfolio");
  const tCommon = useTranslations("common");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CoinResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<CoinResult | null>(null);

  const [quantity, setQuantity] = useState("");
  const [label, setLabel] = useState("");
  const [isLocked, setIsLocked] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  // Reset whenever the sheet opens so a previous entry never bleeds through.
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setResults([]);
    setSelected(null);
    setQuantity("");
    setLabel("");
    setIsLocked(true);
    setError("");
  }, [isOpen]);

  // Debounced search. Once something is picked we stop searching — the user is
  // done with that field and re-querying would just flicker the list back open.
  useEffect(() => {
    if (selected) return;

    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/portfolio/coins/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal }
        );
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        // Aborted or offline — leave the previous results rather than blanking.
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected]);

  const qty = Number(quantity);
  const qtyValid = Number.isFinite(qty) && qty > 0;
  const labelValid = label.trim().length > 0;
  const canSave = Boolean(selected) && qtyValid && labelValid;

  const estimatedValue = useMemo(() => {
    if (!selected?.priceEur || !qtyValid) return null;
    return qty * selected.priceEur;
  }, [selected, qty, qtyValid]);

  // Say which field is blocking Save rather than just greying it out.
  const blockingReason = !selected
    ? t("holdingNeedsAsset")
    : !qtyValid
      ? t("holdingNeedsQuantity")
      : !labelValid
        ? t("holdingNeedsLabel")
        : null;

  const handleSave = async () => {
    if (!canSave || !selected) return;

    setIsSaving(true);
    setError("");

    try {
      const res = await fetch("/api/portfolio/manual-holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coingeckoId: selected.id,
          symbol: selected.symbol,
          name: selected.name,
          quantity: qty,
          label: label.trim(),
          isLocked,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t("holdingSaveFailed"));
        return;
      }

      router.refresh();
      onClose();
    } catch {
      setError(t("holdingSaveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const formatEur = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: n < 1 ? 4 : 2,
    }).format(n);

  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="sheet" size="md">
      <ModalHeader title={t("addHolding")} />

      <ModalBody>
        <div className="space-y-4 pt-1">
          {/* Asset picker */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--ink-muted)" }}>
              {t("holdingAsset")}
            </label>

            {selected ? (
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setQuery("");
                }}
                className="flex w-full items-center gap-3 rounded-[14px] border px-3 py-2.5 text-left transition"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "var(--accent)",
                  color: "var(--ink)",
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {selected.symbol} — {selected.name}
                  </div>
                  <div
                    className="truncate text-xs"
                    style={{ color: selected.priceEur ? "var(--positive)" : "var(--warning)" }}
                  >
                    {selected.priceEur
                      ? t("holdingMatched", { price: formatEur(selected.priceEur) })
                      : t("holdingNoPrice")}
                  </div>
                </div>
                <span className="text-xs" style={{ color: "var(--ink-subtle)" }}>
                  {t("holdingChange")}
                </span>
              </button>
            ) : (
              <>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("holdingAssetPlaceholder")}
                  autoComplete="off"
                  className="w-full rounded-[14px] border px-3 py-2.5 text-sm placeholder:text-[var(--ink-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition"
                  style={{
                    background: "var(--surface-2)",
                    borderColor: "var(--line)",
                    color: "var(--ink)",
                  }}
                />

                <AnimatePresence initial={false}>
                  {(isSearching || results.length > 0) && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.25, ease: EASE }}
                      className="overflow-hidden rounded-[14px] border"
                      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
                    >
                      {isSearching && results.length === 0 ? (
                        <div
                          className="px-3 py-2.5 text-xs"
                          style={{ color: "var(--ink-subtle)" }}
                        >
                          {t("holdingSearching")}
                        </div>
                      ) : (
                        results.map((coin, i) => (
                          <button
                            key={coin.id}
                            type="button"
                            onClick={() => {
                              setSelected(coin);
                              setResults([]);
                            }}
                            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]"
                            style={
                              i > 0
                                ? { borderTop: "1px solid var(--line)" }
                                : undefined
                            }
                          >
                            <div className="min-w-0 flex-1">
                              <div
                                className="truncate text-sm font-medium"
                                style={{ color: "var(--ink)" }}
                              >
                                {coin.name}
                              </div>
                              <div
                                className="text-xs"
                                style={{ color: "var(--ink-subtle)" }}
                              >
                                {coin.symbol}
                              </div>
                            </div>
                            <div
                              className="shrink-0 text-xs tabular-nums"
                              style={{ color: "var(--ink-muted)" }}
                            >
                              {coin.priceEur ? formatEur(coin.priceEur) : "—"}
                            </div>
                          </button>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <p className="text-xs" style={{ color: "var(--ink-subtle)" }}>
                  {t("holdingAssetHint")}
                </p>
              </>
            )}
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--ink-muted)" }}>
              {t("holdingQuantity")}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(",", "."))}
              placeholder="0"
              className="w-full rounded-[14px] border px-3 py-2.5 text-sm tabular-nums placeholder:text-[var(--ink-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--line)",
                color: "var(--ink)",
              }}
            />
          </div>

          {/* Held at */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--ink-muted)" }}>
              {t("holdingHeldAt")}
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("holdingHeldAtPlaceholder")}
              maxLength={100}
              className="w-full rounded-[14px] border px-3 py-2.5 text-sm placeholder:text-[var(--ink-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--line)",
                color: "var(--ink)",
              }}
            />
            <p className="text-xs" style={{ color: "var(--ink-subtle)" }}>
              {t("holdingHeldAtHint")}
            </p>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--ink-muted)" }}>
              {t("holdingStatus")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: false, labelText: t("holdingLiquid") },
                { value: true, labelText: t("holdingLocked") },
              ].map((opt) => {
                const active = isLocked === opt.value;
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setIsLocked(opt.value)}
                    className="rounded-[14px] border px-3 py-2.5 text-sm font-medium transition"
                    style={
                      active
                        ? {
                            borderColor: "var(--accent)",
                            background: "var(--surface-2)",
                            color: "var(--ink)",
                          }
                        : {
                            borderColor: "var(--line)",
                            background: "var(--surface-2)",
                            color: "var(--ink-subtle)",
                          }
                    }
                  >
                    {opt.labelText}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live value preview */}
          <AnimatePresence initial={false}>
            {estimatedValue !== null && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                style={{ overflow: "hidden" }}
              >
                <div
                  className="rounded-[14px] px-4 py-3 text-sm"
                  style={{ background: "var(--surface-2)", color: "var(--ink)" }}
                >
                  {t("holdingEstimate", { value: formatEur(estimatedValue) })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <div
              className="rounded-[14px] border px-4 py-3 text-sm"
              style={{
                background: "rgba(214,69,80,0.10)",
                color: "var(--negative)",
                borderColor: "rgba(214,69,80,0.25)",
              }}
            >
              {error}
            </div>
          )}
        </div>
      </ModalBody>

      <ModalFooter className="flex-col gap-2">
        {blockingReason && (
          <p
            className="w-full text-center text-xs"
            style={{ color: "var(--ink-subtle)" }}
          >
            {blockingReason}
          </p>
        )}
        <div className="flex w-full gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 rounded-[14px] border px-4 py-2.5 text-sm font-medium transition hover:bg-[var(--surface-2)] disabled:opacity-40"
            style={{ borderColor: "var(--line)", color: "var(--ink-muted)" }}
          >
            {tCommon("cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || isSaving}
            className="flex flex-1 items-center justify-center gap-2 rounded-[14px] px-4 py-2.5 text-sm font-medium transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {isSaving && (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {t("addHoldingSave")}
          </button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
