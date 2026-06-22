"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "./theme-controls";

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "SHARED";
  role: string;
  isActive: boolean;
  memberCount: number;
}

interface ProfileMenuProps {
  userEmail?: string;
  workspaceName?: string;
  workspaceType?: "PERSONAL" | "SHARED";
  collapsed?: boolean;
  onSignOut?: () => void;
  onWhatsNew?: () => void;
}

export default function ProfileMenu({
  userEmail,
  workspaceName = "Personal",
  workspaceType = "PERSONAL",
  collapsed = false,
  onSignOut,
  onWhatsNew,
}: ProfileMenuProps) {
  const t = useTranslations("nav");
  const tw = useTranslations("workspace");
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && workspaces.length === 0) {
      fetch("/api/workspaces")
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setWorkspaces(Array.isArray(d) ? d : []))
        .catch(() => {});
    }
  }, [open, workspaces.length]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const switchWorkspace = async (id: string) => {
    if (switching) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: id }),
      });
      if (res.ok) window.location.reload();
    } finally {
      setSwitching(false);
    }
  };

  const initial = (userEmail?.[0] || "A").toUpperCase();

  return (
    <div className="relative" ref={ref}>
      {/* Popover */}
      <div
        className={`absolute bottom-[calc(100%+8px)] left-0 right-0 rounded-2xl border p-1.5 origin-bottom transition-all duration-200 z-50 ${
          open ? "opacity-100 visible scale-100 translate-y-0" : "opacity-0 invisible scale-95 translate-y-2"
        }`}
        style={{
          background: "var(--surface-2)",
          borderColor: "var(--line-strong)",
          boxShadow: "var(--shadow-pop)",
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Workspaces */}
        <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--ink-subtle)" }}>
          {tw("title") || "Workspace"}
        </div>
        <div className="max-h-48 overflow-y-auto scrollbar-hide">
          {(workspaces.length ? workspaces : [{ id: "_", name: workspaceName, type: workspaceType, role: "OWNER", isActive: true, memberCount: 1 }]).map((w) => (
            <button
              key={w.id}
              onClick={() => !w.isActive && w.id !== "_" && switchWorkspace(w.id)}
              disabled={w.isActive || switching}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors"
              style={{ background: w.isActive ? "var(--accent-tint)" : "transparent" }}
              onMouseEnter={(e) => { if (!w.isActive) e.currentTarget.style.background = "var(--surface-3)"; }}
              onMouseLeave={(e) => { if (!w.isActive) e.currentTarget.style.background = "transparent"; }}
            >
              <div className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                style={{ background: "var(--surface-3)", color: "var(--ink-muted)" }}>
                {w.type === "SHARED" ? "⊕" : w.name[0]?.toUpperCase()}
              </div>
              <span className="flex-1 text-[13px] font-medium truncate" style={{ color: "var(--ink)" }}>{w.name}</span>
              {w.isActive && (
                <svg className="w-4 h-4 flex-shrink-0" style={{ color: "var(--accent)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>

        <Link href="/dashboard/workspace?create=true" onClick={() => setOpen(false)}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors"
          style={{ color: "var(--accent)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" /></svg>
          {tw("createWorkspace") || "Create workspace"}
        </Link>

        <div className="h-px my-1.5 mx-1" style={{ background: "var(--line)" }} />

        {/* Theme */}
        <div className="px-1.5 pb-1.5"><ThemeToggle /></div>

        <div className="h-px my-1 mx-1" style={{ background: "var(--line)" }} />

        <PopItem onClick={() => { setOpen(false); onWhatsNew?.(); }}
          icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />}>
          {t("whatsNew")}
        </PopItem>
        <Link href="/dashboard/settings" onClick={() => setOpen(false)}>
          <PopItem icon={<><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>}>
            {t("settings")}
          </PopItem>
        </Link>

        <div className="h-px my-1 mx-1" style={{ background: "var(--line)" }} />

        <PopItem danger onClick={() => { setOpen(false); onSignOut?.(); }}
          icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />}>
          {t("signOut")}
        </PopItem>
      </div>

      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2.5 p-2 rounded-xl transition-colors ${collapsed ? "justify-center" : ""}`}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold text-white flex-shrink-0"
          style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)" }}>
          {initial}
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-[13px] font-semibold truncate" style={{ color: "var(--ink)" }}>{userEmail?.split("@")[0] || "Account"}</div>
              <div className="text-[11px] truncate" style={{ color: "var(--ink-subtle)" }}>{workspaceName}</div>
            </div>
            <svg className="w-4 h-4 flex-shrink-0" style={{ color: "var(--ink-subtle)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
            </svg>
          </>
        )}
      </button>
    </div>
  );
}

function PopItem({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick?: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors"
      style={{ color: danger ? "var(--negative)" : "var(--ink)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
      {children}
    </button>
  );
}
