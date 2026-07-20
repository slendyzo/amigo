"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Lock, Unlock, Pencil, Trash2 } from "lucide-react";
import NudgeProjectCard from "@/components/nudge-project-card";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

type Project = {
  id: string;
  name: string;
  description: string | null;
  budget: number | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  isActive: boolean;
  _count?: { expenses: number };
  totalSpent?: number;
};

type NudgeCluster = {
  theme: string;
  suggestedProjectName: string;
  expenses: Array<{ id: string; name: string; amount: number; date: string }>;
};

// Framer-motion entrance: fade + rise, 0.05s stagger
const EASE = [0.16, 1, 0.3, 1] as const;
const sectionMotion = (i: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: EASE, delay: i * 0.05 },
});

const fmtEur = (v: number) =>
  `€${Number(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ProjectsPage() {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");

  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // AI nudge state
  const [nudgeClusters, setNudgeClusters] = useState<NudgeCluster[]>([]);
  const [nudgeProjects, setNudgeProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchProjects();
    fetchNudges();
  }, []);

  const fetchNudges = async () => {
    try {
      const [stateRes, nudgeRes] = await Promise.all([
        fetch("/api/user/advisor-state"),
        fetch("/api/insights/nudges/project"),
      ]);
      if (!stateRes.ok || !nudgeRes.ok) return;
      const stateData = await stateRes.json();
      if (!stateData.aiProcessingEnabled) return;
      setAiEnabled(true);
      const nudgeData = await nudgeRes.json();
      setNudgeClusters(nudgeData.clusters ?? []);
      setNudgeProjects(nudgeData.existingProjects ?? []);
    } catch {
      // Silently ignore nudge fetch failures
    }
  };

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/projects");
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setBudget("");
    setStartDate("");
    setEndDate("");
    setEditingProject(null);
  };

  const openModal = (project?: Project) => {
    if (project) {
      setEditingProject(project);
      setName(project.name);
      setDescription(project.description || "");
      setBudget(project.budget?.toString() || "");
      setStartDate(project.startDate?.split("T")[0] || "");
      setEndDate(project.endDate?.split("T")[0] || "");
    } else {
      resetForm();
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const body = {
        name,
        description: description || null,
        budget: budget ? parseFloat(budget) : null,
        startDate: startDate || null,
        endDate: endDate || null,
      };

      const url = editingProject ? `/api/projects/${editingProject.id}` : "/api/projects";
      const method = editingProject ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setIsModalOpen(false);
        resetForm();
        fetchProjects();
      }
    } catch (error) {
      console.error("Failed to save project:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (response.ok) {
        setProjects(projects.filter((p) => p.id !== id));
      }
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
    setDeleteId(null);
  };

  const handleToggleLock = async (project: Project) => {
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !project.isActive }),
      });
      if (response.ok) {
        setProjects(projects.map((p) =>
          p.id === project.id ? { ...p, isActive: !p.isActive } : p
        ));
      }
    } catch (error) {
      console.error("Failed to toggle lock:", error);
    }
  };

  const formatMonth = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

  const inputStyle: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--line-strong)",
    color: "var(--ink)",
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* Pushed-page header */}
      <motion.header {...sectionMotion(0)} className="flex items-center gap-3 py-1">
        <button
          onClick={() => router.back()}
          aria-label={tCommon("back")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)", color: "var(--ink)" }}
        >
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </button>
        <h1 className="flex-1 text-center text-[16px] font-semibold" style={{ color: "var(--ink)" }}>
          {t("title")}
        </h1>
        <button
          onClick={() => openModal()}
          aria-label={t("newProject")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)", color: "var(--ink)" }}
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </button>
      </motion.header>

      {/* Explainer */}
      <motion.p
        {...sectionMotion(1)}
        className="mt-1 mb-5 px-1 text-[12px] leading-snug"
        style={{ color: "var(--ink-muted)" }}
      >
        {t("ledgerExplainer")}
      </motion.p>

      {/* AI Nudge Cards */}
      {aiEnabled && nudgeClusters.length > 0 && (
        <div className="mb-5 space-y-3">
          {nudgeClusters.map((cluster, i) => (
            <NudgeProjectCard
              key={`${cluster.theme}-${i}`}
              cluster={cluster}
              existingProjects={nudgeProjects}
              onAccepted={() => {
                setNudgeClusters((prev) => prev.filter((_, idx) => idx !== i));
                router.refresh();
              }}
            />
          ))}
        </div>
      )}

      {/* Projects list */}
      {isLoading ? (
        <div
          className="rounded-[20px] p-8 text-center text-[13px]"
          style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)", color: "var(--ink-muted)" }}
        >
          {tCommon("loading")}
        </div>
      ) : projects.length === 0 ? (
        <motion.div
          {...sectionMotion(2)}
          className="rounded-[20px] p-8 text-center"
          style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
        >
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: "var(--accent-fainter)", color: "var(--accent)" }}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <h3 className="mb-1 text-[15px] font-semibold" style={{ color: "var(--ink)" }}>{t("noProjectsYet")}</h3>
          <p className="mb-4 text-[13px]" style={{ color: "var(--ink-muted)" }}>{t("createFirstProject")}</p>
          <button
            onClick={() => openModal()}
            className="text-[13px] font-semibold"
            style={{ color: "var(--accent)" }}
          >
            {t("createProject")}
          </button>
        </motion.div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((project, i) => {
            const spent = project.totalSpent ?? 0;
            const count = project._count?.expenses ?? 0;
            const hasBudget = project.budget != null && Number(project.budget) > 0;
            const pct = hasBudget ? Math.min((spent / Number(project.budget)) * 100, 100) : 0;
            const isActive = project.isActive !== false;
            return (
              <motion.div
                key={project.id}
                {...sectionMotion(2 + i * 0.5)}
                onClick={() => router.push(`/dashboard/projects/${project.id}`)}
                className="cursor-pointer rounded-[20px] p-[18px] transition-shadow hover:shadow-[var(--shadow-pop)]"
                style={{
                  background: "var(--surface)",
                  boxShadow: "var(--shadow-card)",
                  opacity: project.isActive ? 1 : 0.65,
                }}
              >
                {/* Top row: name + status chip */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <h3 className="truncate text-[15px] font-bold" style={{ color: "var(--ink)" }}>{project.name}</h3>
                    {!project.isActive && (
                      <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} style={{ color: "var(--ink-subtle)" }} />
                    )}
                  </div>
                  <span
                    className="shrink-0 rounded-[12px] px-[9px] py-[3px] text-[11px] font-semibold"
                    style={
                      isActive
                        ? { background: "var(--surface-2)", color: "var(--accent)" }
                        : { background: "var(--app-bg)", color: "var(--ink-muted)" }
                    }
                  >
                    {isActive ? t("statuses.active") : t("inactive")}
                  </span>
                </div>

                {/* Meta line */}
                <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>
                  {project.startDate
                    ? t("startedMeta", { date: formatMonth(project.startDate), count })
                    : t("expensesMeta", { count })}
                </p>

                {project.description && (
                  <p className="mt-2 line-clamp-2 text-[12px]" style={{ color: "var(--ink-muted)" }}>
                    {project.description}
                  </p>
                )}

                {/* Spent row */}
                <div className="mt-3.5 flex items-baseline gap-2">
                  <span className="text-[20px] font-bold tabular-nums" style={{ color: "var(--ink)" }}>
                    {fmtEur(spent)}
                  </span>
                  <span className="text-[12px]" style={{ color: "var(--ink-muted)" }}>
                    {hasBudget ? t("ofBudget", { budget: fmtEur(Number(project.budget)) }) : t("noBudget")}
                  </span>
                </div>

                {/* Progress bar */}
                {hasBudget && (
                  <div className="mt-2 h-2 overflow-hidden rounded-[4px]" style={{ background: "var(--surface-2)" }}>
                    <motion.div
                      className="h-full rounded-[4px]"
                      style={{ background: "var(--bar-gradient)" }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.5, ease: EASE }}
                    />
                  </div>
                )}

                {/* Action footer */}
                <div
                  className="mt-3.5 flex gap-1 border-t pt-3"
                  style={{ borderColor: "var(--line)" }}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); openModal(project); }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-[12px] py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--surface-2)]"
                    style={{ color: "var(--ink-muted)" }}
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
                    {tCommon("edit")}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggleLock(project); }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-[12px] py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--surface-2)]"
                    style={{ color: "var(--ink-muted)" }}
                  >
                    {project.isActive
                      ? <Lock className="h-3.5 w-3.5" strokeWidth={1.8} />
                      : <Unlock className="h-3.5 w-3.5" strokeWidth={1.8} />}
                    {project.isActive ? t("lock") : t("unlock")}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteId(project.id); }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-[12px] py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--surface-2)]"
                    style={{ color: "var(--negative)" }}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                    {tCommon("delete")}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        variant="dialog"
        size="md"
        as="form"
        onSubmit={handleSubmit}
        zIndexClassName="z-50"
      >
        <ModalHeader showClose={false} className="px-6 pt-6">
          <h2 className="mb-4 text-[17px] font-semibold" style={{ color: "var(--ink)" }}>
            {editingProject ? t("editProject") : t("newProject")}
          </h2>
        </ModalHeader>

        <ModalBody className="px-6 pb-0">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--ink-muted)" }}>{t("name")}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-[12px] px-4 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--ink-muted)" }}>{t("description")}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-[12px] px-4 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--ink-muted)" }}>{t("budget")}</label>
                <input
                  type="number"
                  step="0.01"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder={tCommon("optional")}
                  className="w-full rounded-[12px] px-4 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  style={inputStyle}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--ink-muted)" }}>{t("startDate")}</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-[12px] px-4 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[13px] font-medium" style={{ color: "var(--ink-muted)" }}>{t("endDate")}</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-[12px] px-4 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
        </ModalBody>

        <ModalFooter className="gap-3 px-6 pb-6 pt-6 md:px-6 md:pb-6">
          <button
            type="button"
            onClick={() => setIsModalOpen(false)}
            className="flex-1 rounded-[14px] px-4 py-2.5 text-[14px] font-medium"
            style={{ border: "1px solid var(--line-strong)", color: "var(--ink-muted)" }}
          >
            {tCommon("cancel")}
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !name}
            className="flex-1 rounded-[14px] px-4 py-2.5 text-[14px] font-semibold disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {isSubmitting ? t("saving") : tCommon("save")}
          </button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        variant="dialog"
        size="sm"
        zIndexClassName="z-50"
      >
        <ModalBody className="px-6 pb-0 pt-6">
          <h3 className="mb-2 text-[17px] font-semibold" style={{ color: "var(--ink)" }}>{t("deleteProjectQuestion")}</h3>
          <p className="mb-4 text-[13px]" style={{ color: "var(--ink-muted)" }}>
            {t("expensesWillUnlink")}
          </p>
        </ModalBody>
        <ModalFooter className="gap-3 px-6 pb-6 pt-0 md:px-6 md:pb-6">
          <button
            onClick={() => setDeleteId(null)}
            className="flex-1 rounded-[14px] px-4 py-2.5 text-[14px] font-medium"
            style={{ border: "1px solid var(--line-strong)", color: "var(--ink-muted)" }}
          >
            {tCommon("cancel")}
          </button>
          <button
            onClick={() => { if (deleteId) handleDelete(deleteId); }}
            className="flex-1 rounded-[14px] px-4 py-2.5 text-[14px] font-semibold text-white"
            style={{ background: "var(--negative)" }}
          >
            {tCommon("delete")}
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
