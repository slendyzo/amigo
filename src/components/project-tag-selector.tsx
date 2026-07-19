"use client";

import { useTranslations } from "next-intl";
import type { Project } from "@/types/models";

type ProjectTagSelectorProps = {
  projects: Project[];
  selectedIds: string[];
  onToggle: (projectId: string) => void;
  onClearAll: () => void;
  showNewTagInput: boolean;
  onShowNewTagInput: () => void;
  newTagName: string;
  onNewTagNameChange: (name: string) => void;
  onCreateTag: () => void;
  onCancelNewTag: () => void;
  isCreating?: boolean;
  showSelectedCount?: boolean;
};

/**
 * Reusable project tag selector component.
 * Used in add-expense-modal and edit-expense-modal for tag selection.
 */
export default function ProjectTagSelector({
  projects,
  selectedIds,
  onToggle,
  onClearAll,
  showNewTagInput,
  onShowNewTagInput,
  newTagName,
  onNewTagNameChange,
  onCreateTag,
  onCancelNewTag,
  isCreating = false,
  showSelectedCount = true,
}: ProjectTagSelectorProps) {
  const t = useTranslations("modals");
  const tCommon = useTranslations("common");

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {/* Clear all tags option */}
        <button
          type="button"
          onClick={onClearAll}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            selectedIds.length === 0
              ? "bg-slate-800 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {t("noTags")}
        </button>

        {/* Existing project tags (multi-select, hide locked) */}
        {projects.filter((p) => p.isActive !== false).map((project) => {
          const isSelected = selectedIds.includes(project.id);
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => onToggle(project.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                isSelected
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--accent-tint)] text-[var(--accent-strong)] hover:bg-[var(--accent-tint)]"
              }`}
            >
              {project.name}
            </button>
          );
        })}

        {/* Add new tag button */}
        {!showNewTagInput && (
          <button
            type="button"
            onClick={onShowNewTagInput}
            className="px-3 py-1.5 rounded-full text-sm font-medium bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t("new")}
          </button>
        )}
      </div>

      {/* New tag input */}
      {showNewTagInput && (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => onNewTagNameChange(e.target.value)}
            placeholder={t("tagPlaceholder")}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onCreateTag();
              }
            }}
          />
          <button
            type="button"
            onClick={onCreateTag}
            disabled={!newTagName.trim() || isCreating}
            className="px-3 py-2 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] text-sm font-medium hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            {tCommon("add")}
          </button>
          <button
            type="button"
            onClick={onCancelNewTag}
            className="px-3 py-2 rounded-lg text-slate-500 hover:text-slate-700"
          >
            {tCommon("cancel")}
          </button>
        </div>
      )}

      {showSelectedCount && selectedIds.length > 0 && (
        <p className="mt-2 text-xs text-[var(--accent)]">
          {t("taggedTo", { count: selectedIds.length })}
        </p>
      )}
    </div>
  );
}
