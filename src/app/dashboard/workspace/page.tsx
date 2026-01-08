"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface Member {
  id: string;
  userId: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    username: string | null;
  };
  joinedAt: string;
  isCurrentUser: boolean;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  invitedBy: { name: string | null; email: string };
  expiresAt: string;
  createdAt: string;
}

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "SHARED";
  role: string;
  isOwner: boolean;
  defaultCurrency: string;
  language: string;
  stats: {
    members: number;
    expenses: number;
    projects: number;
    categories: number;
  };
}

export default function WorkspacePage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form state
  const [inviteIdentifier, setInviteIdentifier] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Create workspace form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Edit workspace state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");

  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("workspace");

  // Check if we should show create modal on load
  useEffect(() => {
    if (searchParams.get("create") === "true") {
      setShowCreateModal(true);
    }
  }, [searchParams]);

  // Fetch workspace data
  useEffect(() => {
    fetchWorkspaceData();
  }, []);

  const fetchWorkspaceData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get list of workspaces to find active one
      const workspacesRes = await fetch("/api/workspaces");
      if (!workspacesRes.ok) throw new Error("Failed to fetch workspaces");
      const workspaces = await workspacesRes.json();

      const activeWorkspace = workspaces.find((w: { isActive: boolean }) => w.isActive);
      if (!activeWorkspace) throw new Error("No active workspace found");

      // Get detailed workspace info
      const detailRes = await fetch(`/api/workspaces/${activeWorkspace.id}`);
      if (!detailRes.ok) throw new Error("Failed to fetch workspace details");
      const detail = await detailRes.json();

      setWorkspace({ ...activeWorkspace, ...detail });
      setEditName(detail.name);

      // Fetch members
      const membersRes = await fetch(`/api/workspaces/${activeWorkspace.id}/members`);
      if (membersRes.ok) {
        const membersData = await membersRes.json();
        setMembers(membersData);
      }

      // Fetch invitations (only if user can invite)
      if (activeWorkspace.role === "OWNER" || activeWorkspace.role === "ADMIN") {
        const invitesRes = await fetch(`/api/workspaces/${activeWorkspace.id}/invitations`);
        if (invitesRes.ok) {
          const invitesData = await invitesRes.json();
          setInvitations(invitesData);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !inviteIdentifier.trim()) return;

    setIsInviting(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: inviteIdentifier.trim(),
          role: inviteRole,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send invitation");
      }

      setInviteSuccess(
        data.type === "existing_user"
          ? `Invitation sent to ${data.user.name || data.invitation.email}`
          : `Invitation email sent to ${data.invitation.email}`
      );
      setInviteIdentifier("");

      // Refresh invitations
      const invitesRes = await fetch(`/api/workspaces/${workspace.id}/invitations`);
      if (invitesRes.ok) {
        setInvitations(await invitesRes.json());
      }
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to send invitation");
    } finally {
      setIsInviting(false);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!workspace) return;

    try {
      const res = await fetch(
        `/api/workspaces/${workspace.id}/invitations?invitationId=${invitationId}`,
        { method: "DELETE" }
      );

      if (res.ok) {
        setInvitations(invitations.filter((i) => i.id !== invitationId));
      }
    } catch (err) {
      console.error("Failed to cancel invitation:", err);
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!workspace) return;
    if (!confirm(`Remove ${memberName} from this workspace?`)) return;

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/members/${memberId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setMembers(members.filter((m) => m.id !== memberId));
      }
    } catch (err) {
      console.error("Failed to remove member:", err);
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    if (!workspace) return;

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/members/${memberId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (res.ok) {
        setMembers(members.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)));
      }
    } catch (err) {
      console.error("Failed to update role:", err);
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    setIsCreating(true);

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newWorkspaceName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create workspace");
      }

      const newWorkspace = await res.json();

      // Switch to new workspace
      await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: newWorkspace.id }),
      });

      setShowCreateModal(false);
      router.refresh();
      window.location.reload();
    } catch (err) {
      console.error("Failed to create workspace:", err);
      alert(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateWorkspace = async () => {
    if (!workspace || !editName.trim() || editName === workspace.name) {
      setIsEditing(false);
      return;
    }

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });

      if (res.ok) {
        setWorkspace({ ...workspace, name: editName.trim() });
        setIsEditing(false);
        router.refresh();
      }
    } catch (err) {
      console.error("Failed to update workspace:", err);
    }
  };

  const handleLeaveWorkspace = async () => {
    if (!workspace) return;
    if (!confirm("Are you sure you want to leave this workspace?")) return;

    const currentMember = members.find((m) => m.isCurrentUser);
    if (!currentMember) return;

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/members/${currentMember.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        router.refresh();
        window.location.reload();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to leave workspace");
      }
    } catch (err) {
      console.error("Failed to leave workspace:", err);
    }
  };

  const canInvite = workspace?.role === "OWNER" || workspace?.role === "ADMIN";
  const canManageMembers = workspace?.role === "OWNER" || workspace?.role === "ADMIN";
  const isOwner = workspace?.role === "OWNER";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error}</p>
        <button
          onClick={fetchWorkspaceData}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {t("manageWorkspace") || "Manage Workspace"}
        </h1>
        <p className="text-slate-500 mt-1">
          {t("manageWorkspaceDescription") || "Manage your workspace settings, members, and invitations."}
        </p>
      </div>

      {/* Workspace Info Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                workspace?.type === "SHARED"
                  ? "bg-blue-100 text-blue-600"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {workspace?.type === "SHARED" ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )}
            </div>
            <div>
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="px-3 py-1 border border-slate-300 rounded-lg text-lg font-semibold"
                    autoFocus
                  />
                  <button
                    onClick={handleUpdateWorkspace}
                    className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditName(workspace?.name || "");
                    }}
                    className="px-3 py-1 text-slate-600 hover:bg-slate-100 rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-slate-900">{workspace?.name}</h2>
                  {canManageMembers && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="p-1 text-slate-400 hover:text-slate-600"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  workspace?.type === "SHARED" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"
                }`}>
                  {workspace?.type === "SHARED" ? t("shared") || "Shared" : t("personal") || "Personal"}
                </span>
                <span>{workspace?.stats.members} {workspace?.stats.members === 1 ? "member" : "members"}</span>
                <span>{workspace?.stats.expenses} expenses</span>
              </div>
            </div>
          </div>
          <div className="text-sm text-slate-500">
            Your role: <span className="font-medium text-slate-700">{workspace?.role}</span>
          </div>
        </div>
      </div>

      {/* Members Section */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="p-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-900">{t("members") || "Members"}</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {members.map((member) => (
            <div key={member.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-medium">
                  {(member.user.name?.[0] || member.user.email[0]).toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-slate-900">
                    {member.user.name || member.user.email}
                    {member.isCurrentUser && (
                      <span className="ml-2 text-xs text-slate-400">(you)</span>
                    )}
                  </div>
                  <div className="text-sm text-slate-500">
                    {member.user.email}
                    {member.user.username && ` · @${member.user.username}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {canManageMembers && !member.isCurrentUser && member.role !== "OWNER" ? (
                  <select
                    value={member.role}
                    onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Member</option>
                  </select>
                ) : (
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    member.role === "OWNER"
                      ? "bg-purple-100 text-purple-700"
                      : member.role === "ADMIN"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-700"
                  }`}>
                    {member.role}
                  </span>
                )}
                {canManageMembers && !member.isCurrentUser && member.role !== "OWNER" && (
                  <button
                    onClick={() => handleRemoveMember(member.id, member.user.name || member.user.email)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                    title="Remove member"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Invite Section */}
      {canInvite && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-900 mb-4">{t("inviteMember") || "Invite Member"}</h3>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="flex gap-3">
              <input
                type="text"
                value={inviteIdentifier}
                onChange={(e) => setInviteIdentifier(e.target.value)}
                placeholder={t("invitePlaceholder") || "Username or email address"}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="px-4 py-2 border border-slate-200 rounded-lg"
                disabled={!isOwner}
              >
                <option value="MEMBER">Member</option>
                {isOwner && <option value="ADMIN">Admin</option>}
              </select>
              <button
                type="submit"
                disabled={isInviting || !inviteIdentifier.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isInviting ? "Inviting..." : t("invite") || "Invite"}
              </button>
            </div>
            {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
            {inviteSuccess && <p className="text-sm text-green-600">{inviteSuccess}</p>}
          </form>

          {/* Pending Invitations */}
          {invitations.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium text-slate-700 mb-3">
                {t("pendingInvitations") || "Pending Invitations"}
              </h4>
              <div className="space-y-2">
                {invitations.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-lg"
                  >
                    <div>
                      <div className="font-medium text-slate-900">{invite.email}</div>
                      <div className="text-xs text-slate-500">
                        Invited as {invite.role} · Expires{" "}
                        {new Date(invite.expiresAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCancelInvitation(invite.id)}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions Section */}
      {workspace?.type === "SHARED" && !isOwner && (
        <div className="bg-white rounded-xl border border-red-200 p-6">
          <h3 className="font-semibold text-red-900 mb-2">{t("dangerZone") || "Danger Zone"}</h3>
          <p className="text-sm text-slate-600 mb-4">
            {t("leaveWorkspaceWarning") || "Leaving this workspace will remove your access to all shared data."}
          </p>
          <button
            onClick={handleLeaveWorkspace}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            {t("leaveWorkspace") || "Leave Workspace"}
          </button>
        </div>
      )}

      {/* Create Workspace Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              {t("createWorkspace") || "Create Workspace"}
            </h2>
            <form onSubmit={handleCreateWorkspace}>
              <input
                type="text"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                placeholder={t("workspaceNamePlaceholder") || "Workspace name (e.g., Family, Team)"}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg mb-4"
                autoFocus
              />
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    router.replace("/dashboard/workspace");
                  }}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newWorkspaceName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isCreating ? "Creating..." : t("create") || "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
