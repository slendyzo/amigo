"use client";

/**
 * MobileTabBar — Forest & Bracket bottom navigation, 5 cells.
 *
 * Cells: Painel · Património · [FAB slot] · Despesas · Ferramentas
 * (the FAB itself is rendered separately by MobileNav so it can overlap.)
 *
 * Active tab: gilt-deep text + a small gilt dot above the label.
 * Inactive: ink-faint. No italic anywhere — General Sans labels, mono is reserved
 * for eyebrows elsewhere.
 *
 * Hides on scroll down, shows on scroll up. Respects safe-area-inset-bottom.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { LayoutDashboard, Wallet, List, Wand2, User } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

interface TabDef {
  key: string;            // i18n key under "nav"
  href?: string;          // route
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  fabSpacer?: boolean;    // center cell — rendered transparent
}

const TABS: TabDef[] = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "portfolio", href: "/dashboard/networth", icon: Wallet },
  { key: "fab", icon: LayoutDashboard, fabSpacer: true },
  { key: "expenses", href: "/dashboard/expenses", icon: List },
  { key: "sectionTools", href: "/dashboard/tidy-up", icon: Wand2 },
];

interface MobileTabBarProps {
  /** Slot for the FAB — rendered on top of the center cell. */
  centerSlot?: ReactNode;
  /** Hide-on-scroll-down behavior. Default true. */
  hideOnScroll?: boolean;
}

export default function MobileTabBar({ centerSlot, hideOnScroll = true }: MobileTabBarProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  // Hide-on-scroll-down, show-on-scroll-up
  useEffect(() => {
    if (!hideOnScroll) return;
    if (typeof window === "undefined") return;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const dy = y - lastY.current;
        if (Math.abs(dy) > 6) {
          if (dy > 0 && y > 80) setHidden(true);
          else if (dy < 0) setHidden(false);
          lastY.current = y;
        }
        ticking = false;
      });
    };
    lastY.current = window.scrollY;
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hideOnScroll]);

  const isActive = (href?: string) => {
    if (!href) return false;
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  // Use a stable label resolver so we don't crash if a key is missing on a locale.
  const label = (key: string) => {
    try {
      return t(key);
    } catch {
      return key;
    }
  };

  return (
    <nav
      role="navigation"
      aria-label="Navegação principal"
      className="md:hidden fixed inset-x-0 bottom-0 z-40"
      style={{
        background: "var(--paper)",
        borderTop: "1px solid var(--rule)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        transform: hidden ? "translateY(110%)" : "translateY(0)",
        transition: "transform 320ms cubic-bezier(0.16, 1, 0.3, 1)",
        willChange: "transform",
      }}
    >
      <div
        className="grid items-end"
        style={{
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 4,
          padding: "10px 12px 8px",
        }}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;

          if (tab.fabSpacer) {
            // Reserved center slot — render the centerSlot (FAB) on top.
            return (
              <div
                key="fab-slot"
                className="relative grid place-items-center"
                style={{ height: 1 }}
              >
                <div className="absolute inset-x-0 top-0 grid place-items-center pointer-events-none">
                  <div className="pointer-events-auto">{centerSlot}</div>
                </div>
              </div>
            );
          }

          const active = isActive(tab.href);
          const tone = active ? "var(--gilt-deep)" : "var(--ink-faint)";

          return (
            <Link
              key={tab.key}
              href={tab.href!}
              prefetch={false}
              className="flex flex-col items-center gap-1 outline-none"
              style={{
                color: tone,
                padding: "6px 4px 2px",
                textDecoration: "none",
              }}
            >
              <Icon size={16} strokeWidth={1.6} />
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 10.5,
                  fontWeight: 500,
                  letterSpacing: 0,
                  lineHeight: 1,
                  color: tone,
                }}
              >
                {label(tab.key)}
              </span>
              <span
                aria-hidden
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 999,
                  background: active ? "var(--gilt)" : "var(--ink-faint)",
                  opacity: active ? 1 : 0.5,
                  marginTop: 2,
                }}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
