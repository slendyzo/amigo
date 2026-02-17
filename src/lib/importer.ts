// Flexible Importer for Amigo
// Handles various Excel/CSV formats with custom column mapping
// Also supports OFX, QIF, and email parsing

import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import * as ofxParser from "ofx-js";
import { prisma } from "./db";
import { ExpenseType } from "@prisma/client";
import { convertToEur } from "./currency";
import { stripHtmlTags } from "./utils";

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

export type DuplicateInfo = {
  date: string;
  name: string;
  amount: number;
  existingId: string;
};

export type ImporterResult = {
  success: boolean;
  imported: number;
  failed: number;
  skipped: number; // Number of duplicates skipped
  replaced: number; // Number of duplicates replaced
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
  duplicatesFound: number; // Total duplicates detected
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
 * Extract cell value, handling formulas, hyperlinks, and rich text
 * Always returns plain text for text cells
 */
function getCellValue(cell: ExcelJS.Cell): unknown {
  if (!cell || cell.value === null || cell.value === undefined) {
    return null;
  }

  const value = cell.value;

  // Handle object-type values (formulas, hyperlinks, rich text)
  if (typeof value === "object" && value !== null) {
    // Handle formula cells - extract the result
    if ("result" in value) {
      return (value as { result: unknown }).result;
    }

    // Handle hyperlink cells - extract the text, not the link
    // ExcelJS stores hyperlinks as { text: "display text", hyperlink: "url" }
    if ("text" in value) {
      return (value as { text: string }).text;
    }

    // Handle rich text cells - concatenate all text parts
    // ExcelJS stores rich text as { richText: [{ text: "part1" }, { text: "part2" }] }
    if ("richText" in value && Array.isArray((value as { richText: unknown[] }).richText)) {
      const richText = (value as { richText: Array<{ text: string }> }).richText;
      return richText.map(part => part.text || "").join("");
    }
  }

  return value;
}

/**
 * Parse Excel date (handles serial numbers and Date objects)
 * Returns a date that may need year correction - use correctYearIfNeeded() after collecting all dates
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
    const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{1,4})$/);
    if (dmyMatch) {
      const [, day, month, yearStr] = dmyMatch;
      let fullYear = parseInt(yearStr);

      // Handle 2-digit years
      if (yearStr.length === 2) {
        fullYear = 2000 + fullYear;
      }
      // Handle 3-digit years (typos like "202" instead of "2025")
      else if (yearStr.length === 3) {
        // Assume it's a typo - will be corrected later by correctYearIfNeeded()
        // For now, try to make a reasonable guess: "202" -> 2020 (will be corrected)
        fullYear = fullYear * 10; // 202 -> 2020
      }
      // Handle very old years that are likely typos (like 2018 in midst of 2025 data)
      // This will be corrected later by correctYearIfNeeded()

      return new Date(fullYear, parseInt(month) - 1, parseInt(day));
    }

    // Try ISO format
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

/**
 * Collect all years from parsed dates and find the dominant year
 * A year is considered dominant if it appears significantly more than others
 * Also considers sheet names as hints (e.g., "Janeiro 2026" suggests year 2026)
 */
function findDominantYear(dates: (Date | null)[], sheetYearHints: number[] = []): number | null {
  const yearCounts = new Map<number, number>();

  // Count years from actual dates
  for (const date of dates) {
    if (date) {
      const year = date.getFullYear();
      yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
    }
  }

  // Add sheet name hints with high weight (each hint counts as 10 dates)
  // This helps when there are few dated rows but clear sheet names like "Janeiro 2026"
  for (const hintYear of sheetYearHints) {
    yearCounts.set(hintYear, (yearCounts.get(hintYear) || 0) + 10);
  }

  if (yearCounts.size === 0) return null;

  // Find the year with the most occurrences
  let dominantYear = 0;
  let maxCount = 0;

  for (const [year, count] of yearCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantYear = year;
    }
  }

  // Return dominant year if it appears significantly
  // With sheet hints, we're more confident in the dominant year
  const totalDates = dates.filter(d => d !== null).length;
  const threshold = Math.max(3, totalDates * 0.6);

  if (maxCount >= threshold) {
    return dominantYear;
  }

  // Also accept if the dominant year is recent and makes sense
  const currentYear = new Date().getFullYear();
  if (dominantYear >= currentYear - 1 && dominantYear <= currentYear + 1) {
    return dominantYear;
  }

  // If we have sheet hints, trust them even if date counts are low
  if (sheetYearHints.length > 0) {
    // Use the most recent hint year
    const mostRecentHint = Math.max(...sheetYearHints);
    if (mostRecentHint >= currentYear - 1 && mostRecentHint <= currentYear + 1) {
      return mostRecentHint;
    }
  }

  return null;
}

/**
 * Correct year typos based on the dominant year
 * Handles:
 * - 3-digit years like "202" (missing digit) -> use dominant year
 * - Outlier years that differ significantly from dominant (likely typos)
 */
function correctYearIfNeeded(date: Date, dominantYear: number | null): Date {
  if (!dominantYear) return date;

  const year = date.getFullYear();

  // If year looks like a truncated version of dominant year, fix it
  // e.g., "202" (stored as 2020) should become 2025 if dominant is 2025
  const dominantStr = dominantYear.toString();
  const yearStr = year.toString();

  // Check if this looks like a 3-digit typo that we expanded to 4 digits
  // e.g., 202 -> 2020, but should be 2025
  if (yearStr.endsWith("0") && dominantStr.startsWith(yearStr.slice(0, -1))) {
    // The year 2020 from input "202" should become dominantYear (e.g., 2025)
    return new Date(dominantYear, date.getMonth(), date.getDate());
  }

  // Check for obvious outliers (years that differ by more than 2 from dominant)
  // This catches typos like "2018" when everything else is "2025"
  const yearDiff = Math.abs(year - dominantYear);
  if (yearDiff > 2) {
    console.log(`  → Auto-correcting year typo: ${year} → ${dominantYear} (outlier)`);
    return new Date(dominantYear, date.getMonth(), date.getDate());
  }

  return date;
}

/**
 * Parse amount from various formats
 * Preserves sign - negative values are valid for refunds/credits
 */
function parseAmount(value: unknown): number {
  if (typeof value === "number") {
    return value; // Preserve sign for negatives (refunds/credits)
  }

  if (typeof value === "string") {
    const cleaned = value
      .replace(/[€$£R\s]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");

    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num; // Preserve sign for negatives
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

export type DuplicateHandling = "skip" | "replace";

/**
 * Main importer function with custom column mapping
 */
export async function importExpensesFromExcel(
  buffer: Buffer,
  workspaceId: string,
  _userId: string,
  fileName: string,
  mapping?: ColumnMapping,
  _duplicateHandling: DuplicateHandling = "skip",
  currency: string = "EUR"
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
  const sheetYearHints: number[] = []; // Collect years from sheet names for year correction
  let latestSheetDate: Date | null = null;
  let latestSheetName: string | null = null;

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
          skipped: 0,
          replaced: 0,
          errors: ["Failed to read .xls file. The file may be corrupted or in an unsupported format."],
          stats: { ...stats, incomes: 0 },
          sheets: [],
          recurringCandidates: [],
          recurringTemplatesCreated: 0,
          duplicatesFound: 0,
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

      // Track the latest (most recent) sheet by date
      if (sheetDate && !isProjectSheet) {
        if (!latestSheetDate || sheetDate > latestSheetDate) {
          latestSheetDate = sheetDate;
          latestSheetName = sheetName;
        }
        // Collect year hint from sheet name for year correction
        sheetYearHints.push(sheetDate.getFullYear());
      }

      console.log(`\nProcessing sheet: "${sheetName}" (isProject: ${isProjectSheet}, sheetDate: ${sheetDate?.toISOString().slice(0, 10) || "none"})`);
      processedSheets.push(sheetName);

      let rowsProcessed = 0;
      let recurringRowsImported = 0; // Track how many recurring (no-date) rows are imported
      let lastValidDate: Date | null = null; // Track last seen date for inheritance
      let firstDateSeen = false; // Track if we've seen a date yet (rows before first date are recurring)
      const sheetRecurringNames = new Set<string>(); // Track recurring candidates per sheet
      const sheetRecurringCandidates: RecurringCandidate[] = []; // Temp storage for this sheet's recurring

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

        // Skip SUBTOTAL formula rows (these are summary rows in Excel)
        // Check both the raw cell value and the formula property
        const amountCellRaw = amountCell.value;
        if (amountCellRaw && typeof amountCellRaw === "object" && "formula" in amountCellRaw) {
          const formula = (amountCellRaw as { formula: string }).formula;
          if (formula && formula.toUpperCase().includes("SUBTOTAL")) {
            console.log(`    Skipping SUBTOTAL row: "${rawName}"`);
            return;
          }
        }
        // Also check if rawAmount string contains SUBTOTAL (in case formula wasn't parsed as object)
        if (typeof rawAmount === "string" && rawAmount.toUpperCase().includes("SUBTOTAL")) {
          console.log(`    Skipping SUBTOTAL row: "${rawName}"`);
          return;
        }

        // Parse amount - handles empty/null as 0
        // IMPORTANT: Preserve negative values for refunds/credits
        const rawAmountValue = rawAmount ? parseAmountRaw(rawAmount) : 0;
        const amount = rawAmountValue; // Keep sign - negative values are valid (refunds, credits)
        // Determine if this should be an income (positive value when splitExpensesIncomes is enabled)
        const isIncome = columnMapping.splitExpensesIncomes && rawAmountValue > 0;

        const dateValue = dateCell ? getCellValue(dateCell) : null;
        let parsedDate = parseExcelDate(dateValue);

        // hasDate now reflects whether THIS row had a date OR inherited one
        // For type determination, we check if the ORIGINAL cell had a date
        const originalHadDate = dateValue !== null && dateValue !== undefined && dateValue !== "";

        // Track recurring candidates: expenses without dates that appear before any dated entries
        // These are typically subscription/fixed costs listed at the top of the sheet
        // NOTE: We collect per-sheet but only use the LATEST sheet's candidates later
        // IMPORTANT: Include €0/empty expenses here - they're variable costs like utilities
        const isRecurringRow = !originalHadDate && !firstDateSeen && !isProjectSheet;
        if (isRecurringRow) {
          // This is a recurring candidate - expense without date at top of sheet
          const normalizedName = rawName.toLowerCase().trim();
          if (!sheetRecurringNames.has(normalizedName)) {
            sheetRecurringNames.add(normalizedName);
            const type = determineExpenseType(rawName, false, false);
            // Only add SURVIVAL_FIXED and SURVIVAL_VARIABLE as recurring candidates
            if (type === ExpenseType.SURVIVAL_FIXED || type === ExpenseType.SURVIVAL_VARIABLE) {
              sheetRecurringCandidates.push({
                name: rawName,
                amount, // Amount can be 0 for variable expenses like utilities
                type,
              });
            }
          }
          // NOTE: These rows ARE imported as expenses (with sheet date)
          // They represent actual monthly payments for each month's sheet
          // We don't skip them - they continue to be processed below
        }

        // Log recurring rows that WILL be imported
        if (isRecurringRow) {
          recurringRowsImported++;
          console.log(`    [${sheetName}] Importing recurring row: "${rawName}" €${amount} → date: ${sheetDate?.toISOString().slice(0, 10) || "today"}`);
        }

        // DATE INHERITANCE: If no date in this row, use the last valid date
        if (parsedDate) {
          lastValidDate = parsedDate; // Update the last valid date
          firstDateSeen = true; // Mark that we've seen a date
        } else if (lastValidDate) {
          // Date inheritance - log only first few to avoid spam
          if (rowsProcessed < 5) {
            console.log(`    Date inheritance: "${rawName}" inherits ${lastValidDate.toISOString().slice(0, 10)} from previous row`);
          }
          parsedDate = lastValidDate; // Inherit from previous row
        }

        // Determine expense type
        // For project sheets: always PROJECT
        // For non-project sheets with explicit dates or inherited dates from dated rows: LIFESTYLE
        // For survival items (no date context): SURVIVAL_FIXED/VARIABLE
        const hasDateContext = originalHadDate || (lastValidDate !== null && !isProjectSheet);
        const type = determineExpenseType(rawName, hasDateContext, isProjectSheet);

        // Debug logging for expense type determination (only for first 10 rows per sheet to avoid log spam)
        if (rowsProcessed < 10) {
          console.log(`    [${sheetName}] Row ${rowNumber}: "${rawName}" €${amount} - hasDateContext=${hasDateContext}, type=${type}`);
        }

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

        // Extra logging for recurring rows to track the issue
        if (isRecurringRow) {
          console.log(`    [${sheetName}] ADDED recurring: "${rawName}" €${amount} type=${type} date=${expenseDate.toISOString().slice(0, 10)}`);
        }

        rowsProcessed++;
      });

      console.log(`  → Processed ${rowsProcessed} rows from "${sheetName}" (${recurringRowsImported} recurring)`);

      // Store recurring candidates temporarily - we'll decide which to use after processing all sheets
      if (sheetRecurringCandidates.length > 0) {
        // Tag these candidates with sheet info for later filtering
        (worksheet as unknown as { _recurringCandidates: RecurringCandidate[] })._recurringCandidates = sheetRecurringCandidates;
      }
    }

    // IMPORTANT: Only use recurring candidates from the LATEST sheet (most recent month)
    // This prevents old subscriptions that no longer exist from being auto-generated
    if (latestSheetName) {
      console.log(`\nLatest sheet detected: "${latestSheetName}" (${latestSheetDate?.toISOString().slice(0, 7)})`);

      // Find the worksheet and get its recurring candidates
      const latestWorksheet = workbook.worksheets.find(ws => ws.name === latestSheetName);
      if (latestWorksheet) {
        const latestCandidates = (latestWorksheet as unknown as { _recurringCandidates?: RecurringCandidate[] })._recurringCandidates || [];
        recurringCandidates.push(...latestCandidates);
        console.log(`  → Using ${latestCandidates.length} recurring candidates from latest sheet only`);
      }
    }

    console.log(`\nTotal rows to import: ${allParsedRows.length}`);

    if (allParsedRows.length === 0) {
      return {
        success: false,
        imported: 0,
        failed: 0,
        skipped: 0,
        replaced: 0,
        errors: ["No valid expense rows found. Please check your column mapping."],
        stats,
        sheets: processedSheets,
        recurringCandidates: [],
        recurringTemplatesCreated: 0,
        duplicatesFound: 0,
      };
    }

    // YEAR CORRECTION PHASE: Fix year typos based on dominant year
    // Use sheet name years as hints (e.g., "Janeiro 2026" tells us the year should be 2026)
    const allDates = allParsedRows.map(row => row.date);
    console.log(`\nYear hints from sheet names: ${[...new Set(sheetYearHints)].join(", ")}`);
    const dominantYear = findDominantYear(allDates, sheetYearHints);
    if (dominantYear) {
      console.log(`Dominant year detected: ${dominantYear}`);
      let correctionsMade = 0;
      for (const row of allParsedRows) {
        if (row.date) {
          const originalYear = row.date.getFullYear();
          const correctedDate = correctYearIfNeeded(row.date, dominantYear);
          if (correctedDate.getFullYear() !== originalYear) {
            row.date = correctedDate;
            correctionsMade++;
          }
        }
      }
      if (correctionsMade > 0) {
        console.log(`  → Corrected ${correctionsMade} date(s) with year typos`);
      }
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

    // Process incomes - import all directly (no duplicate detection needed)
    if (incomeRows.length > 0) {
      // Convert currency for each income
      const incomeDataPromises = incomeRows.map(async (row) => {
        const { amountEur, exchangeRate } = await convertToEur(row.amount, currency);
        return {
          workspaceId,
          name: row.name,
          amount: row.amount,
          currency,
          amountEur,
          exchangeRate,
          date: row.date!,
          isRecurring: false,
        };
      });
      const incomeData = await Promise.all(incomeDataPromises);

      const incomeResult = await prisma.income.createMany({
        data: incomeData,
      });
      totalCreated += incomeResult.count;
      console.log(`  → Created ${incomeResult.count} incomes`);
    }

    // Insert all regular expenses in batch - NO duplicate detection
    // Users buy the same things every month/week, that's normal spending!
    // Store created expenses for project sheet matching
    const createdExpenseIds: string[] = [];

    if (regularExpenses.length > 0) {
      // Use individual creates instead of createMany to get IDs back
      // This is needed for proper project sheet matching
      for (const row of regularExpenses) {
        const { amountEur, exchangeRate } = await convertToEur(row.amount, currency);
        const created = await prisma.expense.create({
          data: {
            workspaceId,
            categoryId: defaultCategory!.id,
            importLogId: importLog.id,
            name: row.name,
            rawInput: row.rawInput,
            type: row.type,
            status: "PAID",
            amount: row.amount,
            currency,
            amountEur,
            exchangeRate,
            date: row.date!,
          },
        });
        createdExpenseIds.push(created.id);
        totalCreated++;
      }
      console.log(`  → Created ${regularExpenses.length} regular expenses`);
    }

    // Process project expenses - GHOST SHEET STRATEGY
    // Project sheets (like "Casa") are meant to TAG existing expenses, not create new ones
    // They reference expenses that already exist in monthly sheets
    //
    // Strategy:
    // 1. Try to find matching expense by name (fuzzy) + amount (with €1 tolerance)
    // 2. If found: link it to the project (tag it)
    // 3. If NOT found: still create it (might be a project-only expense)
    //
    // The monthly sheet is the SOURCE OF TRUTH for amounts
    let projectExpensesLinked = 0;
    let projectExpensesCreated = 0;
    let projectAmountMismatches = 0;

    // Helper function to normalize names for fuzzy matching
    const normalizeName = (name: string): string => {
      return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, "") // Remove special chars
        .replace(/\s+/g, ""); // Remove ALL whitespace for comparison (matches "Multi Riscos" with "Multiriscos")
    };

    // More aggressive name comparison - checks multiple similarity criteria
    const namesAreSimilar = (name1: string, name2: string): boolean => {
      const n1 = normalizeName(name1);
      const n2 = normalizeName(name2);

      // Exact match after normalization
      if (n1 === n2) return true;

      // One contains the other
      if (n1.includes(n2) || n2.includes(n1)) return true;

      // Check if they share most words (for multi-word names)
      const words1 = name1.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const words2 = name2.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const commonWords = words1.filter(w => words2.some(w2 => w2.includes(w) || w.includes(w2)));

      // If most words are common, consider it a match
      if (words1.length > 0 && commonWords.length >= Math.min(words1.length, words2.length) * 0.6) {
        return true;
      }

      return false;
    };

    for (const row of projectExpenses) {
      const projectId = projectMap[row.sheetName.toLowerCase()];

      // Search for matching expense in the workspace
      // Priority 1: Look for expenses created in THIS import batch first (most reliable)
      // Priority 2: Look in existing workspace expenses

      let existingExpense = null;

      // First try: Search recently created expenses from this import (by ID)
      // This ensures we match expenses that were just created in the same import
      if (createdExpenseIds.length > 0) {
        const recentExpenses = await prisma.expense.findMany({
          where: {
            id: { in: createdExpenseIds },
            // Don't match expenses already linked to this project
            NOT: {
              projects: {
                some: { id: projectId },
              },
            },
          },
        });

        // Find match using fuzzy name comparison and amount tolerance
        for (const candidate of recentExpenses) {
          const amountDiff = Math.abs(Number(candidate.amountEur) - row.amount);
          if (amountDiff <= 5 && namesAreSimilar(candidate.name, row.name)) {
            existingExpense = candidate;
            console.log(`  → Matched to same-batch expense: "${row.name}" ≈ "${candidate.name}"`);
            break;
          }
        }
      }

      // Second try: Search all workspace expenses with exact name match
      if (!existingExpense) {
        existingExpense = await prisma.expense.findFirst({
          where: {
            workspaceId,
            name: {
              equals: row.name,
              mode: "insensitive",
            },
            // Amount tolerance: within €2 of the project sheet amount
            amountEur: {
              gte: row.amount - 2,
              lte: row.amount + 2,
            },
            // Don't match expenses already linked to this project
            NOT: {
              projects: {
                some: { id: projectId },
              },
            },
          },
        });
      }

      // Third try: if no exact name match, try fuzzy match by fetching candidates
      if (!existingExpense) {
        // Get all expenses with similar amounts (within €5 to cast a wider net)
        const candidates = await prisma.expense.findMany({
          where: {
            workspaceId,
            amountEur: {
              gte: row.amount - 5,
              lte: row.amount + 5,
            },
            NOT: {
              projects: {
                some: { id: projectId },
              },
            },
          },
          take: 100, // Increased limit for better matching
        });

        // Find best match using more aggressive name similarity
        for (const candidate of candidates) {
          if (namesAreSimilar(candidate.name, row.name)) {
            existingExpense = candidate;
            console.log(`  → Fuzzy match found: "${row.name}" ≈ "${candidate.name}"`);
            break;
          }
        }
      }

      if (existingExpense) {
        // Link existing expense to the project
        await prisma.expense.update({
          where: { id: existingExpense.id },
          data: {
            projects: {
              connect: { id: projectId },
            },
          },
        });
        projectExpensesLinked++;

        // Log if there was an amount difference (monthly sheet is source of truth)
        const amountDiff = Math.abs(Number(existingExpense.amountEur) - row.amount);
        if (amountDiff > 0.01) {
          projectAmountMismatches++;
          console.log(`  → Linked "${row.name}" to project (amount mismatch: project €${row.amount} vs monthly €${existingExpense.amountEur}, keeping monthly)`);
        } else {
          console.log(`  → Linked existing expense to project: "${row.name}" €${row.amount}`);
        }
      } else {
        // No matching expense found - create new one
        // This happens for project-only expenses that don't exist in monthly sheets
        const { amountEur, exchangeRate } = await convertToEur(row.amount, currency);
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
            currency,
            amountEur,
            exchangeRate,
            date: row.date!,
            projects: {
              connect: { id: projectId },
            },
          },
        });
        totalCreated++;
        projectExpensesCreated++;
        console.log(`  → Created new project expense (no match found): "${row.name}" €${row.amount}`);
      }
    }

    console.log(`Project expenses: ${projectExpensesLinked} linked to existing, ${projectExpensesCreated} created new, ${projectAmountMismatches} had amount mismatches (monthly amount kept)`);

    // Update import log with actual success count
    await prisma.importLog.update({
      where: { id: importLog.id },
      data: { rowsSuccess: totalCreated },
    });

    // Create recurring templates from candidates (skip if already exists)
    // First, fetch all existing templates for this workspace to do proper duplicate detection
    const existingTemplates = await prisma.recurringTemplate.findMany({
      where: { workspaceId },
      select: { name: true },
    });
    const existingNormalizedNames = new Set(
      existingTemplates.map(t => t.name.toLowerCase().trim())
    );

    let recurringTemplatesCreated = 0;
    for (const candidate of dedupedRecurring) {
      // Check if template already exists with normalized name comparison
      const normalizedCandidateName = candidate.name.toLowerCase().trim();
      const alreadyExists = existingNormalizedNames.has(normalizedCandidateName);

      if (!alreadyExists) {
        // Add to set to prevent duplicates within the same import batch
        existingNormalizedNames.add(normalizedCandidateName);
        // Auto-generate is true for both SURVIVAL_FIXED and SURVIVAL_VARIABLE
        // - Fixed expenses (like Spotify) have their amount pre-filled
        // - Variable expenses (like utilities) start at €0 and user fills in the actual amount
        const shouldAutoGenerate = true;

        // For variable expenses, set amount to 0 so user fills it in when the bill arrives
        const templateAmount = candidate.type === ExpenseType.SURVIVAL_VARIABLE ? 0 : candidate.amount;

        await prisma.recurringTemplate.create({
          data: {
            workspaceId,
            name: candidate.name,
            type: candidate.type,
            amount: templateAmount,
            currency,
            interval: "MONTHLY",
            isActive: true,
            autoGenerate: shouldAutoGenerate,
          },
        });
        recurringTemplatesCreated++;
        console.log(`  Created recurring template: ${candidate.name} (type: ${candidate.type}, amount: €${templateAmount}, autoGenerate: ${shouldAutoGenerate})`);
      }
    }

    return {
      success: true,
      imported: totalCreated,
      failed: errors.length,
      skipped: 0,
      replaced: 0,
      errors: errors.slice(0, 20),
      stats,
      sheets: processedSheets,
      recurringCandidates: dedupedRecurring,
      recurringTemplatesCreated,
      duplicatesFound: 0,
    };
  } catch (error) {
    console.error("Import error:", error);
    errors.push(error instanceof Error ? error.message : "Unknown error");

    return {
      success: false,
      imported: 0,
      failed: allParsedRows.length,
      skipped: 0,
      replaced: 0,
      errors,
      stats,
      sheets: processedSheets,
      recurringCandidates: [],
      recurringTemplatesCreated: 0,
      duplicatesFound: 0,
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
  mapping?: ColumnMapping,
  duplicateHandling: DuplicateHandling = "skip",
  currency: string = "EUR"
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
  return importExpensesFromExcel(Buffer.from(buffer), workspaceId, userId, fileName, mapping, duplicateHandling, currency);
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
  _userId: string,
  fileName: string,
  _duplicateHandling: DuplicateHandling = "skip",
  currency: string = "EUR"
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

      // Try euro amount pattern first (e.g., "123,45 €" or "1.234,56" or "-123,45")
      const euroMatch = afterDate.match(euroAmountPattern);
      if (euroMatch) {
        // Convert European format (1.234,56) to number
        // Preserve negative sign for refunds/credits
        const amountStr = euroMatch[1]
          .replace(/\./g, "")  // Remove thousand separators
          .replace(",", ".");  // Convert decimal separator
        amount = parseFloat(amountStr); // Keep sign - negatives are valid
        name = afterDate.replace(euroMatch[0], "").trim();
      } else {
        // Try standard amount pattern
        const amountMatch = afterDate.match(amountPattern);
        if (amountMatch) {
          const amountStr = amountMatch[1]
            .replace(/\./g, "")
            .replace(",", ".");
          amount = parseFloat(amountStr); // Keep sign - negatives are valid
          name = afterDate.replace(amountMatch[0], "").trim();
        }
      }

      // Skip if no valid amount or name
      // Note: amount can be negative (refunds/credits) - only skip if exactly 0
      if (amount === 0 || !name || name.length < 2) continue;

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
        skipped: 0,
        replaced: 0,
        errors: ["No expenses found in PDF. The file format may not be supported. Try exporting your bank statement as CSV or Excel instead."],
        stats,
        sheets: ["PDF"],
        recurringCandidates: [],
        recurringTemplatesCreated: 0,
        duplicatesFound: 0,
      };
    }

    // YEAR CORRECTION PHASE: Fix year typos based on dominant year
    const allDates = allParsedRows.map(row => row.date);
    const dominantYear = findDominantYear(allDates);
    if (dominantYear) {
      console.log(`\nDominant year detected: ${dominantYear}`);
      let correctionsMade = 0;
      for (const row of allParsedRows) {
        if (row.date) {
          const originalYear = row.date.getFullYear();
          const correctedDate = correctYearIfNeeded(row.date, dominantYear);
          if (correctedDate.getFullYear() !== originalYear) {
            row.date = correctedDate;
            correctionsMade++;
          }
        }
      }
      if (correctionsMade > 0) {
        console.log(`  → Corrected ${correctionsMade} date(s) with year typos`);
      }
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

    let totalCreated = 0;

    // Insert all expenses - NO duplicate detection
    // Users buy the same things regularly, that's normal spending!
    if (allParsedRows.length > 0) {
      // Convert currency for each expense
      const expenseDataPromises = allParsedRows.map(async (row) => {
        const { amountEur, exchangeRate } = await convertToEur(row.amount, currency);
        return {
          workspaceId,
          categoryId: defaultCategory!.id,
          importLogId: importLog.id,
          name: row.name,
          rawInput: row.rawInput,
          type: row.type,
          status: "PAID" as const,
          amount: row.amount,
          currency,
          amountEur,
          exchangeRate,
          date: row.date!,
        };
      });
      const expenseData = await Promise.all(expenseDataPromises);

      const result = await prisma.expense.createMany({
        data: expenseData,
      });
      totalCreated = result.count;
    }

    // Update import log
    await prisma.importLog.update({
      where: { id: importLog.id },
      data: { rowsSuccess: totalCreated },
    });

    return {
      success: true,
      imported: totalCreated,
      failed: errors.length,
      skipped: 0,
      replaced: 0,
      errors: errors.slice(0, 20),
      stats,
      sheets: ["PDF"],
      recurringCandidates: [],
      recurringTemplatesCreated: 0,
      duplicatesFound: 0,
    };
  } catch (error) {
    console.error("PDF import error:", error);
    errors.push(error instanceof Error ? error.message : "Unknown error");

    return {
      success: false,
      imported: 0,
      failed: 0,
      skipped: 0,
      replaced: 0,
      errors: ["Failed to parse PDF file. The file may be corrupted, password-protected, or in an unsupported format."],
      stats,
      sheets: [],
      recurringCandidates: [],
      recurringTemplatesCreated: 0,
      duplicatesFound: 0,
    };
  }
}

// ============================================================================
// OFX (Open Financial Exchange) Import
// Standard format used by most banks for transaction export
// ============================================================================

/**
 * Import expenses from OFX file
 * OFX is a standard banking format - most banks can export this
 */
export async function importExpensesFromOFX(
  content: string,
  workspaceId: string,
  userId: string,
  fileName: string,
  duplicateHandling: DuplicateHandling = "skip",
  currency: string = "EUR"
): Promise<ImporterResult> {
  const errors: string[] = [];
  const stats = {
    survivalFixed: 0,
    survivalVariable: 0,
    lifestyle: 0,
    project: 0,
    incomes: 0,
  };

  try {
    // Parse OFX content
    const ofx = await ofxParser.parse(content);

    // Navigate to transactions - OFX structure varies between bank and credit card statements
    // Bank statements use BANKMSGSRSV1 -> STMTTRNRS -> STMTRS
    // Credit card statements use CREDITCARDMSGSRSV1 -> CCSTMTTRNRS -> CCSTMTRS
    const bankStmt = ofx.OFX?.BANKMSGSRSV1?.STMTTRNRS?.STMTRS;
    const ccStmt = ofx.OFX?.CREDITCARDMSGSRSV1?.CCSTMTTRNRS?.CCSTMTRS;

    const stmtrs = bankStmt || ccStmt;
    if (!stmtrs) {
      return {
        success: false,
        imported: 0,
        failed: 0,
        skipped: 0,
        replaced: 0,
        errors: ["No bank or credit card statement data found in OFX file"],
        stats,
        sheets: [],
        recurringCandidates: [],
        recurringTemplatesCreated: 0,
        duplicatesFound: 0,
      };
    }

    // Get currency from OFX if available
    const ofxCurrency = stmtrs.CURDEF || currency;

    // Get transactions from BANKTRANLIST
    const transactions = stmtrs.BANKTRANLIST?.STMTTRN || [];

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return {
        success: false,
        imported: 0,
        failed: 0,
        skipped: 0,
        replaced: 0,
        errors: ["No transactions found in OFX file"],
        stats,
        sheets: [],
        recurringCandidates: [],
        recurringTemplatesCreated: 0,
        duplicatesFound: 0,
      };
    }

    // Parse transactions
    const parsedRows: ParsedRow[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const txn = transactions[i];

      try {
        // Parse date (OFX format: YYYYMMDDHHMMSS or YYYYMMDD)
        const dateStr = txn.DTPOSTED || "";
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        const date = new Date(year, month, day);

        if (isNaN(date.getTime())) {
          errors.push(`Row ${i + 1}: Invalid date ${dateStr}`);
          continue;
        }

        // Parse amount (negative = expense, positive = income)
        const amount = parseFloat(txn.TRNAMT || "0");
        if (amount === 0) continue;

        // Get name from NAME or MEMO
        const name = stripHtmlTags(txn.NAME || txn.MEMO || "Unknown Transaction", 255);

        // Determine if income or expense
        const isIncome = amount > 0;
        const absAmount = Math.abs(amount);

        // Determine expense type
        const type = determineExpenseTypeSimple(name);

        if (isIncome) {
          stats.incomes++;
        } else {
          if (type === ExpenseType.SURVIVAL_FIXED) stats.survivalFixed++;
          else if (type === ExpenseType.SURVIVAL_VARIABLE) stats.survivalVariable++;
          else stats.lifestyle++;
        }

        parsedRows.push({
          sheetName: "OFX",
          rowNumber: i + 1,
          date,
          name,
          rawInput: `${txn.NAME || ""} ${txn.MEMO || ""}`.trim(),
          amount: absAmount,
          type,
          isIncome,
        });
      } catch (err) {
        errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : "Parse error"}`);
      }
    }

    // Create expenses and incomes
    return await createExpensesAndIncomes(
      parsedRows,
      workspaceId,
      fileName,
      "ofx",
      ofxCurrency,
      duplicateHandling,
      errors,
      stats
    );
  } catch (error) {
    console.error("OFX import error:", error);
    return {
      success: false,
      imported: 0,
      failed: 0,
      skipped: 0,
      replaced: 0,
      errors: ["Failed to parse OFX file. The file may be corrupted or in an unsupported format."],
      stats,
      sheets: [],
      recurringCandidates: [],
      recurringTemplatesCreated: 0,
      duplicatesFound: 0,
    };
  }
}

// ============================================================================
// QIF (Quicken Interchange Format) Import
// Older but still widely supported format
// ============================================================================

/**
 * Import expenses from QIF file
 * QIF is an older format but still supported by many banks
 */
export async function importExpensesFromQIF(
  content: string,
  workspaceId: string,
  userId: string,
  fileName: string,
  duplicateHandling: DuplicateHandling = "skip",
  currency: string = "EUR"
): Promise<ImporterResult> {
  const errors: string[] = [];
  const stats = {
    survivalFixed: 0,
    survivalVariable: 0,
    lifestyle: 0,
    project: 0,
    incomes: 0,
  };

  try {
    const lines = content.split(/\r?\n/);
    const parsedRows: ParsedRow[] = [];

    let currentTxn: {
      date?: Date | null;
      amount?: number;
      name?: string;
      memo?: string;
    } = {};
    let rowNumber = 0;

    for (const line of lines) {
      const code = line.charAt(0);
      const value = line.substring(1).trim();

      switch (code) {
        case "D": // Date
          // QIF date formats: MM/DD/YY, MM/DD/YYYY, DD/MM/YY, etc.
          currentTxn.date = parseQIFDate(value);
          break;

        case "T": // Amount
        case "U": // Amount (alternate)
          // Remove currency symbols and commas
          const cleanAmount = value.replace(/[^0-9.\-]/g, "");
          currentTxn.amount = parseFloat(cleanAmount) || 0;
          break;

        case "P": // Payee
          currentTxn.name = stripHtmlTags(value, 255);
          break;

        case "M": // Memo
          currentTxn.memo = value;
          break;

        case "^": // End of transaction
          rowNumber++;
          if (currentTxn.date && currentTxn.amount !== undefined) {
            const isIncome = currentTxn.amount > 0;
            const absAmount = Math.abs(currentTxn.amount);
            const name = currentTxn.name || currentTxn.memo || "Unknown Transaction";
            const type = determineExpenseTypeSimple(name);

            if (isIncome) {
              stats.incomes++;
            } else {
              if (type === ExpenseType.SURVIVAL_FIXED) stats.survivalFixed++;
              else if (type === ExpenseType.SURVIVAL_VARIABLE) stats.survivalVariable++;
              else stats.lifestyle++;
            }

            parsedRows.push({
              sheetName: "QIF",
              rowNumber,
              date: currentTxn.date,
              name,
              rawInput: `${currentTxn.name || ""} ${currentTxn.memo || ""}`.trim(),
              amount: absAmount,
              type,
              isIncome,
            });
          }
          currentTxn = {};
          break;
      }
    }

    if (parsedRows.length === 0) {
      return {
        success: false,
        imported: 0,
        failed: 0,
        skipped: 0,
        replaced: 0,
        errors: ["No valid transactions found in QIF file"],
        stats,
        sheets: [],
        recurringCandidates: [],
        recurringTemplatesCreated: 0,
        duplicatesFound: 0,
      };
    }

    return await createExpensesAndIncomes(
      parsedRows,
      workspaceId,
      fileName,
      "qif",
      currency,
      duplicateHandling,
      errors,
      stats
    );
  } catch (error) {
    console.error("QIF import error:", error);
    return {
      success: false,
      imported: 0,
      failed: 0,
      skipped: 0,
      replaced: 0,
      errors: ["Failed to parse QIF file. The file may be corrupted or in an unsupported format."],
      stats,
      sheets: [],
      recurringCandidates: [],
      recurringTemplatesCreated: 0,
      duplicatesFound: 0,
    };
  }
}

/**
 * Parse QIF date formats
 */
function parseQIFDate(value: string): Date | null {
  if (!value) return null;

  // Try MM/DD/YY or MM/DD/YYYY
  const usMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (usMatch) {
    const [, month, day, yearStr] = usMatch;
    let year = parseInt(yearStr);
    if (yearStr.length === 2) {
      year = year > 50 ? 1900 + year : 2000 + year;
    }
    return new Date(year, parseInt(month) - 1, parseInt(day));
  }

  // Try DD/MM/YYYY (European)
  const euMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (euMatch) {
    const [, day, month, year] = euMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // Try YYYY-MM-DD (ISO)
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  return null;
}

// ============================================================================
// Email Transaction Parser
// Parse bank notification emails for automatic import
// ============================================================================

export interface ParsedEmailTransaction {
  date: Date;
  amount: number;
  name: string;
  currency: string;
  bankName?: string;
  cardLast4?: string;
  isIncome: boolean;
}

/**
 * Parse bank notification email content
 * Supports common formats from major banks
 */
export function parseEmailTransaction(
  subject: string,
  body: string,
  receivedDate: Date
): ParsedEmailTransaction | null {
  const fullText = `${subject}\n${body}`.toLowerCase();

  // Detect bank by common patterns
  const bankPatterns: Array<{
    name: string;
    patterns: RegExp[];
    amountRegex: RegExp;
    merchantRegex?: RegExp;
    isExpense?: (text: string) => boolean;
  }> = [
    {
      name: "Millennium BCP",
      patterns: [/millennium/i, /bcp/i, /activobank/i],
      amountRegex: /(?:valor|montante|amount)[:\s]*([€$£]?\s*[\d.,]+)/i,
      merchantRegex: /(?:comerciante|merchant|em|at)[:\s]*([^\n\r]+)/i,
      isExpense: (text) => /compra|purchase|pagamento|payment|débito|debit/i.test(text),
    },
    {
      name: "Caixa Geral",
      patterns: [/caixa geral/i, /cgd/i],
      amountRegex: /(?:valor|montante)[:\s]*([€$£]?\s*[\d.,]+)/i,
      merchantRegex: /(?:entidade|entity)[:\s]*([^\n\r]+)/i,
      isExpense: (text) => /débito|debit|compra|purchase/i.test(text),
    },
    {
      name: "Revolut",
      patterns: [/revolut/i],
      amountRegex: /([€$£]\s*[\d.,]+)/i,
      merchantRegex: /(?:at|em|to)\s+([^\n\r€$£]+)/i,
      isExpense: (text) => !/received|recebido|credited/i.test(text),
    },
    {
      name: "N26",
      patterns: [/n26/i, /number26/i],
      amountRegex: /([€$£]\s*[\d.,]+)/i,
      merchantRegex: /(?:at|to)\s+([^\n\r€$£]+)/i,
      isExpense: (text) => /outgoing|sent|paid/i.test(text),
    },
    {
      name: "Wise",
      patterns: [/wise/i, /transferwise/i],
      amountRegex: /([€$£]\s*[\d.,]+)/i,
      merchantRegex: /(?:to|para)\s+([^\n\r€$£]+)/i,
      isExpense: (text) => /sent|paid|converted/i.test(text),
    },
    {
      name: "PayPal",
      patterns: [/paypal/i],
      amountRegex: /([€$£]\s*[\d.,]+)/i,
      merchantRegex: /(?:to|para|payment to)\s+([^\n\r€$£]+)/i,
      isExpense: (text) => /sent|payment|paid/i.test(text) && !/received/i.test(text),
    },
    // Generic pattern for unrecognized banks
    {
      name: "Generic",
      patterns: [/transaction|transação|movement|movimento/i],
      amountRegex: /([€$£]?\s*[\d]+[.,][\d]{2})/i,
      merchantRegex: /(?:at|em|merchant|comerciante)[:\s]*([^\n\r]+)/i,
      isExpense: () => true,
    },
  ];

  // Try each bank pattern
  for (const bank of bankPatterns) {
    const isThisBank = bank.patterns.some(p => p.test(fullText));
    if (!isThisBank && bank.name !== "Generic") continue;

    // Extract amount
    const amountMatch = fullText.match(bank.amountRegex);
    if (!amountMatch) continue;

    let amountStr = amountMatch[1];
    // Detect currency
    let currency = "EUR";
    if (amountStr.includes("C$")) currency = "CAD";
    else if (amountStr.includes("R$")) currency = "BRL";
    else if (amountStr.includes("$")) currency = "USD";
    else if (amountStr.includes("£")) currency = "GBP";

    // Clean amount
    amountStr = amountStr.replace(/[€$£RC\s]/g, "");
    // Handle European format (1.234,56) vs US format (1,234.56)
    if (amountStr.includes(",") && amountStr.includes(".")) {
      // If comma comes after dot, it's European
      if (amountStr.lastIndexOf(",") > amountStr.lastIndexOf(".")) {
        amountStr = amountStr.replace(/\./g, "").replace(",", ".");
      } else {
        amountStr = amountStr.replace(/,/g, "");
      }
    } else if (amountStr.includes(",") && !amountStr.includes(".")) {
      // Single comma - check if it's decimal separator
      const parts = amountStr.split(",");
      if (parts[1] && parts[1].length === 2) {
        amountStr = amountStr.replace(",", ".");
      } else {
        amountStr = amountStr.replace(",", "");
      }
    }

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount === 0) continue;

    // Extract merchant/name
    let name = "Unknown Transaction";
    if (bank.merchantRegex) {
      const merchantMatch = fullText.match(bank.merchantRegex);
      if (merchantMatch) {
        name = stripHtmlTags(merchantMatch[1].trim(), 255);
        // Clean up common suffixes
        name = name.replace(/\s*\d{4}\s*$/, ""); // Remove card last 4
        name = name.replace(/\s*[€$£][\d.,]+\s*$/, ""); // Remove amount at end
      }
    }

    // Determine if expense or income
    const isExpense = bank.isExpense ? bank.isExpense(fullText) : true;

    // Extract card last 4 if present
    const cardMatch = fullText.match(/\*{4,}(\d{4})|card.*?(\d{4})|cartão.*?(\d{4})/i);
    const cardLast4 = cardMatch ? (cardMatch[1] || cardMatch[2] || cardMatch[3]) : undefined;

    return {
      date: receivedDate,
      amount,
      name,
      currency,
      bankName: bank.name !== "Generic" ? bank.name : undefined,
      cardLast4,
      isIncome: !isExpense,
    };
  }

  return null;
}

/**
 * Import a single parsed email transaction
 */
export async function importEmailTransaction(
  transaction: ParsedEmailTransaction,
  workspaceId: string,
  bankAccountId?: string
): Promise<{ success: boolean; expenseId?: string; incomeId?: string; error?: string }> {
  try {
    // Get default category
    let defaultCategory = await prisma.category.findFirst({
      where: { workspaceId, name: "Uncategorized" },
    });

    if (!defaultCategory) {
      defaultCategory = await prisma.category.create({
        data: { workspaceId, name: "Uncategorized", isSystem: true },
      });
    }

    // Convert currency
    const { amountEur, exchangeRate } = await convertToEur(transaction.amount, transaction.currency);

    if (transaction.isIncome) {
      // Create income
      const income = await prisma.income.create({
        data: {
          workspaceId,
          bankAccountId: bankAccountId || null,
          name: transaction.name,
          type: "OTHER",
          amount: transaction.amount,
          currency: transaction.currency,
          amountEur,
          exchangeRate,
          date: transaction.date,
        },
      });
      return { success: true, incomeId: income.id };
    } else {
      // Determine expense type
      const type = determineExpenseTypeSimple(transaction.name);

      // Create expense
      const expense = await prisma.expense.create({
        data: {
          workspaceId,
          bankAccountId: bankAccountId || null,
          categoryId: defaultCategory.id,
          name: transaction.name,
          rawInput: `[Email] ${transaction.bankName || "Bank"}: ${transaction.name}`,
          type,
          status: "PAID",
          amount: transaction.amount,
          currency: transaction.currency,
          amountEur,
          exchangeRate,
          date: transaction.date,
        },
      });
      return { success: true, expenseId: expense.id };
    }
  } catch (error) {
    console.error("Email import error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// ============================================================================
// Helper: Create expenses and incomes from parsed rows
// ============================================================================

async function createExpensesAndIncomes(
  parsedRows: ParsedRow[],
  workspaceId: string,
  fileName: string,
  fileType: string,
  currency: string,
  duplicateHandling: DuplicateHandling,
  errors: string[],
  stats: ImporterResult["stats"]
): Promise<ImporterResult> {
  // Get default category
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
      fileType,
      rowsTotal: parsedRows.length,
      rowsSuccess: 0,
      rowsFailed: errors.length,
      errors: errors.length > 0 ? JSON.stringify(errors) : null,
    },
  });

  // Separate expenses and incomes
  const expenses = parsedRows.filter(r => !r.isIncome && r.date);
  const incomes = parsedRows.filter(r => r.isIncome && r.date);

  let expensesCreated = 0;
  let incomesCreated = 0;

  // Create expenses
  if (expenses.length > 0) {
    const expenseDataPromises = expenses.map(async (row) => {
      const { amountEur, exchangeRate } = await convertToEur(row.amount, currency);
      return {
        workspaceId,
        categoryId: defaultCategory!.id,
        importLogId: importLog.id,
        name: row.name,
        rawInput: row.rawInput,
        type: row.type,
        status: "PAID" as const,
        amount: row.amount,
        currency,
        amountEur,
        exchangeRate,
        date: row.date!,
      };
    });
    const expenseData = await Promise.all(expenseDataPromises);

    const result = await prisma.expense.createMany({
      data: expenseData,
    });
    expensesCreated = result.count;
  }

  // Create incomes
  if (incomes.length > 0) {
    const incomeDataPromises = incomes.map(async (row) => {
      const { amountEur, exchangeRate } = await convertToEur(row.amount, currency);
      return {
        workspaceId,
        name: row.name,
        type: "OTHER" as const,
        amount: row.amount,
        currency,
        amountEur,
        exchangeRate,
        date: row.date!,
      };
    });
    const incomeData = await Promise.all(incomeDataPromises);

    const result = await prisma.income.createMany({
      data: incomeData,
    });
    incomesCreated = result.count;
  }

  // Update import log
  await prisma.importLog.update({
    where: { id: importLog.id },
    data: { rowsSuccess: expensesCreated + incomesCreated },
  });

  return {
    success: true,
    imported: expensesCreated + incomesCreated,
    failed: errors.length,
    skipped: 0,
    replaced: 0,
    errors: errors.slice(0, 20),
    stats,
    sheets: [fileType.toUpperCase()],
    recurringCandidates: [],
    recurringTemplatesCreated: 0,
    duplicatesFound: 0,
  };
}

/**
 * Determine expense type from name using keywords (simple version for imports)
 */
function determineExpenseTypeSimple(name: string): ExpenseType {
  const nameLower = name.toLowerCase();

  // Check for fixed expenses
  if (FIXED_KEYWORDS.some(k => nameLower.includes(k))) {
    return ExpenseType.SURVIVAL_FIXED;
  }

  // Check for variable utilities
  if (VARIABLE_KEYWORDS.some(k => nameLower.includes(k))) {
    return ExpenseType.SURVIVAL_VARIABLE;
  }

  return ExpenseType.LIFESTYLE;
}
