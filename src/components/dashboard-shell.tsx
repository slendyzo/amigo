"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import MobileNav from "./mobile-nav";
import WorkspaceSwitcher from "./workspace-switcher";
import {
  LayoutDashboard,
  Sparkles,
  Wallet,
  TrendingUp,
  Link as LinkIcon,
  Home,
  Car,
  List,
  DollarSign,
  Repeat,
  Upload,
  Tag,
  Wand2,
  CreditCard,
  KeyRound,
  Folder,
  Settings,
  Inbox,
  Users,
  Bell,
  ChevronDown,
} from "lucide-react";
import type { ReactNode, ComponentType } from "react";

// Lazy-load non-critical shell components
const GlobalAddButton = lazy(() => import("./global-add-button"));
const FeedbackButton = lazy(() => import("./feedback-button"));
const IOSInstallPrompt = lazy(() => import("./ios-install-prompt"));
const AnnouncementModal = lazy(() => import("./announcement-modal"));
const AiConsentModal = lazy(() => import("./ai-consent-modal"));
const OfflineIndicator = lazy(() => import("./offline-indicator").then(mod => ({ default: mod.OfflineIndicator })));
const ServiceWorkerRegister = lazy(() => import("./service-worker-register").then(mod => ({ default: mod.ServiceWorkerRegister })));
const ChangelogModal = lazy(() => import("./changelog-modal").then(mod => ({ default: mod.ChangelogModal })));

const CURRENT_ANNOUNCEMENT_ID = "category-groups-v1";

// ---------- Forest & Bracket sidebar IA ----------
type IconKey =
  | "painel"
  | "retrospective"
  | "summary"
  | "holdings"
  | "exchanges"
  | "property"
  | "vehicles"
  | "expenses"
  | "incomes"
  | "recurring"
  | "import"
  | "categories"
  | "tidyUp"
  | "accounts"
  | "mappings"
  | "projects"
  | "settings"
  | "inbox"
  | "workspace";

type NavItem = {
  key: string;
  href: string;
  icon: IconKey;
  badgeKey?: string;
  aiOnly?: boolean;
};

type NavGroup = {
  labelKey?: string;
  items: NavItem[];
};

const navigationGroups: NavGroup[] = [
  {
    labelKey: "sectionVision",
    items: [
      { key: "dashboard", href: "/dashboard", icon: "painel" },
      { key: "retrospective", href: "/dashboard/insights", icon: "retrospective", aiOnly: true },
    ],
  },
  {
    labelKey: "sectionPatrimonio",
    items: [
      { key: "networth", href: "/dashboard/networth", icon: "summary" },
      { key: "holdings", href: "/dashboard/portfolio", icon: "holdings" },
      { key: "exchanges", href: "/dashboard/portfolio/exchanges", icon: "exchanges" },
    ],
  },
  {
    labelKey: "sectionFinances",
    items: [
      { key: "expenses", href: "/dashboard/expenses", icon: "expenses" },
      { key: "incomes", href: "/dashboard/incomes", icon: "incomes" },
      { key: "recurring", href: "/dashboard/recurring", icon: "recurring" },
    ],
  },
  {
    labelKey: "sectionTools",
    items: [
      { key: "import", href: "/dashboard/import", icon: "import" },
      { key: "categories", href: "/dashboard/categories", icon: "categories" },
      { key: "tidyUp", href: "/dashboard/tidy-up", icon: "tidyUp", badgeKey: "uncategorizedCount" },
      { key: "accounts", href: "/dashboard/accounts", icon: "accounts" },
      { key: "mappings", href: "/dashboard/mappings", icon: "mappings" },
      { key: "projects", href: "/dashboard/projects", icon: "projects" },
    ],
  },
  {
    labelKey: "sectionAccount",
    items: [
      { key: "settings", href: "/dashboard/settings", icon: "settings" },
      { key: "workspace", href: "/dashboard/workspace", icon: "workspace" },
    ],
  },
];

const adminItem: NavItem = { key: "inbox", href: "/dashboard/inbox", icon: "inbox" };

const iconFor: Record<IconKey, ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  painel: LayoutDashboard,
  retrospective: Sparkles,
  summary: Wallet,
  holdings: TrendingUp,
  exchanges: LinkIcon,
  property: Home,
  vehicles: Car,
  expenses: List,
  incomes: DollarSign,
  recurring: Repeat,
  import: Upload,
  categories: Tag,
  tidyUp: Wand2,
  accounts: CreditCard,
  mappings: KeyRound,
  projects: Folder,
  settings: Settings,
  inbox: Inbox,
  workspace: Users,
};

// ---------- Brand mark ----------
function BracketMark({ size = 22, ink = "var(--paper)", accent = "var(--gilt-soft)" }: { size?: number; ink?: string; accent?: string }) {
  return (
    <span
      className="bracket-mark"
      style={{
        fontFamily: "var(--font-italic)",
        fontStyle: "italic",
        fontWeight: 400,
        fontSize: size,
        lineHeight: 1,
        color: ink,
        letterSpacing: "-0.02em",
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      <span>(</span>
      <span
        style={{
          width: size * 0.18,
          height: size * 0.18,
          minWidth: 3,
          minHeight: 3,
          borderRadius: "50%",
          background: accent,
          display: "inline-block",
          margin: `0 ${size * 0.04}px`,
          alignSelf: "center",
          flexShrink: 0,
        }}
      />
      <span>)</span>
    </span>
  );
}

interface DashboardShellProps {
  children: ReactNode;
  userEmail?: string;
  workspaceName?: string;
  workspaceType?: "PERSONAL" | "SHARED";
}

export default function DashboardShell({
  children,
  userEmail,
  workspaceName,
  workspaceType,
}: DashboardShellProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [showAiConsent, setShowAiConsent] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});

  // AI consent on mount
  useEffect(() => {
    fetch("/api/user/ai-consent")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.aiConsentAt === null) setShowAiConsent(true);
        if (data.aiProcessingEnabled) setAiEnabled(true);
      })
      .catch(() => {});
  }, []);

  // Tidy-up badge count
  useEffect(() => {
    fetch("/api/expenses/uncategorized-count")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.count > 0) setBadgeCounts((prev) => ({ ...prev, uncategorizedCount: data.count }));
      })
      .catch(() => {});
  }, []);

  const handleSignOut = () => signOut({ callbackUrl: "/" });
  const handleAddClick = () => window.dispatchEvent(new CustomEvent("openQuickAdd"));

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const isAdmin = userEmail === "kikoman200@gmail.com";

  // Hide AI-gated items unless enabled
  const filteredGroups = navigationGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.aiOnly || aiEnabled),
  }));

  return (
    <div className="flex min-h-screen bg-paper">
      {/* ===================== Sidebar (desktop) ===================== */}
      <aside
        className="hidden md:flex w-[240px] min-h-screen flex-col"
        style={{
          background: "var(--forest)",
          color: "var(--paper)",
        }}
      >
        {/* Brand */}
        <div className="px-6 pt-7 pb-3">
          <Link href="/dashboard" className="inline-flex items-baseline gap-2.5 outline-none">
            <BracketMark size={26} />
            <span
              className="text-[22px] leading-none"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 360,
                letterSpacing: "-0.02em",
                color: "var(--paper)",
              }}
            >
              amigo
            </span>
          </Link>
        </div>

        {/* Workspace switcher */}
        <div className="px-4 pb-4">
          <div
            className="rounded-md px-3 py-2.5"
            style={{
              background: "var(--forest-deep)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <WorkspaceSwitcher
              currentWorkspaceName={workspaceName}
              currentWorkspaceType={workspaceType}
            />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 pb-4 overflow-y-auto">
          {filteredGroups.map((group, gi) => (
            <div key={gi} className="mt-4 first:mt-1">
              {group.labelKey && (
                <div
                  className="px-4 pb-1.5 text-[10px] font-medium uppercase"
                  style={{
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.18em",
                    color: "var(--gilt-soft)",
                    opacity: 0.85,
                  }}
                >
                  {t(group.labelKey)}
                </div>
              )}
              <ul className="space-y-px">
                {group.items.map((item) => {
                  const Icon = iconFor[item.icon];
                  const active = isActive(item.href);
                  const badge = item.badgeKey ? badgeCounts[item.badgeKey] : 0;
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        className="relative flex items-center gap-2.5 px-4 py-1.5 text-[13.5px] outline-none"
                        style={{
                          color: active ? "var(--paper)" : "rgba(241,235,221,0.78)",
                          background: active ? "var(--forest-deep)" : "transparent",
                          transition: "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
                        }}
                        onMouseEnter={(e) => {
                          if (!active) e.currentTarget.style.background = "var(--forest-soft)";
                        }}
                        onMouseLeave={(e) => {
                          if (!active) e.currentTarget.style.background = "transparent";
                        }}
                      >
                        {active && (
                          <span
                            aria-hidden
                            className="absolute left-0 top-1.5 bottom-1.5 w-[2px]"
                            style={{ background: "var(--gilt-soft)" }}
                          />
                        )}
                        <Icon size={15} strokeWidth={1.6} />
                        <span className="flex-1">{t(item.key)}</span>
                        {badge > 0 && (
                          <span
                            className="text-[10px] px-1.5 py-px rounded-full"
                            style={{
                              fontFamily: "var(--font-mono)",
                              background: "var(--gilt-deep)",
                              color: "var(--paper)",
                            }}
                          >
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {/* Admin */}
          {isAdmin && (
            <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <ul className="space-y-px">
                {[adminItem].map((item) => {
                  const Icon = iconFor[item.icon];
                  const active = isActive(item.href);
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        className="relative flex items-center gap-2.5 px-4 py-1.5 text-[13.5px] outline-none"
                        style={{
                          color: active ? "var(--paper)" : "var(--gilt-soft)",
                          background: active ? "var(--forest-deep)" : "transparent",
                        }}
                      >
                        <Icon size={15} strokeWidth={1.6} />
                        <span className="flex-1">{t(item.key)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* What's New */}
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <button
              onClick={() => setShowAnnouncement(true)}
              className="w-full flex items-center gap-2.5 px-4 py-1.5 text-[12.5px] outline-none cursor-pointer"
              style={{
                color: "var(--gilt-soft)",
                background: "transparent",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.04em",
              }}
            >
              <Bell size={14} strokeWidth={1.6} />
              <span>{t("whatsNew")}</span>
            </button>
          </div>
        </nav>

        {/* Footer */}
        <div className="px-6 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div
            className="text-[10px] mb-1"
            style={{
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.18em",
              color: "var(--gilt-soft)",
              opacity: 0.85,
            }}
          >
            SESSÃO
          </div>
          <div className="text-[12px]" style={{ color: "rgba(241,235,221,0.7)" }}>
            {userEmail || "—"}
          </div>
          <div
            className="mt-2 text-[10px]"
            style={{
              fontFamily: "var(--font-mono)",
              color: "rgba(241,235,221,0.45)",
              letterSpacing: "0.04em",
            }}
          >
            v0.4.0 · {process.env.NEXT_PUBLIC_BUILD_ID || "dev"}
          </div>
        </div>
      </aside>

      {/* ===================== Main ===================== */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Desktop topbar */}
        <header
          className="hidden md:flex h-16 items-center justify-between px-8"
          style={{ background: "var(--paper)", borderBottom: "1px solid var(--rule)" }}
        >
          <div className="flex-1 flex items-center gap-4 max-w-[480px]">
            <div
              className="flex-1 h-9 rounded-md px-3.5 flex items-center gap-2.5 cursor-text text-[13px]"
              style={{
                background: "var(--paper-deep)",
                border: "1px solid var(--rule)",
                color: "var(--ink-mute)",
              }}
            >
              <span
                className="text-[11px] uppercase"
                style={{
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.18em",
                  color: "var(--ink-faint)",
                }}
              >
                Procurar
              </span>
              <span className="flex-1" />
              <span
                className="text-[10.5px]"
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--ink-faint)",
                  letterSpacing: "0.06em",
                }}
              >
                ⌘ K
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleAddClick}
              className="w-9 h-9 rounded-md grid place-items-center cursor-pointer outline-none"
              style={{
                color: "var(--ink-mute)",
                background: "transparent",
                transition: "background var(--dur-fast) var(--ease-out)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--paper-soft)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              aria-label="Adicionar despesa"
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              onClick={handleSignOut}
              className="px-3.5 py-1.5 rounded-md text-[12.5px]"
              style={{
                color: "var(--ink-mute)",
                background: "transparent",
                border: "1px solid var(--rule)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--paper-soft)";
                e.currentTarget.style.color = "var(--ink)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--ink-mute)";
              }}
            >
              {t("signOut")}
            </button>
            <ChevronDown
              size={14}
              strokeWidth={1.6}
              style={{ color: "var(--ink-faint)" }}
              aria-hidden
            />
          </div>
        </header>

        {/* Mobile header */}
        <header
          className="md:hidden h-14 flex items-center justify-center px-4 sticky top-0 z-40"
          style={{ background: "var(--paper)", borderBottom: "1px solid var(--rule)" }}
        >
          <Link href="/dashboard" className="inline-flex items-baseline gap-2 outline-none">
            <BracketMark size={20} ink="var(--ink)" accent="var(--gilt)" />
            <span
              className="text-[18px] leading-none"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 360,
                letterSpacing: "-0.02em",
                color: "var(--ink)",
              }}
            >
              amigo
            </span>
          </Link>
        </header>

        {/* Main content */}
        <main className="flex-1 p-4 md:p-8 pb-36 md:pb-8 overflow-x-hidden min-h-[calc(100vh-3.5rem)] md:min-h-0">
          {children}
        </main>
      </div>

      {/* Mobile nav */}
      <MobileNav onAddClick={handleAddClick} userEmail={userEmail} onSignOut={handleSignOut} />

      <Suspense fallback={null}>
        <GlobalAddButton />
      </Suspense>
      <Suspense fallback={null}>
        <FeedbackButton />
      </Suspense>
      <Suspense fallback={null}>
        <IOSInstallPrompt />
      </Suspense>

      {showAiConsent && (
        <Suspense fallback={null}>
          <AiConsentModal isOpen={showAiConsent} onClose={() => setShowAiConsent(false)} />
        </Suspense>
      )}
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

      <Suspense fallback={null}>
        <OfflineIndicator />
      </Suspense>
      <Suspense fallback={null}>
        <ServiceWorkerRegister />
      </Suspense>
      <Suspense fallback={null}>
        <ChangelogModal />
      </Suspense>
    </div>
  );
}
