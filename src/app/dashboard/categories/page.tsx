"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  FolderTree,
  AlertTriangle,
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Lock,
  Tag,
  X,
} from "lucide-react";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import { buildCategoryTree, getParentExpenseCount, type CategoryNode, type FlatCategory } from "@/lib/category-utils";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

const EASE = [0.16, 1, 0.3, 1] as const;

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

  const viewExpenses = (categoryId: string) => router.push(`/dashboard/expenses?category=${categoryId}`);

  // Build tree from flat categories
  const categoryTree = buildCategoryTree(categories as FlatCategory[]);

  // Split top-level nodes into hierarchical groups (with children) and loose leaves
  const groupNodes = categoryTree.filter((n) => n.children.length > 0);
  const looseNodes = categoryTree.filter((n) => n.children.length === 0);

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
    <div className="space-y-5">
      {/* Pushed header */}
      <div className="relative flex items-center justify-center h-10">
        <button
          onClick={() => router.back()}
          aria-label={tCommon("back")}
          className="absolute left-0 flex items-center justify-center rounded-full transition-transform active:scale-95"
          style={{ width: 40, height: 40, background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
        >
          <ArrowLeft className="w-5 h-5" strokeWidth={1.8} style={{ color: "var(--ink)" }} />
        </button>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>{t("title")}</h1>
        <button
          onClick={() => openModal()}
          aria-label={t("addSubcategory")}
          className="absolute right-0 flex items-center justify-center rounded-full transition-transform active:scale-95"
          style={{ width: 40, height: 40, background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
        >
          <Plus className="w-5 h-5" strokeWidth={1.8} style={{ color: "var(--accent)" }} />
        </button>
      </div>

      {/* 2-segment control */}
      <SegmentControl active="categories" router={router} labelCategories={t("tabCategories")} labelRules={t("tabRules")} />

      <motion.div
        className="space-y-4"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
      >
        {/* Info Note */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.35, ease: EASE }}
          className="text-sm"
          style={{ background: "var(--surface-2)", borderRadius: 16, padding: "12px 16px", color: "var(--ink-muted)" }}
        >
          <span style={{ fontWeight: 600, color: "var(--ink)" }}>{t("note")}:</span> {t("systemNote")}
        </motion.div>

        {/* Add Default Categories Prompt */}
        {showAddDefaultsPrompt && !seedResult && (
          <PromptCard
            icon={<Sparkles className="w-5 h-5" strokeWidth={1.8} style={{ color: "var(--accent)" }} />}
            title={t("addDefaultsTitle")}
            description={t("addDefaultsDescription")}
            actionLabel={isSeeding ? t("addingDefaults") : t("addDefaults")}
            onAction={handleSeedDefaults}
            disabled={isSeeding}
          />
        )}

        {/* Organize into Groups Prompt */}
        {showUpgradePrompt && (
          <PromptCard
            icon={<FolderTree className="w-5 h-5" strokeWidth={1.8} style={{ color: "var(--accent)" }} />}
            title={t("organizeTitle")}
            description={t("organizeDescription")}
            actionLabel={isUpgrading ? t("organizing") : t("organizeButton")}
            onAction={handleUpgradeHierarchy}
            disabled={isUpgrading}
          />
        )}

        {/* Seed Result Toast */}
        {seedResult && (
          <motion.div
            variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.35, ease: EASE }}
            style={{ background: "var(--surface)", borderRadius: 16, padding: 16, boxShadow: "var(--shadow-card)" }}
          >
            <p className="text-sm" style={{ fontWeight: 600, color: seedResult.created > 0 ? "var(--positive)" : "var(--ink-muted)" }}>
              {seedResult.created > 0 ? t("defaultsAdded", { count: seedResult.created }) : t("defaultsAlreadyExist")}
            </p>
            {seedResult.created > 0 && (
              <p className="text-sm mt-1" style={{ color: "var(--ink-muted)" }}>{seedResult.categories.join(", ")}</p>
            )}
          </motion.div>
        )}

        {/* Upgrade Result Toast */}
        {upgradeResult && (
          <motion.div
            variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.35, ease: EASE }}
            style={{ background: "var(--surface)", borderRadius: 16, padding: 16, boxShadow: "var(--shadow-card)" }}
          >
            <p className="text-sm" style={{ fontWeight: 600, color: "var(--positive)" }}>{upgradeResult}</p>
          </motion.div>
        )}

        {/* Unmatched Categories Prompt */}
        {unmatchedCategories.length > 0 && (
          <motion.div
            variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.35, ease: EASE }}
            style={{ background: "var(--surface)", borderRadius: 20, padding: 16, boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center shrink-0" style={{ width: 40, height: 40, borderRadius: 12, background: "var(--accent-fainter)" }}>
                <AlertTriangle className="w-5 h-5" strokeWidth={1.8} style={{ color: "var(--accent-strong)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="mb-1" style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{t("unmatchedTitle")}</h3>
                <p className="text-sm mb-2" style={{ color: "var(--ink-muted)" }}>{t("unmatchedDescription")}</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {unmatchedCategories.map((n) => (
                    <span key={n} style={{ fontSize: 11, fontWeight: 600, background: "var(--accent-fainter)", color: "var(--accent-strong)", borderRadius: 999, padding: "5px 10px" }}>
                      {translateCategory(n)}
                    </span>
                  ))}
                </div>
                <p style={{ fontSize: 11.5, color: "var(--ink-subtle)" }}>{t("unmatchedHint")}</p>
              </div>
              <button onClick={() => setUnmatchedCategories([])} className="p-1 shrink-0" style={{ color: "var(--ink-subtle)" }} aria-label={tCommon("cancel")}>
                <X className="w-4 h-4" strokeWidth={1.8} />
              </button>
            </div>
          </motion.div>
        )}

        {/* Categories List */}
        {isLoading ? (
          <div className="text-center py-10" style={{ color: "var(--ink-subtle)" }}>{tCommon("loading")}</div>
        ) : categories.length === 0 ? (
          <motion.div
            variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.35, ease: EASE }}
            className="text-center"
            style={{ background: "var(--surface)", borderRadius: 20, padding: 40, boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center justify-center mx-auto mb-4" style={{ width: 56, height: 56, borderRadius: 16, background: "var(--surface-2)" }}>
              <Tag className="w-6 h-6" strokeWidth={1.8} style={{ color: "var(--accent)" }} />
            </div>
            <h3 className="mb-1" style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>{t("noCategoriesYet")}</h3>
            <p className="text-sm mb-4" style={{ color: "var(--ink-muted)" }}>{t("createToOrganize")}</p>
            <button onClick={() => openModal()} className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
              {t("createCategory")}
            </button>
          </motion.div>
        ) : (
          <div className="space-y-5">
            {/* Hierarchical groups */}
            {groupNodes.map((node) => {
              const isExpanded = expandedParents.has(node.id);
              const total = getParentExpenseCount(node);
              return (
                <motion.div
                  key={node.id}
                  variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  {/* Group label + parent actions */}
                  <div className="flex items-center justify-between mb-2 px-1">
                    <button onClick={() => toggleParent(node.id)} className="flex items-center gap-1.5 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} style={{ color: "var(--ink-subtle)" }} />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} style={{ color: "var(--ink-subtle)" }} />
                      )}
                      <span className="uppercase truncate" style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.06em", color: "var(--ink-subtle)" }}>
                        {translateCategory(node.name)}
                      </span>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      {total > 0 && (
                        <button
                          onClick={() => viewExpenses(node.id)}
                          title={t("viewExpenses")}
                          className="tabular-nums"
                          style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)", padding: "2px 8px", borderRadius: 999, background: "var(--accent-fainter)" }}
                        >
                          {total}
                        </button>
                      )}
                      {node.isSystem ? (
                        <span title={t("systemLocked")} className="flex items-center justify-center" style={{ width: 28, height: 28 }}>
                          <Lock className="w-3.5 h-3.5" strokeWidth={1.8} style={{ color: "var(--ink-subtle)" }} />
                        </span>
                      ) : (
                        <>
                          <button onClick={() => openModal({ id: node.id, name: node.name, parentId: node.parentId, icon: node.icon, color: node.color, isSystem: node.isSystem ?? false, _count: node._count })} className="flex items-center justify-center" style={{ width: 28, height: 28, color: "var(--ink-subtle)" }} aria-label={t("editCategory")}>
                            <Pencil className="w-3.5 h-3.5" strokeWidth={1.8} />
                          </button>
                          <button onClick={() => setDeleteId(node.id)} className="flex items-center justify-center" style={{ width: 28, height: 28, color: "var(--negative)" }} aria-label={t("deleteCategory")}>
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Group card with subcategory rows */}
                  {isExpanded && (
                    <div style={{ background: "var(--surface)", borderRadius: 20, padding: "6px 16px", boxShadow: "var(--shadow-card)" }}>
                      {node.children.map((child, i) => (
                        <CategoryRow
                          key={child.id}
                          node={child}
                          isLast={i === node.children.length - 1}
                          onEdit={openModal}
                          onDelete={setDeleteId}
                          onViewExpenses={viewExpenses}
                          translateCategory={translateCategory}
                          t={t}
                        />
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}

            {/* Loose leaves (flat / uncategorized top-levels) */}
            {looseNodes.length > 0 && (
              <motion.div
                variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                transition={{ duration: 0.35, ease: EASE }}
                style={{ background: "var(--surface)", borderRadius: 20, padding: "6px 16px", boxShadow: "var(--shadow-card)" }}
              >
                {looseNodes.map((node, i) => (
                  <CategoryRow
                    key={node.id}
                    node={node}
                    isLast={i === looseNodes.length - 1}
                    onEdit={openModal}
                    onDelete={setDeleteId}
                    onViewExpenses={viewExpenses}
                    translateCategory={translateCategory}
                    t={t}
                  />
                ))}
              </motion.div>
            )}
          </div>
        )}
      </motion.div>

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        variant="dialog"
        size="sm"
        as="form"
        onSubmit={handleSubmit}
        zIndexClassName="z-50"
      >
        <ModalHeader showClose={false} className="px-6 pt-6">
          <h2 className="mb-4" style={{ fontSize: 17, fontWeight: 600, color: "var(--ink)" }}>
            {editingCategory ? t("editCategory") : t("newCategory")}
          </h2>
        </ModalHeader>

        <ModalBody className="px-6 pb-0">
            <div className="space-y-4">
              {error && (
                <div className="text-sm" style={{ borderRadius: 14, padding: 12, background: "var(--surface-2)", color: "var(--negative)" }}>{error}</div>
              )}
              <div>
                <label className="block text-sm mb-1.5" style={{ fontWeight: 600, color: "var(--ink)" }}>{t("name")}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder={t("namePlaceholder")}
                  className="w-full focus:outline-none"
                  style={{ borderRadius: 14, border: "1px solid var(--line-strong)", padding: "11px 14px", color: "var(--ink)", background: "var(--surface)" }}
                />
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ fontWeight: 600, color: "var(--ink)" }}>{t("parentCategory")}</label>
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className="w-full focus:outline-none"
                  style={{ borderRadius: 14, border: "1px solid var(--line-strong)", padding: "11px 14px", color: "var(--ink)", background: "var(--surface)" }}
                >
                  {parentCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{translateCategory(cat.name)}</option>
                  ))}
                </select>
              </div>
            </div>
        </ModalBody>

        <ModalFooter className="gap-3 px-6 pb-6 pt-5 md:px-6 md:pb-6">
          <button
            type="button"
            onClick={() => setIsModalOpen(false)}
            className="flex-1"
            style={{ borderRadius: 14, border: "1px solid var(--line-strong)", padding: "11px 0", color: "var(--ink)", fontWeight: 600 }}
          >
            {tCommon("cancel")}
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !name}
            className="flex-1 disabled:opacity-50"
            style={{ borderRadius: 14, padding: "11px 0", background: "var(--accent)", color: "var(--accent-fg)", fontWeight: 600 }}
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
          <h3 className="mb-2" style={{ fontSize: 17, fontWeight: 600, color: "var(--ink)" }}>{t("deleteCategoryQuestion")}</h3>
          <p className="text-sm mb-4" style={{ color: "var(--ink-muted)" }}>{t("moveToCategorized")}</p>
        </ModalBody>
        <ModalFooter className="gap-3 px-6 pb-6 pt-0 md:px-6 md:pb-6">
          <button onClick={() => setDeleteId(null)} className="flex-1" style={{ borderRadius: 14, border: "1px solid var(--line-strong)", padding: "11px 0", color: "var(--ink)", fontWeight: 600 }}>
            {tCommon("cancel")}
          </button>
          <button onClick={() => { if (deleteId) handleDelete(deleteId); }} className="flex-1" style={{ borderRadius: 14, padding: "11px 0", background: "var(--negative)", color: "#fff", fontWeight: 600 }}>
            {tCommon("delete")}
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

/* ==============================
   SHARED 2-SEGMENT CONTROL
   ============================== */
function SegmentControl({
  active,
  router,
  labelCategories,
  labelRules,
}: {
  active: "categories" | "rules";
  router: ReturnType<typeof useRouter>;
  labelCategories: string;
  labelRules: string;
}) {
  const seg = (isActive: boolean, label: string, onClick: () => void) => (
    <button onClick={onClick} className="relative flex-1" style={{ padding: "12.5px 0", borderRadius: 12 }}>
      {isActive && (
        <motion.span
          layoutId="catSegPill"
          className="absolute inset-0"
          style={{ background: "var(--ink)", borderRadius: 12 }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <span className="relative z-10" style={{ fontSize: 12.5, fontWeight: isActive ? 600 : 500, color: isActive ? "#fff" : "var(--ink-muted)" }}>
        {label}
      </span>
    </button>
  );
  return (
    <div className="flex" style={{ background: "var(--surface)", borderRadius: 16, padding: 4, boxShadow: "var(--shadow-card)" }}>
      {seg(active === "categories", labelCategories, () => router.push("/dashboard/categories"))}
      {seg(active === "rules", labelRules, () => router.push("/dashboard/mappings"))}
    </div>
  );
}

/* ==============================
   PROMPT CARD
   ============================== */
function PromptCard({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  disabled: boolean;
}) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.35, ease: EASE }}
      style={{ background: "var(--surface)", borderRadius: 20, padding: 16, boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center shrink-0" style={{ width: 40, height: 40, borderRadius: 12, background: "var(--accent-fainter)" }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="mb-1" style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{title}</h3>
          <p className="text-sm mb-3" style={{ color: "var(--ink-muted)" }}>{description}</p>
          <button
            onClick={onAction}
            disabled={disabled}
            className="text-sm disabled:opacity-50"
            style={{ padding: "9px 16px", borderRadius: 12, background: "var(--accent)", color: "var(--accent-fg)", fontWeight: 600 }}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ==============================
   CATEGORY ROW (subcategory / leaf)
   ============================== */
function CategoryRow({
  node,
  isLast,
  onEdit,
  onDelete,
  onViewExpenses,
  translateCategory,
  t,
}: {
  node: CategoryNode;
  isLast: boolean;
  onEdit: (category: { id: string; name: string; parentId: string | null; icon?: string | null; color?: string | null; isSystem: boolean; _count?: { expenses: number } }) => void;
  onDelete: (id: string) => void;
  onViewExpenses: (categoryId: string) => void;
  translateCategory: (name: string) => string;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const count = node._count?.expenses ?? 0;
  const tint = node.color || undefined;

  return (
    <div
      className="flex items-center gap-3"
      style={{ padding: "11px 0", borderBottom: isLast ? "none" : "1px solid var(--line)" }}
    >
      <div
        className="flex items-center justify-center shrink-0"
        style={{ width: 38, height: 38, borderRadius: 12, background: tint ? `${tint}22` : "var(--surface-2)" }}
      >
        {node.icon ? (
          <span style={{ fontSize: 16 }}>{node.icon}</span>
        ) : (
          <Tag className="w-4 h-4" strokeWidth={1.8} style={{ color: tint || "var(--accent)" }} />
        )}
      </div>
      <button
        onClick={() => !node.isSystem && onEdit({ id: node.id, name: node.name, parentId: node.parentId, icon: node.icon, color: node.color, isSystem: node.isSystem ?? false, _count: node._count })}
        className="flex-1 text-left min-w-0"
        disabled={node.isSystem}
      >
        <div className="truncate" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{translateCategory(node.name)}</div>
        <div style={{ fontSize: 11.5, color: "var(--ink-subtle)" }}>{t("expensesCount", { count })}</div>
      </button>
      <div className="flex items-center gap-1 shrink-0">
        {count > 0 && (
          <button
            onClick={() => onViewExpenses(node.id)}
            title={t("viewExpenses")}
            className="tabular-nums"
            style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)", padding: "2px 8px", borderRadius: 999, background: "var(--accent-fainter)" }}
          >
            {count}
          </button>
        )}
        {node.isSystem ? (
          <span title={t("systemLocked")} className="flex items-center justify-center" style={{ width: 28, height: 28 }}>
            <Lock className="w-3.5 h-3.5" strokeWidth={1.8} style={{ color: "var(--ink-subtle)" }} />
          </span>
        ) : (
          <>
            <button onClick={() => onEdit({ id: node.id, name: node.name, parentId: node.parentId, icon: node.icon, color: node.color, isSystem: node.isSystem ?? false, _count: node._count })} className="flex items-center justify-center" style={{ width: 28, height: 28, color: "var(--ink-subtle)" }} aria-label={t("editCategory")}>
              <Pencil className="w-3.5 h-3.5" strokeWidth={1.8} />
            </button>
            <button onClick={() => onDelete(node.id)} className="flex items-center justify-center" style={{ width: 28, height: 28, color: "var(--negative)" }} aria-label={t("deleteCategory")}>
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
