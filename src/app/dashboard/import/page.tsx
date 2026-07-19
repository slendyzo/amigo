"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  UploadCloud,
  FileText,
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

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

  const stepNum = step === "upload" ? 1 : step === "mapping" ? 2 : 3;
  const stepCaption =
    step === "upload"
      ? t("stepCaptionUpload")
      : step === "mapping"
      ? t("stepCaptionMapping")
      : t("stepCaptionImport");

  const totalRows = preview
    ? preview.sheets.reduce((sum, s) => sum + (s.rowCount || 0), 0)
    : 0;

  const selectClass =
    "w-full px-4 py-2.5 rounded-[14px] text-[14px] appearance-none transition-colors focus:outline-none";
  const selectStyle = {
    background: "var(--surface)",
    color: "var(--ink)",
    border: "1px solid var(--line-strong)",
  } as const;

  return (
    <main className="min-h-screen" style={{ background: "var(--app-bg)" }}>
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Pushed header */}
        <header className="relative flex items-center justify-center h-10 mb-5">
          <button
            onClick={() => router.back()}
            aria-label={tCommon("back")}
            className="absolute left-0 w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={1.8} style={{ color: "var(--ink)" }} />
          </button>
          <h1 className="text-[16px] font-semibold" style={{ color: "var(--ink)" }}>
            {t("importExpenses")}
          </h1>
          <div className="absolute right-0 w-10 h-10" />
        </header>

        {/* Stepper */}
        <div className="mb-6">
          <div className="flex gap-1.5 mb-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex-1 h-1 rounded-[2px]"
                style={{
                  background: i <= stepNum ? "var(--accent)" : "var(--surface-3)",
                  transition: "background var(--ease) 0.4s",
                }}
              />
            ))}
          </div>
          <p className="text-[12px]" style={{ color: "var(--ink-muted)" }}>
            {t("stepOf", { current: stepNum, total: 3 })} — {stepCaption}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mb-5 p-4 rounded-[16px] text-[13.5px] flex items-start gap-2.5"
            style={{
              background: "color-mix(in srgb, var(--negative) 12%, transparent)",
              color: "var(--negative)",
            }}
          >
            <AlertCircle className="w-[18px] h-[18px] shrink-0 mt-px" strokeWidth={1.8} />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Upload */}
        {step === "upload" && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            <div className="mb-5">
              <h2 className="text-[17px] font-semibold" style={{ color: "var(--ink)" }}>
                {t("uploadYourFile")}
              </h2>
              <p className="text-[13.5px] mt-1 leading-relaxed" style={{ color: "var(--ink-muted)" }}>
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
              className="relative rounded-[20px] p-10 text-center transition-colors"
              style={{
                border: `2px dashed ${isDragging ? "var(--accent)" : "var(--accent-faint)"}`,
                background: isDragging ? "var(--accent-fainter)" : "var(--surface)",
                opacity: isLoading ? 0.6 : 1,
                pointerEvents: isLoading ? "none" : "auto",
              }}
            >
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.pdf,.ofx,.qfx,.qif"
                onChange={handleFileInput}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isLoading}
              />

              <div className="flex flex-col items-center gap-4">
                <div
                  className="w-16 h-16 rounded-[18px] flex items-center justify-center"
                  style={{ background: "var(--accent-tint)" }}
                >
                  {isLoading ? (
                    <Loader2 className="w-7 h-7 animate-spin" strokeWidth={1.8} style={{ color: "var(--accent)" }} />
                  ) : (
                    <UploadCloud className="w-7 h-7" strokeWidth={1.8} style={{ color: "var(--accent)" }} />
                  )}
                </div>

                {isLoading ? (
                  <p className="text-[14px]" style={{ color: "var(--ink-muted)" }}>{t("analyzingFile")}</p>
                ) : (
                  <>
                    <p className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
                      {t("dropOrBrowse")}
                    </p>
                    <p className="text-[12px]" style={{ color: "var(--ink-subtle)" }}>{t("supportsFormats")}</p>
                  </>
                )}
              </div>
            </div>

            {/* How it works */}
            <div
              className="mt-6 p-5 rounded-[20px]"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
            >
              <h3 className="text-[14px] font-semibold mb-3" style={{ color: "var(--ink)" }}>
                {t("howItWorks")}
              </h3>
              <ul className="space-y-2.5 text-[13px]" style={{ color: "var(--ink-muted)" }}>
                <li>
                  <strong style={{ color: "var(--ink)" }}>{t("step1Upload")}</strong> — {t("step1Desc")}
                </li>
                <li>
                  <strong style={{ color: "var(--ink)" }}>{t("step2Map")}</strong> — {t("step2Desc")}
                </li>
                <li>
                  <strong style={{ color: "var(--ink)" }}>{t("step3Classification")}</strong> — {t("step3Desc")}
                  <ul className="ml-4 mt-1.5 space-y-1">
                    <li>• <strong style={{ color: "var(--ink)" }}>{tExpenses("types.fixed")}:</strong> {t("classLivingFixed")}</li>
                    <li>• <strong style={{ color: "var(--ink)" }}>{tExpenses("types.variable")}:</strong> {t("classLivingVariable")}</li>
                    <li>• <strong style={{ color: "var(--ink)" }}>{tExpenses("types.lifestyle")}:</strong> {t("classLifestyle")}</li>
                    <li>• <strong style={{ color: "var(--ink)" }}>{tExpenses("types.project")}:</strong> {t("classProject")}</li>
                  </ul>
                </li>
              </ul>
            </div>
          </motion.div>
        )}

        {/* Step 2: Column Mapping */}
        {step === "mapping" && preview && (
          <motion.div
            key="mapping"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="space-y-5"
          >
            {/* File card */}
            <div
              className="p-4 rounded-[20px] flex items-center gap-3"
              style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
            >
              <div
                className="w-[38px] h-[38px] rounded-[12px] flex items-center justify-center shrink-0"
                style={{ background: "var(--surface-2)" }}
              >
                <FileText className="w-5 h-5" strokeWidth={1.8} style={{ color: "var(--accent)" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold truncate" style={{ color: "var(--ink)" }}>
                  {file?.name || ""}
                </p>
                <p className="text-[11.5px]" style={{ color: "var(--ink-subtle)" }}>
                  {t("fileSheetsRows", { sheets: preview.sheets.length, rows: totalRows })}
                </p>
              </div>
            </div>

            {/* Mapping Form */}
            <div className="space-y-5">
              {/* Header Row */}
              <div>
                <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "var(--ink-muted)" }}>
                  {t("headerRow")}
                </label>
                <select
                  value={mapping.headerRow}
                  onChange={(e) => setMapping({ ...mapping, headerRow: parseInt(e.target.value) })}
                  className={selectClass}
                  style={selectStyle}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((row) => (
                    <option key={row} value={row}>{t("row")} {row}</option>
                  ))}
                </select>
                <p className="text-[11.5px] mt-1" style={{ color: "var(--ink-subtle)" }}>{t("headerRowHint")}</p>
              </div>

              {/* Column Selectors */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "var(--ink-muted)" }}>
                    {t("dateColumnOptional")}
                  </label>
                  <select
                    value={mapping.dateColumn || ""}
                    onChange={(e) => setMapping({ ...mapping, dateColumn: e.target.value ? parseInt(e.target.value) : null })}
                    className={selectClass}
                    style={selectStyle}
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
                  <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "var(--ink-muted)" }}>
                    {t("nameDescriptionColumn")} <span style={{ color: "var(--negative)" }}>*</span>
                  </label>
                  <select
                    value={mapping.nameColumn}
                    onChange={(e) => setMapping({ ...mapping, nameColumn: parseInt(e.target.value) })}
                    className={selectClass}
                    style={selectStyle}
                  >
                    {availableColumns.map((col) => (
                      <option key={col.column} value={col.column}>
                        {t("col")} {col.column}: {col.value}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "var(--ink-muted)" }}>
                    {t("amountColumn")} <span style={{ color: "var(--negative)" }}>*</span>
                  </label>
                  <select
                    value={mapping.amountColumn}
                    onChange={(e) => setMapping({ ...mapping, amountColumn: parseInt(e.target.value) })}
                    className={selectClass}
                    style={selectStyle}
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
              <div className="p-4 rounded-[18px]" style={{ background: "var(--surface-2)" }}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mapping.splitExpensesIncomes}
                    onChange={(e) => setMapping({ ...mapping, splitExpensesIncomes: e.target.checked })}
                    className="mt-0.5 w-4 h-4 rounded"
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <div className="flex-1">
                    <span className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
                      {t("splitExpensesIncomes")}
                    </span>
                    <p className="text-[12.5px] mt-0.5" style={{ color: "var(--ink-muted)" }}>
                      {t("splitDescription")}
                    </p>
                    {preview.hasMixedValues && (
                      <p className="text-[12.5px] mt-1.5 flex items-center gap-1.5 font-medium" style={{ color: "var(--accent)" }}>
                        <Info className="w-4 h-4" strokeWidth={1.8} />
                        {t("mixedValuesDetected")}
                      </p>
                    )}
                  </div>
                </label>
              </div>

              {/* Duplicate Handling */}
              <div className="p-4 rounded-[18px]" style={{ background: "var(--surface-2)" }}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" strokeWidth={1.8} style={{ color: "var(--warning)" }} />
                  <div className="flex-1">
                    <span className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
                      {t("duplicateHandlingTitle")}
                    </span>
                    <p className="text-[12.5px] mt-0.5 mb-3" style={{ color: "var(--ink-muted)" }}>
                      {t("duplicateHandlingHint")}
                    </p>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="duplicateHandling"
                          value="skip"
                          checked={duplicateHandling === "skip"}
                          onChange={() => setDuplicateHandling("skip")}
                          className="w-4 h-4"
                          style={{ accentColor: "var(--accent)" }}
                        />
                        <span className="text-[13px]" style={{ color: "var(--ink)" }}>{t("skipDuplicates")}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="duplicateHandling"
                          value="replace"
                          checked={duplicateHandling === "replace"}
                          onChange={() => setDuplicateHandling("replace")}
                          className="w-4 h-4"
                          style={{ accentColor: "var(--accent)" }}
                        />
                        <span className="text-[13px]" style={{ color: "var(--ink)" }}>{t("replaceDuplicates")}</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sheet Selection */}
              {preview.sheets.length > 1 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[13px] font-semibold" style={{ color: "var(--ink-muted)" }}>
                      {t("sheetsToImport")}
                    </label>
                    <div className="flex items-center gap-2 text-[12px]">
                      <button
                        type="button"
                        onClick={selectAllSheets}
                        className="font-medium hover:underline"
                        style={{ color: "var(--accent)" }}
                      >
                        {t("selectAll")}
                      </button>
                      <span style={{ color: "var(--line-strong)" }}>|</span>
                      <button
                        type="button"
                        onClick={deselectAllSheets}
                        className="hover:underline"
                        style={{ color: "var(--ink-subtle)" }}
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
                          className="px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors"
                          style={
                            isSelected
                              ? { background: "var(--accent-tint)", color: "var(--accent)", border: "1px solid var(--accent)" }
                              : { background: "var(--surface-2)", color: "var(--ink-subtle)", border: "1px solid transparent" }
                          }
                        >
                          {sheet.name} ({sheet.rowCount} {t("rowsImported").split(" ")[0]})
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11.5px] mt-1.5" style={{ color: "var(--ink-subtle)" }}>
                    {mapping.sheetsToImport.length === 0
                      ? t("noSheetsSelected")
                      : t("sheetsSelected", { selected: mapping.sheetsToImport.length, total: preview.sheets.length })}
                  </p>
                </div>
              )}

              {/* Project Sheets - only show sheets that are selected for import */}
              {preview.sheets.length > 1 && mapping.sheetsToImport.length > 0 && (
                <div>
                  <label className="block text-[13px] font-semibold mb-1" style={{ color: "var(--ink-muted)" }}>
                    {t("projectSheetsOptional")}
                  </label>
                  <p className="text-[11.5px] mb-2" style={{ color: "var(--ink-subtle)" }}>
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
                            className="px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors"
                            style={
                              isProject
                                ? { background: "var(--accent)", color: "var(--accent-fg)", border: "1px solid var(--accent)" }
                                : { background: "var(--surface-2)", color: "var(--ink-muted)", border: "1px solid transparent" }
                            }
                          >
                            {sheet.name}
                          </button>
                        );
                      })}
                  </div>
                  {mapping.projectSheets.length > 0 && (
                    <p className="text-[11.5px] mt-2 font-medium" style={{ color: "var(--accent)" }}>
                      {t("sheetsAsProjects", { count: mapping.projectSheets.length })}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Preview Table */}
            <div>
              <h3 className="text-[13px] font-semibold mb-2.5" style={{ color: "var(--ink-muted)" }}>
                {t("dataPreview")}
              </h3>
              <div
                className="overflow-x-auto rounded-[20px]"
                style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
              >
                <table className="w-full text-[13px]">
                  <thead>
                    <tr style={{ background: "var(--surface-2)" }}>
                      {availableColumns.map((col) => {
                        const isDate = col.column === mapping.dateColumn;
                        const isName = col.column === mapping.nameColumn;
                        const isAmount = col.column === mapping.amountColumn;
                        const headStyle = isDate
                          ? { color: "var(--accent)", background: "var(--accent-tint)" }
                          : isName
                          ? { color: "var(--positive)", background: "color-mix(in srgb, var(--positive) 12%, transparent)" }
                          : isAmount
                          ? { color: "var(--warning)", background: "color-mix(in srgb, var(--warning) 12%, transparent)" }
                          : { color: "var(--ink-muted)" };
                        return (
                          <th key={col.column} className="px-4 py-3 text-left font-semibold whitespace-nowrap" style={headStyle}>
                            <div className="flex flex-col">
                              <span className="text-[10.5px] opacity-60">{t("col")} {col.column}</span>
                              <span>{col.value}</span>
                              {isDate && <span className="text-[10.5px] font-normal">→ {t("date")}</span>}
                              {isName && <span className="text-[10.5px] font-normal">→ {t("name")}</span>}
                              {isAmount && <span className="text-[10.5px] font-normal">→ {t("amount")}</span>}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {displaySampleRows.map((row, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
                        {availableColumns.map((col) => {
                          const isDate = col.column === mapping.dateColumn;
                          const isName = col.column === mapping.nameColumn;
                          const isAmount = col.column === mapping.amountColumn;
                          const cellStyle = isDate
                            ? { background: "var(--accent-fainter)", color: "var(--ink)" }
                            : isName
                            ? { background: "color-mix(in srgb, var(--positive) 8%, transparent)", color: "var(--ink)" }
                            : isAmount
                            ? { background: "color-mix(in srgb, var(--warning) 8%, transparent)", color: "var(--ink)" }
                            : { color: "var(--ink)" };
                          return (
                            <td
                              key={col.column}
                              className={`px-4 py-2.5 whitespace-nowrap ${isAmount ? "tabular-nums" : ""}`}
                              style={cellStyle}
                            >
                              {row[col.column] !== undefined ? String(row[col.column]) : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={resetImport}
                className="px-6 py-3.5 rounded-[18px] text-[15px] font-semibold transition-colors active:scale-[0.99]"
                style={{ background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line-strong)" }}
              >
                {tCommon("back")}
              </button>
              <button
                onClick={handleImport}
                disabled={!mapping.nameColumn || !mapping.amountColumn || mapping.sheetsToImport.length === 0}
                className="flex-1 rounded-[18px] px-6 py-3.5 text-[15px] font-semibold transition-transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "var(--accent)", color: "var(--accent-fg)", boxShadow: "var(--shadow-fab)" }}
              >
                {mapping.sheetsToImport.length === 0
                  ? t("selectAtLeastOneSheet")
                  : t("importFromSheets", { count: mapping.sheetsToImport.length })}
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Importing */}
        {step === "importing" && (
          <motion.div
            key="importing"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="text-center py-16"
          >
            <div
              className="w-16 h-16 mx-auto mb-5 rounded-[18px] flex items-center justify-center"
              style={{ background: "var(--accent-tint)" }}
            >
              <Loader2 className="w-8 h-8 animate-spin" strokeWidth={1.8} style={{ color: "var(--accent)" }} />
            </div>
            <h3 className="text-[17px] font-semibold mb-1.5" style={{ color: "var(--ink)" }}>
              {t("importingExpenses")}
            </h3>
            <p className="text-[13.5px]" style={{ color: "var(--ink-muted)" }}>
              {t("importMayTakeMoment")}
            </p>
          </motion.div>
        )}

        {/* Step 4: Results */}
        {step === "result" && result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="space-y-5"
          >
            <div
              className="p-4 rounded-[18px] text-[14px] font-medium flex items-start gap-2.5"
              style={
                result.success
                  ? { background: "color-mix(in srgb, var(--positive) 12%, transparent)", color: "var(--positive)" }
                  : { background: "color-mix(in srgb, var(--negative) 12%, transparent)", color: "var(--negative)" }
              }
            >
              {result.success ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-px" strokeWidth={1.8} />
              ) : (
                <AlertCircle className="w-5 h-5 shrink-0 mt-px" strokeWidth={1.8} />
              )}
              <span>
                {result.success
                  ? t("successfullyImported", { count: result.imported })
                  : t("importWithIssues", { count: result.imported })}
                {(result.duplicatesFound ?? 0) > 0 && (
                  <span className="ml-1">
                    ({result.duplicatesFound} {t("duplicatesFound")}
                    {((result.skipped ?? 0) > 0 || (result.replaced ?? 0) > 0) && ": "}
                    {(result.skipped ?? 0) > 0 && <>{result.skipped} {t("skipped")}</>}
                    {(result.skipped ?? 0) > 0 && (result.replaced ?? 0) > 0 && ", "}
                    {(result.replaced ?? 0) > 0 && <>{result.replaced} {t("replaced")}</>})
                  </span>
                )}
              </span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: tExpenses("types.fixed"), value: result.stats.survivalFixed },
                { label: tExpenses("types.variable"), value: result.stats.survivalVariable },
                { label: tExpenses("types.lifestyle"), value: result.stats.lifestyle },
                { label: tExpenses("types.project"), value: result.stats.project },
              ].map((s, i) => (
                <div
                  key={i}
                  className="p-4 rounded-[20px]"
                  style={{ background: "var(--surface)", boxShadow: "var(--shadow-card)" }}
                >
                  <p className="text-[12px]" style={{ color: "var(--ink-muted)" }}>{s.label}</p>
                  <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--ink)" }}>{s.value}</p>
                </div>
              ))}
              {result.stats.incomes > 0 && (
                <div
                  className="p-4 rounded-[20px]"
                  style={{ background: "color-mix(in srgb, var(--positive) 12%, transparent)" }}
                >
                  <p className="text-[12px]" style={{ color: "var(--positive)" }}>{tExpenses("title")}</p>
                  <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--positive)" }}>{result.stats.incomes}</p>
                </div>
              )}
            </div>

            {/* Duplicate Detection Summary */}
            {(result.duplicatesFound ?? 0) > 0 && (
              <div
                className="p-4 rounded-[18px]"
                style={{ background: "color-mix(in srgb, var(--warning) 10%, transparent)" }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <AlertTriangle className="w-5 h-5" strokeWidth={1.8} style={{ color: "var(--warning)" }} />
                  <p className="text-[14px] font-semibold" style={{ color: "var(--warning)" }}>
                    {t("duplicatesDetected")}
                  </p>
                </div>
                <p className="text-[13px]" style={{ color: "var(--ink-muted)" }}>
                  {t("duplicatesSummary", { count: result.duplicatesFound ?? 0 })}{" "}
                  {(result.skipped ?? 0) > 0 && (
                    <span className="font-semibold" style={{ color: "var(--ink)" }}>{result.skipped} {t("skipped")}</span>
                  )}
                  {(result.skipped ?? 0) > 0 && (result.replaced ?? 0) > 0 && ", "}
                  {(result.replaced ?? 0) > 0 && (
                    <span className="font-semibold" style={{ color: "var(--ink)" }}>{result.replaced} {t("replaced")}</span>
                  )}
                  .
                </p>
              </div>
            )}

            {/* Recurring Templates Created */}
            {(result.recurringTemplatesCreated ?? 0) > 0 && (
              <div
                className="p-4 rounded-[18px]"
                style={{ background: "var(--accent-tint)" }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <RefreshCw className="w-5 h-5" strokeWidth={1.8} style={{ color: "var(--accent)" }} />
                  <p className="text-[14px] font-semibold" style={{ color: "var(--accent)" }}>
                    {t("recurringTemplatesCreated", { count: result.recurringTemplatesCreated ?? 0 })}
                  </p>
                </div>
                <p className="text-[13px] mb-3" style={{ color: "var(--ink-muted)" }}>
                  {t("recurringTemplatesDesc")}
                </p>
                {result.recurringCandidates && result.recurringCandidates.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {result.recurringCandidates.map((rc, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-full text-[12px] font-medium tabular-nums"
                        style={{ background: "var(--accent-fainter)", color: "var(--accent-strong)" }}
                      >
                        {rc.name} (€{rc.amount.toFixed(2)})
                      </span>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => router.push("/dashboard/recurring")}
                  className="mt-3 text-[13px] font-semibold underline"
                  style={{ color: "var(--accent)" }}
                >
                  {t("viewRecurringTemplates")}
                </button>
              </div>
            )}

            {/* Sheets processed */}
            {result.sheets && result.sheets.length > 0 && (
              <div className="p-4 rounded-[18px]" style={{ background: "var(--surface-2)" }}>
                <p className="text-[13px] font-semibold mb-2" style={{ color: "var(--ink-muted)" }}>
                  {t("sheetsProcessed")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.sheets.map((sheet) => (
                    <span
                      key={sheet}
                      className="px-2.5 py-1 rounded-full text-[12.5px]"
                      style={{ background: "var(--surface)", color: "var(--ink)", boxShadow: "var(--shadow-card)" }}
                    >
                      {sheet}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {result.errors.length > 0 && (
              <div
                className="p-4 rounded-[18px]"
                style={{ background: "color-mix(in srgb, var(--warning) 10%, transparent)" }}
              >
                <p className="text-[14px] font-semibold mb-2" style={{ color: "var(--warning)" }}>
                  {t("rowsHadIssues", { count: result.errors.length })}
                </p>
                <ul className="text-[13px] space-y-1" style={{ color: "var(--ink-muted)" }}>
                  {result.errors.map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => router.push("/dashboard")}
                className="flex-1 rounded-[18px] px-6 py-3.5 text-[15px] font-semibold transition-transform active:scale-[0.99]"
                style={{ background: "var(--accent)", color: "var(--accent-fg)", boxShadow: "var(--shadow-fab)" }}
              >
                {t("goToDashboard")}
              </button>
              <button
                onClick={resetImport}
                className="rounded-[18px] px-6 py-3.5 text-[15px] font-semibold transition-colors active:scale-[0.99]"
                style={{ background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line-strong)" }}
              >
                {t("importAnotherFile")}
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </main>
  );
}
