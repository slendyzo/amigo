"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface ClusterExpense {
  id: string;
  name: string;
  amount: number;
  date: string;
}

interface NudgeProjectCardProps {
  cluster: {
    theme: string;
    suggestedProjectName: string;
    expenses: ClusterExpense[];
  };
  existingProjects: Array<{ id: string; name: string }>;
  onAccepted: () => void;
}

export default function NudgeProjectCard({
  cluster,
  existingProjects,
  onAccepted,
}: NudgeProjectCardProps) {
  const t = useTranslations("aiAdvisor");

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState(cluster.suggestedProjectName);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);

  if (dismissed) return null;

  const handleDismiss = async () => {
    setDismissed(true); // optimistic
    try {
      await fetch("/api/insights/dismiss", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "NUDGE_PROJECT",
          scope: { expenseIds: cluster.expenses.map((e) => e.id) },
        }),
      });
    } catch (err) {
      console.error("[advisor] dismiss failed:", err);
    }
  };

  // Radio-style UX: picking a project from the dropdown disables the text input
  // and vice-versa — typing clears the dropdown.
  const handleDropdownChange = (value: string) => {
    setSelectedProjectId(value);
    if (value) setNewProjectName("");
  };

  const handleNameChange = (value: string) => {
    setNewProjectName(value);
    if (value) setSelectedProjectId("");
  };

  const canSubmit =
    (selectedProjectId.length > 0) ||
    (newProjectName.trim().length > 0);

  const MAX_VISIBLE = 4;
  const visibleExpenses = cluster.expenses.slice(0, MAX_VISIBLE);
  const hiddenCount = cluster.expenses.length - MAX_VISIBLE;
  const merchantList =
    visibleExpenses.map((e) => e.name).join(", ") +
    (hiddenCount > 0 ? `, +${hiddenCount}` : "");

  const handleTag = async () => {
    if (!canSubmit) return;
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        expenseIds: cluster.expenses.map((e) => e.id),
      };
      if (selectedProjectId) {
        body.projectId = selectedProjectId;
      } else {
        body.newProjectName = newProjectName.trim();
      }

      const res = await fetch("/api/insights/nudges/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        onAccepted();
      }
    } catch (err) {
      console.error("[nudge-project-card] POST error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3.5">
      {/* Dismiss X */}
      <button
        onClick={handleDismiss}
        aria-label={t("nudges.common.dismiss")}
        className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Heading */}
      <p className="text-sm font-medium text-slate-900 dark:text-white pr-6">
        {t("nudges.project.cardHeading", { count: cluster.expenses.length })}
      </p>

      {/* Theme */}
      <p className="text-xs text-slate-700 dark:text-slate-300 mt-1">
        <span className="font-medium">{t("nudges.project.themePrefix")}</span>
        {": "}
        {cluster.theme}
      </p>

      {/* Merchants */}
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
        <span className="font-medium">{t("nudges.project.merchantsPrefix")}</span>
        {": "}
        {merchantList}
      </p>

      {/* Controls */}
      <div className="mt-3 space-y-2">
        {/* Existing project dropdown */}
        <select
          value={selectedProjectId}
          onChange={(e) => handleDropdownChange(e.target.value)}
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        >
          <option value="">{t("nudges.project.pickProject")}</option>
          {existingProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* New project name input */}
        <input
          type="text"
          value={newProjectName}
          onChange={(e) => handleNameChange(e.target.value)}
          disabled={!!selectedProjectId}
          placeholder={t("nudges.project.newProjectPlaceholder")}
          className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
        />
      </div>

      {/* Action buttons */}
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleTag}
          disabled={!canSubmit || loading}
          className="flex-1 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "…" : t("nudges.project.tagButton")}
        </button>
        <button
          onClick={handleDismiss}
          className="flex-1 rounded-md border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          {t("nudges.common.notNow")}
        </button>
      </div>
    </div>
  );
}
