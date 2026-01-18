"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type SheetPreview = {
  name: string;
  headers: { column: number; value: string }[];
  sampleRows: Record<number, unknown>[];
  rowCount: number;
  // Raw rows data for first N rows (allows dynamic header selection on frontend)
  rawRows: Record<number, unknown>[];
};

type PreviewResponse = {
  success: boolean;
  sheets: SheetPreview[];
  suggestedMapping: {
    dateColumn: number | null;
    nameColumn: number | null;
    amountColumn: number | null;
    headerRow: number;
  };
  hasMixedValues: boolean;
  error?: string;
};

type ImportStats = {
  survivalFixed: number;
  survivalVariable: number;
  lifestyle: number;
  project: number;
  incomes: number;
};

type RecurringCandidate = {
  name: string;
  amount: number;
  type: string;
};

type ImportResponse = {
  success: boolean;
  imported: number;
  skipped?: number;
  replaced?: number;
  duplicatesFound?: number;
  stats: ImportStats;
  errors: string[];
  sheets?: string[];
  recurringCandidates?: RecurringCandidate[];
  recurringTemplatesCreated?: number;
};

type ColumnMapping = {
  dateColumn: number | null;
  nameColumn: number;
  amountColumn: number;
  headerRow: number;
  sheetsToImport: string[];
  projectSheets: string[];
  splitExpensesIncomes: boolean; // If true, positive amounts = incomes, negative = expenses
};

type Step = "upload" | "mapping" | "importing" | "result";
type DuplicateHandling = "skip" | "replace";

export default function ImportPage() {
  const router = useRouter();
  const t = useTranslations("import");
  const tExpenses = useTranslations("expenses");
  const tCommon = useTranslations("common");
  const [step, setStep] = useState<Step>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateHandling, setDuplicateHandling] = useState<DuplicateHandling>("skip");

  // Column mapping state
  const [mapping, setMapping] = useState<ColumnMapping>({
    dateColumn: null,
    nameColumn: 1,
    amountColumn: 2,
    headerRow: 1,
    sheetsToImport: [],
    projectSheets: [],
    splitExpensesIncomes: false,
  });

  const handleFile = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setIsLoading(true);
    setError(null);

    const fileName = selectedFile.name.toLowerCase();
    // Files that skip preview and go directly to import: PDF, OFX, QFX, QIF
    const isDirectImport = fileName.endsWith(".pdf") ||
                           fileName.endsWith(".ofx") ||
                           fileName.endsWith(".qfx") ||
                           fileName.endsWith(".qif");

    if (isDirectImport) {
      setStep("importing");

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("duplicateHandling", duplicateHandling);

      try {
        const response = await fetch("/api/import", {
          method: "POST",
          body: formData,
        });

        const data: ImportResponse = await response.json();

        if (!response.ok) {
          setError(data.errors?.[0] || t("failedToImport"));
          setStep("upload");
        } else {
          setResult(data);
          setStep("result");
        }
      } catch {
        setError(t("failedToImport"));
        setStep("upload");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // For CSV/Excel files, preview first
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch("/api/import/preview", {
        method: "POST",
        body: formData,
      });

      const data: PreviewResponse = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || t("failedToPreview"));
        setStep("upload");
      } else {
        setPreview(data);
        // Apply suggested mapping - start with ALL sheets selected
        // Auto-check splitExpensesIncomes if mixed values detected
        setMapping({
          dateColumn: data.suggestedMapping.dateColumn,
          nameColumn: data.suggestedMapping.nameColumn || 1,
          amountColumn: data.suggestedMapping.amountColumn || 2,
          headerRow: data.suggestedMapping.headerRow,
          sheetsToImport: data.sheets.map((s) => s.name), // Select all by default
          projectSheets: [],
          splitExpensesIncomes: data.hasMixedValues, // Auto-enable if mixed values detected
        });
        setStep("mapping");
      }
    } catch {
      setError(t("failedToPreview"));
      setStep("upload");
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFile(droppedFile);
      }
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (selectedFile) {
        handleFile(selectedFile);
      }
    },
    [handleFile]
  );

  const handleImport = useCallback(async () => {
    if (!file) return;

    setStep("importing");
    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mapping", JSON.stringify(mapping));
    formData.append("duplicateHandling", duplicateHandling);

    try {
      const response = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      const data: ImportResponse = await response.json();

      if (!response.ok) {
        setError(data.errors?.[0] || t("failedToImportFile"));
        setStep("mapping");
      } else {
        setResult(data);
        setStep("result");
      }
    } catch {
      setError(t("failedToImportFile"));
      setStep("mapping");
    } finally {
      setIsLoading(false);
    }
  }, [file, mapping, duplicateHandling, t]);

  const resetImport = () => {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setDuplicateHandling("skip");
    setMapping({
      dateColumn: null,
      nameColumn: 1,
      amountColumn: 2,
      headerRow: 1,
      sheetsToImport: [],
      projectSheets: [],
      splitExpensesIncomes: false,
    });
  };

  // Toggle sheet selection
  const toggleSheet = (sheetName: string) => {
    if (mapping.sheetsToImport.includes(sheetName)) {
      setMapping({
        ...mapping,
        sheetsToImport: mapping.sheetsToImport.filter((s) => s !== sheetName),
        // Also remove from project sheets if deselected
        projectSheets: mapping.projectSheets.filter((s) => s !== sheetName),
      });
    } else {
      setMapping({
        ...mapping,
        sheetsToImport: [...mapping.sheetsToImport, sheetName],
      });
    }
  };

  // Toggle project sheet
  const toggleProjectSheet = (sheetName: string) => {
    if (mapping.projectSheets.includes(sheetName)) {
      setMapping({
        ...mapping,
        projectSheets: mapping.projectSheets.filter((s) => s !== sheetName),
      });
    } else {
      setMapping({
        ...mapping,
        projectSheets: [...mapping.projectSheets, sheetName],
      });
    }
  };

  // Select/deselect all sheets
  const selectAllSheets = () => {
    if (preview) {
      setMapping({
        ...mapping,
        sheetsToImport: preview.sheets.map((s) => s.name),
      });
    }
  };

  const deselectAllSheets = () => {
    setMapping({
      ...mapping,
      sheetsToImport: [],
      projectSheets: [],
    });
  };

  // Get all available columns from selected header row (dynamically computed)
  const availableColumns = useMemo(() => {
    if (!preview?.sheets[0]?.rawRows) {
      // Fallback to original headers if rawRows not available
      return preview?.sheets[0]?.headers || [];
    }

    const rawRows = preview.sheets[0].rawRows;
    const headerRowIndex = mapping.headerRow - 1; // Convert 1-based to 0-based index

    if (headerRowIndex < 0 || headerRowIndex >= rawRows.length) {
      return preview?.sheets[0]?.headers || [];
    }

    const headerRowData = rawRows[headerRowIndex];
    const columns: { column: number; value: string }[] = [];

    // Extract columns from the selected header row
    Object.entries(headerRowData).forEach(([colNum, value]) => {
      const column = parseInt(colNum);
      const strValue = value !== null && value !== undefined ? String(value).trim() : "";
      if (strValue.length > 0) {
        columns.push({ column, value: strValue });
      }
    });

    // Sort by column number
    columns.sort((a, b) => a.column - b.column);

    return columns;
  }, [preview, mapping.headerRow]);

  // Get sample rows to display (rows after the selected header row)
  const displaySampleRows = useMemo(() => {
    if (!preview?.sheets[0]?.rawRows) {
      return preview?.sheets[0]?.sampleRows || [];
    }

    const rawRows = preview.sheets[0].rawRows;
    const headerRowIndex = mapping.headerRow - 1;

    // Get rows after the header row (up to 5 rows)
    const sampleRows: Record<number, unknown>[] = [];
    for (let i = headerRowIndex + 1; i < rawRows.length && sampleRows.length < 5; i++) {
      const row = rawRows[i];
      // Skip empty rows and total rows
      const values = Object.values(row);
      if (values.length > 0) {
        const isTotal = values.some(v =>
          typeof v === "string" && v.toLowerCase().includes("total")
        );
        if (!isTotal) {
          sampleRows.push(row);
        }
      }
    }

    return sampleRows;
  }, [preview, mapping.headerRow]);

  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push("/dashboard")}
                className="text-slate-600 hover:text-slate-900"
              >
                ← {tCommon("back")}
              </button>
              <h1 className="text-xl font-bold text-slate-900">
                {t("importExpenses")}
              </h1>
            </div>
            {/* Step indicator */}
            <div className="flex items-center gap-2 text-sm">
              <span className={step === "upload" ? "text-[#0070f3] font-medium" : "text-slate-400"}>
                {t("stepUpload")}
              </span>
              <span className="text-slate-300">→</span>
              <span className={step === "mapping" ? "text-[#0070f3] font-medium" : "text-slate-400"}>
                {t("stepMapColumns")}
              </span>
              <span className="text-slate-300">→</span>
              <span className={step === "result" || step === "importing" ? "text-[#0070f3] font-medium" : "text-slate-400"}>
                {t("stepImport")}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-600">
            {error}
          </div>
        )}

        {/* Step 1: Upload */}
        {step === "upload" && (
          <>
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">
                {t("uploadYourFile")}
              </h2>
              <p className="text-slate-600">
                {t("uploadDescription")}
              </p>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`
                relative border-2 border-dashed rounded-xl p-12 text-center transition-colors
                ${isDragging ? "border-[#0070f3] bg-blue-50" : "border-slate-300"}
                ${isLoading ? "opacity-50 pointer-events-none" : ""}
              `}
            >
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.pdf,.ofx,.qfx,.qif"
                onChange={handleFileInput}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isLoading}
              />

              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                  <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>

                {isLoading ? (
                  <p className="text-slate-600">{t("analyzingFile")}</p>
                ) : (
                  <>
                    <p className="text-slate-900 font-medium">
                      {t("dropOrBrowse")}
                    </p>
                    <p className="text-sm text-slate-500">{t("supportsFormats")}</p>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* Step 2: Column Mapping */}
        {step === "mapping" && preview && (
          <>
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">
                {t("mapYourColumns")}
              </h2>
              <p className="text-slate-600">
                {t("fileInfo", { fileName: file?.name || "", sheetCount: preview.sheets.length })}
              </p>
            </div>

            {/* Mapping Form */}
            <div className="space-y-6 mb-8">
              {/* Header Row */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t("headerRow")}
                </label>
                <select
                  value={mapping.headerRow}
                  onChange={(e) => setMapping({ ...mapping, headerRow: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((row) => (
                    <option key={row} value={row}>{t("row")} {row}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">{t("headerRowHint")}</p>
              </div>

              {/* Column Selectors */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t("dateColumnOptional")}
                  </label>
                  <select
                    value={mapping.dateColumn || ""}
                    onChange={(e) => setMapping({ ...mapping, dateColumn: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
                  >
                    <option value="">{t("noDateColumn")}</option>
                    {availableColumns.map((col) => (
                      <option key={col.column} value={col.column}>
                        {t("col")} {col.column}: {col.value}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t("nameDescriptionColumn")} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={mapping.nameColumn}
                    onChange={(e) => setMapping({ ...mapping, nameColumn: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
                  >
                    {availableColumns.map((col) => (
                      <option key={col.column} value={col.column}>
                        {t("col")} {col.column}: {col.value}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t("amountColumn")} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={mapping.amountColumn}
                    onChange={(e) => setMapping({ ...mapping, amountColumn: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-900"
                  >
                    {availableColumns.map((col) => (
                      <option key={col.column} value={col.column}>
                        {t("col")} {col.column}: {col.value}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mixed Expenses/Incomes Checkbox */}
              <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mapping.splitExpensesIncomes}
                    onChange={(e) => setMapping({ ...mapping, splitExpensesIncomes: e.target.checked })}
                    className="mt-1 w-4 h-4 rounded border-slate-300 text-[#0070f3] focus:ring-[#0070f3]"
                  />
                  <div className="flex-1">
                    <span className="font-medium text-slate-900">
                      {t("splitExpensesIncomes")}
                    </span>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {t("splitDescription")}
                    </p>
                    {preview.hasMixedValues && (
                      <p className="text-sm text-[#0070f3] mt-1 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {t("mixedValuesDetected")}
                      </p>
                    )}
                  </div>
                </label>
              </div>

              {/* Duplicate Handling */}
              <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <span className="font-medium text-slate-900">
                      {t("duplicateHandlingTitle")}
                    </span>
                    <p className="text-sm text-slate-500 mt-0.5 mb-3">
                      {t("duplicateHandlingHint")}
                    </p>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="duplicateHandling"
                          value="skip"
                          checked={duplicateHandling === "skip"}
                          onChange={() => setDuplicateHandling("skip")}
                          className="w-4 h-4 border-slate-300 text-[#0070f3] focus:ring-[#0070f3]"
                        />
                        <span className="text-sm text-slate-700">{t("skipDuplicates")}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="duplicateHandling"
                          value="replace"
                          checked={duplicateHandling === "replace"}
                          onChange={() => setDuplicateHandling("replace")}
                          className="w-4 h-4 border-slate-300 text-[#0070f3] focus:ring-[#0070f3]"
                        />
                        <span className="text-sm text-slate-700">{t("replaceDuplicates")}</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sheet Selection */}
              {preview.sheets.length > 1 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-slate-700">
                      {t("sheetsToImport")}
                    </label>
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={selectAllSheets}
                        className="text-[#0070f3] hover:underline"
                      >
                        {t("selectAll")}
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={deselectAllSheets}
                        className="text-slate-500 hover:underline"
                      >
                        {t("deselectAll")}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {preview.sheets.map((sheet) => {
                      const isSelected = mapping.sheetsToImport.includes(sheet.name);
                      return (
                        <button
                          key={sheet.name}
                          type="button"
                          onClick={() => toggleSheet(sheet.name)}
                          className={`
                            px-3 py-2 rounded-lg border transition-colors
                            ${isSelected
                              ? "border-[#0070f3] bg-blue-50 text-[#0070f3]"
                              : "border-slate-300 text-slate-400 bg-slate-50"
                            }
                          `}
                        >
                          {sheet.name} ({sheet.rowCount} {t("rowsImported").split(" ")[0]})
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {mapping.sheetsToImport.length === 0
                      ? t("noSheetsSelected")
                      : t("sheetsSelected", { selected: mapping.sheetsToImport.length, total: preview.sheets.length })}
                  </p>
                </div>
              )}

              {/* Project Sheets - only show sheets that are selected for import */}
              {preview.sheets.length > 1 && mapping.sheetsToImport.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t("projectSheetsOptional")}
                  </label>
                  <p className="text-xs text-slate-500 mb-2">
                    {t("projectSheetsHint")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {preview.sheets
                      .filter((sheet) => mapping.sheetsToImport.includes(sheet.name))
                      .map((sheet) => {
                        const isProject = mapping.projectSheets.includes(sheet.name);
                        return (
                          <button
                            key={sheet.name}
                            type="button"
                            onClick={() => toggleProjectSheet(sheet.name)}
                            className={`
                              px-3 py-2 rounded-lg border transition-colors
                              ${isProject
                                ? "border-amber-500 bg-amber-50 text-amber-600"
                                : "border-slate-300 text-slate-600 hover:bg-slate-50"
                              }
                            `}
                          >
                            {sheet.name}
                          </button>
                        );
                      })}
                  </div>
                  {mapping.projectSheets.length > 0 && (
                    <p className="text-xs text-amber-600 mt-2">
                      {t("sheetsAsProjects", { count: mapping.projectSheets.length })}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Preview Table */}
            <div className="mb-8">
              <h3 className="text-sm font-medium text-slate-700 mb-3">
                {t("dataPreview")}
              </h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {availableColumns.map((col) => (
                        <th
                          key={col.column}
                          className={`px-4 py-3 text-left font-medium ${
                            col.column === mapping.dateColumn
                              ? "text-blue-600 bg-blue-50"
                              : col.column === mapping.nameColumn
                              ? "text-green-600 bg-green-50"
                              : col.column === mapping.amountColumn
                              ? "text-orange-600 bg-orange-50"
                              : "text-slate-600"
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="text-xs opacity-60">{t("col")} {col.column}</span>
                            <span>{col.value}</span>
                            {col.column === mapping.dateColumn && <span className="text-xs font-normal">→ {t("date")}</span>}
                            {col.column === mapping.nameColumn && <span className="text-xs font-normal">→ {t("name")}</span>}
                            {col.column === mapping.amountColumn && <span className="text-xs font-normal">→ {t("amount")}</span>}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {displaySampleRows.map((row, i) => (
                      <tr key={i} className="bg-white">
                        {availableColumns.map((col) => (
                          <td
                            key={col.column}
                            className={`px-4 py-2 ${
                              col.column === mapping.dateColumn
                                ? "bg-blue-50/50"
                                : col.column === mapping.nameColumn
                                ? "bg-green-50/50"
                                : col.column === mapping.amountColumn
                                ? "bg-orange-50/50"
                                : ""
                            }`}
                          >
                            {row[col.column] !== undefined ? String(row[col.column]) : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <button
                onClick={resetImport}
                className="px-6 py-3 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
              >
                {tCommon("back")}
              </button>
              <button
                onClick={handleImport}
                disabled={!mapping.nameColumn || !mapping.amountColumn || mapping.sheetsToImport.length === 0}
                className="flex-1 rounded-lg bg-[#0070f3] px-6 py-3 text-white font-medium hover:bg-[#0060df] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mapping.sheetsToImport.length === 0
                  ? t("selectAtLeastOneSheet")
                  : t("importFromSheets", { count: mapping.sheetsToImport.length })}
              </button>
            </div>
          </>
        )}

        {/* Step 3: Importing */}
        {step === "importing" && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#0070f3]/10 flex items-center justify-center animate-pulse">
              <svg className="w-8 h-8 text-[#0070f3] animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              {t("importingExpenses")}
            </h3>
            <p className="text-slate-600">
              {t("importMayTakeMoment")}
            </p>
          </div>
        )}

        {/* Step 4: Results */}
        {step === "result" && result && (
          <div className="space-y-6">
            <div className={`p-4 rounded-lg ${result.success ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
              {result.success
                ? t("successfullyImported", { count: result.imported })
                : t("importWithIssues", { count: result.imported })}
              {result.duplicatesFound && result.duplicatesFound > 0 && (
                <span className="ml-2">
                  ({result.duplicatesFound} {t("duplicatesFound")}: {result.skipped || 0} {t("skipped")}, {result.replaced || 0} {t("replaced")})
                </span>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="p-4 rounded-lg border border-slate-200">
                <p className="text-sm text-slate-500">{tExpenses("types.fixed")}</p>
                <p className="text-2xl font-bold text-slate-900">{result.stats.survivalFixed}</p>
              </div>
              <div className="p-4 rounded-lg border border-slate-200">
                <p className="text-sm text-slate-500">{tExpenses("types.variable")}</p>
                <p className="text-2xl font-bold text-slate-900">{result.stats.survivalVariable}</p>
              </div>
              <div className="p-4 rounded-lg border border-slate-200">
                <p className="text-sm text-slate-500">{tExpenses("types.lifestyle")}</p>
                <p className="text-2xl font-bold text-slate-900">{result.stats.lifestyle}</p>
              </div>
              <div className="p-4 rounded-lg border border-slate-200">
                <p className="text-sm text-slate-500">{tExpenses("types.project")}</p>
                <p className="text-2xl font-bold text-slate-900">{result.stats.project}</p>
              </div>
              {result.stats.incomes > 0 && (
                <div className="p-4 rounded-lg border border-green-200 bg-green-50">
                  <p className="text-sm text-green-600">{tExpenses("title")}</p>
                  <p className="text-2xl font-bold text-green-700">{result.stats.incomes}</p>
                </div>
              )}
            </div>

            {/* Duplicate Detection Summary */}
            {result.duplicatesFound && result.duplicatesFound > 0 && (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <p className="font-medium text-amber-700">
                    {t("duplicatesDetected")}
                  </p>
                </div>
                <p className="text-sm text-amber-600">
                  {t("duplicatesSummary", { count: result.duplicatesFound })}{' '}
                  {(result.skipped ?? 0) > 0 && (
                    <span className="font-medium">{result.skipped} {t("skipped")}</span>
                  )}
                  {(result.skipped ?? 0) > 0 && (result.replaced ?? 0) > 0 && ', '}
                  {(result.replaced ?? 0) > 0 && (
                    <span className="font-medium">{result.replaced} {t("replaced")}</span>
                  )}
                  .
                </p>
              </div>
            )}

            {/* Recurring Templates Created */}
            {result.recurringTemplatesCreated && result.recurringTemplatesCreated > 0 && (
              <div className="p-4 rounded-lg bg-purple-50 border border-purple-200">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <p className="font-medium text-purple-700">
                    {t("recurringTemplatesCreated", { count: result.recurringTemplatesCreated })}
                  </p>
                </div>
                <p className="text-sm text-purple-600 mb-3">
                  {t("recurringTemplatesDesc")}
                </p>
                {result.recurringCandidates && result.recurringCandidates.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {result.recurringCandidates.map((rc, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 rounded-full bg-purple-100 text-xs text-purple-700"
                      >
                        {rc.name} (€{rc.amount.toFixed(2)})
                      </span>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => router.push("/dashboard/recurring")}
                  className="mt-3 text-sm text-purple-600 hover:text-purple-800 font-medium underline"
                >
                  {t("viewRecurringTemplates")}
                </button>
              </div>
            )}

            {/* Sheets processed */}
            {result.sheets && result.sheets.length > 0 && (
              <div className="p-4 rounded-lg bg-slate-50">
                <p className="text-sm font-medium text-slate-700 mb-2">
                  {t("sheetsProcessed")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.sheets.map((sheet) => (
                    <span key={sheet} className="px-2 py-1 rounded bg-slate-200 text-sm text-slate-700">
                      {sheet}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {result.errors.length > 0 && (
              <div className="p-4 rounded-lg bg-yellow-50">
                <p className="font-medium text-yellow-700 mb-2">
                  {t("rowsHadIssues", { count: result.errors.length })}
                </p>
                <ul className="text-sm text-yellow-600 space-y-1">
                  {result.errors.map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-4">
              <button
                onClick={() => router.push("/dashboard")}
                className="rounded-lg bg-[#0070f3] px-6 py-3 text-white font-medium hover:bg-[#0060df] transition-colors"
              >
                {t("goToDashboard")}
              </button>
              <button
                onClick={resetImport}
                className="rounded-lg border border-slate-300 px-6 py-3 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
              >
                {t("importAnotherFile")}
              </button>
            </div>
          </div>
        )}

        {/* Format Info */}
        {step === "upload" && (
          <div className="mt-12 p-6 rounded-xl bg-slate-50">
            <h3 className="font-semibold text-slate-900 mb-3">
              {t("howItWorks")}
            </h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>
                <strong>{t("step1Upload")}</strong> — {t("step1Desc")}
              </li>
              <li>
                <strong>{t("step2Map")}</strong> — {t("step2Desc")}
              </li>
              <li>
                <strong>{t("step3Classification")}</strong> — {t("step3Desc")}
                <ul className="ml-4 mt-1 space-y-1">
                  <li>• <strong>{tExpenses("types.fixed")}:</strong> {t("classLivingFixed")}</li>
                  <li>• <strong>{tExpenses("types.variable")}:</strong> {t("classLivingVariable")}</li>
                  <li>• <strong>{tExpenses("types.lifestyle")}:</strong> {t("classLifestyle")}</li>
                  <li>• <strong>{tExpenses("types.project")}:</strong> {t("classProject")}</li>
                </ul>
              </li>
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
