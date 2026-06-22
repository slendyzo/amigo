"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "./theme-controls";

const icons: Record<string, ReactNode> = {
  layout: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zm10-3a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" />,
  dollar: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
  "trending-up": <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />,
  menu: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />,
  plus: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />,
  folder: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />,
  settings: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>,
  "bar-chart": <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
  inbox: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />,
  sparkles: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />,
  close: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />,
  signout: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />,
};

const Icon = ({ name, cls = "w-6 h-6" }: { name: string; cls?: string }) => (
  <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">{icons[name]}</svg>
);

interface MobileNavProps {
  onAddClick?: () => void;
  userEmail?: string;
  onSignOut?: () => void;
  aiEnabled?: boolean;
  isAdmin?: boolean;
  onWhatsNew?: () => void;
}

export default function MobileNav({ onAddClick, userEmail, onSignOut, aiEnabled, isAdmin, onWhatsNew }: MobileNavProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const t = useTranslations("nav");

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle("modal-open", menuOpen);
    return () => document.body.classList.remove("modal-open");
  }, [menuOpen]);

  const moneyActive = ["/dashboard/expenses", "/dashboard/incomes", "/dashboard/recurring", "/dashboard/import"].some((p) => pathname.startsWith(p));
  const portfolioActive = ["/dashboard/portfolio", "/dashboard/networth", "/dashboard/exchanges"].some((p) => pathname.startsWith(p));
  const dashActive = pathname === "/dashboard";

  const tab = (active: boolean, href: string, icon: string, label: string) => (
    <Link href={href} className="flex flex-col items-center justify-center w-16 h-full tap-none transition-colors"
      style={{ color: active ? "var(--accent)" : "var(--ink-subtle)" }}>
      <Icon name={icon} />
      <span className="text-[10px] mt-0.5 font-medium">{label}</span>
    </Link>
  );

  const drawerLink = (href: string, icon: string, label: string, active = false) => (
    <Link href={href} onClick={() => setMenuOpen(false)}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium tap-none transition-colors"
      style={{ background: active ? "var(--accent-tint)" : "transparent", color: active ? "var(--accent)" : "var(--ink)" }}>
      <Icon name={icon} cls="w-5 h-5" />
      <span className="flex-1">{label}</span>
    </Link>
  );

  return (
    <>
      {/* Bottom Tab Bar */}
      <nav className="mobile-nav-bar md:hidden fixed bottom-0 left-0 right-0 z-40 pb-safe-bottom border-t"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
        <div className="flex items-center justify-around h-16">
          {tab(dashActive, "/dashboard", "layout", t("dashboard"))}
          {tab(moneyActive, "/dashboard/expenses", "dollar", t("money"))}

          {/* Center Add */}
          <button onClick={onAddClick} aria-label="Add"
            className="flex items-center justify-center w-14 h-14 rounded-full -mt-6 text-white tap-none active:scale-95 transition-transform"
            style={{ background: "var(--accent-strong)", boxShadow: "0 8px 22px var(--accent-tint), 0 4px 10px rgba(0,0,0,.3)" }}>
            <Icon name="plus" cls="w-7 h-7" />
          </button>

          {tab(portfolioActive, "/dashboard/portfolio", "trending-up", t("portfolio"))}

          <button onClick={() => setMenuOpen(true)}
            className="flex flex-col items-center justify-center w-16 h-full tap-none transition-colors"
            style={{ color: "var(--ink-subtle)" }}>
            <Icon name="menu" />
            <span className="text-[10px] mt-0.5 font-medium">{t("more")}</span>
          </button>
        </div>
      </nav>

      {/* Drawer overlay */}
      {menuOpen && <div className="md:hidden fixed inset-0 bg-black/50 z-50" onClick={() => setMenuOpen(false)} />}

      {/* Drawer */}
      <div
        className={`md:hidden fixed top-0 right-0 bottom-0 w-72 max-w-[80vw] z-50 transform transition-transform duration-300 ease-out flex flex-col ${menuOpen ? "translate-x-0" : "translate-x-full"}`}
        style={{ background: "var(--surface)" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b pt-safe flex-shrink-0" style={{ borderColor: "var(--line)" }}>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold" style={{ color: "var(--ink)" }}>{t("menu")}</h2>
            {userEmail && <p className="text-xs truncate" style={{ color: "var(--ink-subtle)" }}>{userEmail}</p>}
          </div>
          <button onClick={() => setMenuOpen(false)} className="p-2 -mr-2 rounded-lg tap-none flex-shrink-0" style={{ color: "var(--ink-muted)" }}>
            <Icon name="close" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-touch scrollbar-hide px-2 py-2 space-y-1">
          {drawerLink("/dashboard/projects", "folder", t("projects"), pathname.startsWith("/dashboard/projects"))}
          {drawerLink("/dashboard/settings", "settings", t("settings"), pathname.startsWith("/dashboard/settings"))}
          {aiEnabled && drawerLink("/dashboard/insights", "bar-chart", t("insights"), pathname.startsWith("/dashboard/insights"))}
          {isAdmin && drawerLink("/dashboard/inbox", "inbox", t("inbox"), pathname.startsWith("/dashboard/inbox"))}

          <div className="h-px my-2 mx-1" style={{ background: "var(--line)" }} />
          <div className="px-1"><ThemeToggle /></div>

          <button onClick={() => { setMenuOpen(false); onWhatsNew?.(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium tap-none transition-colors" style={{ color: "var(--ink)" }}>
            <Icon name="sparkles" cls="w-5 h-5" />{t("whatsNew")}
          </button>
        </div>

        <div className="flex-shrink-0 border-t p-3 pb-safe" style={{ borderColor: "var(--line)" }}>
          {onSignOut && (
            <button onClick={onSignOut}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium tap-none transition-colors"
              style={{ color: "var(--negative)", background: "color-mix(in srgb, var(--negative) 12%, transparent)" }}>
              <Icon name="signout" cls="w-5 h-5" />{t("signOut")}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
