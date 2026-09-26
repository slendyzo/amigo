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
  fillRows?: boolean;
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
  fillRows = false,
}: ProjectTagSelectorProps) {
  const t = useTranslations("modals");
  const tCommon = useTranslations("common");

  return (
    <div>
      <div className={fillRows ? "grid grid-cols-2 gap-2 [&>button:last-child:nth-child(odd)]:col-span-2 [&>button]:h-11 [&>button]:min-w-0 [&>button]:w-full [&>button]:truncate [&>button]:rounded-[12px] [&>button]:text-[13px] [&>button]:justify-center" : "flex flex-wrap gap-2"}>
        {/* Clear all tags option */}
        <button
          type="button"
          aria-pressed={selectedIds.length === 0}
          onClick={onClearAll}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            selectedIds.length === 0
              ? "bg-[var(--ink)] text-[var(--surface)]"
              : "bg-[var(--surface-2)] text-[var(--ink-muted)] hover:bg-[var(--surface-3)]"
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
              aria-pressed={isSelected}
              title={project.name}
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
            className="px-3 py-1.5 rounded-full text-sm font-medium bg-[var(--surface-2)] text-[var(--ink-subtle)] hover:bg-[var(--surface-3)] flex items-center gap-1"
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
            className="min-w-0 flex-1 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
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
            className="px-3 py-2 rounded-lg text-[var(--ink-subtle)] hover:text-[var(--ink-muted)]"
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
