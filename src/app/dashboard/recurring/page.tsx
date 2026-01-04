"use client";

import { useState, useEffect } from "react";
import QuickCreateCategory from "@/components/quick-create-category";

type Category = {
  id: string;
  name: string;
};

type BankAccount = {
  id: string;
  name: string;
};

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
  category: Category | null;
  bankAccount: BankAccount | null;
  _count: { expenses: number };
};

const EXPENSE_TYPES = [
  { value: "SURVIVAL_FIXED", label: "Living Costs (Fixed)", color: "bg-blue-100 text-blue-800" },
  { value: "SURVIVAL_VARIABLE", label: "Living Costs (Variable)", color: "bg-cyan-100 text-cyan-800" },
  { value: "LIFESTYLE", label: "Lifestyle", color: "bg-purple-100 text-purple-800" },
  { value: "PROJECT", label: "Project", color: "bg-amber-100 text-amber-800" },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function RecurringTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Generate modal state
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateMonth, setGenerateMonth] = useState(new Date().getMonth());
  const [generateYear, setGenerateYear] = useState(new Date().getFullYear());
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<string | null>(null);
  const [templateOverrides, setTemplateOverrides] = useState<Record<string, { selected: boolean; day: string }>>({});

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    type: "SURVIVAL_FIXED",
    amount: "",
    currency: "EUR",
    dayOfMonth: "", // Empty = no specific date (just monthly)
    categoryId: "",
    bankAccountId: "",
    autoGenerate: false, // Auto-create expense at month start
  });

  useEffect(() => {
    fetchTemplates();
    fetchCategories();
    fetchBankAccounts();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch("/api/recurring-templates");
      const data = await response.json();
      if (data.templates) {
        setTemplates(data.templates);
      }
    } catch (error) {
      console.error("Failed to fetch templates:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch("/api/categories");
      const data = await response.json();
      if (data.categories) {
        setCategories(data.categories);
      }
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  };

  const fetchBankAccounts = async () => {
    try {
      const response = await fetch("/api/bank-accounts");
      const data = await response.json();
      if (data.bankAccounts) {
        setBankAccounts(data.bankAccounts);
      }
    } catch (error) {
      console.error("Failed to fetch bank accounts:", error);
    }
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) return;

    try {
      const response = await fetch("/api/recurring-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setFormData({
          name: "",
          type: "SURVIVAL_FIXED",
          amount: "",
          currency: "EUR",
          dayOfMonth: "",
          categoryId: "",
          bankAccountId: "",
          autoGenerate: false,
        });
        setIsCreating(false);
        fetchTemplates();
      }
    } catch (error) {
      console.error("Failed to create template:", error);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!formData.name.trim()) return;

    try {
      const response = await fetch(`/api/recurring-templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setEditingId(null);
        fetchTemplates();
      }
    } catch (error) {
      console.error("Failed to update template:", error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/recurring-templates/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setConfirmDeleteId(null);
        fetchTemplates();
      }
    } catch (error) {
      console.error("Failed to delete template:", error);
    }
  };

  const handleToggleActive = async (template: Template) => {
    try {
      const response = await fetch(`/api/recurring-templates/${template.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: template.name,
          isActive: !template.isActive,
        }),
      });

      if (response.ok) {
        fetchTemplates();
      }
    } catch (error) {
      console.error("Failed to toggle template:", error);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerateResult(null);

    try {
      // Build template overrides for selected templates
      const selectedTemplates = Object.entries(templateOverrides)
        .filter(([, override]) => override.selected)
        .map(([id, override]) => ({
          id,
          dayOverride: override.day ? parseInt(override.day) : null,
        }));

      const response = await fetch("/api/recurring-templates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: generateMonth,
          year: generateYear,
          templateOverrides: selectedTemplates,
        }),
      });

      const data = await response.json();
      setGenerateResult(data.message || "Done!");
      fetchTemplates();
    } catch (error) {
      console.error("Failed to generate expenses:", error);
      setGenerateResult("Failed to generate expenses");
    } finally {
      setIsGenerating(false);
    }
  };

  const startEditing = (template: Template) => {
    setFormData({
      name: template.name,
      type: template.type,
      amount: template.amount?.toString() || "",
      currency: template.currency,
      dayOfMonth: template.dayOfMonth?.toString() || "",
      categoryId: template.category?.id || "",
      bankAccountId: template.bankAccount?.id || "",
      autoGenerate: template.autoGenerate || false,
    });
    setEditingId(template.id);
    setIsCreating(false);
  };

  const startCreating = () => {
    setFormData({
      name: "",
      type: "SURVIVAL_FIXED",
      amount: "",
      currency: "EUR",
      dayOfMonth: "",
      categoryId: "",
      bankAccountId: "",
      autoGenerate: false,
    });
    setIsCreating(true);
    setEditingId(null);
  };

  const getTypeStyle = (type: string) => {
    return EXPENSE_TYPES.find((t) => t.value === type)?.color || "bg-gray-100 text-gray-800";
  };

  const getTypeLabel = (type: string) => {
    return EXPENSE_TYPES.find((t) => t.value === type)?.label || type;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString();
  };

  // Calculate totals
  const activeTemplates = templates.filter((t) => t.isActive);
  const monthlyTotal = activeTemplates
    .filter((t) => t.amount)
    .reduce((sum, t) => sum + parseFloat(String(t.amount || 0)), 0);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/4"></div>
          <div className="h-64 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Recurring Templates</h1>
          <p className="text-sm text-slate-500 mt-1">
            Set up monthly recurring expenses that can be auto-generated
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              // Initialize overrides with active templates
              const overrides: Record<string, { selected: boolean; day: string }> = {};
              templates.filter(t => t.isActive).forEach(t => {
                overrides[t.id] = { selected: true, day: t.dayOfMonth?.toString() || "" };
              });
              setTemplateOverrides(overrides);
              setShowGenerateModal(true);
            }}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Generate for Month
          </button>
          <button
            onClick={startCreating}
            className="px-4 py-2 bg-[#0070f3] text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Template
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <p className="text-sm text-slate-500 mb-1">Active Templates</p>
          <p className="text-2xl font-bold text-slate-900">{activeTemplates.length}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <p className="text-sm text-slate-500 mb-1">Monthly Total (Fixed)</p>
          <p className="text-2xl font-bold text-slate-900">€{monthlyTotal.toFixed(2)}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <p className="text-sm text-slate-500 mb-1">Total Templates</p>
          <p className="text-2xl font-bold text-slate-900">{templates.length}</p>
        </div>
      </div>

      {/* Create Form */}
      {isCreating && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">New Template</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Netflix, Rent, Spotify"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {EXPENSE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount (€)</label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Day of Month <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={formData.dayOfMonth}
                onChange={(e) => setFormData({ ...formData, dayOfMonth: e.target.value })}
                placeholder="Any"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-400 mt-1">Leave empty for monthly expenses without a specific day</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <div className="flex gap-1">
                <select
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Uncategorized</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <QuickCreateCategory
                  onCreated={(newCat) => {
                    setCategories([...categories, newCat]);
                    setFormData({ ...formData, categoryId: newCat.id });
                  }}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Bank Account</label>
              <select
                value={formData.bankAccountId}
                onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No bank account</option>
                {bankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                <a href="/dashboard/accounts" className="text-blue-500 hover:underline">Manage accounts</a>
              </p>
            </div>
          </div>

          {/* Auto-generate toggle */}
          <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.autoGenerate}
                onChange={(e) => setFormData({ ...formData, autoGenerate: e.target.checked })}
                className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <span className="font-medium text-slate-900">Auto-generate at month start</span>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formData.type === "SURVIVAL_FIXED" || formData.amount
                    ? "Expense will be created automatically with the fixed amount"
                    : "Expense will be created with \u20ac0.00 - update when bill arrives"}
                </p>
              </div>
            </label>
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={handleCreate}
              disabled={!formData.name.trim()}
              className="px-4 py-2 bg-[#0070f3] text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Template
            </button>
            <button
              onClick={() => setIsCreating(false)}
              className="px-4 py-2 text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Templates List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Templates ({templates.length})</h2>
        </div>

        {templates.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <svg className="w-12 h-12 mx-auto mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p>No recurring templates yet</p>
            <p className="text-sm mt-1">Create templates for expenses that happen every month</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {templates.map((template) => (
              <div key={template.id} className={`p-4 ${!template.isActive ? 'opacity-50' : ''}`}>
                {editingId === template.id ? (
                  // Edit Form
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                      <div className="lg:col-span-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                        <select
                          value={formData.type}
                          onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          {EXPENSE_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Amount</label>
                        <div className="flex items-center">
                          <span className="text-slate-400 mr-1">€</span>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                            placeholder="0.00"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Day of Month</label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={formData.dayOfMonth}
                          onChange={(e) => setFormData({ ...formData, dayOfMonth: e.target.value })}
                          placeholder="Any day"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
                        <div className="flex gap-1">
                          <select
                            value={formData.categoryId}
                            onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Uncategorized</option>
                            {categories.map((cat) => (
                              <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                          <QuickCreateCategory
                            onCreated={(newCat) => {
                              setCategories([...categories, newCat]);
                              setFormData({ ...formData, categoryId: newCat.id });
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Bank Account</label>
                        <select
                          value={formData.bankAccountId}
                          onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">No bank account</option>
                          {bankAccounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                          ))}
                        </select>
                        <p className="text-xs text-slate-400 mt-1">
                          <a href="/dashboard/accounts" className="text-blue-500 hover:underline">Manage accounts</a>
                        </p>
                      </div>
                      {/* Auto-generate toggle in edit */}
                      <div className="lg:col-span-2">
                        <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 rounded-lg">
                          <input
                            type="checkbox"
                            checked={formData.autoGenerate}
                            onChange={(e) => setFormData({ ...formData, autoGenerate: e.target.checked })}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div>
                            <span className="text-sm font-medium text-slate-900">Auto-generate</span>
                            <p className="text-xs text-slate-500">
                              {formData.amount ? "Creates with fixed amount" : "Creates at \u20ac0.00"}
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => handleUpdate(template.id)}
                        className="px-4 py-2 bg-[#0070f3] text-white text-sm rounded-lg hover:bg-blue-600"
                      >
                        Save Changes
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-4 py-2 text-slate-600 text-sm hover:text-slate-900"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // Display Row
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => handleToggleActive(template)}
                        className={`w-10 h-6 rounded-full transition-colors ${
                          template.isActive ? 'bg-green-500' : 'bg-slate-300'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-1 ${
                          template.isActive ? 'translate-x-4' : ''
                        }`} />
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{template.name}</span>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${getTypeStyle(template.type)}`}>
                            {getTypeLabel(template.type)}
                          </span>
                          {template.category && (
                            <span className="text-xs text-slate-500">
                              {template.category.name}
                            </span>
                          )}
                          {template.bankAccount && (
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                              </svg>
                              {template.bankAccount.name}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-500 mt-0.5 flex items-center gap-1 flex-wrap">
                          <span>{template.dayOfMonth ? `Day ${template.dayOfMonth}` : 'Monthly'}</span>
                          <span>•</span>
                          <span>{template.amount ? `\u20ac${Number(template.amount).toFixed(2)}` : 'Variable'}</span>
                          <span>•</span>
                          <span>{template._count.expenses} generated</span>
                          {template.autoGenerate && (
                            <>
                              <span>•</span>
                              <span className="text-green-600 flex items-center gap-0.5">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                Auto
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right text-sm text-slate-500">
                        <div>Last: {formatDate(template.lastGenerated)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEditing(template)}
                          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        {confirmDeleteId === template.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(template.id)}
                              className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(template.id)}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generate Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Generate Expenses</h2>
            <p className="text-sm text-slate-500 mb-4">
              Create expense entries from active templates for a specific month. You can customize the day for each expense.
            </p>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Month</label>
                <select
                  value={generateMonth}
                  onChange={(e) => setGenerateMonth(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {MONTHS.map((month, index) => (
                    <option key={index} value={index}>{month}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Year</label>
                <input
                  type="number"
                  value={generateYear}
                  onChange={(e) => setGenerateYear(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Template Selection with Day Override */}
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg mb-4">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">
                  Templates ({Object.values(templateOverrides).filter(o => o.selected).length} selected)
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const allSelected = Object.fromEntries(
                        Object.entries(templateOverrides).map(([id, o]) => [id, { ...o, selected: true }])
                      );
                      setTemplateOverrides(allSelected);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Select all
                  </button>
                  <button
                    onClick={() => {
                      const noneSelected = Object.fromEntries(
                        Object.entries(templateOverrides).map(([id, o]) => [id, { ...o, selected: false }])
                      );
                      setTemplateOverrides(noneSelected);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    Deselect all
                  </button>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {templates.filter(t => t.isActive).map((template) => {
                  const override = templateOverrides[template.id] || { selected: true, day: "" };
                  return (
                    <div key={template.id} className={`p-3 flex items-center gap-3 ${!override.selected ? 'opacity-50' : ''}`}>
                      <input
                        type="checkbox"
                        checked={override.selected}
                        onChange={(e) => setTemplateOverrides({
                          ...templateOverrides,
                          [template.id]: { ...override, selected: e.target.checked }
                        })}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 truncate">{template.name}</span>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${getTypeStyle(template.type)}`}>
                            {getTypeLabel(template.type)}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          {template.amount ? `€${Number(template.amount).toFixed(2)}` : 'Variable'}
                          {template.dayOfMonth && ` • Default: Day ${template.dayOfMonth}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">Day:</span>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={override.day}
                          onChange={(e) => setTemplateOverrides({
                            ...templateOverrides,
                            [template.id]: { ...override, day: e.target.value }
                          })}
                          placeholder="1st"
                          disabled={!override.selected}
                          className="w-16 px-2 py-1 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {templates.filter(t => t.isActive).length === 0 && (
                <div className="p-8 text-center text-slate-500 text-sm">
                  No active templates. Enable some templates first.
                </div>
              )}
            </div>

            {generateResult && (
              <div className={`p-3 rounded-lg mb-4 ${
                generateResult.includes('Failed') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
              }`}>
                {generateResult}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleGenerate}
                disabled={isGenerating || Object.values(templateOverrides).filter(o => o.selected).length === 0}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  `Generate ${Object.values(templateOverrides).filter(o => o.selected).length} Expense(s)`
                )}
              </button>
              <button
                onClick={() => {
                  setShowGenerateModal(false);
                  setGenerateResult(null);
                }}
                className="px-4 py-2 text-slate-600 hover:text-slate-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
