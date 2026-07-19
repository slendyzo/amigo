"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowLeft, Plus, Pencil, Trash2, ChevronDown, Info } from "lucide-react";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import NudgeKeywordCard from "@/components/nudge-keyword-card";

const EASE = [0.16, 1, 0.3, 1] as const;

type Category = {
  id: string;
  name: string;
};

type KeywordMapping = {
  id: string;
  keyword: string;
  categoryId: string | null;
  expenseType: string | null;
  category: Category | null;
};

type BuiltinKeyword = {
  keyword: string;
  merchant: string;
  category: string;
};

type NudgeCandidate = {
  merchantKey: string;
  categoryId: string;
  categoryName: string;
  count: number;
};

export default function KeywordMappingsPage() {
  const t = useTranslations("mappings");
  const tCommon = useTranslations("common");
  const { translateCategory } = useCategoryTranslation();
  const router = useRouter();

  const [nudgeCandidates, setNudgeCandidates] = useState<NudgeCandidate[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);

  const [mappings, setMappings] = useState<KeywordMapping[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [builtins, setBuiltins] = useState<BuiltinKeyword[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<KeywordMapping | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showBuiltins, setShowBuiltins] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  // Form state
  const [keyword, setKeyword] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [expenseType, setExpenseType] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const EXPENSE_TYPES = [
    { value: "SURVIVAL_FIXED", label: t("types.fixed") },
    { value: "SURVIVAL_VARIABLE", label: t("types.variable") },
    { value: "LIFESTYLE", label: t("types.lifestyle") },
    { value: "PROJECT", label: t("types.project") },
  ];

  // Set of custom mapping keywords (lowercase) to detect overrides
  const customKeywordSet = useMemo(
    () => new Set(mappings.map((m) => m.keyword.toLowerCase())),
    [mappings]
  );

  useEffect(() => {
    fetchData();
    fetchNudges();
  }, []);

  const fetchNudges = async () => {
    try {
      const [advisorRes, nudgesRes] = await Promise.all([
        fetch("/api/user/advisor-state"),
        fetch("/api/insights/nudges/keyword"),
      ]);
      if (advisorRes.ok) {
        const data = await advisorRes.json();
        setAiEnabled(data.aiProcessingEnabled === true);
      }
      if (nudgesRes.ok) {
        const data = await nudgesRes.json();
        setNudgeCandidates(data.candidates ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch nudges:", err);
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [mappingsRes, categoriesRes, builtinsRes] = await Promise.all([
        fetch("/api/keyword-mappings"),
        fetch("/api/categories"),
        fetch("/api/keyword-mappings/builtins"),
      ]);

      if (mappingsRes.ok) {
        const data = await mappingsRes.json();
        setMappings(data.mappings || []);
      }
      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        setCategories(data.categories || []);
      }
      if (builtinsRes.ok) {
        const data = await builtinsRes.json();
        setBuiltins(data.builtins || []);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setKeyword("");
    setCategoryId("");
    setExpenseType("");
    setEditingMapping(null);
    setError("");
  };

  const openModal = (mapping?: KeywordMapping) => {
    if (mapping) {
      setEditingMapping(mapping);
      setKeyword(mapping.keyword);
      setCategoryId(mapping.categoryId || "");
      setExpenseType(mapping.expenseType || "");
    } else {
      resetForm();
    }
    setIsModalOpen(true);
  };

  const openOverrideModal = (builtin: BuiltinKeyword) => {
    resetForm();
    setKeyword(builtin.keyword);
    // Try to pre-select the category that matches the builtin's category name
    const matchingCat = categories.find((c) => c.name === builtin.category);
    if (matchingCat) {
      setCategoryId(matchingCat.id);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    if (!categoryId && !expenseType) {
      setError(t("selectCategoryOrType"));
      setIsSubmitting(false);
      return;
    }

    try {
      const body = {
        keyword,
        categoryId: categoryId || null,
        expenseType: expenseType || null,
      };

      const url = editingMapping ? `/api/keyword-mappings/${editingMapping.id}` : "/api/keyword-mappings";
      const method = editingMapping ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save mapping");
      }

      setIsModalOpen(false);
      resetForm();
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/keyword-mappings/${id}`, { method: "DELETE" });
      if (response.ok) {
        setMappings(mappings.filter((m) => m.id !== id));
      }
    } catch (error) {
      console.error("Failed to delete mapping:", error);
    }
    setDeleteId(null);
  };

  const getTypeLabel = (type: string) => {
    return EXPENSE_TYPES.find((ty) => ty.value === type)?.label || type;
  };

  // Build preview chips: custom mappings first, then builtins that map to a category
  const previewItems = useMemo(() => {
    const items: { keyword: string; category: string }[] = [];
    mappings.forEach((m) => {
      if (m.category) items.push({ keyword: m.keyword, category: translateCategory(m.category.name) });
    });
    builtins.forEach((b) => {
      if (!customKeywordSet.has(b.keyword.toLowerCase())) {
        items.push({ keyword: b.keyword, category: translateCategory(b.category) });
      }
    });
    return items;
  }, [mappings, builtins, customKeywordSet, translateCategory]);

  const PREVIEW_LIMIT = 6;
  const previewShown = previewItems.slice(0, PREVIEW_LIMIT);
  const previewMore = previewItems.length - previewShown.length;

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
        <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>{t("tabRules")}</h1>
        <button
          onClick={() => openModal()}
          aria-label={t("addMapping")}
          className="absolute right-0 flex items-center justify-center rounded-full transition-transform active:scale-95"
          style={{ width: 40, height: 40, background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
        >
          <Plus className="w-5 h-5" strokeWidth={1.8} style={{ color: "var(--accent)" }} />
        </button>
      </div>

      {/* 2-segment control */}
      <SegmentControl active="rules" router={router} labelCategories={t("tabCategories")} labelRules={t("tabRules")} />

      {/* Keyword nudge cards */}
      {aiEnabled && nudgeCandidates.length > 0 && (
        <div className="flex flex-col gap-2">
          {nudgeCandidates.map((c) => (
            <NudgeKeywordCard
              key={`${c.merchantKey}::${c.categoryId}`}
              merchantKey={c.merchantKey}
              categoryId={c.categoryId}
              categoryName={c.categoryName}
              count={c.count}
              onAccepted={() => {
                setNudgeCandidates((prev) =>
                  prev.filter(
                    (x) => !(x.merchantKey === c.merchantKey && x.categoryId === c.categoryId)
                  )
                );
                router.refresh();
              }}
            />
          ))}
        </div>
      )}

      <motion.div
        className="space-y-4"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
      >
        {/* Keyword rules preview */}
        {!isLoading && previewItems.length > 0 && (
          <motion.div
            variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.35, ease: EASE }}
            style={{ background: "var(--surface-2)", borderRadius: 20, padding: "14px 16px" }}
          >
            <p className="mb-2" style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-strong)" }}>{t("rulesPreview")}</p>
            <div className="flex flex-wrap gap-2">
              {previewShown.map((it, i) => (
                <span key={`${it.keyword}-${i}`} style={{ fontSize: 11, fontWeight: 600, color: "var(--ink)", background: "var(--surface)", borderRadius: 12, padding: "5px 10px" }}>
                  &quot;{it.keyword}&quot; <span style={{ color: "var(--ink-subtle)" }}>&rarr;</span> {it.category}
                </span>
              ))}
              {previewMore > 0 && (
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)", borderRadius: 12, padding: "5px 10px" }}>
                  {t("moreCount", { count: previewMore })}
                </span>
              )}
            </div>
          </motion.div>
        )}

        {/* How it works (collapsible) */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.35, ease: EASE }}
          style={{ background: "var(--surface)", borderRadius: 20, boxShadow: "var(--shadow-card)", overflow: "hidden" }}
        >
          <button onClick={() => setShowHowItWorks((v) => !v)} className="w-full flex items-center gap-3" style={{ padding: "14px 16px" }}>
            <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 32, borderRadius: 12, background: "var(--accent-fainter)" }}>
              <Info className="w-4 h-4" strokeWidth={1.8} style={{ color: "var(--accent)" }} />
            </div>
            <span className="flex-1 text-left" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{t("howItWorks")}</span>
            <ChevronDown className="w-4 h-4 shrink-0" strokeWidth={1.8} style={{ color: "var(--ink-subtle)", transform: showHowItWorks ? "rotate(180deg)" : "none", transition: "transform .2s var(--ease)" }} />
          </button>
          {showHowItWorks && (
            <ul className="space-y-1.5" style={{ padding: "0 16px 16px 60px", listStyle: "disc" }}>
              <li className="text-sm" style={{ color: "var(--ink-muted)" }}>{t("howItWorksItem1")}</li>
              <li className="text-sm" style={{ color: "var(--ink-muted)" }}>{t("howItWorksItem2")}</li>
              <li className="text-sm" style={{ color: "var(--ink-muted)" }}>{t("howItWorksItem3")}</li>
              <li className="text-sm" style={{ color: "var(--ink-muted)" }}>{t("howItWorksItem4")}</li>
            </ul>
          )}
        </motion.div>

        {/* Custom mappings */}
        <motion.div variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }} transition={{ duration: 0.35, ease: EASE }}>
          <div className="px-1 mb-2">
            <h2 className="uppercase" style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.06em", color: "var(--ink-subtle)" }}>{t("yourMappings")}</h2>
          </div>
          {isLoading ? (
            <div className="text-center py-10" style={{ color: "var(--ink-subtle)" }}>{tCommon("loading")}</div>
          ) : mappings.length === 0 ? (
            <div className="text-center" style={{ background: "var(--surface)", borderRadius: 20, padding: 40, boxShadow: "var(--shadow-card)" }}>
              <h3 className="mb-1" style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>{t("noMappingsYet")}</h3>
              <p className="text-sm mb-4" style={{ color: "var(--ink-muted)" }}>{t("createMappingsHint")}</p>
              <button onClick={() => openModal()} className="text-sm font-semibold" style={{ color: "var(--accent)" }}>{t("createFirstMapping")}</button>
            </div>
          ) : (
            <div style={{ background: "var(--surface)", borderRadius: 20, padding: "6px 16px", boxShadow: "var(--shadow-card)" }}>
              {mappings.map((mapping, i) => (
                <div key={mapping.id} className="flex items-center gap-3" style={{ padding: "11px 0", borderBottom: i === mappings.length - 1 ? "none" : "1px solid var(--line)" }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", background: "var(--surface-2)", borderRadius: 8, padding: "2px 8px" }}>{mapping.keyword}</span>
                      <span style={{ fontSize: 11.5, color: "var(--ink-subtle)" }}>&rarr;</span>
                      <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
                        {mapping.category ? translateCategory(mapping.category.name) : "—"}
                        {mapping.expenseType && (
                          <span style={{ color: "var(--ink-subtle)" }}> · {getTypeLabel(mapping.expenseType)}</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openModal(mapping)} className="flex items-center justify-center" style={{ width: 28, height: 28, color: "var(--ink-subtle)" }} aria-label={t("editMapping")}>
                      <Pencil className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                    <button onClick={() => setDeleteId(mapping.id)} className="flex items-center justify-center" style={{ width: 28, height: 28, color: "var(--negative)" }} aria-label={t("deleteMappingQuestion")}>
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Built-in keywords (collapsible) */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.35, ease: EASE }}
          style={{ background: "var(--surface)", borderRadius: 20, boxShadow: "var(--shadow-card)", overflow: "hidden" }}
        >
          <button onClick={() => setShowBuiltins(!showBuiltins)} className="w-full flex items-center gap-3" style={{ padding: "14px 16px" }}>
            <div className="flex-1 text-left">
              <h2 style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{t("builtinKeywords")}</h2>
              <p style={{ fontSize: 11.5, color: "var(--ink-subtle)", marginTop: 2 }}>{t("builtinHint", { count: builtins.length })}</p>
            </div>
            <ChevronDown className="w-4 h-4 shrink-0" strokeWidth={1.8} style={{ color: "var(--ink-subtle)", transform: showBuiltins ? "rotate(180deg)" : "none", transition: "transform .2s var(--ease)" }} />
          </button>
          {showBuiltins && (
            <div style={{ padding: "0 16px", borderTop: "1px solid var(--line)" }}>
              {builtins.map((builtin, i) => {
                const isOverridden = customKeywordSet.has(builtin.keyword.toLowerCase());
                return (
                  <div
                    key={builtin.keyword}
                    className="flex items-center gap-3"
                    style={{ padding: "11px 0", borderBottom: i === builtins.length - 1 ? "none" : "1px solid var(--line)", opacity: isOverridden ? 0.5 : 1 }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          style={{
                            fontSize: 12.5,
                            fontWeight: 600,
                            color: "var(--ink)",
                            background: "var(--surface-2)",
                            borderRadius: 8,
                            padding: "2px 8px",
                            textDecoration: isOverridden ? "line-through" : "none",
                          }}
                        >
                          {builtin.keyword}
                        </span>
                        {isOverridden && (
                          <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--accent-strong)", background: "var(--accent-fainter)", borderRadius: 999, padding: "2px 8px" }}>{t("overridden")}</span>
                        )}
                        <span style={{ fontSize: 11.5, color: "var(--ink-subtle)" }}>&rarr;</span>
                        <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>{translateCategory(builtin.category)}</span>
                      </div>
                      <p style={{ fontSize: 11.5, color: "var(--ink-subtle)", marginTop: 1 }}>{builtin.merchant}</p>
                    </div>
                    {!isOverridden && (
                      <button onClick={() => openOverrideModal(builtin)} className="shrink-0" style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>{t("override")}</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsModalOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="relative w-full max-w-md mx-4"
            style={{ background: "var(--surface)", borderRadius: 20, padding: 24, boxShadow: "var(--shadow-pop)" }}
          >
            <h2 className="mb-4" style={{ fontSize: 17, fontWeight: 600, color: "var(--ink)" }}>
              {editingMapping ? t("editMapping") : t("newMapping")}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="text-sm" style={{ borderRadius: 14, padding: 12, background: "var(--surface-2)", color: "var(--negative)" }}>{error}</div>
              )}
              <div>
                <label className="block text-sm mb-1.5" style={{ fontWeight: 600, color: "var(--ink)" }}>{t("keyword")}</label>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  required
                  placeholder={t("keywordPlaceholder")}
                  className="w-full focus:outline-none"
                  style={{ borderRadius: 14, border: "1px solid var(--line-strong)", padding: "11px 14px", color: "var(--ink)", background: "var(--surface)" }}
                />
                <p className="mt-1.5" style={{ fontSize: 11.5, color: "var(--ink-subtle)" }}>{t("keywordHint")}</p>
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ fontWeight: 600, color: "var(--ink)" }}>{t("category")}</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full focus:outline-none"
                  style={{ borderRadius: 14, border: "1px solid var(--line-strong)", padding: "11px 14px", color: "var(--ink)", background: "var(--surface)" }}
                >
                  <option value="">{t("noCategoryMapping")}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{translateCategory(cat.name)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1.5" style={{ fontWeight: 600, color: "var(--ink)" }}>{t("expenseType")}</label>
                <select
                  value={expenseType}
                  onChange={(e) => setExpenseType(e.target.value)}
                  className="w-full focus:outline-none"
                  style={{ borderRadius: 14, border: "1px solid var(--line-strong)", padding: "11px 14px", color: "var(--ink)", background: "var(--surface)" }}
                >
                  <option value="">{t("noTypeMapping")}</option>
                  {EXPENSE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-1">
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
                  disabled={isSubmitting || !keyword}
                  className="flex-1 disabled:opacity-50"
                  style={{ borderRadius: 14, padding: "11px 0", background: "var(--accent)", color: "var(--accent-fg)", fontWeight: 600 }}
                >
                  {isSubmitting ? t("saving") : tCommon("save")}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteId(null)} />
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="relative w-full max-w-sm mx-4"
            style={{ background: "var(--surface)", borderRadius: 20, padding: 24, boxShadow: "var(--shadow-pop)" }}
          >
            <h3 className="mb-2" style={{ fontSize: 17, fontWeight: 600, color: "var(--ink)" }}>{t("deleteMappingQuestion")}</h3>
            <p className="text-sm mb-4" style={{ color: "var(--ink-muted)" }}>{t("deleteMappingHint")}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1" style={{ borderRadius: 14, border: "1px solid var(--line-strong)", padding: "11px 0", color: "var(--ink)", fontWeight: 600 }}>
                {tCommon("cancel")}
              </button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1" style={{ borderRadius: 14, padding: "11px 0", background: "var(--negative)", color: "#fff", fontWeight: 600 }}>
                {tCommon("delete")}
              </button>
            </div>
          </motion.div>
        </div>
      )}
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
