// Monthly templates use an exclusive end month. Using day 1 prevents dates
// such as August 31 + six months from overflowing into an extra billing month.
export function debtSchedule(startDate: Date, termMonths: number | null, now = new Date()) {
  const dayOfMonth = startDate.getUTCDate();
  const dateInMonth = (year: number, month: number) => new Date(Date.UTC(
    year, month, Math.min(dayOfMonth, new Date(Date.UTC(year, month + 1, 0)).getUTCDate()),
  ));
  let nextDue = dateInMonth(now.getUTCFullYear(), now.getUTCMonth());
  if (nextDue <= now) nextDue = dateInMonth(now.getUTCFullYear(), now.getUTCMonth() + 1);
  if (nextDue < startDate) nextDue = startDate;
  return {
    startDate,
    dayOfMonth,
    nextDue,
    endDate: termMonths == null ? null : new Date(Date.UTC(
      startDate.getUTCFullYear(), startDate.getUTCMonth() + termMonths, 1,
    )),
  };
}
