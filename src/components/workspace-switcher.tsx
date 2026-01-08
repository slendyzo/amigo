"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "SHARED";
  role: string;
  isOwner: boolean;
  isActive: boolean;
  memberCount: number;
}

interface WorkspaceSwitcherProps {
  currentWorkspaceName?: string;
  currentWorkspaceType?: "PERSONAL" | "SHARED";
}

export default function WorkspaceSwitcher({
  currentWorkspaceName = "Personal",
  currentWorkspaceType = "PERSONAL",
}: WorkspaceSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const t = useTranslations("workspace");

  // Fetch workspaces when dropdown opens
  useEffect(() => {
    if (isOpen && workspaces.length === 0) {
      fetchWorkspaces();
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchWorkspaces = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/workspaces");
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data);
      }
    } catch (error) {
      console.error("Failed to fetch workspaces:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitch = async (workspaceId: string) => {
    if (isSwitching) return;

    setIsSwitching(true);
    try {
      const res = await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });

      if (res.ok) {
        setIsOpen(false);
        // Refresh the page to load new workspace data
        router.refresh();
        window.location.reload();
      }
    } catch (error) {
      console.error("Failed to switch workspace:", error);
    } finally {
      setIsSwitching(false);
    }
  };

  const activeWorkspace = workspaces.find((w) => w.isActive);
  const displayName = activeWorkspace?.name || currentWorkspaceName;
  const displayType = activeWorkspace?.type || currentWorkspaceType;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {/* Workspace Icon */}
          <div
            className={`w-6 h-6 rounded flex items-center justify-center text-xs font-medium ${
              displayType === "SHARED"
                ? "bg-blue-100 text-blue-600"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {displayType === "SHARED" ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-900 truncate max-w-[120px]">
              {displayName}
            </div>
          </div>
        </div>
        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
          {isLoading ? (
            <div className="px-4 py-3 text-sm text-slate-500 text-center">
              {t("loading") || "Loading..."}
            </div>
          ) : (
            <>
              {/* Workspace List */}
              <div className="max-h-64 overflow-y-auto">
                {workspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    onClick={() => !workspace.isActive && handleSwitch(workspace.id)}
                    disabled={workspace.isActive || isSwitching}
                    className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors ${
                      workspace.isActive
                        ? "bg-blue-50 cursor-default"
                        : "hover:bg-slate-50 cursor-pointer"
                    } ${isSwitching ? "opacity-50" : ""}`}
                  >
                    {/* Icon */}
                    <div
                      className={`w-8 h-8 rounded flex items-center justify-center ${
                        workspace.type === "SHARED"
                          ? "bg-blue-100 text-blue-600"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {workspace.type === "SHARED" ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {workspace.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {workspace.type === "SHARED"
                          ? `${workspace.memberCount} ${workspace.memberCount === 1 ? t("member") || "member" : t("members") || "members"}`
                          : t("personal") || "Personal"}
                        {workspace.role !== "MEMBER" && ` · ${workspace.role}`}
                      </div>
                    </div>

                    {/* Active Indicator */}
                    {workspace.isActive && (
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>

              {/* Divider */}
              <div className="my-1 border-t border-slate-200" />

              {/* Actions */}
              <Link
                href="/dashboard/workspace"
                onClick={() => setIsOpen(false)}
                className="w-full px-4 py-2 flex items-center gap-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {t("manageWorkspace") || "Manage Workspace"}
              </Link>

              <Link
                href="/dashboard/workspace?create=true"
                onClick={() => setIsOpen(false)}
                className="w-full px-4 py-2 flex items-center gap-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t("createWorkspace") || "Create Workspace"}
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
