"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronDown, Pencil, Trash2, Users, User } from "lucide-react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

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

const EASE = [0.16, 1, 0.3, 1] as const;
const sectionMotion = (i: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: EASE, delay: i * 0.05 },
});
const cardShadow = { boxShadow: "var(--shadow-card)" };

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
  const tCommon = useTranslations("common");

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

  // ---- Shared token styles ----
  const ctrlStyle = {
    background: "var(--app-bg)",
    color: "var(--ink)",
    border: "1px solid var(--line-strong)",
  };
  const inputCls =
    "w-full rounded-[14px] px-4 py-2.5 text-[14px] text-[color:var(--ink)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]";

  const roleLabel = (role: string) => {
    const key = role.toLowerCase();
    if (key === "owner" || key === "admin" || key === "member") return t(`roles.${key}`);
    return role;
  };

  const roleChip = (role: string) => {
    const priv = role === "OWNER" || role === "ADMIN";
    return (
      <span
        className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
        style={
          priv
            ? { background: "var(--surface-2)", color: "var(--accent)" }
            : { background: "var(--app-bg)", color: "var(--ink-muted)" }
        }
      >
        {roleLabel(role)}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div
          className="h-8 w-8 animate-spin rounded-full border-b-2"
          style={{ borderColor: "var(--accent)" }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p style={{ color: "var(--negative)" }}>{error}</p>
        <button
          onClick={fetchWorkspaceData}
          className="mt-4 rounded-[18px] px-4 py-2 text-[14px] font-semibold"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          {tCommon("reset")}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[640px]">
      {/* Pushed header */}
      <div className="relative mb-5 flex items-center justify-center">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label={tCommon("back")}
          className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full transition-transform active:scale-[.94]"
          style={{ background: "var(--surface)", ...cardShadow }}
        >
          <ChevronLeft size={20} strokeWidth={1.8} style={{ color: "var(--ink)" }} />
        </button>
        <h1 className="text-[16px] font-semibold" style={{ color: "var(--ink)" }}>
          {t("manageWorkspace")}
        </h1>
        <div className="absolute right-0 h-10 w-10" />
      </div>

      <div className="flex flex-col gap-[18px]">
        {/* Workspace info card */}
        <motion.section
          {...sectionMotion(0)}
          className="rounded-[20px] p-4"
          style={{ background: "var(--surface)", ...cardShadow }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
                style={
                  workspace?.type === "SHARED"
                    ? { background: "var(--surface-2)", color: "var(--accent)" }
                    : { background: "var(--app-bg)", color: "var(--ink-muted)" }
                }
              >
                {workspace?.type === "SHARED" ? (
                  <Users size={22} strokeWidth={1.8} />
                ) : (
                  <User size={22} strokeWidth={1.8} />
                )}
              </div>
              <div className="min-w-0">
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="rounded-[12px] px-3 py-1.5 text-[16px] font-semibold focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                      style={ctrlStyle}
                      autoFocus
                    />
                    <button
                      onClick={handleUpdateWorkspace}
                      className="rounded-[12px] px-3 py-1.5 text-[13px] font-semibold"
                      style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                    >
                      {tCommon("save")}
                    </button>
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setEditName(workspace?.name || "");
                      }}
                      className="rounded-[12px] px-3 py-1.5 text-[13px]"
                      style={{ color: "var(--ink-muted)" }}
                    >
                      {tCommon("cancel")}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-[18px] font-bold" style={{ color: "var(--ink)" }}>
                      {workspace?.name}
                    </h2>
                    {canManageMembers && (
                      <button
                        onClick={() => setIsEditing(true)}
                        aria-label={tCommon("edit")}
                        className="flex h-8 w-8 items-center justify-center rounded-full"
                        style={{ color: "var(--ink-subtle)" }}
                      >
                        <Pencil size={15} strokeWidth={1.8} />
                      </button>
                    )}
                  </div>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]" style={{ color: "var(--ink-subtle)" }}>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={
                      workspace?.type === "SHARED"
                        ? { background: "var(--surface-2)", color: "var(--accent)" }
                        : { background: "var(--app-bg)", color: "var(--ink-muted)" }
                    }
                  >
                    {workspace?.type === "SHARED" ? t("shared") : t("personal")}
                  </span>
                  <span className="tabular-nums">
                    {workspace?.stats.members} {workspace?.stats.members === 1 ? t("member") : t("members")}
                  </span>
                  <span className="tabular-nums">{workspace?.stats.expenses} expenses</span>
                </div>
              </div>
            </div>
            <div className="shrink-0 text-right text-[12px]" style={{ color: "var(--ink-subtle)" }}>
              {roleChip(workspace?.role || "MEMBER")}
            </div>
          </div>
        </motion.section>

        {/* Members section */}
        <motion.section
          {...sectionMotion(1)}
          className="overflow-hidden rounded-[20px]"
          style={{ background: "var(--surface)", ...cardShadow }}
        >
          <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--line)" }}>
            <h3 className="text-[14px] font-bold" style={{ color: "var(--ink)" }}>
              {t("members").charAt(0).toUpperCase() + t("members").slice(1)}
            </h3>
          </div>
          <div>
            {members.map((member, idx) => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-3 px-4 py-3.5"
                style={idx > 0 ? { borderTop: "1px solid var(--line)" } : undefined}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] text-[15px] font-bold"
                    style={{ background: "var(--surface-2)", color: "var(--accent)" }}
                  >
                    {(member.user.name?.[0] || member.user.email[0]).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
                      {member.user.name || member.user.email}
                      {member.isCurrentUser && (
                        <span className="ml-1.5 text-[11.5px] font-normal" style={{ color: "var(--ink-subtle)" }}>
                          (you)
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[12px]" style={{ color: "var(--ink-subtle)" }}>
                      {member.user.email}
                      {member.user.username && ` · @${member.user.username}`}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canManageMembers && !member.isCurrentUser && member.role !== "OWNER" ? (
                    <div className="relative">
                      <select
                        value={member.role}
                        onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                        className="appearance-none rounded-[12px] pl-3 pr-8 py-1.5 text-[12px] font-semibold focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                        style={ctrlStyle}
                      >
                        <option value="ADMIN">{t("roles.admin")}</option>
                        <option value="MEMBER">{t("roles.member")}</option>
                      </select>
                      <ChevronDown
                        size={13}
                        strokeWidth={1.8}
                        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                        style={{ color: "var(--ink-subtle)" }}
                      />
                    </div>
                  ) : (
                    roleChip(member.role)
                  )}
                  {canManageMembers && !member.isCurrentUser && member.role !== "OWNER" && (
                    <button
                      onClick={() => handleRemoveMember(member.id, member.user.name || member.user.email)}
                      className="flex h-9 w-9 items-center justify-center rounded-full"
                      style={{ color: "var(--negative)" }}
                      title={t("removeMember")}
                    >
                      <Trash2 size={16} strokeWidth={1.8} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Invite section */}
        {canInvite && (
          <motion.section
            {...sectionMotion(2)}
            className="rounded-[20px] p-4"
            style={{ background: "var(--surface)", ...cardShadow }}
          >
            <h3 className="mb-3 text-[14px] font-bold" style={{ color: "var(--ink)" }}>
              {t("inviteMember")}
            </h3>
            <form onSubmit={handleInvite} className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={inviteIdentifier}
                  onChange={(e) => setInviteIdentifier(e.target.value)}
                  placeholder={t("invitePlaceholder")}
                  className="flex-1 rounded-[14px] px-4 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                  style={ctrlStyle}
                />
                <div className="flex gap-2">
                  <div className="relative flex-1 sm:flex-none">
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full appearance-none rounded-[14px] pl-4 pr-9 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] disabled:opacity-50"
                      style={ctrlStyle}
                      disabled={!isOwner}
                    >
                      <option value="MEMBER">{t("roles.member")}</option>
                      {isOwner && <option value="ADMIN">{t("roles.admin")}</option>}
                    </select>
                    <ChevronDown
                      size={14}
                      strokeWidth={1.8}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: "var(--ink-subtle)" }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isInviting || !inviteIdentifier.trim()}
                    className="rounded-[18px] px-6 py-2.5 text-[14px] font-semibold transition-transform active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                  >
                    {isInviting ? t("sending") : t("invite")}
                  </button>
                </div>
              </div>
              {inviteError && (
                <p className="text-[13px]" style={{ color: "var(--negative)" }}>
                  {inviteError}
                </p>
              )}
              {inviteSuccess && (
                <p className="text-[13px]" style={{ color: "var(--positive)" }}>
                  {inviteSuccess}
                </p>
              )}
            </form>

            {/* Pending invitations */}
            {invitations.length > 0 && (
              <div className="mt-5">
                <h4 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--ink-subtle)" }}>
                  {t("pendingInvitations")}
                </h4>
                <div className="space-y-2">
                  {invitations.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex items-center justify-between gap-3 rounded-[14px] px-4 py-3"
                      style={{ background: "var(--app-bg)" }}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
                          {invite.email}
                        </div>
                        <div className="text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>
                          {roleLabel(invite.role)} · {t("expires")}{" "}
                          {new Date(invite.expiresAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleCancelInvitation(invite.id)}
                        className="shrink-0 text-[13px] font-semibold"
                        style={{ color: "var(--negative)" }}
                      >
                        {t("cancelInvitation")}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.section>
        )}

        {/* Danger zone — leave workspace */}
        {workspace?.type === "SHARED" && !isOwner && (
          <motion.section
            {...sectionMotion(3)}
            className="rounded-[20px] p-4"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)", border: "1px solid color-mix(in srgb, var(--negative) 22%, transparent)" }}
          >
            <h3 className="mb-1.5 text-[14px] font-bold" style={{ color: "var(--negative)" }}>
              {t("dangerZone")}
            </h3>
            <p className="mb-4 text-[13px]" style={{ color: "var(--ink-muted)" }}>
              {t("leaveWorkspaceWarning")}
            </p>
            <button
              onClick={handleLeaveWorkspace}
              className="rounded-[18px] px-4 py-2.5 text-[14px] font-semibold text-white transition-transform active:scale-[.98]"
              style={{ background: "var(--negative)" }}
            >
              {t("leaveWorkspace")}
            </button>
          </motion.section>
        )}
      </div>

      {/* Create workspace modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          router.replace("/dashboard/workspace");
        }}
        variant="dialog"
        size="md"
        as="form"
        onSubmit={handleCreateWorkspace}
        zIndexClassName="z-50"
      >
        <ModalHeader showClose={false} className="px-6 pt-6">
          <h2 className="mb-4 text-[18px] font-bold" style={{ color: "var(--ink)" }}>
            {t("createWorkspace")}
          </h2>
        </ModalHeader>

        <ModalBody className="px-6 pb-0">
          <input
            type="text"
            value={newWorkspaceName}
            onChange={(e) => setNewWorkspaceName(e.target.value)}
            placeholder={t("workspaceNamePlaceholder")}
            className={`${inputCls} mb-4`}
            style={ctrlStyle}
            autoFocus
          />
        </ModalBody>

        <ModalFooter className="justify-end gap-3 px-6 pb-6 pt-0 md:px-6 md:pb-6">
          <button
            type="button"
            onClick={() => {
              setShowCreateModal(false);
              router.replace("/dashboard/workspace");
            }}
            className="rounded-[18px] px-4 py-2.5 text-[14px] font-semibold"
            style={{ color: "var(--ink-muted)" }}
          >
            {tCommon("cancel")}
          </button>
          <button
            type="submit"
            disabled={isCreating || !newWorkspaceName.trim()}
            className="rounded-[18px] px-4 py-2.5 text-[14px] font-semibold transition-transform active:scale-[.98] disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {isCreating ? t("creating") : tCommon("create")}
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
