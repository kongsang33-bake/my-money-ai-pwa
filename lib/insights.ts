// Home-screen insight builders: quick-add shortcuts derived from recent
// history, the day-streak counter, the "how am I doing this cycle" wallet
// blurb, and the 7-day spend-pace sparkline data.
import {
  CASH_FLOW_WINDOW_DAYS,
  MS_PER_DAY,
  SPEND_BASELINE_MIN_DAYS,
  SPEND_BASELINE_TOLERANCE_PERCENT,
  SPEND_BASELINE_WINDOW_DAYS,
} from "./constants.ts";
import { formatMoney, moneySign } from "./format.ts";
import { daysRemainingInCycle, entriesInRange, startOfDay } from "./cycle.ts";
import type { Debtor, Entry, QuickShortcut, RecurringExpense } from "./types.ts";

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

export type UnpaidOwnDebt = { name: string; balance: number; minimum: number };

/**
 * The user's own debts -- credit cards, instalments -- that still owe money
 * and have had nothing paid against them this cycle.
 *
 * A card charge moves no wallet money (that is what a card is), so the bill
 * arriving and being paid is a separate entry the user has to remember. When
 * they don't, the app's wallet keeps money the bank has already taken, which
 * is one of the few ways a carefully kept ledger still drifts from reality.
 *
 * "Paid this cycle" is any debt_payment against that name inside the range,
 * the same way isRecurringLogged reads a bill as logged: by what is in the
 * ledger, not by a stored link.
 */
export function unpaidOwnDebts(
  debtors: Debtor[],
  balances: { name: string; amount: number }[],
  entries: Entry[],
  cycleRange: { start: Date; end: Date },
): UnpaidOwnDebt[] {
  const paid = new Set(
    entriesInRange(entries, cycleRange.start, cycleRange.end)
      .filter((entry) => entry.transaction_type === "debt_payment")
      .map((entry) => entry.debtor_name.trim()),
  );

  return debtors
    .filter((debtor) => debtor.kind === "own" && !paid.has(debtor.name.trim()))
    .map((debtor) => {
      const balance = balances.find((item) => item.name === debtor.name)?.amount ?? 0;
      const percent = debtor.credit_card_min_payment_percent;
      return {
        name: debtor.name,
        balance,
        minimum: percent ? Math.round(balance * percent) / 100 : debtor.monthly_installment ?? 0,
      };
    })
    .filter((item) => item.balance > 0)
    .sort((a, b) => b.balance - a.balance);
}

export type SpendPaceTone = "unknown" | "low" | "steady" | "high";

export type CashFlowSummary = {
  days: { key: string; label: string; income: number; expense: number }[];
  spend: number;
  income: number;
  avgDaily: number;
  baselineDaily: number;
  deltaPercent: number;
  tone: SpendPaceTone;
};

// The card this feeds asks "am I spending more than usual?", not "am I up or
// down?" -- see CASH_FLOW_WINDOW_DAYS in lib/constants.ts for why a 7-day net
// can't answer anything. So the headline number is `spend`, and the judgement
// lives in `tone`/`deltaPercent`: this window's spend against the average day
// of the 28 days before it.
export function lastSevenDayCashFlow(entries: Entry[], anchorDate: Date): CashFlowSummary {
  const today = startOfDay(anchorDate);
  const windowStart = today - (CASH_FLOW_WINDOW_DAYS - 1) * MS_PER_DAY;
  const baselineStart = windowStart - SPEND_BASELINE_WINDOW_DAYS * MS_PER_DAY;

  const buckets = new Map<number, { income: number; expense: number }>();
  let baselineSpend = 0;
  let firstEntryDay = Infinity;

  for (const entry of entries) {
    if (entry.transaction_type === "transfer") continue;
    const day = startOfDay(new Date(entry.occurred_at));
    if (day < firstEntryDay) firstEntryDay = day;
    if (day >= windowStart && day <= today) {
      let bucket = buckets.get(day);
      if (!bucket) buckets.set(day, (bucket = { income: 0, expense: 0 }));
      if (entry.wallet_impact > 0) bucket.income += entry.wallet_impact;
      else bucket.expense += Math.abs(entry.wallet_impact);
    } else if (day >= baselineStart && day < windowStart && entry.wallet_impact < 0) {
      baselineSpend += Math.abs(entry.wallet_impact);
    }
  }

  const days = Array.from({ length: CASH_FLOW_WINDOW_DAYS }, (_, index) => {
    const time = windowStart + index * MS_PER_DAY;
    const bucket = buckets.get(time);
    return {
      key: String(time),
      label: new Date(time).toLocaleDateString("th-TH", { weekday: "short" }),
      income: bucket?.income ?? 0,
      expense: bucket?.expense ?? 0,
    };
  });

  const spend = days.reduce((sum, day) => sum + day.expense, 0);
  const income = days.reduce((sum, day) => sum + day.income, 0);
  const avgDaily = spend / CASH_FLOW_WINDOW_DAYS;

  // Divide by the days the baseline window actually covers, not by a flat 28:
  // an account that is three weeks old would otherwise have its average
  // diluted by a week that never existed, and read as overspending forever.
  const baselineEnd = windowStart - MS_PER_DAY;
  const baselineDays = firstEntryDay === Infinity
    ? 0
    : Math.round((baselineEnd - Math.max(baselineStart, firstEntryDay)) / MS_PER_DAY) + 1;
  const baselineDaily = baselineDays >= SPEND_BASELINE_MIN_DAYS ? baselineSpend / baselineDays : 0;

  if (baselineDaily <= 0) {
    return { days, spend, income, avgDaily, baselineDaily: 0, deltaPercent: 0, tone: "unknown" };
  }

  const deltaPercent = Math.round(((avgDaily - baselineDaily) / baselineDaily) * 100);
  const tone: SpendPaceTone =
    deltaPercent <= -SPEND_BASELINE_TOLERANCE_PERCENT ? "low"
      : deltaPercent >= SPEND_BASELINE_TOLERANCE_PERCENT ? "high"
        : "steady";

  return { days, spend, income, avgDaily, baselineDaily, deltaPercent, tone };
}
