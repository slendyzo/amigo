"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/currencies";

type Props = {
  userName: string;
  netWorthEur: number;
  netWorthDeltaEur?: number | null;
  spentEur: number;
  budgetEur: number;
  portfolioEur: number;
  portfolioDeltaEur?: number | null;
};

// Stat tile — value + optional "this month" delta, deep-links into a hub.
function StatTile({
  label,
  value,
  delta,
  href,
  isFirst,
}: {
  label: string;
  value: string;
  delta: React.ReactNode;
  href: string;
  isFirst?: boolean;
}) {
  return (
    <Link
      href={href}
      className="block px-5 py-4 rounded-2xl transition-colors hover:bg-[var(--surface-2)]"
      style={isFirst ? undefined : { borderLeft: "1px solid var(--line)" }}
    >
      <p className="text-[11px] font-medium" style={{ color: "var(--ink-muted)" }}>
        {label}
      </p>
      <p className="mt-1 text-[25px] font-bold tracking-tight tabular-nums">{value}</p>
      <p className="mt-0.5 text-[12px] font-semibold tabular-nums">{delta}</p>
    </Link>
  );
}

function DeltaText({ amount }: { amount: number | null | undefined }) {
  const t = useTranslations("dashboard");
  if (amount == null) return <span style={{ color: "var(--ink-subtle)" }}>&nbsp;</span>;
  const positive = amount >= 0;
  return (
    <span style={{ color: positive ? "var(--positive)" : "var(--negative)" }}>
      {positive ? "▲" : "▼"} {formatCurrency(Math.abs(amount), "EUR")} {t("thisMonth")}
    </span>
  );
}

export default function OverviewHero({
  userName,
  netWorthEur,
  netWorthDeltaEur,
  spentEur,
  budgetEur,
  portfolioEur,
  portfolioDeltaEur,
}: Props) {
  const t = useTranslations("dashboard");

  // Time-of-day greeting computed on the client to use the user's local hour
  // (the server runs in UTC) — avoids an SSR/CSR hydration mismatch.
  const [greetingKey, setGreetingKey] = useState<"greetingMorning" | "greetingAfternoon" | "greetingEvening">(
    "greetingEvening",
  );
  useEffect(() => {
    const h = new Date().getHours();
    setGreetingKey(h < 12 ? "greetingMorning" : h < 18 ? "greetingAfternoon" : "greetingEvening");
  }, []);

  const pct = budgetEur > 0 ? Math.round((spentEur / budgetEur) * 100) : 0;

  return (
    <section>
      <h1 className="mb-3.5 text-[19px] font-semibold tracking-tight">
        {t(greetingKey, { name: userName })} 👋
      </h1>
      <div
        className="grid grid-cols-3 rounded-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
      >
        <StatTile
          isFirst
          label={t("statNetWorth")}
          value={formatCurrency(netWorthEur, "EUR")}
          href="/dashboard/networth"
          delta={<DeltaText amount={netWorthDeltaEur} />}
        />
        <StatTile
          label={t("statSpent")}
          value={formatCurrency(spentEur, "EUR")}
          href="/dashboard/expenses"
          delta={<span style={{ color: "var(--ink-muted)" }}>{t("pctOfBudget", { pct })}</span>}
        />
        <StatTile
          label={t("statPortfolio")}
          value={formatCurrency(portfolioEur, "EUR")}
          href="/dashboard/portfolio"
          delta={<DeltaText amount={portfolioDeltaEur} />}
        />
      </div>
    </section>
  );
}
