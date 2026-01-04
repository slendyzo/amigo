// Flexible Importer for Amigo
// Handles various Excel/CSV formats with custom column mapping

import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { prisma } from "./db";
import { ExpenseType } from "@prisma/client";

// Keywords to identify SURVIVAL_FIXED vs SURVIVAL_VARIABLE
const FIXED_KEYWORDS = [
  "spotify", "netflix", "youtube", "hbo", "disney", "amazon", "prime",
  "ginásio", "ginasio", "gym", "renda", "aluguer", "rent", "seguro",
  "insurance", "mensalidade", "subscription", "assinatura", "nowo",
  "vodafone", "meo", "nos", "phone", "telemovel", "telemóvel",
  "duster", "prestação", "prestacao", "seg social", "contabilista",
  "manutenção", "manutencao", "conta"
];

const VARIABLE_KEYWORDS = [
  "luz", "água", "agua", "gás", "gas", "eletricidade", "electricity",
  "water", "edp", "galp", "endesa"
];

export type ColumnMapping = {
  dateColumn: number | null;
  nameColumn: number;
  amountColumn: number;
  headerRow: number;
  sheetsToImport: string[]; // Empty = all sheets
  projectSheets: string[]; // Sheets to tag as PROJECT type
  splitExpensesIncomes?: boolean; // If true, positive = incomes, negative = expenses
};

export type RecurringCandidate = {
  name: string;
  amount: number;
  type: ExpenseType;
};

export type ImporterResult = {
  success: boolean;
  imported: number;
  failed: number;
  errors: string[];
  stats: {
    survivalFixed: number;
    survivalVariable: number;
    lifestyle: number;
    project: number;
    incomes: number;
  };
  sheets: string[];
  recurringCandidates: RecurringCandidate[];
  recurringTemplatesCreated: number;
};

export type ParsedRow = {
  sheetName: string;
  rowNumber: number;
  date: Date | null;
  name: string;
  rawInput: string;
  amount: number;
  type: ExpenseType;
  isIncome?: boolean; // If true, this row should be imported as income instead of expense
};

/**
 * Extract cell value, handling formulas
 */
function getCellValue(cell: ExcelJS.Cell): unknown {
  if (!cell || cell.value === null || cell.value === undefined) {
    return null;
  }

  const value = cell.value;

  // Handle formula cells - extract the result
  if (typeof value === "object" && value !== null && "result" in value) {
    return (value as { result: unknown }).result;
  }

  return value;
}

/**
 * Parse Excel date (handles serial numbers and Date objects)
 */
function parseExcelDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    // Excel serial date (days since 1899-12-30)
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string") {
    const str = value.trim();
    if (!str || str.toLowerCase() === "total") return null;

    // Try DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (dmyMatch) {
      const [, day, month, year] = dmyMatch;
      const fullYear = year.length === 2 ? 2000 + parseInt(year) : parseInt(year);
      return new Date(fullYear, parseInt(month) - 1, parseInt(day));
    }

    // Try ISO format
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

/**
 * Parse amount from various formats
 * Returns absolute value by default, use parseAmountRaw for signed value
 */
function parseAmount(value: unknown): number {
  if (typeof value === "number") {
    return Math.abs(value);
  }

  if (typeof value === "string") {
    const cleaned = value
      .replace(/[€$£R\s]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");

    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.abs(num);
  }

  return 0;
}

/**
 * Parse amount preserving the sign (for detecting positive/negative values)
 */
function parseAmountRaw(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const cleaned = value
      .replace(/[€$£R\s]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");

    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  return 0;
}

/**
 * Determine expense type based on keywords and whether it has a date
 */
function determineExpenseType(name: string, hasDate: boolean, isProjectSheet: boolean): ExpenseType {
  // Project sheets always return PROJECT type
  if (isProjectSheet) {
    return ExpenseType.PROJECT;
  }

  const lowerName = name.toLowerCase();

  // If it has a date, it's lifestyle spending
  if (hasDate) {
    return ExpenseType.LIFESTYLE;
  }

  // Check for variable keywords first (utilities)
  for (const keyword of VARIABLE_KEYWORDS) {
    if (lowerName.includes(keyword)) {
      return ExpenseType.SURVIVAL_VARIABLE;
    }
  }

  // Check for fixed keywords
  for (const keyword of FIXED_KEYWORDS) {
    if (lowerName.includes(keyword)) {
      return ExpenseType.SURVIVAL_FIXED;
    }
  }

  // Default: no date = survival fixed
  return ExpenseType.SURVIVAL_FIXED;
}

/**
 * Extract month/year from sheet name like "Dezembro 2025"
 */
function parseSheetDate(sheetName: string): Date | null {
  const months: Record<string, number> = {
    janeiro: 0, january: 0, jan: 0,
    fevereiro: 1, february: 1, feb: 1,
    março: 2, marco: 2, march: 2, mar: 2,
    abril: 3, april: 3, apr: 3,
    maio: 4, may: 4,
    junho: 5, june: 5, jun: 5,
    julho: 6, july: 6, jul: 6,
    agosto: 7, august: 7, aug: 7,
    setembro: 8, september: 8, sep: 8, set: 8,
    outubro: 9, october: 9, oct: 9, out: 9,
    novembro: 10, november: 10, nov: 10,
    dezembro: 11, december: 11, dec: 11, dez: 11
  };

  const match = sheetName.toLowerCase().match(/(\w+)\s+(\d{4})/);
  if (match) {
    const monthName = match[1];
    const year = parseInt(match[2]);
    const month = months[monthName];
    if (month !== undefined) {
      return new Date(year, month, 1);
    }
  }
  return null;
}

/**
 * Convert old .xls (BIFF) format to .xlsx format using SheetJS
 * ExcelJS doesn't support the old .xls format, so we convert it first
 */
function convertXlsToXlsx(buffer: Buffer): Buffer {
  // Read the .xls file with SheetJS
  const xlsWorkbook = XLSX.read(buffer, { type: "buffer" });
  // Write it back as .xlsx format
  const xlsxBuffer = XLSX.write(xlsWorkbook, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(xlsxBuffer);
}

/**
 * Main importer function with custom column mapping
 */
export async function importExpensesFromExcel(
  buffer: Buffer,
  workspaceId: string,
  userId: string,
  fileName: string,
  mapping?: ColumnMapping
): Promise<ImporterResult> {
  const errors: string[] = [];
  const allParsedRows: ParsedRow[] = [];
  const stats = {
    survivalFixed: 0,
    survivalVariable: 0,
    lifestyle: 0,
    project: 0,
    incomes: 0,
  };
  const processedSheets: string[] = [];
  const recurringCandidates: RecurringCandidate[] = [];

  // Default mapping (legacy format)
  const columnMapping: ColumnMapping = mapping || {
    dateColumn: 2,  // Column B
    nameColumn: 3,  // Column C
    amountColumn: 4, // Column D
    headerRow: 2,
    sheetsToImport: [],
    projectSheets: ["casa"],
  };

  try {
    // Check if this is an old .xls file (BIFF format) by checking file extension or magic bytes
    const isXls = fileName.toLowerCase().endsWith(".xls") && !fileName.toLowerCase().endsWith(".xlsx");

    // Convert .xls to .xlsx format if needed (ExcelJS doesn't support old .xls format)
    let processBuffer = buffer;
    if (isXls) {
      console.log("Converting .xls to .xlsx format...");
      try {
        processBuffer = convertXlsToXlsx(buffer);
        console.log("Conversion successful");
      } catch (convError) {
        console.error("Failed to convert .xls file:", convError);
        return {
          success: false,
          imported: 0,
          failed: 0,
          errors: ["Failed to read .xls file. The file may be corrupted or in an unsupported format."],
          stats: { ...stats, incomes: 0 },
          sheets: [],
          recurringCandidates: [],
          recurringTemplatesCreated: 0,
        };
      }
    }

    const workbook = new ExcelJS.Workbook();
    // @ts-expect-error ExcelJS types don't match Node 22 Buffer types
    await workbook.xlsx.load(processBuffer);

    console.log(`Processing ${workbook.worksheets.length} worksheets...`);

    // Process each worksheet
    for (const worksheet of workbook.worksheets) {
      const sheetName = worksheet.name;

      // Skip sheets not in import list (if specified)
      if (columnMapping.sheetsToImport.length > 0 &&
          !columnMapping.sheetsToImport.some(s => s.toLowerCase() === sheetName.toLowerCase())) {
        console.log(`Skipping sheet: "${sheetName}" (not in import list)`);
        continue;
      }

      const isProjectSheet = columnMapping.projectSheets.some(
        s => s.toLowerCase() === sheetName.toLowerCase()
      );
      const sheetDate = parseSheetDate(sheetName);

      console.log(`\nProcessing sheet: "${sheetName}" (isProject: ${isProjectSheet})`);
      processedSheets.push(sheetName);

      let rowsProcessed = 0;
      let lastValidDate: Date | null = null; // Track last seen date for inheritance
      let firstDateSeen = false; // Track if we've seen a date yet (rows before first date are recurring)
      const sheetRecurringNames = new Set<string>(); // Track recurring candidates per sheet

      worksheet.eachRow((row, rowNumber) => {
        // Skip header rows
        if (rowNumber <= columnMapping.headerRow) return;

        const nameCell = row.getCell(columnMapping.nameColumn);
        const amountCell = row.getCell(columnMapping.amountColumn);
        const dateCell = columnMapping.dateColumn ? row.getCell(columnMapping.dateColumn) : null;

        const rawName = String(getCellValue(nameCell) || "").trim();
        const rawAmount = getCellValue(amountCell);

        // Skip empty rows or total rows
        if (!rawName || rawName.toLowerCase() === "total") return;
        if (!rawAmount) return;

        // Parse amount - check raw value for positive/negative detection
        const rawAmountValue = parseAmountRaw(rawAmount);
        const amount = Math.abs(rawAmountValue);
        if (amount === 0) {
          return; // Skip zero amounts silently
        }

        // Determine if this should be an income (positive value when splitExpensesIncomes is enabled)
        const isIncome = columnMapping.splitExpensesIncomes && rawAmountValue > 0;

        const dateValue = dateCell ? getCellValue(dateCell) : null;
        let parsedDate = parseExcelDate(dateValue);

        // hasDate now reflects whether THIS row had a date OR inherited one
        // For type determination, we check if the ORIGINAL cell had a date
        const originalHadDate = dateValue !== null && dateValue !== undefined && dateValue !== "";

        // Track recurring candidates: expenses without dates that appear before any dated entries
        // These are typically subscription/fixed costs listed at the top of the sheet
        if (!originalHadDate && !firstDateSeen && !isProjectSheet) {
          // This is a recurring candidate - expense without date at top of sheet
          const normalizedName = rawName.toLowerCase().trim();
          if (!sheetRecurringNames.has(normalizedName)) {
            sheetRecurringNames.add(normalizedName);
            const type = determineExpenseType(rawName, false, false);
            // Only add SURVIVAL_FIXED and SURVIVAL_VARIABLE as recurring candidates
            if (type === ExpenseType.SURVIVAL_FIXED || type === ExpenseType.SURVIVAL_VARIABLE) {
              recurringCandidates.push({
                name: rawName,
                amount,
                type,
              });
            }
          }
        }

        // DATE INHERITANCE: If no date in this row, use the last valid date
        if (parsedDate) {
          lastValidDate = parsedDate; // Update the last valid date
          firstDateSeen = true; // Mark that we've seen a date
        } else if (lastValidDate) {
          parsedDate = lastValidDate; // Inherit from previous row
        }

        // Determine expense type
        // For project sheets: always PROJECT
        // For non-project sheets with explicit dates or inherited dates from dated rows: LIFESTYLE
        // For survival items (no date context): SURVIVAL_FIXED/VARIABLE
        const type = determineExpenseType(rawName, originalHadDate || (lastValidDate !== null && !isProjectSheet), isProjectSheet);

        // Update stats
        if (isIncome) {
          stats.incomes++;
        } else if (type === ExpenseType.SURVIVAL_FIXED) stats.survivalFixed++;
        else if (type === ExpenseType.SURVIVAL_VARIABLE) stats.survivalVariable++;
        else if (type === ExpenseType.LIFESTYLE) stats.lifestyle++;
        else if (type === ExpenseType.PROJECT) stats.project++;

        // Use parsed date (which may be inherited), or sheet date, or today
        let expenseDate = parsedDate;
        if (!expenseDate && sheetDate) {
          expenseDate = sheetDate;
        }
        if (!expenseDate) {
          expenseDate = new Date();
        }

        allParsedRows.push({
          sheetName,
          rowNumber,
          date: expenseDate,
          name: rawName,
          rawInput: `[${sheetName}] ${rawName}: ${amount}`,
          amount,
          type,
          isIncome,
        });

        rowsProcessed++;
      });

      console.log(`  → Processed ${rowsProcessed} rows from "${sheetName}"`);
    }

    console.log(`\nTotal rows to import: ${allParsedRows.length}`);

    if (allParsedRows.length === 0) {
      return {
        success: false,
        imported: 0,
        failed: 0,
        errors: ["No valid expense rows found. Please check your column mapping."],
        stats,
        sheets: processedSheets,
        recurringCandidates: [],
        recurringTemplatesCreated: 0,
      };
    }

    // Deduplicate recurring candidates by normalized name
    const uniqueRecurring = new Map<string, RecurringCandidate>();
    for (const candidate of recurringCandidates) {
      const key = candidate.name.toLowerCase().trim();
      if (!uniqueRecurring.has(key)) {
        uniqueRecurring.set(key, candidate);
      }
    }
    const dedupedRecurring = Array.from(uniqueRecurring.values());

    console.log(`\nFound ${dedupedRecurring.length} recurring expense candidates`);
    for (const rc of dedupedRecurring) {
      console.log(`  → ${rc.name}: €${rc.amount} (${rc.type})`);
    }

    // Get or create default category
    let defaultCategory = await prisma.category.findFirst({
      where: { workspaceId, name: "Uncategorized" },
    });

    if (!defaultCategory) {
      defaultCategory = await prisma.category.create({
        data: { workspaceId, name: "Uncategorized", isSystem: true },
      });
    }

    // Get or create projects for project-tagged expenses (one per project sheet)
    const projectMap: Record<string, string> = {}; // sheetName -> projectId
    for (const projectSheetName of columnMapping.projectSheets) {
      let project = await prisma.project.findFirst({
        where: { workspaceId, name: { equals: projectSheetName, mode: "insensitive" } },
      });

      if (!project) {
        project = await prisma.project.create({
          data: {
            workspaceId,
            name: projectSheetName.charAt(0).toUpperCase() + projectSheetName.slice(1).toLowerCase()
          },
        });
      }
      projectMap[projectSheetName.toLowerCase()] = project.id;
    }

    // Create the import log first so we can link expenses to it
    const importLog = await prisma.importLog.create({
      data: {
        workspaceId,
        fileName,
        fileType: fileName.endsWith(".csv") ? "csv" : "xlsx",
        rowsTotal: allParsedRows.length,
        rowsSuccess: 0, // Will update after creating expenses
        rowsFailed: errors.length,
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
      },
    });

    // Separate rows into incomes, project expenses, and regular expenses
    const incomeRows: ParsedRow[] = [];
    const projectExpenses: ParsedRow[] = [];
    const regularExpenses: ParsedRow[] = [];

    for (const row of allParsedRows) {
      if (row.isIncome) {
        incomeRows.push(row);
      } else if (row.type === ExpenseType.PROJECT && projectMap[row.sheetName.toLowerCase()]) {
        projectExpenses.push(row);
      } else {
        regularExpenses.push(row);
      }
    }

    let totalCreated = 0;

    // Insert incomes in batch
    if (incomeRows.length > 0) {
      const incomeData = incomeRows.map((row) => ({
        workspaceId,
        name: row.name,
        amount: row.amount,
        currency: "EUR",
        amountEur: row.amount,
        date: row.date!,
        isRecurring: false,
      }));

      const incomeResult = await prisma.income.createMany({
        data: incomeData,
      });
      totalCreated += incomeResult.count;
      console.log(`  → Created ${incomeResult.count} incomes`);
    }

    // Insert regular expenses in batch (no project relation)
    const regularExpenseData = regularExpenses.map((row) => ({
      workspaceId,
      categoryId: defaultCategory!.id,
      importLogId: importLog.id,
      name: row.name,
      rawInput: row.rawInput,
      type: row.type,
      status: "PAID" as const,
      amount: row.amount,
      currency: "EUR",
      amountEur: row.amount,
      date: row.date!,
    }));

    if (regularExpenseData.length > 0) {
      const regularResult = await prisma.expense.createMany({
        data: regularExpenseData,
      });
      totalCreated += regularResult.count;
    }

    // Insert project expenses individually (to support many-to-many relation)
    for (const row of projectExpenses) {
      const projectId = projectMap[row.sheetName.toLowerCase()];
      await prisma.expense.create({
        data: {
          workspaceId,
          categoryId: defaultCategory!.id,
          importLogId: importLog.id,
          name: row.name,
          rawInput: row.rawInput,
          type: row.type,
          status: "PAID",
          amount: row.amount,
          currency: "EUR",
          amountEur: row.amount,
          date: row.date!,
          projects: {
            connect: { id: projectId },
          },
        },
      });
      totalCreated++;
    }

    // Update import log with actual success count
    await prisma.importLog.update({
      where: { id: importLog.id },
      data: { rowsSuccess: totalCreated },
    });

    // Create recurring templates from candidates (skip if already exists)
    let recurringTemplatesCreated = 0;
    for (const candidate of dedupedRecurring) {
      // Check if template already exists with similar name
      const existing = await prisma.recurringTemplate.findFirst({
        where: {
          workspaceId,
          name: { equals: candidate.name, mode: "insensitive" },
        },
      });

      if (!existing) {
        // Auto-generate is true for fixed expenses with amounts (like Spotify)
        // and false for variable expenses (like utilities) so user can fill in later
        const shouldAutoGenerate = candidate.type === ExpenseType.SURVIVAL_FIXED && candidate.amount > 0;

        await prisma.recurringTemplate.create({
          data: {
            workspaceId,
            name: candidate.name,
            type: candidate.type,
            amount: candidate.amount,
            currency: "EUR",
            interval: "MONTHLY",
            isActive: true,
            autoGenerate: shouldAutoGenerate,
          },
        });
        recurringTemplatesCreated++;
        console.log(`  Created recurring template: ${candidate.name} (autoGenerate: ${shouldAutoGenerate})`);
      }
    }

    return {
      success: true,
      imported: totalCreated,
      failed: errors.length,
      errors: errors.slice(0, 20),
      stats,
      sheets: processedSheets,
      recurringCandidates: dedupedRecurring,
      recurringTemplatesCreated,
    };
  } catch (error) {
    console.error("Import error:", error);
    errors.push(error instanceof Error ? error.message : "Unknown error");

    return {
      success: false,
      imported: 0,
      failed: allParsedRows.length,
      errors,
      stats,
      sheets: processedSheets,
      recurringCandidates: [],
      recurringTemplatesCreated: 0,
    };
  }
}

/**
 * Import from CSV string
 */
export async function importExpensesFromCSV(
  csvContent: string,
  workspaceId: string,
  userId: string,
  fileName: string,
  mapping?: ColumnMapping
): Promise<ImporterResult> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Sheet1");

  const lines = csvContent.trim().split("\n");
  const delimiter = lines[0].includes(";") ? ";" : ",";

  lines.forEach((line, index) => {
    const values = parseCsvLine(line, delimiter);
    const row = worksheet.getRow(index + 1);
    values.forEach((val, colIndex) => {
      row.getCell(colIndex + 1).value = val;
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return importExpensesFromExcel(Buffer.from(buffer), workspaceId, userId, fileName, mapping);
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Import from PDF file (bank statements)
 * Parses PDF text to extract expense data
 */
export async function importExpensesFromPDF(
  buffer: Buffer,
  workspaceId: string,
  userId: string,
  fileName: string
): Promise<ImporterResult> {
  const errors: string[] = [];
  const allParsedRows: ParsedRow[] = [];
  const stats = {
    survivalFixed: 0,
    survivalVariable: 0,
    lifestyle: 0,
    project: 0,
    incomes: 0,
  };

  try {
    // Import pdf-parse (v1.1.1 - simpler API)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const pdfData = await pdfParse(buffer) as { numpages: number; text: string };

    console.log(`PDF parsed: ${pdfData.numpages} pages, ${pdfData.text.length} characters`);

    // Split text into lines
    const lines = pdfData.text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

    // Bank statement patterns
    // Pattern 1: DD/MM/YYYY Description Amount (common Portuguese bank format)
    // Pattern 2: DD-MM-YYYY Description Amount
    // Pattern 3: Lines with amounts like "€123.45" or "123,45"

    const datePattern = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;
    const amountPattern = /€?\s*(-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)(?:\s*€)?$/;
    const euroAmountPattern = /(-?\d{1,3}(?:\.\d{3})*(?:,\d{2}))\s*€?/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Try to extract date from line
      const dateMatch = line.match(datePattern);
      if (!dateMatch) continue;

      const day = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]) - 1;
      let year = parseInt(dateMatch[3]);
      if (year < 100) year += 2000;

      const parsedDate = new Date(year, month, day);
      if (isNaN(parsedDate.getTime())) continue;

      // Get the rest of the line after the date
      const afterDate = line.substring(dateMatch[0].length).trim();

      // Try to find amount at the end
      let amount = 0;
      let name = afterDate;

      // Try euro amount pattern first (e.g., "123,45 €" or "1.234,56")
      const euroMatch = afterDate.match(euroAmountPattern);
      if (euroMatch) {
        // Convert European format (1.234,56) to number
        const amountStr = euroMatch[1]
          .replace(/\./g, "")  // Remove thousand separators
          .replace(",", ".");  // Convert decimal separator
        amount = Math.abs(parseFloat(amountStr));
        name = afterDate.replace(euroMatch[0], "").trim();
      } else {
        // Try standard amount pattern
        const amountMatch = afterDate.match(amountPattern);
        if (amountMatch) {
          const amountStr = amountMatch[1]
            .replace(/\./g, "")
            .replace(",", ".");
          amount = Math.abs(parseFloat(amountStr));
          name = afterDate.replace(amountMatch[0], "").trim();
        }
      }

      // Skip if no valid amount or name
      if (amount <= 0 || !name || name.length < 2) continue;

      // Skip common non-expense items
      const skipPatterns = [
        /^saldo/i, /^balance/i, /^total/i, /^data mov/i,
        /^documento/i, /^reference/i, /^movimentos/i
      ];
      if (skipPatterns.some(p => p.test(name))) continue;

      // Determine expense type
      const type = determineExpenseType(name, true, false);

      // Update stats
      if (type === ExpenseType.SURVIVAL_FIXED) stats.survivalFixed++;
      else if (type === ExpenseType.SURVIVAL_VARIABLE) stats.survivalVariable++;
      else if (type === ExpenseType.LIFESTYLE) stats.lifestyle++;
      else if (type === ExpenseType.PROJECT) stats.project++;

      allParsedRows.push({
        sheetName: "PDF",
        rowNumber: i + 1,
        date: parsedDate,
        name: name.substring(0, 100), // Limit name length
        rawInput: line.substring(0, 200),
        amount,
        type,
      });
    }

    console.log(`Extracted ${allParsedRows.length} expenses from PDF`);

    if (allParsedRows.length === 0) {
      return {
        success: false,
        imported: 0,
        failed: 0,
        errors: ["No expenses found in PDF. The file format may not be supported. Try exporting your bank statement as CSV or Excel instead."],
        stats,
        sheets: ["PDF"],
        recurringCandidates: [],
        recurringTemplatesCreated: 0,
      };
    }

    // Get or create default category
    let defaultCategory = await prisma.category.findFirst({
      where: { workspaceId, name: "Uncategorized" },
    });

    if (!defaultCategory) {
      defaultCategory = await prisma.category.create({
        data: { workspaceId, name: "Uncategorized", isSystem: true },
      });
    }

    // Create import log
    const importLog = await prisma.importLog.create({
      data: {
        workspaceId,
        fileName,
        fileType: "pdf",
        rowsTotal: allParsedRows.length,
        rowsSuccess: 0,
        rowsFailed: errors.length,
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
      },
    });

    // Insert expenses
    const expenseData = allParsedRows.map((row) => ({
      workspaceId,
      categoryId: defaultCategory!.id,
      importLogId: importLog.id,
      name: row.name,
      rawInput: row.rawInput,
      type: row.type,
      status: "PAID" as const,
      amount: row.amount,
      currency: "EUR",
      amountEur: row.amount,
      date: row.date!,
    }));

    const result = await prisma.expense.createMany({
      data: expenseData,
    });

    // Update import log
    await prisma.importLog.update({
      where: { id: importLog.id },
      data: { rowsSuccess: result.count },
    });

    return {
      success: true,
      imported: result.count,
      failed: errors.length,
      errors: errors.slice(0, 20),
      stats,
      sheets: ["PDF"],
      recurringCandidates: [],
      recurringTemplatesCreated: 0,
    };
  } catch (error) {
    console.error("PDF import error:", error);
    errors.push(error instanceof Error ? error.message : "Unknown error");

    return {
      success: false,
      imported: 0,
      failed: 0,
      errors: ["Failed to parse PDF file. The file may be corrupted, password-protected, or in an unsupported format."],
      stats,
      sheets: [],
      recurringCandidates: [],
      recurringTemplatesCreated: 0,
    };
  }
}
