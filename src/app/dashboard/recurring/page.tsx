"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import MoneyHubTabs from "@/components/money-hub-tabs";
import MerchantAvatar from "@/components/ui/merchant-avatar";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import { formatCurrency } from "@/lib/currencies";
import NudgeRecurringCard from "@/components/nudge-recurring-card";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

type Category = { id: string; name: string };
type BankAccount = { id: string; name: string };
type Project = { id: string; name: string };

type Template = {
  id: string;
  name: string;
  type: string;
  amount: number | null;
  currency: string;
  interval: string;
  dayOfMonth: number | null;
  isActive: boolean;
  autoGenerate: boolean;
  lastGenerated: string | null;
  nextDue: string | null;
  description: string | null;
  excludeFromBudget: boolean;
  installmentMonths?: number | null;
  installmentTotal?: number | null;
  category: Category | null;
  bankAccount: BankAccount | null;
  projects: Project[];
  _count: { expenses: number };
};

type NudgeCandidate = {
  name: string;
  amount: number;
  dayOfMonth: number;
  monthsObserved: number;
  sampleExpenseIds: string[];
};

const EASE = [0.16, 1, 0.3, 1] as const;
const sectionMotion = (i: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: EASE, delay: i * 0.05 },
});
const cardShadow = { boxShadow: "var(--shadow-card)" };

// Heuristic: a template is a "Subscription" when its category or name matches
// known subscription/streaming/membership keywords; everything else (rent,
// loans, utilities, installment plans) falls under "Bills & loans".
const SUBSCRIPTION_KEYWORDS = [
  "subscription", "subscri", "assinatura", "abonnement", "streaming", "membership",
  "spotify", "netflix", "disney", "hbo", "youtube", "prime", "apple", "icloud",
  "gym", "ginás", "ginas", "plan", "premium",
];
function isSubscription(tpl: Template): boolean {
  if (tpl.installmentMonths) return false; // installment plans are loans → Bills
  const hay = `${tpl.name} ${tpl.category?.name ?? ""}`.toLowerCase();
  return SUBSCRIPTION_KEYWORDS.some((k) => hay.includes(k));
}

export default function RecurringTemplatesPage() {
  const t = useTranslations("recurring");
  const tCommon = useTranslations("common");
  const tTime = useTranslations("time");
  const { translateCategory } = useCategoryTranslation();
  const router = useRouter();

  const EXPENSE_TYPES = [
    { value: "SURVIVAL_FIXED", label: t("expenseTypes.survivalFixed") },
    { value: "SURVIVAL_VARIABLE", label: t("expenseTypes.survivalVariable") },
    { value: "LIFESTYLE", label: t("expenseTypes.lifestyle") },
    { value: "PROJECT", label: t("expenseTypes.project") },
  ];

  const MONTHS = [
    tTime("months.january"), tTime("months.february"), tTime("months.march"),
    tTime("months.april"), tTime("months.may"), tTime("months.june"),
    tTime("months.july"), tTime("months.august"), tTime("months.september"),
    tTime("months.october"), tTime("months.november"), tTime("months.december")
  ];

  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const [nudgeCandidates, setNudgeCandidates] = useState<NudgeCandidate[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);

  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateMonth, setGenerateMonth] = useState(new Date().getMonth());
  const [generateYear, setGenerateYear] = useState(new Date().getFullYear());
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<string | null>(null);
  const [templateOverrides, setTemplateOverrides] = useState<Record<string, { selected: boolean; day: string }>>({});

  const [formData, setFormData] = useState({
    name: "", type: "SURVIVAL_FIXED", amount: "", currency: "EUR", dayOfMonth: "",
    categoryId: "", bankAccountId: "", autoGenerate: false, projectIds: [] as string[],
    excludeFromBudget: false, description: "",
  });

  const emptyForm = {
    name: "", type: "SURVIVAL_FIXED", amount: "", currency: "EUR", dayOfMonth: "",
    categoryId: "", bankAccountId: "", autoGenerate: false, projectIds: [] as string[],
    excludeFromBudget: false, description: "",
  };

  const fetchNudgeCandidates = useCallback(async () => {
    try {
      const [stateRes, nudgesRes] = await Promise.all([
        fetch("/api/user/advisor-state"),
        fetch("/api/insights/nudges/recurring"),
      ]);
      const stateData = await stateRes.json();
      if (stateData.aiProcessingEnabled) {
        setAiEnabled(true);
        const nudgesData = await nudgesRes.json();
        if (nudgesData.candidates) setNudgeCandidates(nudgesData.candidates);
      }
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchCategories();
    fetchBankAccounts();
    fetchProjects();
    fetchNudgeCandidates();
  }, [fetchNudgeCandidates]);

  const fetchTemplates = async () => {
    try {
      const data = await (await fetch("/api/recurring-templates")).json();
      if (data.templates) setTemplates(data.templates);
    } catch (error) {
      console.error("Failed to fetch templates:", error);
    } finally {
      setIsLoading(false);
    }
  };
  const fetchCategories = async () => {
    try {
      const data = await (await fetch("/api/categories")).json();
      if (data.categories) setCategories(data.categories);
    } catch (error) { console.error("Failed to fetch categories:", error); }
  };
  const fetchBankAccounts = async () => {
    try {
      const data = await (await fetch("/api/bank-accounts")).json();
      if (data.bankAccounts) setBankAccounts(data.bankAccounts);
    } catch (error) { console.error("Failed to fetch bank accounts:", error); }
  };
  const fetchProjects = async () => {
    try {
      const data = await (await fetch("/api/projects")).json();
      if (data.projects) setProjects(data.projects);
    } catch (error) { console.error("Failed to fetch projects:", error); }
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) return;
    try {
      const response = await fetch("/api/recurring-templates", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formData),
      });
      if (response.ok) { setFormData(emptyForm); setIsCreating(false); fetchTemplates(); }
    } catch (error) { console.error("Failed to create template:", error); }
  };

  const handleUpdate = async (id: string) => {
    if (!formData.name.trim()) return;
    try {
      const response = await fetch(`/api/recurring-templates/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formData),
      });
      if (response.ok) { setEditingId(null); fetchTemplates(); }
    } catch (error) { console.error("Failed to update template:", error); }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/recurring-templates/${id}`, { method: "DELETE" });
      if (response.ok) { setConfirmDeleteId(null); fetchTemplates(); }
    } catch (error) { console.error("Failed to delete template:", error); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const response = await fetch("/api/recurring-templates", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (response.ok) { setSelectedIds(new Set()); setSelectionMode(false); setConfirmBulkDelete(false); fetchTemplates(); }
    } catch (error) { console.error("Failed to bulk delete templates:", error); }
    finally { setIsDeleting(false); }
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id); else newSelected.add(id);
    setSelectedIds(newSelected);
  };
  const selectAll = () => setSelectedIds(new Set(templates.map((tpl) => tpl.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const handleToggleActive = async (template: Template) => {
    try {
      const response = await fetch(`/api/recurring-templates/${template.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: template.name, isActive: !template.isActive }),
      });
      if (response.ok) fetchTemplates();
    } catch (error) { console.error("Failed to toggle template:", error); }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateResult(null);
    try {
      const selectedTemplates = Object.entries(templateOverrides)
        .filter(([, o]) => o.selected)
        .map(([id, o]) => ({ id, dayOverride: o.day ? parseInt(o.day) : null }));
      const response = await fetch("/api/recurring-templates/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: generateMonth, year: generateYear, templateOverrides: selectedTemplates }),
      });
      const data = await response.json();
      setGenerateResult(data.message || "Done!");
      fetchTemplates();
    } catch (error) {
      console.error("Failed to generate expenses:", error);
      setGenerateResult("Failed to generate expenses");
    } finally { setIsGenerating(false); }
  };

  const startEditing = (template: Template) => {
    setFormData({
      name: template.name, type: template.type, amount: template.amount?.toString() || "",
      currency: template.currency, dayOfMonth: template.dayOfMonth?.toString() || "",
      categoryId: template.category?.id || "", bankAccountId: template.bankAccount?.id || "",
      autoGenerate: template.autoGenerate || false, projectIds: template.projects?.map((p) => p.id) || [],
      excludeFromBudget: template.excludeFromBudget || false, description: template.description || "",
    });
    setEditingId(template.id);
    setIsCreating(false);
  };

  const startCreating = () => { setFormData(emptyForm); setIsCreating(true); setEditingId(null); };

  const getTypeLabel = (type: string) => EXPENSE_TYPES.find((tp) => tp.value === type)?.label || type;

  const activeTemplates = templates.filter((tpl) => tpl.isActive);
  const monthlyTotal = activeTemplates.filter((tpl) => tpl.amount).reduce((sum, tpl) => sum + parseFloat(String(tpl.amount || 0)), 0);

  const bills = templates.filter((tpl) => !isSubscription(tpl));
  const subs = templates.filter((tpl) => isSubscription(tpl));

  // Shared input styling for the create/edit forms
  const inputStyle = { background: "var(--app-bg)", color: "var(--ink)", border: "1px solid var(--line)" };
  const inputCls = "w-full rounded-[12px] px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[var(--accent)]";
  const labelCls = "mb-1 block text-[12px] font-medium";

  const templateRow = (template: Template, idx: number, count: number) => {
    const paused = !template.isActive;
    const isInstallment = !!template.installmentMonths;
    const paid = template._count.expenses;
    const totalInst = template.installmentMonths || 0;
    const isVariable = template.type === "SURVIVAL_VARIABLE";
    const dayPart = template.dayOfMonth ? t("dayShort", { day: template.dayOfMonth }) : t("intervals.monthly");
    let subtitle: string;
    if (isInstallment) subtitle = `${dayPart} · ${t("installmentProgress", { current: paid, total: totalInst })}`;
    else if (paused) subtitle = t("paused");
    else subtitle = `${dayPart} · ${getTypeLabel(template.type)}${isVariable ? ` · ${t("varies")}` : ""}`;

    const amountNode =
      template.amount != null
        ? `${isVariable ? "~" : ""}${formatCurrency(Number(template.amount), template.currency)}`
        : t("variable");

    return (
      <div key={template.id} className="py-[11px]" style={{ borderBottom: idx < count - 1 ? "1px solid var(--line)" : "none" }}>
        <div className="flex items-center gap-3">
          {selectionMode ? (
            <button
              type="button"
              onClick={() => toggleSelection(template.id)}
              className="flex h-5 w-5 flex-none items-center justify-center rounded-[6px]"
              style={{ border: selectedIds.has(template.id) ? "none" : "1.5px solid var(--line-strong)", background: selectedIds.has(template.id) ? "var(--accent)" : "transparent" }}
            >
              {selectedIds.has(template.id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>}
            </button>
          ) : null}
          <div style={paused ? { opacity: 0.55 } : undefined}>
            <MerchantAvatar name={template.name} category={template.category?.name} />
          </div>
          <button type="button" onClick={() => startEditing(template)} className="min-w-0 flex-1 text-left tap-none">
            <div className="truncate text-[13.5px] font-semibold" style={{ color: paused ? "var(--ink-subtle)" : "var(--ink)" }}>
              {template.name}
            </div>
            <div className="truncate text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>{subtitle}</div>
          </button>
          <div className="flex items-center gap-2.5">
            <span className="text-[13.5px] font-semibold tabular-nums" style={{ color: paused ? "var(--ink-subtle)" : "var(--ink)" }}>
              {amountNode}
            </span>
            {!selectionMode && (
              <button
                type="button"
                onClick={() => handleToggleActive(template)}
                aria-label="Toggle active"
                className="relative flex-none tap-none"
                style={{ width: 36, height: 21, borderRadius: 11, background: template.isActive ? "var(--accent)" : "var(--surface-3)", transition: "background .2s var(--ease)" }}
              >
                <span
                  className="absolute top-[2.5px] h-4 w-4 rounded-full bg-white"
                  style={{ left: template.isActive ? "17.5px" : "2.5px", transition: "left .2s var(--ease)" }}
                />
              </button>
            )}
          </div>
        </div>
        {isInstallment && totalInst > 0 && (
          <div className="mt-2 ml-[50px] h-[5px] rounded-[3px]" style={{ background: "var(--surface-2)" }}>
            <div className="h-full rounded-[3px]" style={{ width: `${Math.min(100, (paid / totalInst) * 100)}%`, background: "var(--accent-soft)" }} />
          </div>
        )}
      </div>
    );
  };

  const groupCard = (label: string, list: Template[]) => (
    <div>
      <div className="mb-2 px-1 text-[11.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--ink-subtle)" }}>{label}</div>
      <div className="rounded-[20px] px-4 py-1.5" style={{ background: "var(--surface)", ...cardShadow }}>
        {list.map((tpl, i) => templateRow(tpl, i, list.length))}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 md:max-w-[640px]">
        <MoneyHubTabs active="recurring" />
        <div className="h-24 animate-pulse rounded-[20px]" style={{ background: "var(--surface-2)" }} />
        <div className="h-64 animate-pulse rounded-[20px]" style={{ background: "var(--surface-2)" }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:max-w-[640px]" style={{ color: "var(--ink)" }}>
      <MoneyHubTabs active="recurring" />

      {/* Summary card */}
      <motion.div {...sectionMotion(1)}>
        <div className="flex items-center justify-between rounded-[20px] px-[18px] py-4" style={{ background: "var(--surface)", ...cardShadow }}>
          <div>
            <div className="text-[12px]" style={{ color: "var(--ink-muted)" }}>{t("monthlyCommitments")}</div>
            <div className="text-[24px] font-bold tracking-[-0.02em] tabular-nums">{formatCurrency(monthlyTotal, "EUR")}</div>
          </div>
          <div className="text-right text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>
            {t("activeCountLabel", { count: activeTemplates.length })}
          </div>
        </div>
      </motion.div>

      {/* Action row */}
      <motion.div {...sectionMotion(2)} className="flex items-center gap-2">
        {selectionMode ? (
          <>
            <button onClick={selectAll} className="tap-none rounded-[12px] px-3 py-2 text-[12.5px] font-medium" style={{ background: "var(--surface)", color: "var(--ink-muted)", ...cardShadow }}>{tCommon("selectAll")}</button>
            <button onClick={deselectAll} className="tap-none rounded-[12px] px-3 py-2 text-[12.5px] font-medium" style={{ background: "var(--surface)", color: "var(--ink-muted)", ...cardShadow }}>{tCommon("deselectAll")}</button>
            <button onClick={() => setConfirmBulkDelete(true)} disabled={selectedIds.size === 0} className="tap-none rounded-[12px] px-3 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40" style={{ background: "var(--negative)" }}>
              {tCommon("delete")} ({selectedIds.size})
            </button>
            <button onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }} className="tap-none px-3 py-2 text-[12.5px]" style={{ color: "var(--ink-muted)" }}>{tCommon("cancel")}</button>
          </>
        ) : (
          <>
            {templates.length > 0 && (
              <button onClick={() => setSelectionMode(true)} className="tap-none rounded-[12px] px-3 py-2 text-[12.5px] font-medium" style={{ background: "var(--surface)", color: "var(--ink-muted)", ...cardShadow }}>{t("select")}</button>
            )}
            <button
              onClick={() => {
                const overrides: Record<string, { selected: boolean; day: string }> = {};
                templates.filter((tpl) => tpl.isActive).forEach((tpl) => { overrides[tpl.id] = { selected: true, day: tpl.dayOfMonth?.toString() || "" }; });
                setTemplateOverrides(overrides);
                setShowGenerateModal(true);
              }}
              className="tap-none rounded-[12px] px-3 py-2 text-[12.5px] font-medium" style={{ background: "var(--surface)", color: "var(--ink)", ...cardShadow }}
            >
              {t("generateForMonth")}
            </button>
            <button onClick={startCreating} className="tap-none ml-auto flex items-center gap-1.5 rounded-[12px] px-3.5 py-2 text-[12.5px] font-semibold text-white" style={{ background: "var(--accent)", boxShadow: "var(--shadow-fab)" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14" /></svg>
              {t("addTemplate")}
            </button>
          </>
        )}
      </motion.div>

      {/* AI nudge cards */}
      {aiEnabled && nudgeCandidates.length > 0 && (
        <div className="space-y-2">
          {nudgeCandidates.map((c, i) => (
            <NudgeRecurringCard
              key={`${c.name}-${i}`}
              name={c.name} amount={c.amount} dayOfMonth={c.dayOfMonth} monthsObserved={c.monthsObserved} sampleExpenseIds={c.sampleExpenseIds}
              onAccepted={() => { setNudgeCandidates((prev) => prev.filter((_, idx) => idx !== i)); router.refresh(); }}
            />
          ))}
        </div>
      )}

      {/* Create / Edit form */}
      {(isCreating || editingId) && (
        <motion.div {...sectionMotion(3)} className="rounded-[20px] p-4" style={{ background: "var(--surface)", ...cardShadow }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-bold">{editingId ? t("editTemplate") : t("addTemplate")}</h2>
            <button onClick={() => { setIsCreating(false); setEditingId(null); }} className="tap-none flex h-7 w-7 items-center justify-center rounded-full" style={{ background: "var(--surface-2)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink-muted)" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={labelCls} style={{ color: "var(--ink-muted)" }}>{t("name")}</label>
              <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder={t("namePlaceholder")} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--ink-muted)" }}>{t("type")}</label>
              <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} className={inputCls} style={inputStyle}>
                {EXPENSE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--ink-muted)" }}>{t("amount")} (€)</label>
              <input type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} placeholder="0.00" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--ink-muted)" }}>{t("dayOfMonthOptional")}</label>
              <input type="number" min="1" max="31" value={formData.dayOfMonth} onChange={(e) => setFormData({ ...formData, dayOfMonth: e.target.value })} placeholder={t("anyDay")} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--ink-muted)" }}>{t("category")}</label>
              <select value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })} className={inputCls} style={inputStyle}>
                <option value="">{t("uncategorized")}</option>
                {categories.map((cat) => <option key={cat.id} value={cat.id}>{translateCategory(cat.name)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--ink-muted)" }}>{t("bankAccount")}</label>
              <select value={formData.bankAccountId} onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })} className={inputCls} style={inputStyle}>
                <option value="">{t("noBankAccount")}</option>
                {bankAccounts.map((acc) => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={labelCls} style={{ color: "var(--ink-muted)" }}>{t("notes")}</label>
              <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder={t("notesPlaceholder")} maxLength={500} className={inputCls} style={inputStyle} />
            </div>
            {projects.length > 0 && (
              <div className="md:col-span-2">
                <label className={labelCls} style={{ color: "var(--ink-muted)" }}>{t("projects")}</label>
                {formData.projectIds.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {formData.projectIds.map((pid) => {
                      const project = projects.find((p) => p.id === pid);
                      return project ? (
                        <span key={pid} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium" style={{ background: "var(--surface-2)", color: "var(--accent)" }}>
                          {project.name}
                          <button type="button" onClick={() => setFormData({ ...formData, projectIds: formData.projectIds.filter((id) => id !== pid) })}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
                <select value="" onChange={(e) => { if (e.target.value && !formData.projectIds.includes(e.target.value)) setFormData({ ...formData, projectIds: [...formData.projectIds, e.target.value] }); }} className={inputCls} style={inputStyle}>
                  <option value="">{t("noProjects")}</option>
                  {projects.filter((p) => !formData.projectIds.includes(p.id)).map((proj) => <option key={proj.id} value={proj.id}>{proj.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="mt-3 space-y-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-[12px] p-3" style={{ background: "var(--app-bg)" }}>
              <input type="checkbox" checked={formData.autoGenerate} onChange={(e) => setFormData({ ...formData, autoGenerate: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
              <div>
                <span className="text-[13px] font-medium">{t("autoGenerateAtMonthStart")}</span>
                <p className="text-[11px]" style={{ color: "var(--ink-subtle)" }}>{formData.type === "SURVIVAL_FIXED" || formData.amount ? t("autoGenerateFixed") : t("autoGenerateVariable")}</p>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-[12px] p-3" style={{ background: "var(--app-bg)" }}>
              <input type="checkbox" checked={formData.excludeFromBudget} onChange={(e) => setFormData({ ...formData, excludeFromBudget: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
              <div>
                <span className="text-[13px] font-medium">{t("excludeFromBudget")}</span>
                <p className="text-[11px]" style={{ color: "var(--ink-subtle)" }}>{t("excludeFromBudgetHint")}</p>
              </div>
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => (editingId ? handleUpdate(editingId) : handleCreate())}
              disabled={!formData.name.trim()}
              className="tap-none rounded-[14px] px-4 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--accent)", boxShadow: "var(--shadow-fab)" }}
            >
              {editingId ? t("saveChanges") : t("createTemplate")}
            </button>
            <button onClick={() => { setIsCreating(false); setEditingId(null); }} className="tap-none px-4 py-2.5 text-[13.5px]" style={{ color: "var(--ink-muted)" }}>{tCommon("cancel")}</button>
            {editingId && (
              <button onClick={() => setConfirmDeleteId(editingId)} className="tap-none ml-auto rounded-[14px] px-4 py-2.5 text-[13.5px] font-semibold" style={{ border: "1px solid color-mix(in srgb, var(--negative) 40%, transparent)", color: "var(--negative)" }}>
                {tCommon("delete")}
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* Grouped lists */}
      {templates.length === 0 ? (
        <div className="rounded-[20px] p-10 text-center" style={{ background: "var(--surface)", ...cardShadow }}>
          <p className="text-[13px]" style={{ color: "var(--ink-muted)" }}>{t("noTemplatesYet")}</p>
          <p className="mt-1 text-[12px]" style={{ color: "var(--ink-subtle)" }}>{t("createTemplatesHint")}</p>
        </div>
      ) : (
        <motion.div {...sectionMotion(4)} className="flex flex-col gap-3.5">
          {bills.length > 0 && groupCard(t("billsLoans"), bills)}
          {subs.length > 0 && groupCard(t("subscriptions"), subs)}
        </motion.div>
      )}

      {/* Delete row confirm (per template) */}
      <Modal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        variant="dialog"
        size="sm"
        zIndexClassName="z-50"
      >
        <ModalBody className="px-6 pb-0 pt-6">
          <h3 className="mb-2 text-[17px] font-bold">{t("deleteTemplate")}</h3>
        </ModalBody>
        <ModalFooter className="gap-3 px-6 pb-6 pt-0 md:px-6 md:pb-6">
          <button onClick={() => setConfirmDeleteId(null)} className="flex-1 rounded-[14px] px-4 py-2.5 text-[13.5px] font-semibold" style={{ border: "1px solid var(--line-strong)", color: "var(--ink)" }}>{tCommon("cancel")}</button>
          <button onClick={() => { if (!confirmDeleteId) return; handleDelete(confirmDeleteId); setEditingId(null); setIsCreating(false); }} className="flex-1 rounded-[14px] px-4 py-2.5 text-[13.5px] font-semibold text-white" style={{ background: "var(--negative)" }}>{tCommon("delete")}</button>
        </ModalFooter>
      </Modal>

      {/* Bulk Delete Confirmation */}
      <Modal
        isOpen={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        variant="dialog"
        size="md"
        zIndexClassName="z-50"
      >
        <ModalBody className="px-6 pb-0 pt-6">
          <h2 className="mb-2 text-[17px] font-bold">{t("deleteTemplates")}</h2>
          <p className="mb-4 text-[13px]" style={{ color: "var(--ink-muted)" }}>{t("deleteTemplatesConfirm", { count: selectedIds.size })}</p>
        </ModalBody>
        <ModalFooter className="gap-3 px-6 pb-6 pt-0 md:px-6 md:pb-6">
          <button onClick={handleBulkDelete} disabled={isDeleting} className="flex-1 rounded-[14px] px-4 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--negative)" }}>
            {isDeleting ? t("deleting") : t("deleteCount", { count: selectedIds.size })}
          </button>
          <button onClick={() => setConfirmBulkDelete(false)} className="px-4 py-2.5 text-[13.5px]" style={{ color: "var(--ink-muted)" }}>{tCommon("cancel")}</button>
        </ModalFooter>
      </Modal>

      {/* Generate Modal */}
      <Modal
        isOpen={showGenerateModal}
        onClose={() => { setShowGenerateModal(false); setGenerateResult(null); }}
        variant="dialog"
        size="xl"
        zIndexClassName="z-50"
      >
        <ModalHeader showClose={false} className="px-6 pt-6">
          <h2 className="mb-2 text-[17px] font-bold">{t("generateExpenses")}</h2>
          <p className="mb-4 text-[13px]" style={{ color: "var(--ink-muted)" }}>{t("generateDescription")}</p>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={{ color: "var(--ink-muted)" }}>{tTime("thisMonth").split(" ")[0]}</label>
              <select value={generateMonth} onChange={(e) => setGenerateMonth(parseInt(e.target.value))} className={inputCls} style={inputStyle}>
                {MONTHS.map((month, index) => <option key={index} value={index}>{month}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--ink-muted)" }}>{tTime("thisYear").split(" ")[0]}</label>
              <input type="number" value={generateYear} onChange={(e) => setGenerateYear(parseInt(e.target.value))} className={inputCls} style={inputStyle} />
            </div>
          </div>
        </ModalHeader>

        <ModalBody className="px-6 pb-0">
            <div className="overflow-hidden rounded-[12px]" style={{ border: "1px solid var(--line)" }}>
              <div className="flex items-center justify-between px-4 py-2" style={{ background: "var(--app-bg)", borderBottom: "1px solid var(--line)" }}>
                <span className="text-[13px] font-medium">{t("templates")} ({Object.values(templateOverrides).filter((o) => o.selected).length} {t("selected")})</span>
                <div className="flex gap-3">
                  <button onClick={() => setTemplateOverrides(Object.fromEntries(Object.entries(templateOverrides).map(([id, o]) => [id, { ...o, selected: true }])))} className="text-[12px] font-medium" style={{ color: "var(--accent)" }}>{tCommon("selectAll")}</button>
                  <button onClick={() => setTemplateOverrides(Object.fromEntries(Object.entries(templateOverrides).map(([id, o]) => [id, { ...o, selected: false }])))} className="text-[12px]" style={{ color: "var(--ink-muted)" }}>{tCommon("deselectAll")}</button>
                </div>
              </div>
              <div>
                {templates.filter((tpl) => tpl.isActive).map((template) => {
                  const override = templateOverrides[template.id] || { selected: true, day: "" };
                  return (
                    <div key={template.id} className="flex items-center gap-3 p-3" style={{ borderBottom: "1px solid var(--line)", opacity: override.selected ? 1 : 0.5 }}>
                      <input type="checkbox" checked={override.selected} onChange={(e) => setTemplateOverrides({ ...templateOverrides, [template.id]: { ...override, selected: e.target.checked } })} className="h-4 w-4 accent-[var(--accent)]" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold">{template.name}</div>
                        <div className="text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>
                          {template.amount ? formatCurrency(Number(template.amount), template.currency) : t("variable")}
                          {template.dayOfMonth ? ` · ${t("default")}: ${t("dayShort", { day: template.dayOfMonth })}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>{t("day")}:</span>
                        <input type="number" min="1" max="31" value={override.day} onChange={(e) => setTemplateOverrides({ ...templateOverrides, [template.id]: { ...override, day: e.target.value } })} placeholder={t("first")} disabled={!override.selected} className="w-16 rounded-[10px] px-2 py-1 text-[13px] outline-none" style={inputStyle} />
                      </div>
                    </div>
                  );
                })}
                {templates.filter((tpl) => tpl.isActive).length === 0 && (
                  <div className="p-8 text-center text-[13px]" style={{ color: "var(--ink-subtle)" }}>{t("noActiveTemplates")}</div>
                )}
              </div>
            </div>
        </ModalBody>

        <ModalFooter className="flex-col gap-0 px-6 pb-6 pt-4 md:px-6 md:pb-6">
          {generateResult && (
            <div className="mb-4 w-full rounded-[12px] p-3 text-[13px]" style={generateResult.includes("Failed") ? { background: "color-mix(in srgb, var(--negative) 12%, transparent)", color: "var(--negative)" } : { background: "color-mix(in srgb, var(--positive) 14%, transparent)", color: "var(--positive)" }}>
              {generateResult}
            </div>
          )}
          <div className="flex w-full gap-3">
            <button onClick={handleGenerate} disabled={isGenerating || Object.values(templateOverrides).filter((o) => o.selected).length === 0} className="tap-none flex-1 rounded-[14px] px-4 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--accent)", boxShadow: "var(--shadow-fab)" }}>
              {isGenerating ? t("generating") : t("generateCount", { count: Object.values(templateOverrides).filter((o) => o.selected).length })}
            </button>
            <button onClick={() => { setShowGenerateModal(false); setGenerateResult(null); }} className="px-4 py-2.5 text-[13.5px]" style={{ color: "var(--ink-muted)" }}>{tCommon("close")}</button>
          </div>
        </ModalFooter>
      </Modal>
    </div>
  );
}
