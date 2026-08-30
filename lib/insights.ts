// Home-screen insight builders: quick-add shortcuts derived from recent
// history, the day-streak counter, the "how am I doing this cycle" wallet
// blurb, and the 7-day cash flow sparkline data.
import { MS_PER_DAY } from "./constants.ts";
import { formatMoney, moneySign } from "./format.ts";
import { daysRemainingInCycle, entriesInRange, startOfDay } from "./cycle.ts";
import type { Entry, RecurringExpense } from "./types.ts";
import type { TransactionType } from "./taxonomy.ts";

export type QuickShortcut = { title: string; category: string; transaction_type: TransactionType; amount: number; count: number };

export function deriveQuickShortcuts(entries: Entry[]): QuickShortcut[] {
  const cutoff = Date.now() - 90 * MS_PER_DAY;
  const map = new Map<string, QuickShortcut>();
  for (const entry of entries) {
    if (entry.transaction_type !== "personal_expense" && entry.transaction_type !== "income") continue;
    if (new Date(entry.occurred_at).getTime() < cutoff) continue;
    const title = entry.title.trim();
    const key = `${title.toLowerCase()}|${entry.category}|${entry.transaction_type}`;
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { title, category: entry.category, transaction_type: entry.transaction_type, amount: entry.amount, count: 1 });
  }
  return [...map.values()]
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
}

export function computeStreak(entries: Entry[]) {
  const days = new Set(entries.map((entry) => startOfDay(new Date(entry.occurred_at))));
  let cursor = startOfDay(new Date());
  if (!days.has(cursor)) cursor -= MS_PER_DAY;
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= MS_PER_DAY;
  }
  return streak;
}

export function buildWalletInsight(balance: number, outflow: number, cycleEnd: Date) {
  const remainingDays = daysRemainingInCycle(cycleEnd);
  const perDay = balance / remainingDays;
  if (balance < 0) {
    return {
      tone: "danger",
      label: "ต้องระวัง",
      text: `ยอดสุทธิติดลบ ${moneySign}${formatMoney(Math.abs(balance))} ในรอบนี้`,
      perDay,
    };
  }
  if (outflow <= 0) {
    return {
      tone: "calm",
      label: "เริ่มรอบใหม่",
      text: `ยังไม่มีรายจ่ายในรอบนี้ เหลืออีก ${remainingDays} วัน`,
      perDay,
    };
  }
  if (perDay < 200) {
    return {
      tone: "warn",
      label: "ใช้แบบประคอง",
      text: `เฉลี่ยใช้ได้ประมาณ ${moneySign}${formatMoney(perDay)} ต่อวัน`,
      perDay,
    };
  }
  return {
    tone: "good",
    label: "ยังดูดี",
    text: `เหลือใช้ได้ประมาณ ${moneySign}${formatMoney(perDay)} ต่อวัน`,
    perDay,
  };
}

// A recurring item counts as "already logged" this cycle once a matching
// title+amount entry exists in the cycle range -- not by any stored link to
// the recurring row, since one-tap logging (DueSoonCard) just inserts a
// plain transaction like a manual entry would.
export function isRecurringLogged(item: RecurringExpense, entries: Entry[], cycleRange: { start: Date; end: Date }) {
  return entriesInRange(entries, cycleRange.start, cycleRange.end).some(
    (entry) => entry.title.trim() === item.name.trim() && entry.amount === item.amount,
  );
}

export function lastSevenDayCashFlow(entries: Entry[], anchorDate: Date) {
  const today = startOfDay(anchorDate);
  return Array.from({ length: 7 }, (_, index) => {
    const time = today - (6 - index) * MS_PER_DAY;
    const dayEntries = entries.filter((entry) => startOfDay(new Date(entry.occurred_at)) === time && entry.transaction_type !== "transfer");
    const income = dayEntries.filter((entry) => entry.wallet_impact > 0).reduce((sum, entry) => sum + entry.wallet_impact, 0);
    const expense = dayEntries.filter((entry) => entry.wallet_impact < 0).reduce((sum, entry) => sum + Math.abs(entry.wallet_impact), 0);
    return {
      key: String(time),
      label: new Date(time).toLocaleDateString("th-TH", { weekday: "short" }),
      income,
      expense,
    };
  });
}
