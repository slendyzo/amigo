"use client";

/**
 * MobileFAB — Forest & Bracket centered bottom-bar floating action button.
 *
 * 56×56, 6px radius (NOT iOS circle — ledger paper aesthetic), forest fill
 * with gilt-soft inset hairline. Lifted above the tab bar by translateY(-22px)
 * so it overlaps the bar.
 *
 * If no onClick prop, dispatches the global `openQuickAdd` event so it slots
 * into dashboard-shell's existing pattern.
 */

import { Plus } from "lucide-react";

interface MobileFABProps {
  onClick?: () => void;
  ariaLabel?: string;
}

export default function MobileFAB({ onClick, ariaLabel = "Adicionar" }: MobileFABProps) {
  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("openQuickAdd"));
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      className="relative grid place-items-center cursor-pointer outline-none"
      style={{
        width: 56,
        height: 56,
        borderRadius: 6,
        background: "var(--forest)",
        color: "var(--paper)",
        border: "1px solid var(--forest-deep)",
        transform: "translateY(-22px)",
        boxShadow:
          "0 8px 22px rgba(20,40,30,0.32), 0 2px 6px rgba(20,40,30,0.18)",
      }}
    >
      {/* Gilt-soft inset hairline — brand differentiator */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: 5,
          border: "1px solid var(--gilt-soft)",
          borderRadius: 3,
          opacity: 0.55,
          pointerEvents: "none",
        }}
      />
      <Plus size={22} strokeWidth={1.5} aria-hidden />
    </button>
  );
}
