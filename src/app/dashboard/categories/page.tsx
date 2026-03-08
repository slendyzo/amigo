"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Sparkles, ChevronDown, ChevronRight, FolderTree, AlertTriangle } from "lucide-react";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import { buildCategoryTree, getParentExpenseCount, type CategoryNode, type FlatCategory } from "@/lib/category-utils";

type Category = {
  id: string;
  name: string;
  parentId: string | null;
  icon?: string | null;
  color?: string | null;
  isSystem: boolean;
  _count?: { expenses: number };
};

// Helper to check if category is the special "Uncategorized" category (any language)
const isUncategorizedCategory = (name: string) => {
  const uncategorizedNames = ["uncategorized", "sem categoria", "non catégorisé"];
  return uncategorizedNames.includes(name.toLowerCase());
};

export default function CategoriesPage() {
  const t = useTranslations("categories");
  const tCommon = useTranslations("common");
  const tExpenses = useTranslations("expenses");
  const locale = useLocale();
  const router = useRouter();
  const { translateCategory } = useCategoryTranslation();

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<{ created: number; categories: string[] } | null>(null);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeResult, setUpgradeResult] = useState<string | null>(null);
  const [unmatchedCategories, setUnmatchedCategories] = useState<string[]>([]);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  // Form state
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/categories");
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
        // Expand all parents by default
        const parentIds = new Set<string>(
          (data.categories || [])
            .filter((c: Category) => c.parentId === null && (data.categories || []).some((ch: Category) => ch.parentId === c.id))
            .map((c: Category) => c.id)
        );
        setExpandedParents(parentIds);
      }
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setParentId("");
    setEditingCategory(null);
    setError("");
  };

  const openModal = (category?: Category) => {
    if (category) {
      if (category.isSystem) return; // Cannot edit system categories
      setEditingCategory(category);
      setName(category.name);
      setParentId(category.parentId || "");
    } else {
      resetForm();
      // Default to first parent group
      const parents = categories.filter(
        (c) => c.parentId === null && !isUncategorizedCategory(c.name)
      );
      if (parents.length > 0) {
        setParentId(parents[0].id);
      }
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const url = editingCategory ? `/api/categories/${editingCategory.id}` : "/api/categories";
      const method = editingCategory ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: parentId || null }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save category");
      }

      setIsModalOpen(false);
      resetForm();
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      if (response.ok) {
        setCategories(categories.filter((c) => c.id !== id && c.parentId !== id));
      } else {
        const data = await response.json();
        alert(data.error || "Failed to delete category");
      }
    } catch (error) {
      console.error("Failed to delete category:", error);
    }
    setDeleteId(null);
  };

  const handleSeedDefaults = async () => {
    setIsSeeding(true);
    setSeedResult(null);
    try {
      const response = await fetch("/api/categories/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: locale }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.created > 0) {
          setSeedResult({ created: data.created, categories: data.categories });
          fetchCategories();
        } else {
          setSeedResult({ created: 0, categories: [] });
        }
      }
    } catch (error) {
      console.error("Failed to seed categories:", error);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleUpgradeHierarchy = async () => {
    setIsUpgrading(true);
    setUpgradeResult(null);
    try {
      const response = await fetch("/api/categories/upgrade-hierarchy", {
        method: "POST",
      });
      if (response.ok) {
        const data = await response.json();
        setUpgradeResult(data.message);
        if (data.unmatched?.length > 0) {
          setUnmatchedCategories(data.unmatched);
        }
        fetchCategories();
        setTimeout(() => setUpgradeResult(null), 5000);
      }
    } catch (error) {
      console.error("Failed to upgrade hierarchy:", error);
    } finally {
      setIsUpgrading(false);
    }
  };

  const toggleParent = (id: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Build tree from flat categories
  const categoryTree = buildCategoryTree(categories as FlatCategory[]);

  // Check if hierarchy exists (any category has children)
  const hasHierarchy = categories.some((c) => c.parentId !== null);

  // Parent categories for the modal dropdown
  const parentCategories = categories.filter(
    (c) => c.parentId === null && !isUncategorizedCategory(c.name)
  );

  // Check if we should show the "add defaults" prompt
  const showAddDefaultsPrompt = !isLoading && categories.length <= 3;

  // Check if we should show "organize into groups" prompt
  const showUpgradePrompt = !isLoading && !hasHierarchy && categories.length > 3;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
          <p className="text-slate-500 text-sm mt-1">
            {t("organizeExpenses")}
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 bg-[#0070f3] text-white px-4 py-2 rounded-lg hover:bg-[#0060df] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t("addSubcategory")}
        </button>
      </div>

      {/* Info Note */}
      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600">
        <span className="font-medium">{t("note")}:</span> {t("systemNote")}
      </div>

      {/* Add Default Categories Prompt */}
      {showAddDefaultsPrompt && !seedResult && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-slate-900 mb-1">{t("addDefaultsTitle")}</h3>
              <p className="text-sm text-slate-600 mb-3">{t("addDefaultsDescription")}</p>
              <button
                onClick={handleSeedDefaults}
                disabled={isSeeding}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {isSeeding ? t("addingDefaults") : t("addDefaults")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Organize into Groups Prompt */}
      {showUpgradePrompt && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <FolderTree className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-slate-900 mb-1">{t("organizeTitle")}</h3>
              <p className="text-sm text-slate-600 mb-3">{t("organizeDescription")}</p>
              <button
                onClick={handleUpgradeHierarchy}
                disabled={isUpgrading}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isUpgrading ? t("organizing") : t("organizeButton")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seed Result Toast */}
      {seedResult && (
        <div className={`p-4 rounded-xl border ${seedResult.created > 0 ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200"}`}>
          <p className={`text-sm font-medium ${seedResult.created > 0 ? "text-green-700" : "text-slate-600"}`}>
            {seedResult.created > 0
              ? t("defaultsAdded", { count: seedResult.created })
              : t("defaultsAlreadyExist")}
          </p>
          {seedResult.created > 0 && (
            <p className="text-sm text-green-600 mt-1">
              {seedResult.categories.join(", ")}
            </p>
          )}
        </div>
      )}

      {/* Upgrade Result Toast */}
      {upgradeResult && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200">
          <p className="text-sm font-medium text-green-700">{upgradeResult}</p>
        </div>
      )}

      {/* Unmatched Categories Prompt */}
      {unmatchedCategories.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-100">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-slate-900 mb-1">{t("unmatchedTitle")}</h3>
              <p className="text-sm text-slate-600 mb-2">{t("unmatchedDescription")}</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {unmatchedCategories.map((name) => (
                  <span key={name} className="px-2.5 py-1 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
                    {translateCategory(name)}
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-500">{t("unmatchedHint")}</p>
            </div>
            <button
              onClick={() => setUnmatchedCategories([])}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Categories List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">{tCommon("loading")}</div>
        ) : categories.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-slate-400 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">{t("noCategoriesYet")}</h3>
            <p className="text-slate-500 text-sm mb-4">{t("createToOrganize")}</p>
            <button
              onClick={() => openModal()}
              className="text-[#0070f3] hover:underline text-sm font-medium"
            >
              {t("createCategory")}
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">{t("name")}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-slate-600">{tExpenses("title")}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-slate-600">{tExpenses("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categoryTree.map((node) => (
                <CategoryRow
                  key={node.id}
                  node={node}
                  depth={0}
                  isExpanded={expandedParents.has(node.id)}
                  onToggle={toggleParent}
                  onEdit={openModal}
                  onDelete={setDeleteId}
                  onViewExpenses={(categoryId) => router.push(`/dashboard/expenses?category=${categoryId}`)}
                  translateCategory={translateCategory}
                  t={t}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              {editingCategory ? t("editCategory") : t("newCategory")}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t("name")}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder={t("namePlaceholder")}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t("parentCategory")}</label>
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
                >
                  {parentCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {translateCategory(cat.name)}
                    </option>
                  ))}
                </select>
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
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{t("deleteCategoryQuestion")}</h3>
            <p className="text-slate-600 text-sm mb-4">
              {t("moveToCategorized")}
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

/* ==============================
   CATEGORY ROW (Recursive tree)
   ============================== */
function CategoryRow({
  node,
  depth,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onViewExpenses,
  translateCategory,
  t,
}: {
  node: CategoryNode;
  depth: number;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onEdit: (category: { id: string; name: string; parentId: string | null; icon?: string | null; color?: string | null; isSystem: boolean; _count?: { expenses: number } }) => void;
  onDelete: (id: string) => void;
  onViewExpenses: (categoryId: string) => void;
  translateCategory: (name: string) => string;
  t: (key: string) => string;
}) {
  const isUncategorized = isUncategorizedCategory(node.name);
  const hasChildren = node.children.length > 0;
  const isParent = depth === 0 && hasChildren;
  const totalExpenses = isParent ? getParentExpenseCount(node) : (node._count?.expenses ?? 0);

  return (
    <>
      <tr className={`hover:bg-slate-50 ${isParent ? "bg-slate-25" : ""}`}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2" style={{ paddingLeft: depth * 24 }}>
            {isParent ? (
              <button
                onClick={() => onToggle(node.id)}
                className="p-0.5 rounded hover:bg-slate-200 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
              </button>
            ) : depth > 0 ? (
              <span className="w-5 h-px bg-slate-200 ml-1" />
            ) : null}
            {node.icon && <span className="text-sm">{node.icon}</span>}
            <span className={`${isParent ? "font-semibold" : "font-medium"} text-slate-900`}>
              {translateCategory(node.name)}
            </span>
            {node.isSystem && (
              <span title={t("systemLocked")}>
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-right">
          {totalExpenses > 0 ? (
            <button
              onClick={() => onViewExpenses(node.id)}
              className="text-[#0070f3] hover:underline font-medium tabular-nums"
              title={t("viewExpenses")}
            >
              {totalExpenses}
            </button>
          ) : (
            <span className="text-slate-400 tabular-nums">0</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          {!node.isSystem && (
            <div className="flex justify-end gap-2">
              <button
                onClick={() => onEdit({
                  id: node.id,
                  name: node.name,
                  parentId: node.parentId,
                  icon: node.icon,
                  color: node.color,
                  isSystem: node.isSystem ?? false,
                  _count: node._count,
                })}
                className="text-slate-500 hover:text-slate-700 p-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button
                onClick={() => onDelete(node.id)}
                className="text-red-500 hover:text-red-700 p-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          )}
        </td>
      </tr>
      {isExpanded && hasChildren && node.children.map((child) => (
        <CategoryRow
          key={child.id}
          node={child}
          depth={depth + 1}
          isExpanded={false}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
          onViewExpenses={onViewExpenses}
          translateCategory={translateCategory}
          t={t}
        />
      ))}
    </>
  );
}
