"use client";

import { useState, useEffect } from "react";
import type { Category, BankAccount, Project } from "@/types/models";

type ModalData = {
  categories: Category[];
  projects: Project[];
  bankAccounts: BankAccount[];
  defaultCurrency: string;
  defaultBankAccountId: string | null;
  isLoading: boolean;
  error: string | null;
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  setBankAccounts: React.Dispatch<React.SetStateAction<BankAccount[]>>;
};

type UseModalDataOptions = {
  fetchCategories?: boolean;
  fetchProjects?: boolean;
  fetchBankAccounts?: boolean;
  fetchWorkspace?: boolean;
};

const defaultOptions: UseModalDataOptions = {
  fetchCategories: true,
  fetchProjects: true,
  fetchBankAccounts: true,
  fetchWorkspace: true,
};

/**
 * Hook for fetching common modal data (categories, projects, bank accounts, workspace settings).
 * Deduplicates the fetch logic that was previously repeated in multiple modals.
 *
 * @param isOpen - Whether the modal is open (triggers fetch when true)
 * @param propCategories - Categories passed via props (skips fetch if provided)
 * @param propProjects - Projects passed via props (skips fetch if provided)
 * @param propBankAccounts - Bank accounts passed via props (skips fetch if provided)
 * @param options - Options to customize which data to fetch
 * @returns Modal data including categories, projects, bank accounts, and default currency
 */
export function useModalData(
  isOpen: boolean,
  propCategories?: Category[],
  propProjects?: Project[],
  propBankAccounts?: BankAccount[],
  options: UseModalDataOptions = defaultOptions
): ModalData {
  const [categories, setCategories] = useState<Category[]>(propCategories || []);
  const [projects, setProjects] = useState<Project[]>(propProjects || []);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(propBankAccounts || []);
  const [defaultCurrency, setDefaultCurrency] = useState("EUR");
  const [defaultBankAccountId, setDefaultBankAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update state when props change
  useEffect(() => {
    if (propCategories) {
      const newJson = JSON.stringify(propCategories);
      const currentJson = JSON.stringify(categories);
      if (newJson !== currentJson) {
        setCategories(propCategories);
      }
    }
  }, [propCategories, categories]);

  useEffect(() => {
    if (propProjects) {
      const newJson = JSON.stringify(propProjects);
      const currentJson = JSON.stringify(projects);
      if (newJson !== currentJson) {
        setProjects(propProjects);
      }
    }
  }, [propProjects, projects]);

  useEffect(() => {
    if (propBankAccounts) {
      const newJson = JSON.stringify(propBankAccounts);
      const currentJson = JSON.stringify(bankAccounts);
      if (newJson !== currentJson) {
        setBankAccounts(propBankAccounts);
      }
    }
  }, [propBankAccounts, bankAccounts]);

  // Fetch data when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const needsCategoriesFetch = options.fetchCategories && !propCategories?.length;
    const needsProjectsFetch = options.fetchProjects && !propProjects?.length;
    const needsBankAccountsFetch = options.fetchBankAccounts && !propBankAccounts?.length;
    const needsWorkspaceFetch = options.fetchWorkspace;

    const needsAnyFetch = needsCategoriesFetch || needsProjectsFetch || needsBankAccountsFetch || needsWorkspaceFetch;

    if (!needsAnyFetch) return;

    setIsLoading(true);
    setError(null);

    const fetchPromises: Promise<Response | null>[] = [
      needsCategoriesFetch ? fetch("/api/categories") : Promise.resolve(null),
      needsProjectsFetch ? fetch("/api/projects") : Promise.resolve(null),
      needsBankAccountsFetch ? fetch("/api/bank-accounts") : Promise.resolve(null),
      needsWorkspaceFetch ? fetch("/api/workspace") : Promise.resolve(null),
    ];

    Promise.all(fetchPromises)
      .then(async ([catRes, projRes, bankRes, workspaceRes]) => {
        const results = await Promise.all([
          catRes ? catRes.json() : null,
          projRes ? projRes.json() : null,
          bankRes ? bankRes.json() : null,
          workspaceRes ? workspaceRes.json() : null,
        ]);

        const [catData, projData, bankData, workspaceData] = results;

        if (catData?.categories) setCategories(catData.categories);
        if (projData?.projects) setProjects(projData.projects);
        if (bankData?.bankAccounts) setBankAccounts(bankData.bankAccounts);
        if (workspaceData?.workspace?.defaultCurrency) {
          setDefaultCurrency(workspaceData.workspace.defaultCurrency);
        }
        if (workspaceData?.workspace) {
          setDefaultBankAccountId(workspaceData.workspace.defaultBankAccountId || null);
        }
      })
      .catch((err) => {
        console.error("Failed to load modal data:", err);
        setError("Failed to load data");
      })
      .finally(() => setIsLoading(false));
  }, [isOpen, propCategories, propProjects, propBankAccounts, options]);

  return {
    categories,
    projects,
    bankAccounts,
    defaultCurrency,
    defaultBankAccountId,
    isLoading,
    error,
    setCategories,
    setProjects,
    setBankAccounts,
  };
}
