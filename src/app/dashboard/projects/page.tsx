"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type Project = {
  id: string;
  name: string;
  description: string | null;
  budget: number | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  _count?: { expenses: number };
  totalSpent?: number;
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  ON_HOLD: "bg-yellow-100 text-yellow-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default function ProjectsPage() {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");

  const STATUS_LABELS: Record<string, string> = {
    ACTIVE: t("statuses.active"),
    COMPLETED: t("statuses.completed"),
    ON_HOLD: t("statuses.on_hold"),
    CANCELLED: t("statuses.cancelled"),
  };

  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
  }, []);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
          <p className="text-slate-500 text-sm mt-1">
            {t("trackProjectExpenses")}
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 bg-[#0070f3] text-white px-4 py-2 rounded-lg hover:bg-[#0060df] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t("newProject")}
        </button>
      </div>

      {/* Projects Grid */}
      {isLoading ? (
        <div className="bg-white rounded-xl p-8 text-center text-slate-500 shadow-sm border border-slate-200">
          {tCommon("loading")}
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-slate-200">
          <div className="text-slate-400 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-slate-900 mb-1">{t("noProjectsYet")}</h3>
          <p className="text-slate-500 text-sm mb-4">{t("createFirstProject")}</p>
          <button
            onClick={() => openModal()}
            className="text-[#0070f3] hover:underline text-sm font-medium"
          >
            {t("createProject")}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push(`/dashboard/projects/${project.id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-slate-900">{project.name}</h3>
                <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[project.status] || "bg-slate-100 text-slate-600"}`}>
                  {STATUS_LABELS[project.status] || project.status}
                </span>
              </div>
              {project.description && (
                <p className="text-sm text-slate-500 mb-3 line-clamp-2">{project.description}</p>
              )}
              <div className="space-y-2 text-sm">
                {project.budget && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t("budget")}</span>
                    <span className="font-medium text-slate-900">€{Number(project.budget).toFixed(2)}</span>
                  </div>
                )}
                {project.totalSpent !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t("spent")}</span>
                    <span className="font-medium text-slate-900">€{Number(project.totalSpent).toFixed(2)}</span>
                  </div>
                )}
                {project._count?.expenses !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t("expenses")}</span>
                    <span className="font-medium text-slate-900">{project._count.expenses}</span>
                  </div>
                )}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); openModal(project); }}
                  className="flex-1 text-sm text-slate-600 hover:text-slate-900 py-1"
                >
                  {tCommon("edit")}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteId(project.id); }}
                  className="flex-1 text-sm text-red-500 hover:text-red-700 py-1"
                >
                  {tCommon("delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              {editingProject ? t("editProject") : t("newProject")}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t("name")}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t("description")}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t("budget")}</label>
                <input
                  type="number"
                  step="0.01"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder={tCommon("optional")}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t("startDate")}</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t("endDate")}</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  {tCommon("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !name}
                  className="flex-1 px-4 py-2 rounded-lg bg-[#0070f3] text-white hover:bg-[#0060df] disabled:opacity-50"
                >
                  {isSubmitting ? t("saving") : tCommon("save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteId(null)} />
          <div className="relative bg-white rounded-xl p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{t("deleteProjectQuestion")}</h3>
            <p className="text-slate-600 text-sm mb-4">
              {t("expensesWillUnlink")}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                {tCommon("cancel")}
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600"
              >
                {tCommon("delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
