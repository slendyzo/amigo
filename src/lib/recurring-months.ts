export const MAX_RECURRING_MONTHS = 120;
export function recurringMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function recurringMonthIndex(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error("Use a valid month in YYYY-MM format");
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 9999) throw new Error("Year must be between 1900 and 9999");
  return year * 12 + Number(value.slice(5)) - 1;
}
function keyFromIndex(index: number): string {
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}
export function parseRecurringMonths(body: Record<string, unknown>, now = new Date()): { months: string[]; backfill: boolean } {
  const hasMonths = body.months !== undefined;
  const hasFrom = body.fromMonth !== undefined;
  const current = recurringMonthIndex(recurringMonthKey(now));
  if (hasMonths || hasFrom) {
    if ((hasMonths && hasFrom) || body.month !== undefined || body.year !== undefined) throw new Error("Choose either specific months or a starting month");
    let indices: number[];
    if (hasMonths) {
      if (!Array.isArray(body.months) || body.months.length === 0 || body.months.length > 1200) throw new Error("Select between 1 and 120 months");
      indices = [...new Set(body.months.map(recurringMonthIndex))].sort((a, b) => a - b);
    } else {
      const start = recurringMonthIndex(body.fromMonth);
      if (start > current) throw new Error("Past payments cannot include future months");
      if (current - start + 1 > MAX_RECURRING_MONTHS) throw new Error("Select at most 120 months");
      indices = Array.from({ length: current - start + 1 }, (_, i) => start + i);
    }
    if (indices.length > MAX_RECURRING_MONTHS) throw new Error("Select at most 120 months");
    if (indices.some((index) => index > current)) throw new Error("Past payments cannot include future months");
    return { months: indices.map(keyFromIndex), backfill: true };
  }
  const month = body.month === undefined ? now.getUTCMonth() : body.month;
  const year = body.year === undefined ? now.getUTCFullYear() : body.year;
  if (typeof month !== "number" || !Number.isInteger(month) || month < 0 || month > 11 || typeof year !== "number" || !Number.isInteger(year) || year < 1900 || year > 9999) throw new Error("Invalid month or year");
  return { months: [keyFromIndex(year * 12 + month)], backfill: false };
}
export function recurringDate(month: string, day: number): Date {
  const index = recurringMonthIndex(month);
  const year = Math.floor(index / 12);
  const monthIndex = index % 12;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(day, lastDay)));
}
export function recurringMonthAllowed(month: string, startDate: Date | null, endDate: Date | null): boolean {
  const index = recurringMonthIndex(month);
  return (!startDate || index >= recurringMonthIndex(recurringMonthKey(startDate))) && (!endDate || index < recurringMonthIndex(recurringMonthKey(endDate)));
}

type MonthlySchedule = {
  dayOfMonth: number | null;
  startDate: string | null;
  endDate: string | null;
  installmentMonths?: number | null;
  expenseCount?: number;
};

export function recurringPlanCompleted(schedule: Pick<MonthlySchedule, "startDate" | "endDate" | "installmentMonths" | "expenseCount">, now = new Date()): boolean {
  if (schedule.installmentMonths && (schedule.expenseCount ?? 0) >= schedule.installmentMonths) return true;
  const currentMonth = now.getFullYear() * 12 + now.getMonth();
  if (schedule.installmentMonths && schedule.startDate && currentMonth >= recurringMonthIndex(recurringMonthKey(new Date(schedule.startDate))) + schedule.installmentMonths) return true;
  return !!schedule.endDate && currentMonth >= recurringMonthIndex(recurringMonthKey(new Date(schedule.endDate)));
}

// Preview the same exclusive end month used by the payment generators. Calendar
// dates are local for display; stored schedule boundaries are UTC month anchors.
export function nextRecurringOccurrence(schedule: MonthlySchedule, now = new Date()): Date | null {
  if (schedule.dayOfMonth === null || recurringPlanCompleted(schedule, now)) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let index = today.getFullYear() * 12 + today.getMonth();
  const startIndex = schedule.startDate ? recurringMonthIndex(recurringMonthKey(new Date(schedule.startDate))) : null;
  if (startIndex !== null) index = Math.max(index, startIndex);
  const dateAt = (month: number) => {
    const year = Math.floor(month / 12);
    const m = month % 12;
    return new Date(year, m, Math.min(schedule.dayOfMonth!, new Date(year, m + 1, 0).getDate()));
  };
  let next = dateAt(index);
  if (next < today) next = dateAt(++index);
  if (schedule.endDate && index >= recurringMonthIndex(recurringMonthKey(new Date(schedule.endDate)))) return null;
  if (schedule.installmentMonths && startIndex !== null && index >= startIndex + schedule.installmentMonths) return null;
  return next;
}
