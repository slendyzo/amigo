"use client";

import { useState, useCallback } from "react";
import type { Project } from "@/types/models";

type UseProjectTagsOptions = {
  initialProjects?: Project[];
  initialSelectedIds?: string[];
  onProjectCreated?: (project: Project) => void;
};

type UseProjectTagsReturn = {
  localProjects: Project[];
  setLocalProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  selectedProjectIds: string[];
  setSelectedProjectIds: React.Dispatch<React.SetStateAction<string[]>>;
  showNewTagInput: boolean;
  setShowNewTagInput: React.Dispatch<React.SetStateAction<boolean>>;
  newTagName: string;
  setNewTagName: React.Dispatch<React.SetStateAction<string>>;
  isCreating: boolean;
  error: string;
  setError: React.Dispatch<React.SetStateAction<string>>;
  createTag: () => Promise<void>;
  toggleProject: (projectId: string) => void;
  clearSelection: () => void;
  resetTagInput: () => void;
};

/**
 * Hook for managing project/tag selection and creation in expense modals.
 * Centralizes the duplicated tag logic from add-expense-modal and edit-expense-modal.
 *
 * @param options - Configuration options
 * @returns Tag management state and functions
 */
export function useProjectTags(options: UseProjectTagsOptions = {}): UseProjectTagsReturn {
  const {
    initialProjects = [],
    initialSelectedIds = [],
    onProjectCreated,
  } = options;

  const [localProjects, setLocalProjects] = useState<Project[]>(initialProjects);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>(initialSelectedIds);
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const createTag = useCallback(async () => {
    if (!newTagName.trim()) return;

    setIsCreating(true);
    setError("");

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        const newProject = data.project as Project;

        setLocalProjects((prev) => [...prev, newProject]);
        setSelectedProjectIds((prev) => [...prev, newProject.id]);
        setShowNewTagInput(false);
        setNewTagName("");
        setError("");

        onProjectCreated?.(newProject);
      } else {
        const data = await response.json();
        setError(data.error || "Failed to create tag");
      }
    } catch (err) {
      console.error("Failed to create tag:", err);
      setError("Failed to create tag");
    } finally {
      setIsCreating(false);
    }
  }, [newTagName, onProjectCreated]);

  const toggleProject = useCallback((projectId: string) => {
    setSelectedProjectIds((prev) => {
      if (prev.includes(projectId)) {
        return prev.filter((id) => id !== projectId);
      }
      return [...prev, projectId];
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedProjectIds([]);
  }, []);

  const resetTagInput = useCallback(() => {
    setShowNewTagInput(false);
    setNewTagName("");
  }, []);

  return {
    localProjects,
    setLocalProjects,
    selectedProjectIds,
    setSelectedProjectIds,
    showNewTagInput,
    setShowNewTagInput,
    newTagName,
    setNewTagName,
    isCreating,
    error,
    setError,
    createTag,
    toggleProject,
    clearSelection,
    resetTagInput,
  };
}
