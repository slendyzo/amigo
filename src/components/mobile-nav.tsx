"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "./ui/modal";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const t = useTranslations("nav");

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const closeSheet = () => setMenuOpen(false);


  const moneyActive = ["/dashboard/expenses", "/dashboard/incomes", "/dashboard/recurring", "/dashboard/accounts"].some((p) => pathname.startsWith(p));
  const wealthActive = ["/dashboard/portfolio", "/dashboard/networth", "/dashboard/portfolio/exchanges"].some((p) => pathname.startsWith(p));
  const dashActive = pathname === "/dashboard";
  const menuActive = menuOpen || (!dashActive && !moneyActive && !wealthActive);

  const tab = (active: boolean, href: string, icon: string, label: string) => (
    <Link href={href} aria-current={active ? "page" : undefined} className="flex flex-col items-center justify-center gap-[3px] min-w-0 w-full min-h-12 tap-none transition-colors"
      style={{ color: active ? "var(--accent)" : "var(--ink-subtle)" }}>
      <Icon name={icon} />
      <span className="text-[10px]" style={{ fontWeight: active ? 600 : 500 }}>{label}</span>
    </Link>
  );

  const groups = [
    { title: "wealth", links: [
      ["assetsAndDebts", "/dashboard/networth", "assetsDescription"],
      ["investments", "/dashboard/portfolio", "investmentsDescription"],
      ["exchanges", "/dashboard/portfolio/exchanges"],
    ] },
    { title: "sectionMoney", links: [
      ["expenses", "/dashboard/expenses"], ["incomes", "/dashboard/incomes"],
      ["recurring", "/dashboard/recurring"], ["accounts", "/dashboard/accounts"],
    ] },
    { title: "sectionOrganize", links: [
      ["projects", "/dashboard/projects"], ["categories", "/dashboard/categories"],
      ["tidyUp", "/dashboard/tidy-up"], ["categorizationRules", "/dashboard/mappings"],
      ...(aiEnabled ? [["insights", "/dashboard/insights"]] : []),
    ] },
    { title: "sectionData", links: [
      ["import", "/dashboard/import"], ["importHistory", "/dashboard/imports"],
    ] },
    { title: "settings", links: [
      ["settings", "/dashboard/settings"], ["workspace", "/dashboard/workspace"],
      ...(isAdmin ? [["inbox", "/dashboard/inbox"]] : []),
    ] },
  ];

  return (
    <>
      {/* Bottom tab bar — Home / Money / FAB / Wealth / More */}
      <nav className="mobile-nav-bar app-bottom-nav fixed bottom-0 left-1/2 -translate-x-1/2 z-40 pb-safe-bottom border-t"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
        <div className="grid grid-cols-5 items-center px-3 pt-2.5 pb-1.5">
          {tab(dashActive, "/dashboard", "home", t("home"))}
          {tab(moneyActive, "/dashboard/expenses", "money", t("money"))}

          {/* Center FAB */}
          <button onClick={onAddClick} aria-label={t("add")}
            className="justify-self-center flex items-center justify-center w-[52px] h-[52px] rounded-full -mt-6 tap-none active:scale-[.94] transition-transform"
            style={{ background: "var(--accent)", color: "var(--accent-fg)", boxShadow: "var(--shadow-fab)" }}>
            <Icon name="plus" size={24} sw={2} />
          </button>

          {tab(wealthActive, "/dashboard/networth", "wealth", t("wealth"))}

          <button onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-haspopup="dialog"
            className="flex flex-col items-center justify-center gap-[3px] min-w-0 w-full min-h-12 tap-none transition-colors"
            style={{ color: menuActive ? "var(--accent)" : "var(--ink-subtle)" }}>
            <Icon name="more" />
            <span className="text-[10px] font-medium">{t("menu")}</span>
          </button>
        </div>
      </nav>

      {/* Same viewport-safe overlay as the other app dialogs. */}
      <Modal isOpen={menuOpen} onClose={closeSheet} variant="sheet" size="xl" flush className="app-more-sheet">
        <ModalHeader title={t("menu")} />
        <ModalBody className="space-y-4 px-5 pt-2">
          <div className="app-menu-groups">
            {groups.map(group => (
              <section key={group.title} className="min-w-0">
                <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">{t(group.title)}</h2>
                <div className="overflow-hidden rounded-[18px] bg-[var(--surface)] px-3 shadow-[var(--shadow-card)]">
                  {group.links.map(([key, href, description]) => {
                    const active = pathname === href || (href === "/dashboard/networth" && pathname.startsWith(`${href}/`));
                    return <Link key={href} href={href} onClick={closeSheet} aria-current={active ? "page" : undefined}
                      className="flex min-h-12 items-center gap-3 border-b border-[var(--line)] py-3 last:border-0"
                      style={{ color: active ? "var(--accent)" : "var(--ink)" }}>
                      <span className="min-w-0 flex-1 break-words">
                        <span className="block text-sm font-semibold">{t(key)}</span>
                        {description && <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">{t(description)}</span>}
                        {key === "workspace" && workspaceName && <span className="block text-xs text-[var(--ink-muted)]">{workspaceName}</span>}
                      </span>
                      <span className="shrink-0"><Icon name="chevron" size={16} /></span>
                    </Link>;
                  })}
                </div>
              </section>
            ))}
          </div>
          {onWhatsNew && <button onClick={() => { closeSheet(); onWhatsNew(); }} className="min-h-11 w-full rounded-xl bg-[var(--surface)] px-4 text-sm font-medium text-[var(--ink)]">{t("whatsNew")}</button>}

            {userEmail && (
              <p className="break-words text-[11px] text-center" style={{ color: "var(--ink-subtle)" }}>{userEmail}</p>
            )}
        </ModalBody>
        <ModalFooter className="flex-wrap items-center justify-between gap-3">
              <ThemeToggle />
              {onSignOut && (
                <button onClick={onSignOut}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-[14px] text-[13px] font-semibold tap-none"
                  style={{ color: "var(--negative)", background: "color-mix(in srgb, var(--negative) 10%, transparent)" }}>
                  <Icon name="signout" size={16} />{t("signOut")}
                </button>
              )}
        </ModalFooter>
      </Modal>
    </>
  );
}
