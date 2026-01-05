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

export type DuplicateHandling = "skip" | "replace";

/**
 * Create a unique key for expense matching (date + normalized name + amount)
 */
function createExpenseKey(date: Date, name: string, amount: number): string {
  const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD
  const normalizedName = name.toLowerCase().trim();
  return `${dateStr}|${normalizedName}|${amount.toFixed(2)}`;
}

/**
 * Main importer function with custom column mapping
 */
export async function importExpensesFromExcel(
  buffer: Buffer,
  workspaceId: string,
  userId: string,
  fileName: string,
  mapping?: ColumnMapping,
  duplicateHandling: DuplicateHandling = "skip"
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

      console.log(`\nProcessing sheet: "${sheetName}" (isProject: ${isProjectSheet})`);
      processedSheets.push(sheetName);

      let rowsProcessed = 0;
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

        // Parse amount - handles empty/null as 0
        const rawAmountValue = rawAmount ? parseAmountRaw(rawAmount) : 0;
        const amount = Math.abs(rawAmountValue);
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
        if (!originalHadDate && !firstDateSeen && !isProjectSheet) {
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

        // Skip zero/empty amounts for regular expense creation (but we already captured recurring candidates above)
        if (!rawAmount || amount === 0) {
          return;
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

        rowsProcessed++;
      });

      console.log(`  → Processed ${rowsProcessed} rows from "${sheetName}"`);

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

    // DUPLICATE DETECTION: Only for SURVIVAL_FIXED and SURVIVAL_VARIABLE (recurring) expenses
    // Regular LIFESTYLE expenses should NEVER be considered duplicates - you can go to the
    // same store, use the same service, or take the same transport multiple times!
    const existingRecurringExpenses = await prisma.expense.findMany({
      where: {
        workspaceId,
        type: { in: ["SURVIVAL_FIXED", "SURVIVAL_VARIABLE"] }
      },
      select: { id: true, date: true, name: true, amount: true },
    });

    // Create a map of existing recurring expense keys -> ids for quick lookup
    const existingExpenseMap = new Map<string, string>();
    for (const exp of existingRecurringExpenses) {
      const key = createExpenseKey(exp.date, exp.name, Number(exp.amount));
      existingExpenseMap.set(key, exp.id);
    }

    // Also check incomes for duplicates (salary/recurring incomes only)
    const existingRecurringIncomes = await prisma.income.findMany({
      where: {
        workspaceId,
        isRecurring: true
      },
      select: { id: true, date: true, name: true, amount: true },
    });

    const existingIncomeMap = new Map<string, string>();
    for (const inc of existingRecurringIncomes) {
      const key = createExpenseKey(inc.date, inc.name, Number(inc.amount));
      existingIncomeMap.set(key, inc.id);
    }

    let totalCreated = 0;
    let totalSkipped = 0;
    let totalReplaced = 0;
    let duplicatesFound = 0;

    // Process incomes - no duplicate checking for regular incomes
    // (you can receive multiple payments of the same amount on the same day)
    if (incomeRows.length > 0) {
      // Insert all incomes directly - no duplicate detection for regular incomes
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

    // Process regular expenses with duplicate handling
    // IMPORTANT: Only check duplicates for SURVIVAL_FIXED and SURVIVAL_VARIABLE (recurring) expenses
    // LIFESTYLE expenses are NEVER duplicates - you can shop at the same store multiple times!
    const newRegularExpenses: typeof regularExpenses = [];
    const duplicateExpenseIds: string[] = [];

    for (const row of regularExpenses) {
      // Only check for duplicates on recurring expense types
      const isRecurringType = row.type === ExpenseType.SURVIVAL_FIXED || row.type === ExpenseType.SURVIVAL_VARIABLE;

      if (isRecurringType) {
        const key = createExpenseKey(row.date!, row.name, row.amount);
        const existingId = existingExpenseMap.get(key);

        if (existingId) {
          duplicatesFound++;
          if (duplicateHandling === "replace") {
            duplicateExpenseIds.push(existingId);
            newRegularExpenses.push(row);
          } else {
            totalSkipped++;
          }
        } else {
          newRegularExpenses.push(row);
        }
      } else {
        // LIFESTYLE and other expense types are NEVER duplicates - always import them
        newRegularExpenses.push(row);
      }
    }

    // Delete duplicates if replacing
    if (duplicateExpenseIds.length > 0) {
      await prisma.expense.deleteMany({
        where: { id: { in: duplicateExpenseIds } },
      });
      totalReplaced += duplicateExpenseIds.length;
    }

    // Insert new regular expenses in batch
    if (newRegularExpenses.length > 0) {
      const regularExpenseData = newRegularExpenses.map((row) => ({
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

      const regularResult = await prisma.expense.createMany({
        data: regularExpenseData,
      });
      totalCreated += regularResult.count;
    }

    // Process project expenses with duplicate handling
    const duplicateProjectExpenseIds: string[] = [];
    const newProjectExpenses: typeof projectExpenses = [];

    for (const row of projectExpenses) {
      const key = createExpenseKey(row.date!, row.name, row.amount);
      const existingId = existingExpenseMap.get(key);

      if (existingId) {
        duplicatesFound++;
        if (duplicateHandling === "replace") {
          duplicateProjectExpenseIds.push(existingId);
          newProjectExpenses.push(row);
        } else {
          totalSkipped++;
        }
      } else {
        newProjectExpenses.push(row);
      }
    }

    // Delete duplicates if replacing
    if (duplicateProjectExpenseIds.length > 0) {
      await prisma.expense.deleteMany({
        where: { id: { in: duplicateProjectExpenseIds } },
      });
      totalReplaced += duplicateProjectExpenseIds.length;
    }

    // Insert project expenses individually (to support many-to-many relation)
    for (const row of newProjectExpenses) {
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

    console.log(`  → Duplicate handling: ${duplicatesFound} duplicates found, ${totalSkipped} skipped, ${totalReplaced} replaced`);

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
            currency: "EUR",
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
      skipped: totalSkipped,
      replaced: totalReplaced,
      errors: errors.slice(0, 20),
      stats,
      sheets: processedSheets,
      recurringCandidates: dedupedRecurring,
      recurringTemplatesCreated,
      duplicatesFound,
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
  duplicateHandling: DuplicateHandling = "skip"
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
  return importExpensesFromExcel(Buffer.from(buffer), workspaceId, userId, fileName, mapping, duplicateHandling);
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
  fileName: string,
  duplicateHandling: DuplicateHandling = "skip"
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

    // DUPLICATE DETECTION: Only for recurring expense types (SURVIVAL_FIXED/VARIABLE)
    // LIFESTYLE expenses are NEVER duplicates - you can have multiple transactions per day!
    const existingRecurringExpenses = await prisma.expense.findMany({
      where: {
        workspaceId,
        type: { in: ["SURVIVAL_FIXED", "SURVIVAL_VARIABLE"] }
      },
      select: { id: true, date: true, name: true, amount: true },
    });

    const existingExpenseMap = new Map<string, string>();
    for (const exp of existingRecurringExpenses) {
      const key = createExpenseKey(exp.date, exp.name, Number(exp.amount));
      existingExpenseMap.set(key, exp.id);
    }

    let totalCreated = 0;
    let totalSkipped = 0;
    let totalReplaced = 0;
    let duplicatesFound = 0;

    // Check each row - only check duplicates for recurring expense types
    const newExpenses: typeof allParsedRows = [];
    const duplicateExpenseIds: string[] = [];

    for (const row of allParsedRows) {
      // Only check duplicates for SURVIVAL_FIXED and SURVIVAL_VARIABLE
      const isRecurringType = row.type === ExpenseType.SURVIVAL_FIXED || row.type === ExpenseType.SURVIVAL_VARIABLE;

      if (isRecurringType) {
        const key = createExpenseKey(row.date!, row.name, row.amount);
        const existingId = existingExpenseMap.get(key);

        if (existingId) {
          duplicatesFound++;
          if (duplicateHandling === "replace") {
            duplicateExpenseIds.push(existingId);
            newExpenses.push(row);
          } else {
            totalSkipped++;
          }
        } else {
          newExpenses.push(row);
        }
      } else {
        // LIFESTYLE expenses are NEVER duplicates - always import them
        newExpenses.push(row);
      }
    }

    // Delete duplicates if replacing
    if (duplicateExpenseIds.length > 0) {
      await prisma.expense.deleteMany({
        where: { id: { in: duplicateExpenseIds } },
      });
      totalReplaced = duplicateExpenseIds.length;
    }

    // Insert new expenses
    if (newExpenses.length > 0) {
      const expenseData = newExpenses.map((row) => ({
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
      totalCreated = result.count;
    }

    console.log(`  → Recurring duplicates: ${duplicatesFound} found, ${totalSkipped} skipped, ${totalReplaced} replaced`);

    // Update import log
    await prisma.importLog.update({
      where: { id: importLog.id },
      data: { rowsSuccess: totalCreated },
    });

    return {
      success: true,
      imported: totalCreated,
      failed: errors.length,
      skipped: totalSkipped,
      replaced: totalReplaced,
      errors: errors.slice(0, 20),
      stats,
      sheets: ["PDF"],
      recurringCandidates: [],
      recurringTemplatesCreated: 0,
      duplicatesFound,
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
