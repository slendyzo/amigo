"use client";

/**
 * Add Expense Modal — Forest & Bracket
 *
 * Three modes share one modal frame:
 *   1. Manual         — descrição + valor + categoria + tags + conta
 *   2. Recibo · IA    — Tesseract OCR receipt scan, image preview + extracted fields
 *   3. Dividir        — split with workspace members or ad-hoc names; equal/by-value/by-percent
 *
 * Italic-serif law: Instrument Serif italic is reserved for the bracket logo
 * mark. Names, hints, asides, microcopy → General Sans. The hero `€` glyph is
 * Fraunces upright (font-display), not italic.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useModalBodyClass } from "@/hooks/use-modal-body-class";
import { useModalData } from "@/hooks/use-modal-data";
import { useProjectTags } from "@/hooks/use-project-tags";
import { useCategoryTranslation } from "@/hooks/use-category-translation";
import { CURRENCIES, getCurrencySymbol } from "@/lib/currencies";
import { parseAmount, evaluateExpression, getTodayDateString } from "@/lib/utils";
import { extractReceiptData, type ExtractedReceiptData } from "@/lib/receipt-ocr";
import { savePendingExpense, isOfflineStorageAvailable } from "@/lib/offline-storage";
import type { Category, BankAccount, Project, ExpenseType } from "@/types/models";

type CreatedExpense = {
  id: string;
  name: string;
  date: string;
  type: string;
  amount: number;
  currency: string;
  amountEur: number;
  categoryName: string;
  projects: { id: string; name: string }[];
  excludeFromBudget: boolean;
  splitCount: number | null;
  splitData: string | null;
  status: string;
  createdAt: string;
};

type AddExpenseModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onExpenseCreated?: (expense: CreatedExpense) => void;
  categories?: Category[];
  bankAccounts?: BankAccount[];
  projects?: Project[];
  defaultProjectId?: string;
  defaultExcludeFromBudget?: boolean;
  defaultBankAccountId?: string;
};

type Mode = "manual" | "recibo" | "dividir";

type WorkspaceMember = {
  id: string;
  userId: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  isCurrentUser: boolean;
};

type ParticipantRow = {
  key: string;
  memberId: string | null;
  adHocName: string | null;
  share: string;
  paid: boolean;
  locked: boolean;
};

type SplitMode = "equal" | "amount" | "percent";

const TOP_CURRENCIES = ["EUR", "USD", "GBP"] as const;
const EXPENSE_TYPES: { value: ExpenseType; key: "fixed" | "variable" | "lifestyle" | "project" }[] = [
  { value: "SURVIVAL_FIXED", key: "fixed" },
  { value: "SURVIVAL_VARIABLE", key: "variable" },
  { value: "LIFESTYLE", key: "lifestyle" },
  { value: "PROJECT", key: "project" },
];

function initialFor(name: string | null | undefined, fallback: string): string {
  const trimmed = (name || "").trim();
  if (trimmed) return trimmed.charAt(0).toUpperCase();
  return fallback.charAt(0).toUpperCase() || "·";
}

function formatAmountFraunces(value: number): string {
  return value.toLocaleString("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function AddExpenseModal({
  isOpen,
  onClose,
  onExpenseCreated,
  categories: propCategories,
  bankAccounts: propBankAccounts,
  projects: propProjects,
  defaultProjectId,
  defaultExcludeFromBudget = false,
  defaultBankAccountId: propDefaultBankAccountId,
}: AddExpenseModalProps) {
  const router = useRouter();
  const tAdd = useTranslations("addExpense");
  const tModals = useTranslations("modals");
  const tCommon = useTranslations("common");
  const { translateCategory } = useCategoryTranslation();

  useModalBodyClass(isOpen);

  const {
    categories: localCategories,
    projects: fetchedProjects,
    bankAccounts: localBankAccounts,
    defaultCurrency,
    defaultBankAccountId: workspaceDefaultBankAccountId,
  } = useModalData(isOpen, propCategories, propProjects, propBankAccounts);

  const resolvedDefaultBankAccountId =
    propDefaultBankAccountId || workspaceDefaultBankAccountId || "";

  const {
    localProjects,
    setLocalProjects,
    selectedProjectIds,
    setSelectedProjectIds,
    toggleProject,
  } = useProjectTags({
    initialProjects: fetchedProjects.filter((p) => p.isActive !== false),
    initialSelectedIds: defaultProjectId ? [defaultProjectId] : [],
  });

  useEffect(() => {
    if (fetchedProjects.length > 0 && localProjects.length === 0) {
      setLocalProjects(fetchedProjects.filter((p) => p.isActive !== false));
    }
  }, [fetchedProjects, localProjects.length, setLocalProjects]);

  // ---------- Tab + shared form state ----------
  const [mode, setMode] = useState<Mode>("manual");

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [amountExpression, setAmountExpression] = useState<string | null>(null);
  const [currency, setCurrency] = useState("EUR");
  const [date, setDate] = useState(getTodayDateString());
  const [expenseType, setExpenseType] = useState<ExpenseType>("LIFESTYLE");
  const [categoryId, setCategoryId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [excludeFromBudget, setExcludeFromBudget] = useState(false);
  const [description, setDescription] = useState("");

  // ---------- Recibo state ----------
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFilename, setImageFilename] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<number | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedReceiptData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------- Dividir state ----------
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [payerMemberId, setPayerMemberId] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [showAddPersonMenu, setShowAddPersonMenu] = useState(false);
  const [adHocDraft, setAdHocDraft] = useState("");
  const [showAdHocInput, setShowAdHocInput] = useState(false);

  // ---------- UI state ----------
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const prevIsOpenRef = useRef(false);

  // Reset on open
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setMode("manual");
      setName("");
      setAmount("");
      setAmountExpression(null);
      setCurrency(defaultCurrency);
      setDate(getTodayDateString());
      setExpenseType("LIFESTYLE");
      setCategoryId("");
      setBankAccountId(resolvedDefaultBankAccountId);
      setExcludeFromBudget(defaultExcludeFromBudget);
      setDescription("");
      setSelectedProjectIds(defaultProjectId ? [defaultProjectId] : []);

      setImagePreview(null);
      setImageFilename(null);
      setImageSize(null);
      setOcrProgress(0);
      setOcrRunning(false);
      setExtractedData(null);

      setSplitMode("equal");
      setParticipants([]);
      setShowAddPersonMenu(false);
      setAdHocDraft("");
      setShowAdHocInput(false);

      setIsSaving(false);
      setError("");
      setValidationError(null);
    }
    prevIsOpenRef.current = isOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Focus when entering manual or dividir
  useEffect(() => {
    if (isOpen && (mode === "manual" || mode === "dividir")) {
      const id = setTimeout(() => nameInputRef.current?.focus(), 120);
      return () => clearTimeout(id);
    }
  }, [isOpen, mode]);

  // Sync currency when async workspace data lands
  useEffect(() => {
    if (isOpen && defaultCurrency && currency === "EUR" && defaultCurrency !== "EUR") {
      setCurrency(defaultCurrency);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultCurrency]);

  useEffect(() => {
    if (isOpen && resolvedDefaultBankAccountId) {
      setBankAccountId((prev) => prev || resolvedDefaultBankAccountId);
    }
  }, [isOpen, resolvedDefaultBankAccountId]);

  // Fetch workspace + members for Dividir
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const wRes = await fetch("/api/workspace");
        if (!wRes.ok) return;
        const wData = await wRes.json();
        const wsId = wData.workspace?.id;
        if (!wsId || cancelled) return;
        setWorkspaceId(wsId);
        const mRes = await fetch(`/api/workspaces/${wsId}/members`);
        if (!mRes.ok) return;
        const mData: WorkspaceMember[] = await mRes.json();
        if (cancelled) return;
        setMembers(mData);
        const me = mData.find((m) => m.isCurrentUser);
        if (me) {
          setPayerMemberId((prev) => prev || me.id);
        }
      } catch {
        // silent — Dividir tab will fall back to ad-hoc only
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Seed participants when entering Dividir for the first time
  useEffect(() => {
    if (mode !== "dividir" || participants.length > 0 || !members.length) return;
    const me = members.find((m) => m.isCurrentUser);
    if (!me) return;
    setParticipants([
      {
        key: `m-${me.id}`,
        memberId: me.id,
        adHocName: null,
        share: "0",
        paid: true,
        locked: false,
      },
    ]);
  }, [mode, members, participants.length]);

  // Recompute equal shares whenever amount / participants / mode changes
  const totalAmount = useMemo(() => {
    const n = parseAmount(amount);
    return Number.isFinite(n) && !Number.isNaN(n) ? n : 0;
  }, [amount]);

  useEffect(() => {
    if (splitMode !== "equal") return;
    if (participants.length === 0) return;
    if (totalAmount <= 0) return;
    const each = totalAmount / participants.length;
    setParticipants((prev) =>
      prev.map((p) => ({
        ...p,
        share: each.toFixed(2),
        locked: true,
      }))
    );
  }, [splitMode, participants.length, totalAmount]);

  // ---------- Handlers ----------

  const handleFileSelected = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError(tAdd("recibo.invalidFile"));
        return;
      }
      setImageFilename(file.name);
      setImageSize(file.size);
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        setImagePreview(dataUrl);
        setOcrRunning(true);
        setOcrProgress(0);
        setError("");
        try {
          const data = await extractReceiptData(dataUrl, (progress) => {
            setOcrProgress(progress);
          });
          setExtractedData(data);
          if (data.merchantName) setName(data.merchantName);
          if (data.totalAmount) setAmount(data.totalAmount.toFixed(2));
          if (data.currency) setCurrency(data.currency);
          if (data.date) setDate(data.date);
        } catch {
          setError(tAdd("recibo.ocrFailed"));
        } finally {
          setOcrRunning(false);
        }
      };
      reader.readAsDataURL(file);
    },
    [tAdd]
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  };

  // Paste image while on Recibo tab
  useEffect(() => {
    if (!isOpen || mode !== "recibo" || imagePreview) return;
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleFileSelected(file);
          return;
        }
      }
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [isOpen, mode, imagePreview, handleFileSelected]);

  // ⌘+ENTER / Ctrl+ENTER to save
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // ---------- Dividir helpers ----------

  const usedMemberIds = new Set(participants.map((p) => p.memberId).filter(Boolean) as string[]);
  const availableMembers = members.filter((m) => !usedMemberIds.has(m.id));

  const addMemberParticipant = (memberId: string) => {
    setParticipants((prev) => [
      ...prev,
      {
        key: `m-${memberId}-${Date.now()}`,
        memberId,
        adHocName: null,
        share: "0",
        paid: false,
        locked: splitMode === "equal",
      },
    ]);
    setShowAddPersonMenu(false);
  };

  const addAdHocParticipant = () => {
    const name = adHocDraft.trim();
    if (!name) return;
    setParticipants((prev) => [
      ...prev,
      {
        key: `a-${Date.now()}`,
        memberId: null,
        adHocName: name,
        share: "0",
        paid: false,
        locked: splitMode === "equal",
      },
    ]);
    setAdHocDraft("");
    setShowAdHocInput(false);
    setShowAddPersonMenu(false);
  };

  const removeParticipant = (key: string) => {
    setParticipants((prev) => prev.filter((p) => p.key !== key));
  };

  const togglePaid = (key: string) => {
    setParticipants((prev) =>
      prev.map((p) => (p.key === key ? { ...p, paid: !p.paid } : p))
    );
  };

  const updateShare = (key: string, value: string) => {
    setParticipants((prev) =>
      prev.map((p) => (p.key === key ? { ...p, share: value, locked: false } : p))
    );
  };

  const sumOfShares = useMemo(() => {
    return participants.reduce((acc, p) => {
      const n = parseFloat(String(p.share).replace(",", "."));
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [participants]);

  const splitMismatch =
    splitMode === "amount" && totalAmount > 0
      ? Number((totalAmount - sumOfShares).toFixed(2))
      : 0;

  const settleSummary = useMemo(() => {
    if (mode !== "dividir") return null;
    if (!payerMemberId) return null;
    const youOwed: { label: string; amount: number; settled: boolean }[] = [];
    const payerLabel =
      members.find((m) => m.id === payerMemberId)?.user.name ||
      members.find((m) => m.id === payerMemberId)?.user.email ||
      "—";
    const meId = members.find((m) => m.isCurrentUser)?.id ?? null;
    const payerIsMe = payerMemberId === meId;
    if (!payerIsMe) {
      const myShare = participants.find((p) => p.memberId === meId);
      if (myShare) {
        const n = parseFloat(String(myShare.share).replace(",", "."));
        if (Number.isFinite(n) && n > 0) {
          return tAdd("dividir.settleYouOwe", {
            payer: payerLabel,
            amount: formatAmountFraunces(n),
            currency: getCurrencySymbol(currency),
          });
        }
      }
      return null;
    }
    for (const p of participants) {
      if (p.memberId === meId) continue;
      const n = parseFloat(String(p.share).replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) continue;
      const label =
        (p.memberId
          ? members.find((m) => m.id === p.memberId)?.user.name ||
            members.find((m) => m.id === p.memberId)?.user.email
          : p.adHocName) || "—";
      youOwed.push({ label, amount: n, settled: p.paid });
    }
    if (youOwed.length === 0) return null;
    const parts = youOwed.map((o) =>
      o.settled
        ? tAdd("dividir.settledLine", {
            name: o.label,
            amount: formatAmountFraunces(o.amount),
            currency: getCurrencySymbol(currency),
          })
        : tAdd("dividir.owesYouLine", {
            name: o.label,
            amount: formatAmountFraunces(o.amount),
            currency: getCurrencySymbol(currency),
          })
    );
    return parts.join(" ");
  }, [mode, payerMemberId, participants, members, currency, tAdd]);

  // ---------- Submit ----------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setValidationError(null);

    if (!name.trim()) {
      setValidationError(tAdd("manual.descriptionMissing"));
      return;
    }

    let finalExpression = amountExpression;
    let finalAmount = amount;
    if (!finalExpression && evaluateExpression(amount) !== null) {
      finalExpression = amount;
      finalAmount = evaluateExpression(amount)!.toString();
    }
    const parsedAmount = parseAmount(finalAmount);
    if (!Number.isFinite(parsedAmount) || Number.isNaN(parsedAmount)) {
      setValidationError(tAdd("manual.amountInvalid"));
      return;
    }

    setIsSaving(true);

    // Recibo: upload the image first so it persists with the expense
    let imageUrlsField: string | undefined;
    if (mode === "recibo" && imagePreview) {
      try {
        const blob = await fetch(imagePreview).then((r) => r.blob());
        const formData = new FormData();
        formData.append("file", blob, imageFilename || "receipt.webp");
        const uploadRes = await fetch("/api/upload?purpose=expense", {
          method: "POST",
          body: formData,
        });
        if (uploadRes.ok) {
          const { imageUrl } = await uploadRes.json();
          imageUrlsField = JSON.stringify([imageUrl]);
        }
      } catch {
        // continue without image
      }
    }

    // Dividir: build participants payload
    let participantsPayload:
      | {
          memberId: string | null;
          adHocName: string | null;
          share: number;
          paid: boolean;
          locked: boolean;
        }[]
      | undefined;
    let payerPayload: string | null = null;

    if (mode === "dividir") {
      if (participants.length === 0) {
        setValidationError(tAdd("dividir.noParticipants"));
        setIsSaving(false);
        return;
      }
      if (splitMode === "amount" && Math.abs(splitMismatch) > 0.01) {
        setValidationError(tAdd("dividir.mismatchSave"));
        setIsSaving(false);
        return;
      }

      participantsPayload = participants
        .map((p) => {
          let share = parseFloat(String(p.share).replace(",", "."));
          if (splitMode === "percent" && Number.isFinite(share)) {
            share = Number(((share / 100) * totalAmount).toFixed(2));
          }
          return {
            memberId: p.memberId,
            adHocName: p.memberId ? null : p.adHocName,
            share: Number.isFinite(share) ? Number(share.toFixed(2)) : 0,
            paid: p.paid,
            locked: p.locked,
          };
        })
        .filter((p) => p.share > 0);
      payerPayload = payerMemberId;
    }

    const expenseData = {
      name: name.trim(),
      amount: parsedAmount,
      amountExpression: finalExpression || undefined,
      currency,
      type: expenseType,
      categoryId: categoryId || undefined,
      bankAccountId: bankAccountId || undefined,
      projectIds: selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
      date,
      excludeFromBudget,
      description: description || undefined,
      imageUrls: imageUrlsField,
      payerMemberId: payerPayload || undefined,
      participants: participantsPayload,
    };

    try {
      if (navigator.onLine) {
        const response = await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(expenseData),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || tAdd("saveFailed"));
        }
        const data = await response.json();
        if (onExpenseCreated && data.expense) {
          const exp = data.expense;
          onExpenseCreated({
            id: exp.id,
            name: exp.name,
            date:
              typeof exp.date === "string" ? exp.date : new Date(exp.date).toISOString(),
            type: exp.type,
            amount: Number(exp.amount),
            currency: exp.currency || "EUR",
            amountEur: Number(exp.amountEur),
            categoryName: exp.category?.name || "Uncategorized",
            projects: (exp.projects || []).map((p: { id: string; name: string }) => ({
              id: p.id,
              name: p.name,
            })),
            excludeFromBudget: exp.excludeFromBudget || false,
            splitCount: exp.splitCount || null,
            splitData: exp.splitData || null,
            status: exp.status || "PAID",
            createdAt:
              typeof exp.createdAt === "string"
                ? exp.createdAt
                : new Date(exp.createdAt).toISOString(),
          });
        }
        router.refresh();
        onClose();
      } else if (isOfflineStorageAvailable()) {
        await savePendingExpense({
          name: expenseData.name,
          amount: expenseData.amount,
          currency: expenseData.currency,
          type: expenseData.type as ExpenseType,
          categoryId: expenseData.categoryId,
          bankAccountId: expenseData.bankAccountId,
          projectIds: expenseData.projectIds,
          date: expenseData.date,
          excludeFromBudget: expenseData.excludeFromBudget,
          status: "PAID",
        });
        window.dispatchEvent(new CustomEvent("offline-expense-added"));
        onClose();
      } else {
        throw new Error(tAdd("offlineUnavailable"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : tAdd("saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const isToday = date === getTodayDateString();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6">
      {/* Scrim — paper-deep tinted, with backdrop blur */}
      <div
        className="absolute inset-0 bg-[rgba(20,20,15,0.42)] backdrop-blur-[2px]"
        onClick={() => !isSaving && onClose()}
        aria-hidden="true"
      />

      {/* Modal */}
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="relative w-full max-w-[640px] max-h-[92vh] flex flex-col bg-paper border border-rule-strong rounded-md shadow-md overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={tAdd("title")}
      >
        {/* Gilt top hairline */}
        <div className="absolute top-0 left-4 right-4 h-px bg-gilt" aria-hidden="true" />

        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-0 flex-shrink-0">
          <div>
            <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-gilt-deep">
              {tAdd("eyebrow")}
            </span>
            <h2 className="font-display font-light text-[28px] leading-[1.05] tracking-[-0.02em] text-ink mt-1">
              {tAdd("title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="bg-paper border border-rule rounded-sm w-[30px] h-[30px] inline-flex items-center justify-center text-ink-mute hover:bg-paper-soft hover:text-ink transition-colors disabled:opacity-40"
            aria-label={tCommon("close")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Mode tabs */}
        <div className="grid grid-cols-3 gap-2 px-6 pt-4 flex-shrink-0">
          <ModeTab
            active={mode === "manual"}
            label={tAdd("modes.manual.label")}
            sub={tAdd("modes.manual.sub")}
            onClick={() => setMode("manual")}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            }
          />
          <ModeTab
            active={mode === "recibo"}
            label={tAdd("modes.recibo.label")}
            sub={tAdd("modes.recibo.sub")}
            onClick={() => setMode("recibo")}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            }
          />
          <ModeTab
            active={mode === "dividir"}
            label={tAdd("modes.dividir.label")}
            sub={tAdd("modes.dividir.sub")}
            onClick={() => setMode("dividir")}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            }
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pt-6 pb-2">
          {(error || validationError) && (
            <div className="mb-4 rounded-sm border border-[rgba(122,40,32,0.3)] bg-crimson-tint text-crimson-deep px-4 py-2.5 text-sm">
              {error || validationError}
            </div>
          )}

          {mode === "manual" && (
            <ManualBody
              name={name}
              setName={(v) => {
                setName(v);
                if (validationError) setValidationError(null);
              }}
              nameInputRef={nameInputRef}
              amount={amount}
              setAmount={(v) => {
                setAmount(v);
                if (validationError) setValidationError(null);
              }}
              setAmountExpression={setAmountExpression}
              currency={currency}
              setCurrency={setCurrency}
              date={date}
              setDate={setDate}
              isToday={isToday}
              expenseType={expenseType}
              setExpenseType={setExpenseType}
              categoryId={categoryId}
              setCategoryId={setCategoryId}
              bankAccountId={bankAccountId}
              setBankAccountId={setBankAccountId}
              localCategories={localCategories}
              localBankAccounts={localBankAccounts}
              translateCategory={translateCategory}
              localProjects={localProjects}
              selectedProjectIds={selectedProjectIds}
              toggleProject={toggleProject}
              description={description}
              setDescription={setDescription}
              excludeFromBudget={excludeFromBudget}
              setExcludeFromBudget={setExcludeFromBudget}
              isSaving={isSaving}
              hasNameError={!!validationError && !name.trim()}
              tAdd={tAdd}
              tModals={tModals}
            />
          )}

          {mode === "recibo" && (
            <ReciboBody
              imagePreview={imagePreview}
              imageFilename={imageFilename}
              imageSize={imageSize}
              ocrRunning={ocrRunning}
              ocrProgress={ocrProgress}
              extractedData={extractedData}
              fileInputRef={fileInputRef}
              onFileInputChange={handleFileInputChange}
              onDrop={handleDrop}
              onClear={() => {
                setImagePreview(null);
                setImageFilename(null);
                setImageSize(null);
                setExtractedData(null);
                setOcrProgress(0);
              }}
              name={name}
              setName={setName}
              amount={amount}
              setAmount={setAmount}
              currency={currency}
              setCurrency={setCurrency}
              date={date}
              setDate={setDate}
              categoryId={categoryId}
              setCategoryId={setCategoryId}
              bankAccountId={bankAccountId}
              setBankAccountId={setBankAccountId}
              localCategories={localCategories}
              localBankAccounts={localBankAccounts}
              translateCategory={translateCategory}
              tAdd={tAdd}
              tModals={tModals}
            />
          )}

          {mode === "dividir" && (
            <DividirBody
              totalAmount={totalAmount}
              currency={currency}
              setCurrency={setCurrency}
              amount={amount}
              setAmount={setAmount}
              setAmountExpression={setAmountExpression}
              name={name}
              setName={(v) => {
                setName(v);
                if (validationError) setValidationError(null);
              }}
              nameInputRef={nameInputRef}
              members={members}
              payerMemberId={payerMemberId}
              setPayerMemberId={setPayerMemberId}
              splitMode={splitMode}
              setSplitMode={(m) => {
                setSplitMode(m);
                if (m === "equal") {
                  // re-equalize lock state
                  setParticipants((prev) =>
                    prev.map((p) => ({ ...p, locked: true }))
                  );
                } else {
                  setParticipants((prev) =>
                    prev.map((p) => ({ ...p, locked: false }))
                  );
                }
              }}
              participants={participants}
              addMemberParticipant={addMemberParticipant}
              addAdHocParticipant={addAdHocParticipant}
              removeParticipant={removeParticipant}
              togglePaid={togglePaid}
              updateShare={updateShare}
              availableMembers={availableMembers}
              showAddPersonMenu={showAddPersonMenu}
              setShowAddPersonMenu={setShowAddPersonMenu}
              adHocDraft={adHocDraft}
              setAdHocDraft={setAdHocDraft}
              showAdHocInput={showAdHocInput}
              setShowAdHocInput={setShowAdHocInput}
              splitMismatch={splitMismatch}
              sumOfShares={sumOfShares}
              settleSummary={settleSummary}
              workspaceUnavailable={!workspaceId}
              tAdd={tAdd}
              tModals={tModals}
            />
          )}
        </div>

        {/* Footer */}
        <footer className="flex-shrink-0 px-6 py-4 border-t border-rule flex items-center justify-between gap-3 bg-paper">
          <span className="text-sm text-ink-mute">
            {isSaving
              ? tAdd("savingHint")
              : ocrRunning
                ? tAdd("recibo.processingHint")
                : tAdd("shortcutHint")}
            {!isSaving && !ocrRunning && (
              <kbd className="ml-1.5 inline-flex items-center font-mono text-[10.5px] tracking-[0.06em] text-ink-soft bg-paper-deep border border-rule rounded-sm px-1.5 py-0.5 align-middle">
                ⌘ + ENTER
              </kbd>
            )}
          </span>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-md px-4 py-2 text-ink-soft font-medium hover:bg-paper-soft transition-colors disabled:opacity-40"
            >
              {tCommon("cancel")}
            </button>
            <button
              type="submit"
              disabled={isSaving || ocrRunning}
              className="rounded-md bg-forest text-paper px-4 py-2 font-medium hover:bg-forest-deep transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <span
                    className="w-2.5 h-2.5 rounded-full border-[1.5px] border-gilt-soft border-t-transparent animate-spin"
                    aria-hidden="true"
                  />
                  {tAdd("savingShort")}
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {tAdd("save")}
                </>
              )}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );

  // ---------- Sub-components (kept inline so they share `tAdd` and tokens) ----------

  function ModeTab({
    active,
    label,
    sub,
    icon,
    onClick,
  }: {
    active: boolean;
    label: string;
    sub: string;
    icon: React.ReactNode;
    onClick: () => void;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={
          "flex items-center gap-2.5 px-3 py-2.5 rounded-sm border text-left transition-colors " +
          (active
            ? "bg-forest text-paper border-forest"
            : "bg-paper text-ink border-rule hover:bg-paper-soft")
        }
      >
        <span
          className={
            "w-7 h-7 inline-flex items-center justify-center rounded-sm border flex-shrink-0 " +
            (active ? "border-gilt-soft text-gilt-soft" : "border-rule-strong text-ink-mute")
          }
        >
          {icon}
        </span>
        <span className="flex flex-col gap-0.5 min-w-0 leading-tight">
          <span className="font-display font-medium text-sm">{label}</span>
          <span
            className={
              "text-[11px] truncate " + (active ? "text-paper/70" : "text-ink-mute")
            }
          >
            {sub}
          </span>
        </span>
      </button>
    );
  }
}

// ============================================================================
// Manual body
// ============================================================================
type ManualBodyProps = {
  name: string;
  setName: (v: string) => void;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
  amount: string;
  setAmount: (v: string) => void;
  setAmountExpression: (v: string | null) => void;
  currency: string;
  setCurrency: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
  isToday: boolean;
  expenseType: ExpenseType;
  setExpenseType: (v: ExpenseType) => void;
  categoryId: string;
  setCategoryId: (v: string) => void;
  bankAccountId: string;
  setBankAccountId: (v: string) => void;
  localCategories: Category[];
  localBankAccounts: BankAccount[];
  translateCategory: (s: string) => string;
  localProjects: Project[];
  selectedProjectIds: string[];
  toggleProject: (id: string) => void;
  description: string;
  setDescription: (v: string) => void;
  excludeFromBudget: boolean;
  setExcludeFromBudget: (v: boolean) => void;
  isSaving: boolean;
  hasNameError: boolean;
  tAdd: ReturnType<typeof useTranslations>;
  tModals: ReturnType<typeof useTranslations>;
};

function ManualBody({
  name,
  setName,
  nameInputRef,
  amount,
  setAmount,
  setAmountExpression,
  currency,
  setCurrency,
  date,
  setDate,
  isToday,
  expenseType,
  setExpenseType,
  categoryId,
  setCategoryId,
  bankAccountId,
  setBankAccountId,
  localCategories,
  localBankAccounts,
  translateCategory,
  localProjects,
  selectedProjectIds,
  toggleProject,
  description,
  setDescription,
  excludeFromBudget,
  setExcludeFromBudget,
  isSaving,
  hasNameError,
  tAdd,
  tModals,
}: ManualBodyProps) {
  const inputCls =
    "w-full bg-paper border border-rule-strong rounded-sm px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-forest focus:ring-2 focus:ring-forest/30";
  const labelCls =
    "font-mono text-[10px] tracking-[0.16em] uppercase text-ink-faint font-medium";

  return (
    <div className={"flex flex-col gap-5 " + (isSaving ? "opacity-60 pointer-events-none" : "")}>
      {/* Hero amount */}
      <div className="flex items-end gap-3 pb-1">
        <span className="font-display font-light text-[28px] leading-none text-ink-mute pb-3">
          {getCurrencySymbol(currency)}
        </span>
        <div className="flex-1">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              const sanitized = e.target.value.replace(/[^0-9.,+\-*/\s]/g, "");
              setAmount(sanitized);
              setAmountExpression(null);
            }}
            placeholder="0,00"
            aria-label={tModals("amount")}
            className="w-full bg-paper border border-rule-strong rounded-sm px-3 py-2 font-display text-[34px] font-normal text-ink tabular-nums focus:outline-none focus:border-forest focus:ring-2 focus:ring-forest/30"
          />
        </div>
        <div className="flex gap-1 mb-2">
          {TOP_CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={
                "px-2.5 py-1 text-[11.5px] rounded-full border font-mono tracking-[0.06em] " +
                (currency === c
                  ? "bg-forest text-paper border-forest"
                  : "bg-paper text-ink-soft border-rule hover:bg-paper-soft")
              }
            >
              {c}
            </button>
          ))}
          {!TOP_CURRENCIES.includes(currency as typeof TOP_CURRENCIES[number]) && (
            <span className="px-2.5 py-1 text-[11.5px] rounded-full bg-forest text-paper border border-forest font-mono">
              {currency}
            </span>
          )}
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="bg-paper border border-rule rounded-full text-[11px] text-ink-mute px-1.5 hover:bg-paper-soft"
            aria-label={tAdd("manual.allCurrencies")}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Descrição */}
      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>{tAdd("manual.description")}</span>
        <input
          ref={nameInputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tAdd("manual.descriptionPlaceholder")}
          className={
            inputCls +
            (hasNameError
              ? " !border-crimson focus:!border-crimson focus:!ring-crimson/20"
              : "")
          }
        />
        {hasNameError && (
          <span className="text-[11.5px] text-crimson-deep">
            {tAdd("manual.descriptionMissing")}
          </span>
        )}
      </div>

      {/* Data + Tipo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>{tAdd("manual.date")}</span>
          <div className="relative">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls + " pr-16"}
            />
            {isToday && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9.5px] tracking-[0.16em] uppercase text-gilt-deep border border-gilt rounded-xs px-1.5 py-0.5">
                {tAdd("manual.today")}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>{tAdd("manual.type")}</span>
          <div className="grid grid-cols-2 border border-rule-strong rounded-sm overflow-hidden bg-paper">
            {EXPENSE_TYPES.map((t, idx) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setExpenseType(t.value)}
                className={
                  "px-2.5 py-2 text-xs font-sans transition-colors " +
                  (idx % 2 === 0 ? "border-r border-rule " : "") +
                  (idx < EXPENSE_TYPES.length - 2 ? "border-b border-rule " : "") +
                  (expenseType === t.value
                    ? "bg-forest text-paper font-medium"
                    : "text-ink-mute hover:bg-paper-soft hover:text-ink")
                }
              >
                {tAdd(`manual.types.${t.key}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Categoria */}
      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>{tAdd("manual.category")}</span>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={inputCls}
        >
          <option value="">{tModals("auto")}</option>
          {localCategories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {translateCategory(cat.name)}
            </option>
          ))}
        </select>
      </div>

      {/* Conta Bancária */}
      {localBankAccounts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>{tAdd("manual.bankAccount")}</span>
          <select
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            className={inputCls}
          >
            <option value="">{tModals("none")}</option>
            {localBankAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tags · Projetos */}
      {localProjects.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>{tAdd("manual.projects")}</span>
          <div className="flex flex-wrap gap-1.5">
            {localProjects.map((p) => {
              const active = selectedProjectIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleProject(p.id)}
                  className={
                    "inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] rounded-sm border transition-colors " +
                    (active
                      ? "bg-forest-tint text-forest border-rule"
                      : "bg-paper text-ink-mute border-rule hover:bg-paper-soft")
                  }
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: active ? "var(--cat-forest)" : "var(--rule-strong)" }}
                  />
                  {p.name}
                </button>
              );
            })}
          </div>
          {selectedProjectIds.length > 0 && (
            <label className="flex items-center gap-2 mt-2 text-[12px] text-ink-mute cursor-pointer">
              <input
                type="checkbox"
                checked={excludeFromBudget}
                onChange={(e) => setExcludeFromBudget(e.target.checked)}
                className="accent-forest"
              />
              {tModals("excludeFromBudget")}
            </label>
          )}
        </div>
      )}

      {/* Notas */}
      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>{tAdd("manual.notes")}</span>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={tAdd("manual.notesPlaceholder")}
          className="w-full bg-paper border border-rule-strong rounded-sm px-3 py-2.5 text-sm text-ink resize-none focus:outline-none focus:border-forest focus:ring-2 focus:ring-forest/30"
        />
      </div>
    </div>
  );
}

// ============================================================================
// Recibo body
// ============================================================================
type ReciboBodyProps = {
  imagePreview: string | null;
  imageFilename: string | null;
  imageSize: number | null;
  ocrRunning: boolean;
  ocrProgress: number;
  extractedData: ExtractedReceiptData | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent) => void;
  onClear: () => void;
  name: string;
  setName: (v: string) => void;
  amount: string;
  setAmount: (v: string) => void;
  currency: string;
  setCurrency: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
  categoryId: string;
  setCategoryId: (v: string) => void;
  bankAccountId: string;
  setBankAccountId: (v: string) => void;
  localCategories: Category[];
  localBankAccounts: BankAccount[];
  translateCategory: (s: string) => string;
  tAdd: ReturnType<typeof useTranslations>;
  tModals: ReturnType<typeof useTranslations>;
};

function ReciboBody({
  imagePreview,
  imageFilename,
  imageSize,
  ocrRunning,
  ocrProgress,
  extractedData,
  fileInputRef,
  onFileInputChange,
  onDrop,
  onClear,
  name,
  setName,
  amount,
  setAmount,
  currency,
  setCurrency,
  date,
  setDate,
  categoryId,
  setCategoryId,
  bankAccountId,
  setBankAccountId,
  localCategories,
  localBankAccounts,
  translateCategory,
  tAdd,
  tModals,
}: ReciboBodyProps) {
  const labelCls =
    "font-mono text-[10px] tracking-[0.16em] uppercase text-ink-faint font-medium";
  const inputCls =
    "w-full bg-paper border border-rule-strong rounded-sm px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-forest focus:ring-2 focus:ring-forest/30";
  const conf = extractedData?.confidence ?? 0;
  const confTier: "high" | "medium" | "low" =
    conf > 70 ? "high" : conf > 50 ? "medium" : "low";

  // Drop zone empty state
  if (!imagePreview) {
    return (
      <div className="flex flex-col gap-5">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className="relative border border-dashed border-gilt bg-paper-deep rounded-sm h-[260px] flex flex-col items-center justify-center gap-2 px-6 text-center cursor-pointer hover:bg-paper-soft transition-colors"
        >
          <span className="absolute top-2 left-2 w-[18px] h-[18px] border-t-[1.5px] border-l-[1.5px] border-gilt" />
          <span className="absolute bottom-2 right-2 w-[18px] h-[18px] border-b-[1.5px] border-r-[1.5px] border-gilt" />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onFileInputChange}
            className="hidden"
          />
          <span className="w-11 h-11 rounded-full border border-gilt inline-flex items-center justify-center text-gilt-deep mb-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </span>
          <span className="font-mono text-[11px] tracking-[0.22em] uppercase text-gilt-deep font-medium">
            {tAdd("recibo.dropEyebrow")}
          </span>
          <span className="text-[15px] text-ink-mute">{tAdd("recibo.dropOrClick")}</span>
          <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-ink-faint mt-1">
            {tAdd("recibo.dropSupport")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {ocrRunning ? null : conf > 0 && conf < 60 ? (
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-amber-tint border border-[rgba(176,109,26,0.3)] rounded-sm text-amber text-[13px]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="flex-1">{tAdd("recibo.lowConfidenceBanner")}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
        {/* Image preview */}
        <div>
          <div className="relative bg-paper-deep border border-rule rounded-sm p-3.5">
            <span className="absolute top-1 left-1 w-3.5 h-3.5 border-t-[1.5px] border-l-[1.5px] border-gilt" />
            <span className="absolute top-1 right-1 w-3.5 h-3.5 border-t-[1.5px] border-r-[1.5px] border-gilt" />
            <span className="absolute bottom-1 left-1 w-3.5 h-3.5 border-b-[1.5px] border-l-[1.5px] border-gilt" />
            <span className="absolute bottom-1 right-1 w-3.5 h-3.5 border-b-[1.5px] border-r-[1.5px] border-gilt" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt={tAdd("recibo.imagePreviewAlt")}
              className="w-full max-h-[280px] object-contain rounded-xs"
            />
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {imageFilename && (
              <span className="font-mono text-[11px] text-ink tracking-[0.04em]">
                {imageFilename}
              </span>
            )}
            {imageSize !== null && (
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-faint">
                {Math.round((imageSize / 1024 / 1024) * 100) / 100} MB
              </span>
            )}
            <button
              type="button"
              onClick={onClear}
              className="self-start mt-1 bg-transparent border border-rule-strong rounded-sm px-2.5 py-1.5 text-[12px] text-ink-soft hover:bg-paper-soft transition-colors"
            >
              {tAdd("recibo.swap")}
            </button>
          </div>
        </div>

        {/* Right: progress or extracted fields */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-gilt-deep font-medium">
              {ocrRunning ? tAdd("recibo.readingEyebrow") : tAdd("recibo.readEyebrow")}
            </span>
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-faint">
              {ocrRunning ? `${ocrProgress}%` : `TESSERACT.JS · ${conf > 0 ? Math.round(conf) + "%" : "—"}`}
            </span>
          </div>

          {ocrRunning ? (
            <>
              <div className="h-[3px] bg-paper-deep rounded-full overflow-hidden">
                <div
                  className="h-full bg-forest transition-[width] duration-300"
                  style={{ width: `${ocrProgress}%` }}
                />
              </div>
              <p className="text-[13px] text-ink-soft m-0">
                {tAdd("recibo.processingHint")}
              </p>
              {[60, 50, 70, 45].map((w, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 pb-3 border-b border-dotted border-rule last:border-b-0"
                >
                  <div className="bg-paper-soft rounded-xs h-2 w-24 animate-pulse" />
                  <div
                    className="bg-paper-soft rounded-xs h-3.5 self-end animate-pulse"
                    style={{ width: `${w}%` }}
                  />
                </div>
              ))}
            </>
          ) : (
            <>
              <ExtractedField
                label={tAdd("recibo.fields.merchant")}
                tier={confTier}
                value={
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-transparent text-right font-display text-[17px] text-ink focus:outline-none"
                  />
                }
                tAdd={tAdd}
              />
              <ExtractedField
                label={tAdd("recibo.fields.total")}
                tier={confTier}
                value={
                  <div className="flex items-center justify-end gap-1">
                    <span className="font-display text-ink-mute text-[14px]">
                      {getCurrencySymbol(currency)}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) =>
                        setAmount(e.target.value.replace(/[^0-9.,+\-*/\s]/g, ""))
                      }
                      className="w-28 bg-transparent text-right font-display text-[17px] text-ink tabular-nums focus:outline-none"
                    />
                  </div>
                }
                tAdd={tAdd}
              />
              <ExtractedField
                label={tAdd("recibo.fields.date")}
                tier={confTier}
                value={
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="bg-transparent text-right font-mono text-[13px] text-ink-soft focus:outline-none"
                  />
                }
                tAdd={tAdd}
              />
              <ExtractedField
                label={tAdd("recibo.fields.currency")}
                tier="medium"
                value={
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="bg-transparent text-right font-mono text-[13px] text-ink-soft focus:outline-none"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c} · {getCurrencySymbol(c)}
                      </option>
                    ))}
                  </select>
                }
                tAdd={tAdd}
              />
            </>
          )}
        </div>
      </div>

      {/* Lower fields */}
      {!ocrRunning && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-4 border-t border-dotted border-rule">
          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>{tAdd("manual.category")}</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={inputCls}
            >
              <option value="">{tModals("auto")}</option>
              {localCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {translateCategory(cat.name)}
                </option>
              ))}
            </select>
          </div>
          {localBankAccounts.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className={labelCls}>{tAdd("manual.bankAccount")}</span>
              <select
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className={inputCls}
              >
                <option value="">{tModals("none")}</option>
                {localBankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExtractedField({
  label,
  tier,
  value,
  tAdd,
}: {
  label: string;
  tier: "high" | "medium" | "low";
  value: React.ReactNode;
  tAdd: ReturnType<typeof useTranslations>;
}) {
  const tierClass =
    tier === "high"
      ? "bg-moss-tint text-moss-deep border-[rgba(74,107,63,0.25)]"
      : tier === "medium"
        ? "bg-amber-tint text-amber border-[rgba(176,109,26,0.25)]"
        : "bg-crimson-tint text-crimson-deep border-[rgba(122,40,32,0.25)]";

  return (
    <div className="flex flex-col gap-1.5 pb-2.5 border-b border-dotted border-rule last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-faint font-medium">
          {label}
        </span>
        <span
          className={
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[9.5px] font-medium tracking-[0.16em] uppercase border " +
            tierClass
          }
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-85" />
          {tAdd(`recibo.confidence.${tier}`)}
        </span>
      </div>
      <div className="flex items-center justify-end">{value}</div>
    </div>
  );
}

// ============================================================================
// Dividir body
// ============================================================================
type DividirBodyProps = {
  totalAmount: number;
  currency: string;
  setCurrency: (v: string) => void;
  amount: string;
  setAmount: (v: string) => void;
  setAmountExpression: (v: string | null) => void;
  name: string;
  setName: (v: string) => void;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
  members: WorkspaceMember[];
  payerMemberId: string | null;
  setPayerMemberId: (id: string | null) => void;
  splitMode: SplitMode;
  setSplitMode: (m: SplitMode) => void;
  participants: ParticipantRow[];
  addMemberParticipant: (memberId: string) => void;
  addAdHocParticipant: () => void;
  removeParticipant: (key: string) => void;
  togglePaid: (key: string) => void;
  updateShare: (key: string, value: string) => void;
  availableMembers: WorkspaceMember[];
  showAddPersonMenu: boolean;
  setShowAddPersonMenu: (v: boolean) => void;
  adHocDraft: string;
  setAdHocDraft: (v: string) => void;
  showAdHocInput: boolean;
  setShowAdHocInput: (v: boolean) => void;
  splitMismatch: number;
  sumOfShares: number;
  settleSummary: string | null;
  workspaceUnavailable: boolean;
  tAdd: ReturnType<typeof useTranslations>;
  tModals: ReturnType<typeof useTranslations>;
};

function DividirBody({
  totalAmount,
  currency,
  setCurrency,
  amount,
  setAmount,
  setAmountExpression,
  name,
  setName,
  nameInputRef,
  members,
  payerMemberId,
  setPayerMemberId,
  splitMode,
  setSplitMode,
  participants,
  addMemberParticipant,
  addAdHocParticipant,
  removeParticipant,
  togglePaid,
  updateShare,
  availableMembers,
  showAddPersonMenu,
  setShowAddPersonMenu,
  adHocDraft,
  setAdHocDraft,
  showAdHocInput,
  setShowAdHocInput,
  splitMismatch,
  sumOfShares,
  settleSummary,
  workspaceUnavailable,
  tAdd,
  tModals,
}: DividirBodyProps) {
  const labelCls =
    "font-mono text-[10px] tracking-[0.16em] uppercase text-ink-faint font-medium";
  const eyebrowCls =
    "font-mono text-[10.5px] tracking-[0.18em] uppercase text-ink-mute font-medium";

  const meId = members.find((m) => m.isCurrentUser)?.id ?? null;

  return (
    <div className="flex flex-col gap-5">
      {/* Total + Descrição */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-3.5">
        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>{tAdd("dividir.total")}</span>
          <div className="bg-paper-deep border border-rule rounded-sm px-3 py-2 flex items-baseline gap-1">
            <span className="font-display text-ink-mute text-[16px]">
              {getCurrencySymbol(currency)}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                const sanitized = e.target.value.replace(/[^0-9.,+\-*/\s]/g, "");
                setAmount(sanitized);
                setAmountExpression(null);
              }}
              placeholder="0,00"
              className="flex-1 bg-transparent border-0 font-display text-[22px] text-ink tabular-nums focus:outline-none"
              aria-label={tModals("amount")}
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="bg-transparent text-[11px] text-ink-mute focus:outline-none font-mono"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>{tAdd("manual.description")}</span>
          <input
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tAdd("dividir.descriptionPlaceholder")}
            className="w-full bg-paper border border-rule-strong rounded-sm px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-forest focus:ring-2 focus:ring-forest/30"
          />
        </div>
      </div>

      {/* Payer picker */}
      {!workspaceUnavailable && (
        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>{tAdd("dividir.whoPaid")}</span>
          <div className="flex items-center gap-1 p-1.5 bg-paper-deep border border-rule rounded-full w-fit overflow-x-auto max-w-full">
            {members.map((m) => {
              const active = payerMemberId === m.id;
              const display = m.user.name?.trim() || m.user.email;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPayerMemberId(m.id)}
                  className={
                    "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] border transition-colors flex-shrink-0 " +
                    (active
                      ? "bg-forest-deep text-paper border-forest-deep"
                      : "bg-transparent text-ink-soft border-transparent hover:bg-paper-soft")
                  }
                >
                  <span
                    className={
                      "w-[26px] h-[26px] rounded-full inline-flex items-center justify-center font-medium text-[13px] flex-shrink-0 " +
                      (active ? "bg-gilt-soft text-forest-deep" : "bg-gilt-deep text-paper")
                    }
                  >
                    {initialFor(m.user.name, m.user.email)}
                  </span>
                  <span className="font-medium">
                    {m.isCurrentUser ? tAdd("dividir.you") : display}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Eyebrow + mode pills */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className={eyebrowCls}>
          {participants.length === 0
            ? tAdd("dividir.noParticipantsEyebrow")
            : tAdd("dividir.dividedAmong", { count: participants.length })}
        </span>
        <div className="inline-flex gap-1">
          {(["equal", "amount", "percent"] as SplitMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSplitMode(m)}
              className={
                "px-3 py-1 rounded-full text-[12px] border transition-colors " +
                (splitMode === m
                  ? "bg-forest text-paper border-forest"
                  : "bg-paper text-ink-soft border-rule hover:bg-paper-soft")
              }
            >
              {tAdd(`dividir.modes.${m}`)}
            </button>
          ))}
        </div>
      </div>

      {/* By-amount mismatch warning */}
      {splitMode === "amount" && totalAmount > 0 && Math.abs(splitMismatch) > 0.01 && (
        <div className="flex items-center justify-between gap-3 px-3.5 py-2 bg-amber-tint border border-[rgba(176,109,26,0.3)] rounded-sm">
          <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-amber font-medium">
            {tAdd("dividir.mismatchEyebrow")}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-tint border border-[rgba(176,109,26,0.4)] rounded-full font-mono text-[10px] tracking-[0.14em] uppercase text-amber">
            {splitMismatch > 0 ? tAdd("dividir.short") : tAdd("dividir.over")}
            <span className="font-display text-[13px] tracking-normal normal-case">
              {getCurrencySymbol(currency)}
              {Math.abs(splitMismatch).toFixed(2)}
            </span>
          </span>
        </div>
      )}

      {/* By-percent sum bar */}
      {splitMode === "percent" && participants.length > 0 && (
        <div className="flex items-center gap-3 px-3.5 py-2.5 border border-rule rounded-sm bg-paper">
          <div className="flex-1 h-1.5 bg-paper-deep rounded-full overflow-hidden flex">
            {participants.map((p, i) => {
              const pct = parseFloat(String(p.share).replace(",", ".")) || 0;
              const colors = ["var(--cat-forest)", "var(--cat-ochre)", "var(--cat-clay)", "var(--cat-plum)", "var(--cat-bronze)"];
              return (
                <span
                  key={p.key}
                  style={{ width: `${pct}%`, background: colors[i % colors.length] }}
                  className="h-full"
                />
              );
            })}
          </div>
          <span
            className={
              "font-mono text-[10px] tracking-[0.16em] uppercase " +
              (Math.abs(sumOfShares - 100) < 0.01 ? "text-moss-deep" : "text-amber")
            }
          >
            {Math.round(sumOfShares)}%
          </span>
        </div>
      )}

      {/* Participants */}
      {participants.length === 0 ? (
        <div className="px-4 py-6 border border-dashed border-rule-strong rounded-sm text-center text-[13px] text-ink-mute bg-paper-soft">
          {tAdd("dividir.emptyPrompt")}
        </div>
      ) : (
        <div className="border border-rule rounded-sm overflow-hidden bg-paper">
          {participants.map((p, idx) => {
            const isPayer = p.memberId === payerMemberId;
            const isMe = p.memberId === meId;
            const member = p.memberId
              ? members.find((m) => m.id === p.memberId)
              : null;
            const display = member
              ? member.isCurrentUser
                ? tAdd("dividir.you")
                : member.user.name?.trim() || member.user.email
              : p.adHocName || "—";
            const sub = isPayer
              ? tAdd("dividir.subPaid")
              : p.paid
                ? tAdd("dividir.subSettled")
                : tAdd("dividir.subOwes");

            return (
              <div
                key={p.key}
                className={
                  "grid items-center gap-3 px-3.5 py-3 " +
                  (idx > 0 ? "border-t border-dotted border-rule " : "") +
                  (isMe ? "bg-paper-soft" : "bg-paper")
                }
                style={{ gridTemplateColumns: "32px 1fr auto auto auto" }}
              >
                <div className="w-8 h-8 rounded-full bg-gilt-deep text-paper inline-flex items-center justify-center font-medium text-sm">
                  {initialFor(member?.user.name, member?.user.email || p.adHocName || "·")}
                </div>
                <div className="min-w-0">
                  <div className="text-[15px] font-medium text-ink leading-tight truncate">
                    {display}
                    {isMe && (
                      <span className="ml-1.5 font-mono text-[9.5px] tracking-[0.18em] uppercase text-gilt-deep align-baseline">
                        · {tAdd("dividir.youTag")}
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-ink-faint mt-0.5">{sub}</div>
                </div>
                <div
                  className={
                    "inline-flex items-center gap-1 px-2.5 py-1.5 border rounded-sm font-display tabular-nums text-[15px] " +
                    (p.locked
                      ? "bg-paper-deep border-rule text-ink-soft"
                      : "bg-paper border-rule-strong text-ink") +
                    (splitMode === "amount" &&
                    totalAmount > 0 &&
                    Math.abs(splitMismatch) > 0.01
                      ? " border-amber text-amber"
                      : "")
                  }
                >
                  {splitMode !== "percent" && (
                    <span className="font-display text-ink-mute text-[12px]">
                      {getCurrencySymbol(currency)}
                    </span>
                  )}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={p.share}
                    onChange={(e) =>
                      updateShare(p.key, e.target.value.replace(/[^0-9.,]/g, ""))
                    }
                    disabled={splitMode === "equal"}
                    className="w-16 bg-transparent text-right focus:outline-none disabled:opacity-70"
                  />
                  {splitMode === "percent" && (
                    <span className="font-display text-ink-mute text-[12px]">%</span>
                  )}
                  {p.locked && splitMode === "equal" && (
                    <span className="text-gilt-deep ml-0.5 inline-flex" title={tAdd("dividir.lockedTitle")}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => togglePaid(p.key)}
                  className={
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[10px] tracking-[0.14em] uppercase border transition-colors " +
                    (p.paid
                      ? "bg-moss-tint text-moss-deep border-[rgba(74,107,63,0.16)]"
                      : "bg-paper-soft text-ink-mute border-rule")
                  }
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {p.paid ? tAdd("dividir.paid") : tAdd("dividir.unpaid")}
                </button>
                <button
                  type="button"
                  onClick={() => removeParticipant(p.key)}
                  className="w-6 h-6 rounded-sm text-ink-mute hover:bg-paper-soft hover:text-ink inline-flex items-center justify-center"
                  aria-label={tAdd("dividir.remove")}
                  title={tAdd("dividir.remove")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Settle-up */}
      {settleSummary && (
        <div className="border-t border-dotted border-rule pt-3.5 text-[14px] text-ink-soft leading-relaxed">
          {settleSummary}
        </div>
      )}

      {/* Add person */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowAddPersonMenu(!showAddPersonMenu)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-paper border border-dashed border-rule-strong text-[12px] text-gilt-deep hover:bg-paper-soft transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {tAdd("dividir.addPerson")}
        </button>

        {showAddPersonMenu && (
          <div className="absolute bottom-full mb-2 left-0 z-10 w-[280px] bg-paper border border-rule-strong rounded-sm shadow-md overflow-hidden">
            <div className="absolute top-0 left-3 right-3 h-px bg-gilt" />
            {availableMembers.length > 0 && (
              <>
                <div className="px-3.5 py-2 font-mono text-[9.5px] tracking-[0.18em] uppercase text-ink-faint border-b border-dotted border-rule">
                  {tAdd("dividir.workspaceMembers")}
                </div>
                {availableMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => addMemberParticipant(m.id)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-paper-soft border-b border-dotted border-rule last:border-b-0 text-left"
                  >
                    <span className="w-6 h-6 rounded-full bg-gilt-deep text-paper inline-flex items-center justify-center text-xs font-medium">
                      {initialFor(m.user.name, m.user.email)}
                    </span>
                    <span className="text-[14px] font-medium text-ink truncate flex-1">
                      {m.user.name?.trim() || m.user.email}
                    </span>
                  </button>
                ))}
              </>
            )}
            {showAdHocInput ? (
              <div className="flex items-center gap-2 px-3.5 py-2.5">
                <input
                  type="text"
                  value={adHocDraft}
                  onChange={(e) => setAdHocDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addAdHocParticipant();
                    }
                  }}
                  autoFocus
                  placeholder={tAdd("dividir.adHocPlaceholder")}
                  className="flex-1 bg-paper border border-rule-strong rounded-sm px-2 py-1 text-[13px] text-ink focus:outline-none focus:border-forest"
                />
                <button
                  type="button"
                  onClick={addAdHocParticipant}
                  className="text-[12px] text-forest font-medium"
                >
                  {tAdd("dividir.adHocAdd")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAdHocInput(true)}
                className="w-full text-left px-3.5 py-2.5 text-[13px] text-gilt-deep hover:bg-paper-soft inline-flex items-center gap-2"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-gilt-deep">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {tAdd("dividir.addAdHoc")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
