// Calendar-cycle and billing-date math: the app's month "cycle" runs from
// a user-configurable start day to the same day next month (not always the
// calendar month), plus recurring-expense billing-date rollover.
import { MS_PER_DAY } from "./constants.ts";
import { formatShortDate, localDateInput, monthKey } from "./format.ts";
import type { Entry, RecurringExpense, ReportPeriod } from "./types.ts";

export function withDate(dateInput: string, hours: number, minutes: number, seconds: number) {
  const [year, month, day] = dateInput.split("-").map(Number);
  return new Date(year, month - 1, day, hours, minutes, seconds).toISOString();
}
export const fromDateInput = (value: string) => {
  const now = new Date();
  return withDate(value, now.getHours(), now.getMinutes(), now.getSeconds());
};
export const withDateKeepingTime = (value: string, referenceIso: string) => {
  const reference = new Date(referenceIso);
  return withDate(value, reference.getHours(), reference.getMinutes(), reference.getSeconds());
};
export const todayDateInput = () => localDateInput(new Date());

export function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

export function dayLabel(value: string) {
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(new Date(value))) / MS_PER_DAY);
  if (diffDays === 0) return "วันนี้";
  if (diffDays === 1) return "เมื่อวาน";
  return formatShortDate(value, { year: true });
}

export function groupEntriesByDay(entries: Entry[]) {
  const byDay = new Map<number, Entry[]>();
  for (const entry of entries) {
    const key = startOfDay(new Date(entry.occurred_at));
    const list = byDay.get(key);
    if (list) list.push(entry);
    else byDay.set(key, [entry]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, items]) => ({ label: dayLabel(items[0].occurred_at), items }));
}

export function daysRemainingInCycle(end: Date) {
  const today = startOfDay(new Date());
  const endDay = startOfDay(new Date(end.getTime() - 1));
  return Math.max(1, Math.round((endDay - today) / MS_PER_DAY) + 1);
}

export function shiftMonthKey(key: string, delta: number) {
  const [year, month] = key.split("-").map(Number);
  return monthKey(new Date(year, month - 1 + delta, 1));
}

// A cycle spans from `startDay` of one calendar month to `startDay` (excl.) of
// the next, so it always straddles two months. `startMonthCycleBounds` keys it
// by the month it *starts* in; `cycleBounds` below keys it by whichever month
// holds the majority of its days instead, since that's the month users expect
// to see it labeled as (e.g. a 25th-start cycle is mostly next month).
export function startMonthCycleBounds(startMonthKey: string, startDay: number) {
  const [year, month] = startMonthKey.split("-").map(Number);
  const safeDay = Math.min(28, Math.max(1, startDay || 1));
  const start = new Date(year, month - 1, safeDay, 0, 0, 0, 0);
  const end = new Date(year, month, safeDay, 0, 0, 0, 0);
  return { start, end };
}

export function cycleMajorityMonthKey(start: Date, end: Date) {
  return monthKey(new Date((start.getTime() + end.getTime()) / 2));
}

export function cycleBounds(majorityMonthKey: string, startDay: number) {
  const candidate = startMonthCycleBounds(majorityMonthKey, startDay);
  if (cycleMajorityMonthKey(candidate.start, candidate.end) === majorityMonthKey) return candidate;
  return startMonthCycleBounds(shiftMonthKey(majorityMonthKey, -1), startDay);
}

export function currentCycleMonthKey(startDay: number, now = new Date()) {
  const safeStartDay = Math.min(28, Math.max(1, startDay || 1));
  const startMonthKey = monthKey(new Date(now.getFullYear(), now.getMonth() - (now.getDate() < safeStartDay ? 1 : 0), 1));
  const { start, end } = startMonthCycleBounds(startMonthKey, startDay);
  return cycleMajorityMonthKey(start, end);
}

export function defaultDayForCycle(key: string, startDay: number) {
  const [year, month] = key.split("-").map(Number);
  const today = new Date();
  const range = cycleBounds(key, startDay);
  const day = Math.min(today.getDate(), new Date(year, month, 0).getDate());
  const preferred = new Date(year, month - 1, day);
  if (preferred < range.start) return range.start.toDateString();
  if (preferred >= range.end) return new Date(range.end.getTime() - 1).toDateString();
  return preferred.toDateString();
}

export function reportBounds(period: ReportPeriod, selectedMonth: string, selectedYear: number, startDay: number) {
  if (period === "month") return cycleBounds(selectedMonth, startDay);
  const safeYear = Number.isFinite(selectedYear) ? selectedYear : new Date().getFullYear();
  return {
    start: new Date(safeYear, 0, 1, 0, 0, 0, 0),
    end: new Date(safeYear + 1, 0, 1, 0, 0, 0, 0),
  };
}

export function reportLabel(period: ReportPeriod, selectedMonth: string, selectedYear: number, startDay: number) {
  if (period === "year") return `รายปี ${selectedYear}`;
  const range = cycleBounds(selectedMonth, startDay);
  const start = formatShortDate(range.start, { year: true });
  const end = formatShortDate(new Date(range.end.getTime() - 1), { year: true });
  return `รายเดือน ${start} - ${end}`;
}

export function entriesInRange(entries: Entry[], start: Date, end: Date) {
  return entries.filter((entry) => {
    const occurredAt = new Date(entry.occurred_at);
    return occurredAt >= start && occurredAt < end;
  });
}

// Recurring expenses bill on a fixed day-of-month, clamped to whatever the
// current/next month actually has (e.g. billing_day 31 bills on the 30th in
// a 30-day month) — rolls to next month once this month's date has passed.
export function nextBillingInfo(item: RecurringExpense, now: Date): { billingDate: Date; daysUntil: number } {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysInThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let billingDate = new Date(now.getFullYear(), now.getMonth(), Math.min(item.billing_day, daysInThisMonth));
  if (billingDate < startOfToday) {
    const daysInNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate();
    billingDate = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(item.billing_day, daysInNextMonth));
  }
  const daysUntil = Math.round((billingDate.getTime() - startOfToday.getTime()) / MS_PER_DAY);
  return { billingDate, daysUntil };
}
