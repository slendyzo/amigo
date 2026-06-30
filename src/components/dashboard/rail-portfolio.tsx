"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/currencies";

export type RailHolding = { symbol: string; label: string; valueEur: number };

type Props = {
  totalEur: number;
  deltaEur?: number | null;
  holdings: RailHolding[];
  exchangeCount: number;
  moreCount: number;
  hasData: boolean;
};

const cardStyle = { background: "var(--surface)", border: "1px solid var(--line)" };
const titleCls = "mb-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.07em]";

export default function RailPortfolio({ totalEur, deltaEur, holdings, exchangeCount, moreCount, hasData }: Props) {
  const t = useTranslations("dashboard");

  if (!hasData) {
    return (
      <div className="rounded-2xl p-[18px]" style={cardStyle}>
        <div className={titleCls} style={{ color: "var(--accent)" }}>{t("statPortfolio")}</div>
        <Link href="/dashboard/portfolio" className="text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
          {t("connectExchange")} →
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-[18px]" style={cardStyle}>
      <div className={titleCls} style={{ color: "var(--accent)" }}>
        <span>{t("statPortfolio")}</span>
        <span className="font-semibold normal-case tracking-normal text-[11px]" style={{ color: "var(--ink-subtle)" }}>
          {t("railExchanges", { count: exchangeCount })}
        </span>
      </div>
      <p className="text-[23px] font-bold tracking-tight tabular-nums">
        {formatCurrency(totalEur, "EUR")}
        {deltaEur != null && (
          <span className="ml-2 text-[13px]" style={{ color: deltaEur >= 0 ? "var(--positive)" : "var(--negative)" }}>
            {deltaEur >= 0 ? "▲" : "▼"} {formatCurrency(Math.abs(deltaEur), "EUR")}
          </span>
        )}
      </p>
      {holdings.map((h) => (
        <div key={h.symbol} className="flex items-center justify-between py-2 text-[13px]" style={{ borderTop: "1px solid var(--line)" }}>
          <span style={{ color: "var(--ink-muted)" }}>{h.label}</span>
          <span className="tabular-nums">{formatCurrency(h.valueEur, "EUR")}</span>
        </div>
      ))}
      <div className="flex items-center justify-between py-2" style={{ borderTop: "1px solid var(--line)" }}>
        <Link href="/dashboard/portfolio" className="text-[12.5px] font-semibold" style={{ color: "var(--accent)" }}>
          {t("openPortfolio")} →
        </Link>
        {moreCount > 0 && (
          <span className="text-[11px]" style={{ color: "var(--ink-subtle)" }}>{t("moreCount", { count: moreCount })}</span>
        )}
      </div>
    </div>
  );
}
