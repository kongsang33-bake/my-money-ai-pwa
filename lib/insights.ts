// Home-screen insight builders: quick-add shortcuts derived from recent
// history, the day-streak counter, the "how am I doing this cycle" wallet
// blurb, the new-account setup checklist, the 7-day spend-pace sparkline
// data, and the two per-day roll-ups the spending calendar and the day strip
// under it read from.
import {
  CASH_FLOW_WINDOW_DAYS,
  MS_PER_DAY,
  SPEND_BASELINE_MIN_DAYS,
  SPEND_BASELINE_TOLERANCE_PERCENT,
  SPEND_BASELINE_WINDOW_DAYS,
} from "./constants.ts";
import { formatMoney, moneySign } from "./format.ts";
import { currentBillingPeriod, daysRemainingInCycle, entriesInRange, startOfDay } from "./cycle.ts";
import { countsAsEarnedOrSpent } from "./taxonomy.ts";
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

/**
 * The line under Home's hero balance. `hasWallet` is what separates the two
 * ways of holding zero: an account whose opening balance has never been set
 * (nothing to spend down, because nothing was ever counted) from one that
 * genuinely starts a cycle at zero. Without it the hero told a brand-new
 * account it had "ยังไม่มีรายจ่ายในรอบนี้" -- true, and completely useless,
 * next to a balance that cannot move until a wallet exists.
 */
export function buildWalletInsight(balance: number, outflow: number, cycleEnd: Date, hasWallet = true) {
  const remainingDays = daysRemainingInCycle(cycleEnd);
  const perDay = balance / remainingDays;
  if (!hasWallet) {
    return {
      tone: "calm",
      label: "ยังไม่เริ่ม",
      text: "ยังไม่ได้ตั้งยอดตั้งต้น สร้างกระเป๋าแล้วยอดนี้จะเริ่มนับให้",
      perDay: 0,
    };
  }
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

export type SetupStepKey = "wallet" | "entry" | "plan" | "pin";

export type SetupStep = {
  key: SetupStepKey;
  label: string;
  detail: string;
  action: string;
  done: boolean;
};

/**
 * The four things that turn an empty account into a working one, in the order
 * they stop being confusing: a wallet (until one exists every entry saves with
 * a null wallet_id and buildWalletLedger cannot count it, so the balance sits
 * at zero however much gets jotted), a first entry, something forward-looking
 * to compare against, and the lock.
 *
 * Every step reads state the app already has -- nothing here is stored, so a
 * step un-ticks itself if its data goes away, and an account that arrived from
 * an earlier version starts fully ticked rather than being told to redo work.
 */
export function buildSetupChecklist(input: {
  walletCount: number;
  entryCount: number;
  budgetCount: number;
  recurringCount: number;
  pinEnabled: boolean;
}): { steps: SetupStep[]; remaining: number; next: SetupStep | null; coreDone: boolean } {
  const steps: SetupStep[] = [
    {
      key: "wallet",
      label: "สร้างกระเป๋าเงิน",
      detail: "ใส่ยอดที่มีอยู่ตอนนี้ เพื่อให้ทุกรายการมีที่ให้บวกลบ",
      action: "สร้างกระเป๋า",
      done: input.walletCount > 0,
    },
    {
      key: "entry",
      label: "จดรายการแรก",
      detail: "พิมพ์เป็นประโยคธรรมดา แล้วให้ AI แยกให้",
      action: "จดรายการ",
      done: input.entryCount > 0,
    },
    {
      key: "plan",
      label: "ตั้งงบหรือรายจ่ายประจำ",
      detail: "บอกแอพว่าเดือนหนึ่งมีอะไรต้องจ่ายบ้าง",
      action: "ตั้งงบ",
      done: input.budgetCount > 0 || input.recurringCount > 0,
    },
    {
      key: "pin",
      label: "ล็อกแอพด้วย PIN",
      detail: "กันคนอื่นเปิดดูเงินของคุณบนเครื่องเดียวกัน",
      action: "ตั้ง PIN",
      done: input.pinEnabled,
    },
  ];
  const remaining = steps.filter((step) => !step.done).length;
  return {
    steps,
    remaining,
    next: steps.find((step) => !step.done) ?? null,
    // What decides whether Home still shows the checklist at all. The lock is
    // deliberately outside it: it is worth offering while someone is setting
    // up, but an account that is otherwise running should not carry a
    // permanent to-do card because its owner chose not to use a PIN.
    coreDone: steps.every((step) => step.key === "pin" || step.done),
  };
}

// A recurring item counts as "already logged" once a matching title+amount
// entry exists in the billing period the next charge belongs to -- not by any
// stored link to the recurring row, since one-tap logging (DueSoonCard) just
// inserts a plain transaction like a manual entry would.
//
// The window is the bill's own period, not the user's month: those agreed
// while every bill was monthly, but a weekly bill logged once would otherwise
// read as paid for the rest of the month and never offer its next three
// charges. A card-paid bill writes two rows, and either of them matching is
// the same answer, so .some() is still the right question.
export function isRecurringLogged(item: RecurringExpense, entries: Entry[], now: Date) {
  const period = currentBillingPeriod(item, now);
  return entriesInRange(entries, period.start, period.end).some(
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
    if (!countsAsEarnedOrSpent(entry.transaction_type)) continue;
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

/**
 * How much was spent on each calendar day, keyed the way the heatmap indexes
 * its cells (Date.toDateString()).
 *
 * Only money that actually left counts: an entry the wallet gained on, and
 * anything countsAsEarnedOrSpent rejects, is not a darker square. A balance
 * adjustment is the one that matters here -- correcting the app after counting
 * real cash used to light up that day as the heaviest of the month and inflate
 * the cycle total under the legend.
 */
export function spendingByDay(entries: Entry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const entry of entries) {
    if (!countsAsEarnedOrSpent(entry.transaction_type) || entry.wallet_impact >= 0) continue;
    const key = new Date(entry.occurred_at).toDateString();
    map.set(key, (map.get(key) ?? 0) + Math.abs(entry.wallet_impact));
  }
  return map;
}

export type DaySummary = { count: number; income: number; outflow: number; top: Entry | null };

/**
 * The strip above the day's list: how many rows it holds, what came in and
 * went out, and the biggest single expense.
 *
 * `count` is every row, because it labels the list below it -- but the money
 * figures pass through countsAsEarnedOrSpent first, so the same reconciliation
 * row can be listed as history without being reported as the day's spending.
 */
export function summarizeDayEntries(entries: Entry[]): DaySummary {
  const counted = entries.filter((entry) => countsAsEarnedOrSpent(entry.transaction_type));
  const spent = counted.filter((entry) => entry.wallet_impact < 0);
  return {
    count: entries.length,
    income: counted.filter((entry) => entry.wallet_impact > 0).reduce((sum, entry) => sum + entry.wallet_impact, 0),
    outflow: spent.reduce((sum, entry) => sum + Math.abs(entry.wallet_impact), 0),
    top: [...spent].sort((a, b) => Math.abs(b.wallet_impact) - Math.abs(a.wallet_impact))[0] ?? null,
  };
}
