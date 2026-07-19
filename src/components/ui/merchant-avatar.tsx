"use client";

import { matchBrand } from "@/lib/merchant-brands";
import { resolveCategoryEmoji } from "@/lib/category-emoji";

/**
 * MerchantAvatar — Calm Violet redesign shared avatar.
 * 38×38 rounded-12 tile with a single uppercase initial, tinted by category
 * (per the design handoff README map). Dark mode derives its colors from the
 * light foreground via color-mix so both themes match the mocks
 * (e.g. violet: #EEEBFD/#5F4BE8 light → ~#2A2648/#B9AEF3 dark).
 *
 * Three tiers, best available wins:
 *   1. known brand (lib/merchant-brands) → real logo on the brand color
 *   2. known category or keyword (lib/category-emoji) → emoji on the tint
 *   3. neither → the uppercase initial on the tint
 * All of it resolves at render time from the raw name, so every past row
 * lights up with no data migration.
 *
 * Reused by the dashboard Recent list (Phase 3) and the expenses ledger
 * (Phase 4).
 */

type Tint = { bg: string; fg: string };

const TINTS: { keys: string[]; tint: Tint }[] = [
  // Groceries / Utilities / Subscriptions — violet
  { keys: ["grocer", "utilit", "subscription", "supermarket", "mercearia", "supermercado"], tint: { bg: "#EEEBFD", fg: "#5F4BE8" } },
  // Fuel / Transport — terracotta
  { keys: ["fuel", "transport", "car", "gas", "parking", "combustível", "combustivel"], tint: { bg: "#FDEEEA", fg: "#C75A3A" } },
  // Eating out — gold
  { keys: ["eating", "restaurant", "dining", "food", "café", "cafe", "coffee", "restauração", "restauracao"], tint: { bg: "#F5EEE1", fg: "#A8823C" } },
  // Health — blue
  { keys: ["health", "saúde", "saude", "pharmacy", "farmácia", "farmacia", "medical"], tint: { bg: "#E9F1FB", fg: "#3D74B8" } },
  // Sports / Income — green
  { keys: ["sport", "gym", "income", "salary", "desporto", "ginásio", "ginasio"], tint: { bg: "#E7F5EE", fg: "#1B9E63" } },
];

const FALLBACK: Tint = { bg: "#F0EFF6", fg: "#6B6880" };

function getTint(category?: string): Tint {
  if (!category) return FALLBACK;
  const c = category.toLowerCase();
  for (const { keys, tint } of TINTS) {
    if (keys.some((k) => c.includes(k))) return tint;
  }
  return FALLBACK;
}

export type MerchantAvatarProps = {
  name: string;
  category?: string;
  size?: number;
};

export default function MerchantAvatar({ name, category, size = 38 }: MerchantAvatarProps) {
  const brand = matchBrand(name);

  if (brand) {
    const markFg = brand.fg ?? "#FFFFFF";
    return (
      <div
        aria-hidden
        title={brand.label}
        className="flex flex-none items-center justify-center overflow-hidden"
        style={{ width: size, height: size, borderRadius: 12, background: brand.color }}
      >
        {brand.mark.kind === "glyph" ? (
          <svg
            viewBox={brand.mark.viewBox}
            width={Math.round(size * 0.56)}
            height={Math.round(size * 0.56)}
            fill={markFg}
            fillRule={brand.mark.fillRule}
          >
            <path d={brand.mark.path} />
          </svg>
        ) : (
          <span
            className="font-bold leading-none tracking-tight"
            style={{
              color: markFg,
              // Shrink as the wordmark grows so 1–4 chars all sit centered.
              fontSize: Math.round(size * (brand.mark.text.length <= 1 ? 0.42 : brand.mark.text.length === 2 ? 0.32 : 0.26)),
            }}
          >
            {brand.mark.text}
          </span>
        )}
      </div>
    );
  }

  const { bg, fg } = getTint(category);
  const emoji = resolveCategoryEmoji(category, name);
  const initial = (name.trim().charAt(0) || "?").toUpperCase();

  return (
    <div
      aria-hidden
      className="flex flex-none items-center justify-center font-semibold bg-[var(--av-bg)] text-[var(--av-fg)] dark:bg-[var(--av-bg-dark)] dark:text-[var(--av-fg-dark)]"
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        // Emoji need a touch more room than a letter to read at 38px.
        fontSize: Math.round(size * (emoji ? 0.44 : 0.37)),
        // Light tints straight from the README map; dark derives from the
        // foreground color (18% tint bg + lightened letter), matching the
        // dark option board (1c).
        ["--av-bg" as string]: bg,
        ["--av-fg" as string]: fg,
        ["--av-bg-dark" as string]: `color-mix(in srgb, ${fg} 18%, transparent)`,
        ["--av-fg-dark" as string]: `color-mix(in srgb, ${fg} 55%, white)`,
      }}
    >
      {emoji ? <span className="leading-none">{emoji}</span> : initial}
    </div>
  );
}
