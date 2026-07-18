"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "./theme-controls";

// 22px stroke icons at 1.8 weight, per the Calm Violet handoff tab bar
const icons: Record<string, ReactNode> = {
  home: <path d="M4 11l8-7 8 7v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" />,
  money: <path d="M4 6h16M4 12h16M4 18h10" />,
  wealth: <path d="M4 17l5-5 4 3 7-8" />,
  more: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  folder: <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />,
  trend: <path d="M4 17l5-5 4 3 7-8" />,
  check: <path d="M5 13l4 4L19 7" />,
  download: <><path d="M12 4v10m0 0l-4-4m4 4l4-4" /><path d="M5 19h14" /></>,
  chevron: <path d="M9 6l6 6-6 6" />,
  inbox: <><path d="M4 13h4l2 3h4l2-3h4" /><path d="M4 13V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" /></>,
  signout: <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" />,
};

const Icon = ({ name, size = 22, sw = 1.8 }: { name: string; size?: number; sw?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {icons[name]}
  </svg>
);

interface MobileNavProps {
  onAddClick?: () => void;
  userEmail?: string;
  workspaceName?: string;
  onSignOut?: () => void;
  aiEnabled?: boolean;
  isAdmin?: boolean;
  onWhatsNew?: () => void;
}

export default function MobileNav({ onAddClick, userEmail, workspaceName, onSignOut, aiEnabled, isAdmin, onWhatsNew }: MobileNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetIn, setSheetIn] = useState(false);
  const t = useTranslations("nav");

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle("modal-open", menuOpen);
    if (menuOpen) {
      const raf = requestAnimationFrame(() => setSheetIn(true));
      return () => { cancelAnimationFrame(raf); document.body.classList.remove("modal-open"); };
    }
    setSheetIn(false);
    return () => document.body.classList.remove("modal-open");
  }, [menuOpen]);

  const closeSheet = () => {
    setSheetIn(false);
    setTimeout(() => setMenuOpen(false), 300);
  };

  const go = (href: string) => { closeSheet(); router.push(href); };

  const moneyActive = ["/dashboard/expenses", "/dashboard/incomes", "/dashboard/recurring", "/dashboard/import"].some((p) => pathname.startsWith(p));
  const wealthActive = ["/dashboard/portfolio", "/dashboard/networth", "/dashboard/exchanges"].some((p) => pathname.startsWith(p));
  const dashActive = pathname === "/dashboard";

  const tab = (active: boolean, href: string, icon: string, label: string) => (
    <Link href={href} className="flex flex-col items-center justify-center gap-[3px] w-16 h-full tap-none transition-colors"
      style={{ color: active ? "var(--accent)" : "var(--ink-subtle)" }}>
      <Icon name={icon} />
      <span className="text-[10px]" style={{ fontWeight: active ? 600 : 500 }}>{label}</span>
    </Link>
  );

  const shortcut = (href: string, icon: string, tint: string, iconColor: string, label: string, sub: string) => (
    <button onClick={() => go(href)} className="text-left rounded-[18px] p-[15px] tap-none active:scale-[.98] transition-transform"
      style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
      <div className="w-[38px] h-[38px] rounded-xl flex items-center justify-center mb-2.5" style={{ background: tint, color: iconColor }}>
        <Icon name={icon} size={16} />
      </div>
      <div className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>{label}</div>
      <div className="text-[11px] mt-px" style={{ color: "var(--ink-subtle)" }}>{sub}</div>
    </button>
  );

  const listRow = (label: string, onClick: () => void, opts?: { dot?: boolean; last?: boolean }) => (
    <button onClick={onClick} className="w-full flex items-center justify-between py-3 tap-none"
      style={{ borderBottom: opts?.last ? "none" : "1px solid var(--line)", color: "var(--ink)" }}>
      <span className="text-[13px] font-medium">{label}</span>
      {opts?.dot
        ? <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
        : <span style={{ color: "var(--ink-subtle)" }}><Icon name="chevron" size={14} sw={2} /></span>}
    </button>
  );

  return (
    <>
      {/* Bottom tab bar — Home / Money / FAB / Wealth / More */}
      <nav className="mobile-nav-bar md:hidden fixed bottom-0 left-0 right-0 z-40 pb-safe-bottom border-t"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
        <div className="flex items-center justify-around pt-2.5 pb-1.5">
          {tab(dashActive, "/dashboard", "home", t("home"))}
          {tab(moneyActive, "/dashboard/expenses", "money", t("money"))}

          {/* Center FAB */}
          <button onClick={onAddClick} aria-label="Add"
            className="flex items-center justify-center w-[52px] h-[52px] rounded-full -mt-6 tap-none active:scale-[.94] transition-transform"
            style={{ background: "var(--accent)", color: "var(--accent-fg)", boxShadow: "var(--shadow-fab)" }}>
            <Icon name="plus" size={24} sw={2} />
          </button>

          {tab(wealthActive, "/dashboard/portfolio", "wealth", t("wealth"))}

          <button onClick={() => setMenuOpen(true)}
            className="flex flex-col items-center justify-center gap-[3px] w-16 h-full tap-none transition-colors"
            style={{ color: menuOpen ? "var(--accent)" : "var(--ink-subtle)" }}>
            <Icon name="more" />
            <span className="text-[10px] font-medium">{t("more")}</span>
          </button>
        </div>
      </nav>

      {/* More sheet (replaces the drawer) */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 transition-opacity duration-300"
            style={{ background: "rgba(23,22,31,.45)", opacity: sheetIn ? 1 : 0 }}
            onClick={closeSheet} />
          <div className="relative flex flex-col gap-4 rounded-t-[28px] px-5 pt-3.5 transition-transform duration-300"
            style={{ background: "var(--app-bg)", paddingBottom: "max(env(safe-area-inset-bottom, 0px), 28px)", transform: sheetIn ? "translateY(0)" : "translateY(100%)", transitionTimingFunction: "var(--ease)" }}>
            <div className="w-10 h-1 rounded-sm mx-auto" style={{ background: "color-mix(in srgb, var(--ink) 15%, transparent)" }} />

            <div className="flex items-center justify-between">
              <div className="text-[17px] font-bold" style={{ color: "var(--ink)" }}>{t("more")}</div>
              <button onClick={closeSheet} aria-label="Close"
                className="w-8 h-8 rounded-full flex items-center justify-center tap-none"
                style={{ background: "var(--surface)", color: "var(--ink-muted)", boxShadow: "var(--shadow-card)" }}>
                <Icon name="close" size={14} sw={2} />
              </button>
            </div>

            {/* 2×2 shortcut grid */}
            <div className="grid grid-cols-2 gap-2.5">
              {shortcut("/dashboard/projects", "folder", "var(--surface-2)", "var(--accent)", t("projects"), t("moreProjectsSub"))}
              {aiEnabled && shortcut("/dashboard/insights", "trend", "color-mix(in srgb, var(--positive) 12%, transparent)", "var(--positive)", t("insights"), t("moreInsightsSub"))}
              {shortcut("/dashboard/tidy-up", "check", "color-mix(in srgb, #a8823c 14%, transparent)", "#a8823c", t("tidyUp"), t("moreTidyUpSub"))}
              {shortcut("/dashboard/import", "download", "color-mix(in srgb, #3d74b8 12%, transparent)", "#3d74b8", t("import"), t("moreImportSub"))}
            </div>

            {/* List card */}
            <div className="rounded-[20px] px-4 py-1.5" style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}>
              {listRow(t("settings"), () => go("/dashboard/settings"))}
              {listRow(workspaceName ? `${t("workspace")} — ${workspaceName}` : t("workspace"), () => go("/dashboard/workspace"))}
              {isAdmin && listRow(t("inbox"), () => go("/dashboard/inbox"))}
              {listRow(t("whatsNew"), () => { closeSheet(); onWhatsNew?.(); }, { dot: true, last: true })}
            </div>

            <div className="flex items-center justify-between gap-3">
              <ThemeToggle />
              {onSignOut && (
                <button onClick={onSignOut}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-[14px] text-[13px] font-semibold tap-none"
                  style={{ color: "var(--negative)", background: "color-mix(in srgb, var(--negative) 10%, transparent)" }}>
                  <Icon name="signout" size={16} />{t("signOut")}
                </button>
              )}
            </div>
            {userEmail && (
              <p className="text-[11px] text-center -mt-1 truncate" style={{ color: "var(--ink-subtle)" }}>{userEmail}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
