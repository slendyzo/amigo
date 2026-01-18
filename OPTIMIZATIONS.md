# Amigo Codebase Optimization Plan

This document outlines redundancies and optimization opportunities identified in the codebase. Each section includes specific files, line numbers, and recommended solutions.

---

## Priority 1: High Impact

### 1.1 Extract Shared Type Definitions

**Problem:** `Category`, `Project`, `BankAccount`, and `Expense` types are defined independently in 5+ files.

**Files with duplicated types:**
- `src/components/add-expense-modal.tsx` (lines 10-23)
- `src/components/edit-expense-modal.tsx` (lines 8-21)
- `src/components/receipt-scanner-modal.tsx` (line 8+)
- `src/components/add-income-modal.tsx` (line 7+)
- `src/components/expense-detail-modal.tsx` (lines 6-21)
- `src/app/dashboard/categorize/page.tsx` (lines 8-14)

**Solution:** Create `src/types/models.ts`:

```typescript
export type Category = {
  id: string;
  name: string;
};

export type BankAccount = {
  id: string;
  name: string;
};

export type Project = {
  id: string;
  name: string;
};

export type ExpenseType = "SURVIVAL_FIXED" | "SURVIVAL_VARIABLE" | "LIFESTYLE" | "PROJECT";

export type Expense = {
  id: string;
  name: string;
  amount: number;
  currency?: string;
  amountEur?: number;
  type: ExpenseType;
  date: string;
  category: Category | null;
  bankAccount: BankAccount | null;
  projects: Project[];
  excludeFromBudget?: boolean;
  notes?: string;
  status?: string;
  importLogId?: string;
};
```

Then update all files to import from this shared location.

---

### 1.2 Extract Currency Constants

**Problem:** Currency arrays and symbol mappings are duplicated in 8+ files.

**Files with duplicated currency constants:**
- `src/components/add-expense-modal.tsx` (lines 60-67)
- `src/components/add-income-modal.tsx` (lines 17-23)
- `src/components/edit-expense-modal.tsx` (lines 70-77)
- `src/components/receipt-scanner-modal.tsx` (lines 50-57)
- `src/components/expense-detail-modal.tsx` (lines 23-29)
- `src/lib/receipt-ocr.ts` (lines 18-24)
- `src/app/dashboard/categorize/page.tsx` (lines 30-37)
- `src/app/dashboard/expenses/page.tsx`

**Solution:** Create `src/lib/currencies.ts`:

```typescript
export const CURRENCIES = ["EUR", "USD", "GBP", "BRL", "PLN"] as const;

export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  BRL: "R$",
  PLN: "zł",
};

export function formatCurrency(amount: number, currency: Currency = "EUR"): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  return `${symbol}${Math.abs(amount).toFixed(2)}`;
}

export function getCurrencySymbol(currency: Currency): string {
  return CURRENCY_SYMBOLS[currency] || currency;
}
```

---

### 1.3 Extract Project/Tag Creation Logic

**Problem:** Tag creation logic is duplicated between add and edit expense modals (55+ lines each).

**Files:**
- `src/components/add-expense-modal.tsx` (lines 195-221 for logic, lines 440-520 for JSX)
- `src/components/edit-expense-modal.tsx` (lines 128-153 for logic, lines 303-404 for JSX)

**Solution:** Create `src/hooks/use-project-tags.ts`:

```typescript
import { useState } from "react";

type Project = { id: string; name: string };

export function useProjectTags(initialProjects: Project[] = []) {
  const [localProjects, setLocalProjects] = useState<Project[]>(initialProjects);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const createTag = async () => {
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
        setLocalProjects([...localProjects, data.project]);
        setSelectedProjectIds([...selectedProjectIds, data.project.id]);
        setShowNewTagInput(false);
        setNewTagName("");
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
  };

  const toggleProject = (projectId: string) => {
    if (selectedProjectIds.includes(projectId)) {
      setSelectedProjectIds(selectedProjectIds.filter((id) => id !== projectId));
    } else {
      setSelectedProjectIds([...selectedProjectIds, projectId]);
    }
  };

  const clearSelection = () => setSelectedProjectIds([]);

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
    createTag,
    toggleProject,
    clearSelection,
  };
}
```

Then create `src/components/project-tag-selector.tsx` for the reusable UI component.

---

### 1.4 Create Modal Data Fetching Hook

**Problem:** Multiple modals independently fetch the same data (categories, projects, bank accounts) with identical logic.

**Files with duplicate fetching:**
- `src/components/add-expense-modal.tsx` (lines 91-123)
- `src/components/receipt-scanner-modal.tsx` (lines 60-69)

**Solution:** Create `src/hooks/use-modal-data.ts`:

```typescript
import { useState, useEffect } from "react";

type Category = { id: string; name: string };
type Project = { id: string; name: string };
type BankAccount = { id: string; name: string };

type ModalData = {
  categories: Category[];
  projects: Project[];
  bankAccounts: BankAccount[];
  defaultCurrency: string;
  isLoading: boolean;
  error: string | null;
};

export function useModalData(
  isOpen: boolean,
  propCategories?: Category[],
  propProjects?: Project[],
  propBankAccounts?: BankAccount[]
): ModalData {
  const [categories, setCategories] = useState<Category[]>(propCategories || []);
  const [projects, setProjects] = useState<Project[]>(propProjects || []);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(propBankAccounts || []);
  const [defaultCurrency, setDefaultCurrency] = useState("EUR");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Use props if provided
    const needsFetch =
      !propCategories?.length || !propProjects?.length || !propBankAccounts?.length;

    if (!needsFetch) {
      if (propCategories) setCategories(propCategories);
      if (propProjects) setProjects(propProjects);
      if (propBankAccounts) setBankAccounts(propBankAccounts);
      return;
    }

    setIsLoading(true);
    setError(null);

    Promise.all([
      !propCategories?.length ? fetch("/api/categories").then((r) => r.json()) : null,
      !propProjects?.length ? fetch("/api/projects").then((r) => r.json()) : null,
      !propBankAccounts?.length ? fetch("/api/bank-accounts").then((r) => r.json()) : null,
      fetch("/api/workspace").then((r) => r.json()),
    ])
      .then(([catData, projData, accData, workspaceData]) => {
        if (catData) setCategories(catData.categories || []);
        if (projData) setProjects(projData.projects || []);
        if (accData) setBankAccounts(accData.bankAccounts || []);
        if (workspaceData?.workspace?.currency) {
          setDefaultCurrency(workspaceData.workspace.currency);
        }
      })
      .catch((err) => {
        console.error("Failed to load modal data:", err);
        setError("Failed to load data");
      })
      .finally(() => setIsLoading(false));
  }, [isOpen, propCategories, propProjects, propBankAccounts]);

  return { categories, projects, bankAccounts, defaultCurrency, isLoading, error };
}
```

---

## Priority 2: Medium Impact

### 2.1 Extract Amount Parsing Utility

**Problem:** Amount normalization pattern repeated in 5+ files.

**Pattern found:**
```typescript
const normalizedAmount = amount.replace(",", ".");
const parsedAmount = parseFloat(normalizedAmount);
```

**Files:**
- `src/components/add-expense-modal.tsx` (lines 230, 281)
- `src/components/edit-expense-modal.tsx` (line 164)
- `src/components/receipt-scanner-modal.tsx` (line 184)
- `src/components/onboarding-modal.tsx` (line 103)

**Solution:** Add to `src/lib/utils.ts` or create `src/lib/formatting.ts`:

```typescript
/**
 * Parses an amount string that may use comma or dot as decimal separator
 * @param amountStr - The amount string (e.g., "12,50" or "12.50")
 * @returns The parsed number or NaN if invalid
 */
export function parseAmount(amountStr: string): number {
  if (!amountStr || typeof amountStr !== "string") return NaN;
  const normalized = amountStr.trim().replace(",", ".");
  return parseFloat(normalized);
}

/**
 * Validates and parses an amount, returning null if invalid
 */
export function parseAmountSafe(amountStr: string): number | null {
  const amount = parseAmount(amountStr);
  return isNaN(amount) ? null : amount;
}
```

---

### 2.2 Extract Modal Body Class Hook

**Problem:** Same useEffect for managing `modal-open` class on document.body appears in 9+ files.

**Pattern found:**
```typescript
useEffect(() => {
  if (isOpen) {
    document.body.classList.add("modal-open");
  } else {
    document.body.classList.remove("modal-open");
  }
  return () => document.body.classList.remove("modal-open");
}, [isOpen]);
```

**Files:**
- `src/components/add-expense-modal.tsx` (lines 166-173)
- `src/components/receipt-scanner-modal.tsx` (lines 88-95)
- `src/components/add-income-modal.tsx`
- `src/components/edit-expense-modal.tsx`
- `src/components/expense-detail-modal.tsx`
- `src/components/onboarding-modal.tsx`
- `src/components/announcement-modal.tsx`
- `src/components/feedback-button.tsx`
- `src/components/changelog-modal.tsx`

**Solution:** Create `src/hooks/use-modal-body-class.ts`:

```typescript
import { useEffect } from "react";

/**
 * Manages the modal-open class on document.body when a modal is open.
 * This prevents background scrolling while modal is visible.
 */
export function useModalBodyClass(isOpen: boolean) {
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [isOpen]);
}
```

---

### 2.3 Extract Expense Type Constants

**Problem:** EXPENSE_TYPES array with translations is duplicated.

**Files:**
- `src/components/add-expense-modal.tsx` (lines 84-88)
- `src/components/edit-expense-modal.tsx` (lines 86-90)

**Solution:** Create `src/lib/expense-types.ts`:

```typescript
export const EXPENSE_TYPE_VALUES = [
  "LIFESTYLE",
  "SURVIVAL_FIXED",
  "SURVIVAL_VARIABLE",
] as const;

export type ExpenseTypeValue = (typeof EXPENSE_TYPE_VALUES)[number];

export const EXPENSE_TYPE_COLORS: Record<ExpenseTypeValue, string> = {
  LIFESTYLE: "purple",
  SURVIVAL_FIXED: "blue",
  SURVIVAL_VARIABLE: "cyan",
};

// Usage in components with translations:
// const EXPENSE_TYPES = EXPENSE_TYPE_VALUES.map(value => ({
//   value,
//   label: t(`types.${value.toLowerCase()}`),
//   color: EXPENSE_TYPE_COLORS[value],
// }));
```

---

### 2.4 Extract Date Utility

**Problem:** Today's date calculation repeated in 7 places.

**Pattern:**
```typescript
new Date().toISOString().split("T")[0]
```

**Files:**
- `src/components/add-expense-modal.tsx` (lines 54, 182, 305)
- `src/components/add-income-modal.tsx` (lines 48, 110)
- `src/components/receipt-scanner-modal.tsx` (lines 42, 81)

**Solution:** Add to `src/lib/utils.ts`:

```typescript
/**
 * Returns today's date in YYYY-MM-DD format for date inputs
 */
export function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Formats a Date object to YYYY-MM-DD string
 */
export function formatDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}
```

---

## Priority 3: Lower Impact / Future Improvements

### 3.1 Create Standardized API Wrapper

**Problem:** Inconsistent error handling across API calls in components.

**Solution:** Create `src/lib/api.ts`:

```typescript
type ApiOptions = RequestInit & {
  throwOnError?: boolean;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  url: string,
  options: ApiOptions = {}
): Promise<T> {
  const { throwOnError = true, ...fetchOptions } = options;

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...fetchOptions.headers,
    },
    ...fetchOptions,
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new ApiError(
      data.error || "Request failed",
      response.status,
      data
    );
    if (throwOnError) throw error;
    return data;
  }

  return data;
}

// Convenience methods
export const api = {
  get: <T>(url: string) => apiRequest<T>(url),
  post: <T>(url: string, body: unknown) =>
    apiRequest<T>(url, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(url: string, body: unknown) =>
    apiRequest<T>(url, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(url: string) => apiRequest<T>(url, { method: "DELETE" }),
};
```

---

### 3.2 Create Modal Wrapper Component

**Problem:** All modals follow the same structure (backdrop, container, header, body, footer).

**Solution:** Create `src/components/ui/modal.tsx`:

```typescript
"use client";

import { ReactNode } from "react";
import { useModalBodyClass } from "@/hooks/use-modal-body-class";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: ModalProps) {
  useModalBodyClass(isOpen);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full ${sizeClasses[size]} mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden`}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 max-h-[70vh] overflow-y-auto">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
```

---

### 3.3 Create AmountInput Component

**Problem:** Amount input with currency symbol and validation logic duplicated.

**Files:**
- `src/components/add-expense-modal.tsx` (lines 369-382)
- `src/components/edit-expense-modal.tsx` (lines 262-274)
- `src/components/receipt-scanner-modal.tsx` (lines 396-408)

**Solution:** Create `src/components/ui/amount-input.tsx`:

```typescript
"use client";

import { CURRENCY_SYMBOLS, Currency } from "@/lib/currencies";

type AmountInputProps = {
  value: string;
  onChange: (value: string) => void;
  currency: Currency;
  placeholder?: string;
  required?: boolean;
  className?: string;
};

export function AmountInput({
  value,
  onChange,
  currency,
  placeholder = "0.00",
  required = false,
  className = "",
}: AmountInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow digits, comma, dot, and minus (for refunds)
    const sanitized = e.target.value.replace(/[^0-9.,-]/g, "");
    onChange(sanitized);
  };

  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
        {CURRENCY_SYMBOLS[currency]}
      </span>
      <input
        type="text"
        inputMode="decimal"
        pattern="[0-9]*[.,]?[0-9]*"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0070f3] focus:border-transparent"
      />
    </div>
  );
}
```

---

## Implementation Order

1. **Phase 1 - Foundation** (do first, other changes depend on these):
   - Create `src/types/models.ts`
   - Create `src/lib/currencies.ts`
   - Create `src/lib/utils.ts` additions (parseAmount, getTodayDateString)

2. **Phase 2 - Hooks** (can be done in parallel):
   - Create `src/hooks/use-modal-body-class.ts`
   - Create `src/hooks/use-modal-data.ts`
   - Create `src/hooks/use-project-tags.ts`

3. **Phase 3 - Components** (after hooks are ready):
   - Create `src/components/ui/modal.tsx`
   - Create `src/components/ui/amount-input.tsx`
   - Create `src/components/project-tag-selector.tsx`

4. **Phase 4 - Refactor** (update existing components):
   - Update all modal components to use new shared types
   - Update all components to use new currency constants
   - Update modals to use new hooks
   - Gradually migrate modals to use Modal wrapper

---

## Estimated Impact

| Change | Lines Saved | Files Affected | Risk Level |
|--------|-------------|----------------|------------|
| Shared types | ~100 | 6+ | Low |
| Currency constants | ~80 | 8+ | Low |
| Modal data hook | ~150 | 3+ | Medium |
| Project tags hook | ~110 | 2 | Medium |
| Modal body class hook | ~90 | 9+ | Low |
| Amount parsing utility | ~20 | 5+ | Low |
| Date utility | ~15 | 7+ | Low |
| **Total** | **~565** | **40+ instances** | |

---

## Testing Checklist

After each refactor:
- [ ] Run `npm run build` - should pass without errors
- [ ] Test Add Expense modal (quick-add flow)
- [ ] Test Edit Expense modal
- [ ] Test Receipt Scanner modal
- [ ] Test Add Income modal
- [ ] Test project/tag creation in modals
- [ ] Verify currency display in all modals
- [ ] Check mobile responsiveness of modals
- [ ] Verify offline functionality still works
