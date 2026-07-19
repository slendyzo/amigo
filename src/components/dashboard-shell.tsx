"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import MobileNav from "./mobile-nav";
import ProfileMenu from "./profile-menu";
import type { ReactNode } from "react";

// Lazy-load non-critical shell components
const GlobalAddButton = lazy(() => import("./global-add-button"));
const FeedbackButton = lazy(() => import("./feedback-button"));
const IOSInstallPrompt = lazy(() => import("./ios-install-prompt"));
const AnnouncementModal = lazy(() => import("./announcement-modal"));
const AiConsentModal = lazy(() => import("./ai-consent-modal"));
const OfflineIndicator = lazy(() => import("./offline-indicator").then((mod) => ({ default: mod.OfflineIndicator })));
const ServiceWorkerRegister = lazy(() => import("./service-worker-register").then((mod) => ({ default: mod.ServiceWorkerRegister })));
const ChangelogModal = lazy(() => import("./changelog-modal").then((mod) => ({ default: mod.ChangelogModal })));

const CURRENT_ANNOUNCEMENT_ID = "category-groups-v1";

type NavItem = {
  key: string;
  href: string;
  icon: string;
  /** route prefixes (besides href) that should light up this item */
  match?: string[];
};

// Flat 5-item primary nav. Money & Portfolio are hubs (their sub-pages light them up).
const primaryNav: NavItem[] = [
  { key: "dashboard", href: "/dashboard", icon: "layout" },
  { key: "money", href: "/dashboard/expenses", icon: "dollar", match: ["/dashboard/incomes", "/dashboard/recurring", "/dashboard/import"] },
  { key: "portfolio", href: "/dashboard/portfolio", icon: "trending-up", match: ["/dashboard/networth", "/dashboard/exchanges"] },
  { key: "projects", href: "/dashboard/projects", icon: "folder" },
  { key: "settings", href: "/dashboard/settings", icon: "settings", match: ["/dashboard/categories", "/dashboard/mappings", "/dashboard/accounts", "/dashboard/tidy-up"] },
];

const icons: Record<string, ReactNode> = {
  layout: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zm10-3a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" />,
  dollar: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
  "trending-up": <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />,
  folder: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />,
  settings: <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>,
  "bar-chart": <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
  inbox: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />,
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
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [showAiConsent, setShowAiConsent] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [rail, setRail] = useState(false);

  const isAdmin = userEmail === "kikoman200@gmail.com";

  useEffect(() => {
    try {
      setRail(localStorage.getItem("amigo-sidebar-rail") === "1");
    } catch {}
  }, []);

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

  const toggleRail = () => {
    setRail((v) => {
      const next = !v;
      try { localStorage.setItem("amigo-sidebar-rail", next ? "1" : "0"); } catch {}
      return next;
    });
  };

  const handleSignOut = () => signOut({ callbackUrl: "/" });
  const handleAddClick = () => window.dispatchEvent(new CustomEvent("openQuickAdd"));

  const isActive = (item: NavItem) => {
    if (item.href === "/dashboard") return pathname === "/dashboard";
    if (pathname.startsWith(item.href)) return true;
    return (item.match || []).some((m) => pathname.startsWith(m));
  };

  const navLink = (item: NavItem) => {
    const active = isActive(item);
    return (
      <Link
        key={item.key}
        href={item.href}
        title={rail ? t(item.key) : undefined}
        className={`group relative flex items-center gap-3 rounded-xl text-sm font-medium transition-colors duration-200 ${rail ? "justify-center px-0 py-2.5" : "px-3 py-2.5"}`}
        style={{
          background: active ? "var(--accent-tint)" : "transparent",
          color: active ? "var(--accent)" : "var(--ink-muted)",
        }}
        onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--ink)"; } }}
        onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--ink-muted)"; } }}
      >
        {active && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r-full" style={{ background: "var(--accent)" }} />
        )}
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icons[item.icon]}</svg>
        {!rail && <span className="flex-1">{t(item.key)}</span>}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen justify-center" style={{ background: "var(--app-bg)", color: "var(--ink)" }}>
      {/* Desktop Sidebar */}
      <aside
        className="hidden md:flex flex-col min-h-screen border-r transition-[width] duration-300 relative"
        style={{ width: rail ? "68px" : "240px", background: "var(--surface)", borderColor: "var(--line)", transitionTimingFunction: "var(--ease-soft)" }}
      >
        {/* Logo */}
        <div className={`h-[60px] flex items-center gap-2.5 ${rail ? "justify-center px-0" : "px-5"}`}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[15px] flex-shrink-0"
            style={{ background: "linear-gradient(135deg, var(--accent-strong), var(--accent))", boxShadow: "0 4px 14px var(--accent-tint)" }}>
            a
          </div>
          {!rail && <span className="text-[18px] font-bold tracking-tight">Amigo</span>}
        </div>

        {/* Rail toggle */}
        <button
          onClick={toggleRail}
          aria-label="Toggle sidebar"
          className="absolute top-[64px] -right-3 w-6 h-6 rounded-full flex items-center justify-center border z-20 transition-colors"
          style={{ background: "var(--surface-2)", borderColor: "var(--line-strong)", color: "var(--ink-muted)" }}
        >
          <svg className="w-3.5 h-3.5 transition-transform duration-200" style={{ transform: rail ? "rotate(180deg)" : "none" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Nav */}
        <nav className={`flex-1 py-3 overflow-y-auto scrollbar-hide ${rail ? "px-2.5" : "px-3"} space-y-1`}>
          {primaryNav.map(navLink)}

          {(aiEnabled || isAdmin) && (
            <div className="h-px my-2 mx-2" style={{ background: "var(--line)" }} />
          )}
          {aiEnabled && navLink({ key: "insights", href: "/dashboard/insights", icon: "bar-chart" })}
          {isAdmin && navLink({ key: "inbox", href: "/dashboard/inbox", icon: "inbox" })}
        </nav>

        {/* Profile */}
        <div className="p-2.5 border-t" style={{ borderColor: "var(--line)" }}>
          <ProfileMenu
            userEmail={userEmail}
            workspaceName={workspaceName}
            workspaceType={workspaceType}
            collapsed={rail}
            onSignOut={handleSignOut}
            onWhatsNew={() => setShowAnnouncement(true)}
          />
        </div>
      </aside>

      {/* Main */}
      {/* The mobile app, centered in a phone-width column at every screen size */}
      <div className="flex flex-col min-w-0 w-full max-w-[660px]">
        {/* Mobile header */}
        <header className="md:hidden flex h-14 items-center justify-center px-4 sticky top-0 z-40 border-b"
          style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
          <h1 className="text-lg font-bold tracking-tight">Amigo</h1>
        </header>

        <main className="flex-1 px-5 py-4 pb-36 overflow-x-hidden min-h-[calc(100vh-3.5rem)]">
          {children}
        </main>
      </div>

      {/* Mobile Navigation */}
      <MobileNav onAddClick={handleAddClick} userEmail={userEmail} workspaceName={workspaceName} onSignOut={handleSignOut} aiEnabled={aiEnabled} isAdmin={isAdmin} onWhatsNew={() => setShowAnnouncement(true)} />

      <Suspense fallback={null}><GlobalAddButton /></Suspense>
      <Suspense fallback={null}><FeedbackButton /></Suspense>
      <Suspense fallback={null}><IOSInstallPrompt /></Suspense>

      {showAiConsent && (
        <Suspense fallback={null}>
          <AiConsentModal isOpen={showAiConsent} onClose={() => setShowAiConsent(false)} />
        </Suspense>
      )}
      {!showAiConsent && showAnnouncement && (
        <Suspense fallback={null}>
          <AnnouncementModal isOpen={showAnnouncement} onClose={() => setShowAnnouncement(false)} announcementId={CURRENT_ANNOUNCEMENT_ID} viewOnly />
        </Suspense>
      )}
      <Suspense fallback={null}><OfflineIndicator /></Suspense>
      <Suspense fallback={null}><ServiceWorkerRegister /></Suspense>
      <Suspense fallback={null}><ChangelogModal /></Suspense>
    </div>
  );
}
