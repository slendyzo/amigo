"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/currencies";

export type RailAsset = { id: string; name: string; valueEur: number };

type Props = {
  equityEur: number;
  assets: RailAsset[];
  linkedDebtEur: number;
  hasData: boolean;
};

const cardStyle = { background: "var(--surface)", border: "1px solid var(--line)" };
const titleCls = "mb-3 text-[10px] font-bold uppercase tracking-[0.07em]";

export default function RailRwa({ equityEur, assets, linkedDebtEur, hasData }: Props) {
  const t = useTranslations("dashboard");
  const tRwa = useTranslations("rwa");

  if (!hasData) {
    return (
      <div className="rounded-2xl p-[18px]" style={cardStyle}>
        <div className={titleCls} style={{ color: "var(--accent)" }}>{t("railRwaEquity")}</div>
        <Link href="/dashboard/networth" className="text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
          {t("addAsset")} →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-[18px]" style={cardStyle}>
      <div className={titleCls} style={{ color: "var(--accent)" }}>{t("railRwaEquity")}</div>
      <p className="text-[23px] font-bold tracking-tight tabular-nums">{formatCurrency(equityEur, "EUR")}</p>
      {assets.map((a) => (
        <div key={a.id} className="flex items-center justify-between py-2 text-[13px]" style={{ borderTop: "1px solid var(--line)" }}>
          <span className="truncate pr-2" style={{ color: "var(--ink-muted)" }}>{a.name}</span>
          <span className="tabular-nums">{formatCurrency(a.valueEur, "EUR")}</span>
        </div>
      ))}
      <div className="flex items-center justify-between py-2" style={{ borderTop: "1px solid var(--line)" }}>
        {linkedDebtEur > 0 ? (
          <span className="text-[11px]" style={{ color: "var(--ink-subtle)" }}>
            {tRwa("afterLoans", { amount: formatCurrency(linkedDebtEur, "EUR") })}
          </span>
        ) : (
          <span />
        )}
        <Link href="/dashboard/networth" className="text-[12.5px] font-semibold" style={{ color: "var(--accent)" }}>
          {t("netWorthLink")} →
        </Link>
      </div>
    </div>
  );
}
