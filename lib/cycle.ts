// Calendar-cycle and billing-date math: the app's month "cycle" runs from
// a user-configurable start day to the same day next month (not always the
// calendar month), plus recurring-expense billing-date rollover.
import { MS_PER_DAY } from "./constants.ts";
import type { BillingIntervalUnit } from "./taxonomy.ts";
import { formatShortDate, localDateInput, monthKey } from "./format.ts";
import type { Entry, ReportPeriod } from "./types.ts";

/**
 * Local midnight on a yyyy-mm-dd date, parsed from its parts rather than
 * through new Date(value): a bare date string parses as UTC, which lands on
 * the day before for anyone behind UTC. An unusable value falls back to
 * today, because a bill whose date failed to parse should still appear
 * somewhere a user can see and fix it.
 */
export function dateFromInput(value: string): Date {
  const [year, month, day] = (value ?? "").split("-").map(Number);
  if (!year || !month || !day) {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }
  return new Date(year, month - 1, day);
}

export function withDate(dateInput: string, hours: number, minutes: number, seconds: number) {
  const date = dateFromInput(dateInput);
  date.setHours(hours, minutes, seconds, 0);
  return date.toISOString();
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
    .map(([day, items]) => ({ key: new Date(day).toDateString(), label: dayLabel(items[0].occurred_at), items }));
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

// The midpoint is counted in days and rebuilt from calendar parts, not taken
// as the average of two timestamps. Across a daylight-saving change the two
// ends are an hour apart in wall-clock terms, and that hour is enough to pull
// an exact-midnight midpoint back into the previous month: a 15th-start cycle
// in a DST timezone filed Feb 15 - Mar 15 under February, though thirteen of
// its days are in February and fifteen are in March. Thailand has no DST, so
// nothing here ever saw it; a browser somewhere else would have.
export function cycleMajorityMonthKey(start: Date, end: Date) {
  const days = Math.round((startOfDay(end) - startOfDay(start)) / MS_PER_DAY);
  return monthKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + Math.floor(days / 2)));
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

/** A recurring bill's schedule, which is all the date math below needs. */
export type BillingSchedule = { anchor_date: string; interval_unit: BillingIntervalUnit; interval_count: number };

const safeIntervalCount = (count: number) => Math.max(1, Math.trunc(count) || 1);

/**
 * The anchor moved forward by whole billing periods.
 *
 * Month arithmetic always clamps from the anchor's own day-of-month, never
 * from the previous occurrence: a bill anchored on the 31st falls on the 28th
 * in February and back on the 31st in March. Stepping month by month from the
 * clamped date instead would walk the bill permanently backwards to the 28th,
 * which is the classic way a subscription tracker loses a day a year.
 */
export function addBillingPeriods(anchor: Date, unit: BillingIntervalUnit, count: number, periods: number): Date {
  const step = safeIntervalCount(count);
  if (unit === "week") {
    return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + periods * step * 7);
  }
  const months = periods * step;
  const daysInTarget = new Date(anchor.getFullYear(), anchor.getMonth() + months + 1, 0).getDate();
  return new Date(anchor.getFullYear(), anchor.getMonth() + months, Math.min(anchor.getDate(), daysInTarget));
}

/**
 * When the bill next comes due, counting from its anchor date rather than
 * from the current month -- which is what lets a yearly or quarterly bill
 * exist at all.
 *
 * An anchor in the future is itself the answer: a subscription whose first
 * charge is next month has not billed yet, and saying so is the whole point
 * of asking for a first billing date instead of a day number.
 */
export function nextBillingInfo(item: BillingSchedule, now: Date): { billingDate: Date; daysUntil: number } {
  const { billingDate } = resolveNextOccurrence(item, now);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysUntil = Math.round((billingDate.getTime() - startOfToday.getTime()) / MS_PER_DAY);
  return { billingDate, daysUntil };
}

/**
 * The next occurrence, with the anchor and the period index that produced it
 * -- which is what lets the period *before* it be worked out exactly, rather
 * than by stepping a period back from a date that may itself have been clamped
 * (a bill anchored on the 31st would come back as the 28th of the month before
 * February, not the 31st).
 */
function resolveNextOccurrence(item: BillingSchedule, now: Date): { anchor: Date; periods: number; billingDate: Date } {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const anchor = dateFromInput(item.anchor_date);
  const step = safeIntervalCount(item.interval_count);

  // Jump straight to roughly the right period rather than stepping one cycle
  // at a time -- a weekly bill anchored years ago is hundreds of periods back,
  // and a loop from zero would do that work on every render. The estimate can
  // land a period early (month lengths, a mid-period anchor), never late, so
  // the correction below runs at most a couple of times.
  let periods = 0;
  if (anchor < startOfToday) {
    periods = item.interval_unit === "week"
      ? Math.floor((startOfToday.getTime() - anchor.getTime()) / (MS_PER_DAY * 7 * step))
      : Math.floor(((startOfToday.getFullYear() - anchor.getFullYear()) * 12 + startOfToday.getMonth() - anchor.getMonth()) / step);
  }

  let billingDate = addBillingPeriods(anchor, item.interval_unit, step, periods);
  while (billingDate < startOfToday) {
    periods += 1;
    billingDate = addBillingPeriods(anchor, item.interval_unit, step, periods);
  }

  return { anchor, periods, billingDate };
}

/**
 * The stretch of time the *upcoming* bill belongs to: everything after the
 * previous occurrence, through the end of the day the next one falls on.
 *
 * This is the window "has this bill been paid yet?" has to be asked in, and
 * it is a different question from "has it been paid this month". They only
 * ever gave the same answer while every bill was monthly: a weekly bill
 * logged on the 1st would otherwise read as already paid on the 8th, the
 * 15th and the 22nd, and the one-tap button for those three charges would
 * never appear.
 *
 * Both ends are whole local days, built from calendar parts: the day after
 * the previous occurrence, through the end of the billing day itself. Whole
 * days rather than instants because the previous charge is not always logged
 * at midnight -- one-tap logging dates its row there, but somebody typing the
 * bill in themselves that morning gets the time they typed it, and an instant
 * boundary would hand that row to the next period and call the next charge
 * paid.
 */
export function currentBillingPeriod(item: BillingSchedule, now: Date): { start: Date; end: Date } {
  const { anchor, periods, billingDate } = resolveNextOccurrence(item, now);
  const previous = addBillingPeriods(anchor, item.interval_unit, safeIntervalCount(item.interval_count), periods - 1);
  return {
    start: new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() + 1),
    end: new Date(billingDate.getFullYear(), billingDate.getMonth(), billingDate.getDate() + 1),
  };
}
