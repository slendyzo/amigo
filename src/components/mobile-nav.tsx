"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";

// Primary tabs for bottom navigation (most used features)
const primaryTabs = [
  { key: "home", href: "/dashboard", icon: "home" },
  { key: "expenses", href: "/dashboard/expenses", icon: "list" },
  { key: "projects", href: "/dashboard/projects", icon: "folder" },
  { key: "more", href: "#menu", icon: "menu", isAction: true },
];

// Navigation groups for the drawer menu (matching desktop sidebar)
type NavItem = {
  key: string;
  href: string;
  icon: string;
  badgeKey?: string;
};

type NavGroup = {
  label?: string;
  collapsible?: boolean;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    items: [
      { key: "overview", href: "/dashboard", icon: "home" },
      { key: "expenses", href: "/dashboard/expenses", icon: "list" },
    ],
  },
  {
    label: "sectionMoney",
    collapsible: true,
    items: [
      { key: "incomes", href: "/dashboard/incomes", icon: "dollar" },
      { key: "recurring", href: "/dashboard/recurring", icon: "repeat" },
    ],
  },
  {
    label: "sectionOrganize",
    collapsible: true,
    items: [
      { key: "projects", href: "/dashboard/projects", icon: "folder" },
      { key: "categories", href: "/dashboard/categories", icon: "tag" },
      { key: "tidyUp", href: "/dashboard/tidy-up", icon: "wand", badgeKey: "uncategorizedCount" },
      { key: "accounts", href: "/dashboard/accounts", icon: "credit-card" },
    ],
  },
  {
    label: "sectionData",
    collapsible: true,
    items: [
      { key: "import", href: "/dashboard/import", icon: "upload" },
      { key: "importHistory", href: "/dashboard/imports", icon: "history" },
      { key: "mappings", href: "/dashboard/mappings", icon: "key" },
    ],
  },
  {
    items: [
      { key: "settings", href: "/dashboard/settings", icon: "settings" },
    ],
  },
];

const icons: Record<string, ReactNode> = {
  home: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  list: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  ),
  plus: (
    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  folder: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  ),
  menu: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
  dollar: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  repeat: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  tag: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  ),
  "credit-card": (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  upload: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  ),
  key: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  ),
  settings: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  history: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  close: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  wand: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  ),
};

interface MobileNavProps {
  onAddClick?: () => void;
  userEmail?: string;
  onSignOut?: () => void;
  hideFloatingButtons?: boolean;
}

export default function MobileNav({ onAddClick, userEmail, onSignOut, hideFloatingButtons }: MobileNavProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const t = useTranslations("nav");
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Close menu on route change
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => document.body.classList.remove("modal-open");
  }, [isMenuOpen]);

  // Load collapsed state from localStorage (shared with desktop sidebar)
  useEffect(() => {
    try {
      const stored = localStorage.getItem("amigo-sidebar-collapsed");
      if (stored) setCollapsedSections(JSON.parse(stored));
    } catch {}
  }, []);

  // Fetch badge counts
  useEffect(() => {
    fetch("/api/expenses/uncategorized-count")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.count > 0) {
          setBadgeCounts((prev) => ({ ...prev, uncategorizedCount: data.count }));
        }
      })
      .catch(() => {});
  }, []);

  const toggleSection = (label: string) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      localStorage.setItem("amigo-sidebar-collapsed", JSON.stringify(next));
      return next;
    });
  };

  const handleTabClick = (item: (typeof primaryTabs)[0], e: React.MouseEvent) => {
    if (item.isAction) {
      e.preventDefault();
      if (item.href === "#menu") {
        setIsMenuOpen(true);
      }
    }
  };

  const handleAddClick = () => {
    if (onAddClick) {
      onAddClick();
    }
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Floating Add Button - Bottom right, above nav bar */}
      <button
        onClick={handleAddClick}
        className="floating-nav-button md:hidden fixed right-4 w-14 h-14 rounded-full bg-[#0070f3] text-white flex items-center justify-center shadow-lg z-40 active:scale-95 transition-transform tap-none"
        style={{ bottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}
        aria-label="Add expense"
      >
        {icons.plus}
      </button>

      {/* Bottom Tab Bar - Only visible on mobile */}
      <nav className="mobile-nav-bar md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 pb-safe-bottom">
        <div className="flex items-center justify-around h-16">
          {primaryTabs.map((item) => {
            const active = !item.isAction && isActive(item.href);

            if (item.isAction) {
              return (
                <button
                  key={item.key}
                  onClick={(e) => handleTabClick(item, e)}
                  className="flex flex-col items-center justify-center w-16 h-full tap-none transition-colors text-slate-500 active:text-slate-900"
                >
                  {icons[item.icon]}
                  <span className="text-xs mt-0.5">{t(item.key)}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex flex-col items-center justify-center w-16 h-full tap-none transition-colors ${
                  active
                    ? "text-[#0070f3]"
                    : "text-slate-500 active:text-slate-900"
                }`}
              >
                {icons[item.icon]}
                <span className="text-xs mt-0.5">{t(item.key)}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Drawer Menu Overlay */}
      {isMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-50"
          onClick={() => setIsMenuOpen(false)}
        />
      )}

      {/* Drawer Menu */}
      <div
        className={`md:hidden fixed top-0 right-0 bottom-0 w-72 max-w-[80vw] bg-white z-50 transform transition-transform duration-300 ease-out flex flex-col ${
          isMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer Header - fixed at top */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 pt-safe flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900">{t("menu")}</h2>
            {userEmail && (
              <p className="text-xs text-slate-500 truncate">{userEmail}</p>
            )}
          </div>
          <button
            onClick={() => setIsMenuOpen(false)}
            className="p-2 -mr-2 rounded-lg text-slate-500 active:bg-slate-100 tap-none flex-shrink-0"
          >
            {icons.close}
          </button>
        </div>

        {/* Navigation Items - scrollable */}
        <div className="flex-1 overflow-y-auto scroll-touch scrollbar-hide">
          {navGroups.map((group, groupIndex) => {
            const hasActiveItem = group.items.some((item) => isActive(item.href));
            const isCollapsed = group.label && !hasActiveItem ? collapsedSections[group.label] : false;

            return (
              <div key={groupIndex}>
                {/* Section header or divider */}
                {group.label ? (
                  <button
                    onClick={() => group.collapsible && toggleSection(group.label!)}
                    className={`w-full flex items-center justify-between px-5 py-1.5 mt-4 mb-0.5 ${
                      group.collapsible ? "cursor-pointer active:bg-slate-50" : "cursor-default"
                    }`}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {t(group.label)}
                    </span>
                    {group.collapsible && (
                      <svg
                        className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </button>
                ) : groupIndex > 0 ? (
                  <div className="my-2 border-t border-slate-100" />
                ) : null}

                {/* Nav items with collapse animation */}
                <div
                  className={`overflow-hidden transition-all duration-200 ${
                    isCollapsed ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100"
                  }`}
                >
                  <nav className="px-2 space-y-0.5">
                    {group.items.map((item) => {
                      const active = isActive(item.href);
                      const badgeCount = item.badgeKey ? badgeCounts[item.badgeKey] : 0;

                      return (
                        <Link
                          key={item.key}
                          href={item.href}
                          onClick={() => setIsMenuOpen(false)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors tap-none ${
                            active
                              ? "bg-[#0070f3] text-white"
                              : "text-slate-700 active:bg-slate-100"
                          }`}
                        >
                          {icons[item.icon]}
                          <span className="flex-1">{t(item.key)}</span>
                          {badgeCount > 0 && (
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                              active
                                ? "bg-white/20 text-white"
                                : "bg-amber-100 text-amber-700"
                            }`}>
                              {badgeCount > 99 ? "99+" : badgeCount}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer - fixed at bottom */}
        <div className="flex-shrink-0 border-t border-slate-200 p-3 pb-safe space-y-2">
          {/* Sign Out Button */}
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 bg-red-50 active:bg-red-100 tap-none transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {t("signOut")}
            </button>
          )}
          {/* Build Version */}
          <div className="text-center text-[10px] text-slate-400">
            <span>Build: {process.env.NEXT_PUBLIC_BUILD_ID || "dev"}</span>
            <span className="mx-1">•</span>
            <span>{process.env.NEXT_PUBLIC_BUILD_DATE || ""}</span>
          </div>
        </div>
      </div>
    </>
  );
}
