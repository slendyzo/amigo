"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import MobileNav from "./mobile-nav";
import WorkspaceSwitcher from "./workspace-switcher";
import type { ReactNode } from "react";

// Lazy-load non-critical shell components
const GlobalAddButton = lazy(() => import("./global-add-button"));
const FeedbackButton = lazy(() => import("./feedback-button"));
const IOSInstallPrompt = lazy(() => import("./ios-install-prompt"));
const AnnouncementModal = lazy(() => import("./announcement-modal"));
const AiConsentModal = lazy(() => import("./ai-consent-modal"));
const OfflineIndicator = lazy(() => import("./offline-indicator").then(mod => ({ default: mod.OfflineIndicator })));
const ServiceWorkerRegister = lazy(() => import("./service-worker-register").then(mod => ({ default: mod.ServiceWorkerRegister })));
const ChangelogModal = lazy(() => import("./changelog-modal").then(mod => ({ default: mod.ChangelogModal })));

// Current announcement ID - should match the one in overview-client.tsx
const CURRENT_ANNOUNCEMENT_ID = "category-groups-v1";

// Navigation grouped by section with labels and collapsible support
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

const navigationGroups: NavGroup[] = [
  {
    items: [
      { key: "dashboard", href: "/dashboard", icon: "layout" },
    ],
  },
  {
    label: "sectionPortfolio",
    collapsible: true,
    items: [
      { key: "holdings", href: "/dashboard/portfolio", icon: "trending-up" },
      { key: "networth", href: "/dashboard/networth", icon: "wallet" },
      { key: "exchanges", href: "/dashboard/portfolio/exchanges", icon: "link" },
    ],
  },
  {
    label: "sectionFinances",
    collapsible: true,
    items: [
      { key: "expenses", href: "/dashboard/expenses", icon: "list" },
      { key: "incomes", href: "/dashboard/incomes", icon: "dollar" },
      { key: "recurring", href: "/dashboard/recurring", icon: "repeat" },
    ],
  },
  {
    label: "sectionTools",
    collapsible: true,
    items: [
      { key: "import", href: "/dashboard/import", icon: "upload" },
      { key: "categories", href: "/dashboard/categories", icon: "tag" },
      { key: "tidyUp", href: "/dashboard/tidy-up", icon: "wand", badgeKey: "uncategorizedCount" },
      { key: "accounts", href: "/dashboard/accounts", icon: "credit-card" },
      { key: "mappings", href: "/dashboard/mappings", icon: "key" },
      { key: "projects", href: "/dashboard/projects", icon: "folder" },
    ],
  },
  {
    items: [
      { key: "settings", href: "/dashboard/settings", icon: "settings" },
    ],
  },
];

// Admin-only navigation items
const adminItems: NavItem[] = [
  { key: "inbox", href: "/dashboard/inbox", icon: "inbox" },
];

const icons: Record<string, ReactNode> = {
  home: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  layout: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zm10-3a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z"/>
    </svg>
  ),
  link: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
    </svg>
  ),
  list: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  ),
  dollar: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  folder: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  ),
  tag: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  ),
  "credit-card": (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  upload: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  ),
  key: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  ),
  repeat: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  history: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  inbox: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
  ),
  sparkles: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  ),
  "trending-up": (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  wand: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  ),
  wallet: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 12h2m-2 0a1 1 0 11-2 0 1 1 0 012 0zM3 9h18" />
    </svg>
  ),
  "bar-chart": (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
};

interface DashboardShellProps {
  children: ReactNode;
  userEmail?: string;
  workspaceName?: string;
  workspaceType?: "PERSONAL" | "SHARED";
}

export default function DashboardShell({ children, userEmail, workspaceName, workspaceType }: DashboardShellProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [showAiConsent, setShowAiConsent] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Load collapsed state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("amigo-sidebar-collapsed");
      if (stored) setCollapsedSections(JSON.parse(stored));
    } catch {}
  }, []);

  // Check AI consent on mount — show modal if user has never been asked; track enabled state for nav gating
  useEffect(() => {
    fetch("/api/user/ai-consent")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          if (data.aiConsentAt === null) setShowAiConsent(true);
          if (data.aiProcessingEnabled) setAiEnabled(true);
        }
      })
      .catch(() => {});
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

  const handleSignOut = () => {
    signOut({ callbackUrl: "/" });
  };

  // Global quick-add functionality (dispatches custom event that pages can listen to)
  const handleAddClick = () => {
    window.dispatchEvent(new CustomEvent("openQuickAdd"));
  };

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop Sidebar - Hidden on mobile */}
      <aside className="hidden md:flex w-64 bg-white border-r border-slate-200 min-h-screen flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-slate-200">
          <Link href="/dashboard" className="text-xl font-bold text-slate-900">
            Amigo
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-3 overflow-y-auto">
          {navigationGroups.map((group, groupIndex) => {
            // Auto-expand section if it contains the active route
            const hasActiveItem = group.items.some((item) => isActive(item.href));
            const isCollapsed = group.label && !hasActiveItem ? collapsedSections[group.label] : false;

            return (
              <div key={groupIndex}>
                {/* Section header or divider */}
                {group.label ? (
                  <button
                    onClick={() => group.collapsible && toggleSection(group.label!)}
                    className={`w-full flex items-center justify-between px-3 py-1.5 mt-5 mb-1 rounded-md ${
                      group.collapsible ? "cursor-pointer hover:bg-slate-50" : "cursor-default"
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
                  <div className="my-3 border-t border-slate-200" />
                ) : null}

                {/* Nav items with collapse animation */}
                <div
                  className={`space-y-0.5 overflow-hidden transition-all duration-200 ${
                    isCollapsed ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100"
                  }`}
                >
                  {group.items.map((item) => {
                    const active = isActive(item.href);
                    const badgeCount = item.badgeKey ? badgeCounts[item.badgeKey] : 0;

                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        className={`
                          flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                          ${active
                            ? "bg-[#0070f3] text-white"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          }
                        `}
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
                </div>
              </div>
            );
          })}

          {/* Admin-only section */}
          {userEmail === "kikoman200@gmail.com" && (
            <div>
              <div className="my-3 border-t border-slate-200" />
              <div className="space-y-0.5">
                {adminItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={`
                        flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                        ${active
                          ? "bg-amber-500 text-white"
                          : "text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                        }
                      `}
                    >
                      {icons[item.icon]}
                      {t(item.key)}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Insights link — only shown to users who enabled AI processing */}
          {aiEnabled && (
            <div>
              <div className="my-3 border-t border-slate-200" />
              <Link
                href="/dashboard/insights"
                className={`
                  flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${isActive("/dashboard/insights")
                    ? "bg-[#0070f3] text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }
                `}
              >
                {icons["bar-chart"]}
                <span>{t("insights")}</span>
              </Link>
            </div>
          )}

          {/* What's New button */}
          <div>
            <div className="my-3 border-t border-slate-200" />
            <button
              onClick={() => setShowAnnouncement(true)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
            >
              {icons.sparkles}
              {t("whatsNew")}
            </button>
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200">
          <div className="text-xs text-slate-400">
            <div>Amigo v0.3.0</div>
            <div className="mt-1 opacity-75">
              Build: {process.env.NEXT_PUBLIC_BUILD_ID || "dev"}<br />
              {process.env.NEXT_PUBLIC_BUILD_DATE || new Date().toLocaleDateString("en-GB")}
            </div>
            <div className="mt-2">
              <a
                href="https://github.com/slendyzo/amigo"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-600"
              >
                GitHub
              </a>
              {" · "}
              <Link href="/terms" className="hover:text-slate-600">
                Terms
              </Link>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Desktop Top Bar - Hidden on mobile */}
        <header className="hidden md:flex h-16 bg-white border-b border-slate-200 items-center justify-between px-6">
          {/* Workspace Switcher */}
          <WorkspaceSwitcher
            currentWorkspaceName={workspaceName}
            currentWorkspaceType={workspaceType}
          />

          {/* User Info */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">
              {userEmail}
            </span>
            <button
              onClick={handleSignOut}
              className="text-sm text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              {t("signOut")}
            </button>
          </div>
        </header>

        {/* Mobile Header */}
        <header className="md:hidden flex h-14 bg-white border-b border-slate-200 items-center justify-center px-4 sticky top-0 z-40">
          <h1 className="text-lg font-semibold text-slate-900">Amigo</h1>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6 pb-36 md:pb-6 overflow-x-hidden min-h-[calc(100vh-3.5rem)] md:min-h-0">
          {children}
        </main>
      </div>

      {/* Mobile Navigation */}
      <MobileNav
        onAddClick={handleAddClick}
        userEmail={userEmail}
        onSignOut={handleSignOut}
      />

      {/* Global Add Button (desktop floating button + modal) */}
      <Suspense fallback={null}>
        <GlobalAddButton />
      </Suspense>

      {/* Feedback Button */}
      <Suspense fallback={null}>
        <FeedbackButton />
      </Suspense>

      {/* iOS Install Prompt */}
      <Suspense fallback={null}>
        <IOSInstallPrompt />
      </Suspense>

      {/* AI Consent Modal — shown before announcement if user has never been asked */}
      {showAiConsent && (
        <Suspense fallback={null}>
          <AiConsentModal
            isOpen={showAiConsent}
            onClose={() => setShowAiConsent(false)}
          />
        </Suspense>
      )}

      {/* What's New Announcement Modal */}
      {!showAiConsent && showAnnouncement && (
        <Suspense fallback={null}>
          <AnnouncementModal
            isOpen={showAnnouncement}
            onClose={() => setShowAnnouncement(false)}
            announcementId={CURRENT_ANNOUNCEMENT_ID}
            viewOnly
          />
        </Suspense>
      )}

      {/* Offline Indicator */}
      <Suspense fallback={null}>
        <OfflineIndicator />
      </Suspense>

      {/* Service Worker Registration */}
      <Suspense fallback={null}>
        <ServiceWorkerRegister />
      </Suspense>

      {/* Changelog Modal */}
      <Suspense fallback={null}>
        <ChangelogModal />
      </Suspense>
    </div>
  );
}
