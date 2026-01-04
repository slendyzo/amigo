"use client";

import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import MobileNav from "./mobile-nav";
import GlobalAddButton from "./global-add-button";
import type { ReactNode } from "react";

const navigation = [
  { name: "Overview", href: "/dashboard", icon: "home" },
  { name: "Expenses", href: "/dashboard/expenses", icon: "list" },
  { name: "Incomes", href: "/dashboard/incomes", icon: "dollar" },
  { name: "Recurring", href: "/dashboard/recurring", icon: "repeat" },
  { name: "Projects", href: "/dashboard/projects", icon: "folder" },
  { name: "Categories", href: "/dashboard/categories", icon: "tag" },
  { name: "Mappings", href: "/dashboard/mappings", icon: "key" },
  { name: "Bank Accounts", href: "/dashboard/accounts", icon: "credit-card" },
  { name: "Import", href: "/dashboard/import", icon: "upload" },
  { name: "Import History", href: "/dashboard/imports", icon: "history" },
  { name: "Settings", href: "/dashboard/settings", icon: "settings" },
];

const icons: Record<string, ReactNode> = {
  home: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
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
};

interface DashboardShellProps {
  children: ReactNode;
  userEmail?: string;
}

export default function DashboardShell({ children, userEmail }: DashboardShellProps) {
  const pathname = usePathname();

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
        <nav className="flex-1 px-4 py-6 space-y-1">
          {navigation.map((item) => {
            const active = isActive(item.href);

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${active
                    ? "bg-[#0070f3] text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }
                `}
              >
                {icons[item.icon]}
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200">
          <div className="text-xs text-slate-400">
            <div>Amigo v0.1.0</div>
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
        <header className="hidden md:flex h-16 bg-white border-b border-slate-200 items-center justify-end px-6">
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">
              {userEmail}
            </span>
            <button
              onClick={handleSignOut}
              className="text-sm text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Mobile Header */}
        <header className="md:hidden flex h-14 bg-white border-b border-slate-200 items-center justify-center px-4 sticky top-0 z-40">
          <h1 className="text-lg font-semibold text-slate-900">Amigo</h1>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-x-hidden">
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
      <GlobalAddButton />
    </div>
  );
}
