"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const destinations = [
  { key: "assetsAndDebts", href: "/dashboard/networth" },
  { key: "investments", href: "/dashboard/portfolio" },
  { key: "exchanges", href: "/dashboard/portfolio/exchanges" },
];

export default function WealthHubNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  if (!destinations.some(({ href }) => pathname === href || pathname.startsWith(`${href}/`))) return null;
  const current = [...destinations].reverse().find(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label={t("wealth")} className="mb-5 grid grid-cols-3 gap-1 rounded-2xl bg-[var(--surface)] p-1 shadow-[var(--shadow-card)]">
      {destinations.map(({ key, href }) => (
        <Link key={href} href={href} aria-current={current?.href === href ? "page" : undefined}
          className="flex min-h-12 min-w-0 items-center justify-center rounded-xl px-2 py-2 text-center text-xs font-medium"
          style={{ background: current?.href === href ? "var(--ink)" : undefined, color: current?.href === href ? "var(--accent-fg)" : "var(--ink-muted)" }}>
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}
