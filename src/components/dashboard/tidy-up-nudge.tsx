"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

type Props = {
  count: number;
};

// Dismissible nudge — appears only when there are uncategorized expenses.
// Calm Violet restyle: slim surface card (sits between Budget and Upcoming on
// the dashboard). Dismissal lasts the session; it reappears next visit if the
// count is still > 0.
export default function TidyUpNudge({ count }: Props) {
  const t = useTranslations("dashboard");
  const [dismissed, setDismissed] = useState(false);

  if (count <= 0 || dismissed) return null;

  return (
    <div
      className="flex items-center gap-3 rounded-[18px] px-4 py-3 text-[13px]"
      style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
    >
      <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: "var(--warning)" }} />
      <span className="min-w-0 truncate" style={{ color: "var(--ink-muted)" }}>{t("tidyUpCount", { count })}</span>
      <Link
        href="/dashboard/tidy-up"
        className="ml-auto flex-none font-semibold"
        style={{ color: "var(--accent)" }}
      >
        {t("tidyUpAction")} →
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="flex-none pl-1 leading-none"
        style={{ color: "var(--ink-subtle)" }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
