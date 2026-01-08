// Legacy Import Logic for Amigo
// Handles "Expenses.xlsx" format with columns: Data, Tipo de Custo, Custo

import { ExpenseType } from "@prisma/client";

export type ImportedRow = {
  date: Date | null;
  name: string;
  amount: number;
  type: ExpenseType;
  projectName: string | null;
};

export type ImportResult = {
  success: boolean;
  rows: ImportedRow[];
  errors: string[];
  stats: {
    total: number;
    survivalFixed: number;
    survivalVariable: number;
    lifestyle: number;
    project: number;
    failed: number;
  };
};

/**
 * Parse legacy Excel/CSV format
 * Columns: Data, Tipo de Custo, Custo
 *
 * Logic:
 * - If Data is null and in top block -> SURVIVAL_FIXED
 * - If Data is present -> LIFESTYLE
 * - Files named "Casa" -> PROJECT: Casa
 */
export function parseLegacyFormat(
  data: Array<Record<string, unknown>>,
  fileName?: string
): ImportResult {
  const rows: ImportedRow[] = [];
  const errors: string[] = [];
  const stats = {
    total: 0,
    survivalFixed: 0,
    survivalVariable: 0,
    lifestyle: 0,
    project: 0,
    failed: 0,
  };

  // Check if this is a project file (e.g., "Casa.xlsx")
  const isProjectFile = fileName?.toLowerCase().includes("casa");
  const projectName = isProjectFile ? "Casa" : null;

  // Track if we're still in the "top block" (survival section)
  let inSurvivalBlock = true;
  let lastRowHadDate = false;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    stats.total++;

    try {
      // Get values with flexible column name matching
      const dateValue = getColumnValue(row, ["Data", "Date", "data", "date"]);
      const nameValue = getColumnValue(row, ["Tipo de Custo", "Tipo", "Name", "Descricao", "Description", "tipo de custo", "name"]);
      const amountValue = getColumnValue(row, ["Custo", "Amount", "Value", "Valor", "custo", "amount"]);

      // Skip empty rows
      if (!nameValue && !amountValue) {
        continue;
      }

      // Parse date
      const date = parseDate(dateValue);

      // Parse amount
      const amount = parseAmount(amountValue);
      if (amount === null || amount === 0) {
        errors.push(`Row ${i + 1}: Invalid amount "${amountValue}"`);
        stats.failed++;
        continue;
      }

      // Parse name
      const name = String(nameValue || "Unknown").trim();
      if (!name) {
        errors.push(`Row ${i + 1}: Missing name/description`);
        stats.failed++;
        continue;
      }

      // Determine expense type based on logic
      let type: ExpenseType;

      if (isProjectFile) {
        // Project file: all entries are PROJECT type
        type = ExpenseType.PROJECT;
        stats.project++;
      } else if (date === null && inSurvivalBlock) {
        // No date and in top block: SURVIVAL_FIXED
        type = ExpenseType.SURVIVAL_FIXED;
        stats.survivalFixed++;
      } else if (date !== null) {
        // Has date: LIFESTYLE
        type = ExpenseType.LIFESTYLE;
        stats.lifestyle++;
        // Once we see a date, we're no longer in survival block
        if (!lastRowHadDate) {
          inSurvivalBlock = false;
        }
        lastRowHadDate = true;
      } else {
        // No date after lifestyle entries: could be SURVIVAL_VARIABLE
        type = ExpenseType.SURVIVAL_VARIABLE;
        stats.survivalVariable++;
      }

      rows.push({
        date: date || new Date(),
        name,
        amount,
        type,
        projectName,
      });
    } catch (error) {
      errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : "Unknown error"}`);
      stats.failed++;
    }
  }

  return {
    success: errors.length === 0,
    rows,
    errors,
    stats,
  };
}

/**
 * Get column value with flexible name matching
 */
function getColumnValue(row: Record<string, unknown>, possibleNames: string[]): unknown {
  for (const name of possibleNames) {
    if (row[name] !== undefined) {
      return row[name];
    }
  }
  return undefined;
}

/**
 * Parse various date formats
 */
function parseDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number") {
    // Excel serial date number
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string") {
    const str = value.trim();
    if (!str) return null;

    // Try various formats
    // DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (dmyMatch) {
      const [, day, month, year] = dmyMatch;
      const fullYear = year.length === 2 ? 2000 + parseInt(year) : parseInt(year);
      return new Date(fullYear, parseInt(month) - 1, parseInt(day));
    }

    // YYYY-MM-DD
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return new Date(str);
    }

    // Try native parsing
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

/**
 * Parse amount from various formats
 */
function parseAmount(value: unknown): number | null {
  if (typeof value === "number") {
    return Math.abs(value);
  }

  if (typeof value === "string") {
    // Remove currency symbols and whitespace
    const cleaned = value
      .replace(/[€$£R\$\s]/g, "")
      .replace(/\./g, "") // Remove thousand separators
      .replace(",", "."); // Convert decimal comma to dot

    const num = parseFloat(cleaned);
    return isNaN(num) ? null : Math.abs(num);
  }

  return null;
}

/**
 * Parse CSV string to array of objects
 */
export function parseCSV(csvString: string): Array<Record<string, string>> {
  const lines = csvString.trim().split("\n");
  if (lines.length < 2) return [];

  // Detect delimiter
  const firstLine = lines[0];
  const delimiter = firstLine.includes(";") ? ";" : ",";

  // Parse header
  const headers = parseCsvLine(firstLine, delimiter);

  // Parse rows
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i], delimiter);
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header.trim()] = values[index]?.trim() || "";
    });

    rows.push(row);
  }

  return rows;
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}
