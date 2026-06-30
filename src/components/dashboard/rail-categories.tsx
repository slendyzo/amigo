"use client";

import { useTranslations } from "next-intl";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import { formatCurrency } from "@/lib/currencies";

export type RailCategory = { name: string; amountEur: number };

type Props = {
  categories: RailCategory[];
};

const cardStyle = { background: "var(--surface)", border: "1px solid var(--line)" };

export default function RailCategories({ categories }: Props) {
  const t = useTranslations("dashboard");
  const { translateCategory } = useCategoryTranslation();

  // Hidden entirely until there's spend to rank (per the locked design).
  if (categories.length === 0) return null;

  const max = Math.max(...categories.map((c) => c.amountEur), 1);

  return (
    <div className="rounded-2xl p-[18px]" style={cardStyle}>
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.07em]" style={{ color: "var(--accent)" }}>
        {t("railTopCategories")}
      </div>
      <div className="space-y-1.5">
        {categories.map((c) => (
          <div key={c.name} className="grid grid-cols-[64px_1fr_auto] items-center gap-2.5 text-[12.5px]">
            <span className="truncate" style={{ color: "var(--ink-muted)" }}>{translateCategory(c.name)}</span>
            <span className="h-[7px] rounded-full" style={{ width: `${(c.amountEur / max) * 100}%`, background: "var(--accent)", opacity: 0.85 }} />
            <span className="tabular-nums">{formatCurrency(c.amountEur, "EUR")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
