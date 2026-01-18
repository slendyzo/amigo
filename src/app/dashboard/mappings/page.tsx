"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useCategoryTranslation } from "@/hooks/use-category-translation";

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

export default function KeywordMappingsPage() {
  const t = useTranslations("mappings");
  const tCommon = useTranslations("common");
  const { translateCategory } = useCategoryTranslation();

  const [mappings, setMappings] = useState<KeywordMapping[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<KeywordMapping | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [mappingsRes, categoriesRes] = await Promise.all([
        fetch("/api/keyword-mappings"),
        fetch("/api/categories"),
      ]);

      if (mappingsRes.ok) {
        const data = await mappingsRes.json();
        setMappings(data.mappings || []);
      }
      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        setCategories(data.categories || []);
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
    return EXPENSE_TYPES.find((t) => t.value === type)?.label || type;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
          <p className="text-slate-500 text-sm mt-1">
            {t("subtitle")}
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 bg-[#0070f3] text-white px-4 py-2 rounded-lg hover:bg-[#0060df] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t("addMapping")}
        </button>
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">{t("howItWorks")}</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li>{t("howItWorksItem1")}</li>
              <li>{t("howItWorksItem2")}</li>
              <li>{t("howItWorksItem3")}</li>
              <li>{t("howItWorksItem4")}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Mappings Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">{tCommon("loading")}</div>
        ) : mappings.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-slate-400 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">{t("noMappingsYet")}</h3>
            <p className="text-slate-500 text-sm mb-4">{t("createMappingsHint")}</p>
            <button
              onClick={() => openModal()}
              className="text-[#0070f3] hover:underline text-sm font-medium"
            >
              {t("createFirstMapping")}
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">{t("keyword")}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">{t("category")}</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">{t("expenseType")}</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-slate-600">{t("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mappings.map((mapping) => (
                <tr key={mapping.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <code className="text-sm bg-slate-100 px-2 py-1 rounded text-slate-800">
                      {mapping.keyword}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {mapping.category ? translateCategory(mapping.category.name) : "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {mapping.expenseType ? getTypeLabel(mapping.expenseType) : "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openModal(mapping)}
                        className="text-slate-500 hover:text-slate-700 p-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteId(mapping.id)}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              {editingMapping ? t("editMapping") : t("newMapping")}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t("keyword")}</label>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  required
                  placeholder={t("keywordPlaceholder")}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
                />
                <p className="mt-1 text-xs text-slate-500">
                  {t("keywordHint")}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t("category")}</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
                >
                  <option value="">{t("noCategoryMapping")}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {translateCategory(cat.name)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t("expenseType")}</label>
                <select
                  value={expenseType}
                  onChange={(e) => setExpenseType(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3]"
                >
                  <option value="">{t("noTypeMapping")}</option>
                  {EXPENSE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
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
                  disabled={isSubmitting || !keyword}
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
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{t("deleteMappingQuestion")}</h3>
            <p className="text-slate-600 text-sm mb-4">
              {t("deleteMappingHint")}
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
