import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSetupChecklist, buildWalletInsight, lastSevenDayCashFlow, isRecurringLogged, buildUpcoming, describeDaysUntil, sameTitleSummary, similarEntries, spendingByDay, summarizeDayEntries, unpaidOwnDebts } from "./insights.ts";
import type { Debtor, Entry, RecurringExpense } from "./types.ts";
import type { TransactionType } from "./taxonomy.ts";
import { MS_PER_DAY } from "./constants.ts";

function makeItem(name: string, amount: number, schedule: Partial<RecurringExpense> = {}): RecurringExpense {
  return {
    id: "r1", user_id: "u1", name, amount, anchor_date: "2026-08-05",
    interval_unit: "month", interval_count: 1, icon: null, icon_color: null,
    wallet_id: null, funding_card_name: null, is_active: true, ...schedule,
  };
}

function makeEntry(title: string, amount: number, occurred_at: string): Entry {
  return {
    id: occurred_at, title, category: "บิลประจำ", amount, type: "expense",
    transaction_type: "personal_expense", wallet_impact: -amount, debt_impact: 0,
    user_share: amount, partner_share: 0, debtor_name: "ไม่ระบุ", occurred_at,
  };
}

const cycleRange = { start: new Date("2026-08-01T00:00:00.000Z"), end: new Date("2026-09-01T00:00:00.000Z") };

describe("isRecurringLogged", () => {
  // A monthly bill anchored on the 5th, asked on the 20th: the charge it is
  // being asked about is next month's, and the window runs back to this
  // month's 5th.
  const asked = new Date(2026, 7, 20);
  const monthly = (name: string, amount: number) => makeItem(name, amount, { anchor_date: "2026-08-05" });

  it("is false when no matching entry exists in the period", () => {
    const entries = [makeEntry("Netflix", 199, new Date(2026, 7, 10, 9, 0).toISOString())];
    assert.equal(isRecurringLogged(monthly("Spotify", 129), entries, asked), false);
  });

  it("is true when a matching title+amount entry exists in the period", () => {
    const entries = [makeEntry("Netflix", 199, new Date(2026, 7, 10, 9, 0).toISOString())];
    assert.equal(isRecurringLogged(monthly("Netflix", 199), entries, asked), true);
  });

  it("is false when the amount differs, even with the same title", () => {
    const entries = [makeEntry("Netflix", 199, new Date(2026, 7, 10, 9, 0).toISOString())];
    assert.equal(isRecurringLogged(monthly("Netflix", 249), entries, asked), false);
  });

  it("ignores a matching entry from a period that has already been and gone", () => {
    const entries = [makeEntry("Netflix", 199, new Date(2026, 6, 20, 9, 0).toISOString())];
    assert.equal(isRecurringLogged(monthly("Netflix", 199), entries, asked), false);
  });

  it("asks about this week's charge, not this month's, for a weekly bill", () => {
    // The bug this guards: a weekly bill logged on the 5th read as paid for
    // the whole month, so the 12th, 19th and 26th never offered the one-tap
    // button and the card claimed they were already done.
    //
    // The row is dated the way recurringExpenseEntries dates one -- midnight
    // *local* to whoever is running it -- rather than at a fixed UTC instant.
    // The boundary between one billing period and the next is local midnight
    // too, so a Z-suffixed literal here would only line up with it in UTC and
    // would put this row in the wrong period for the country the app is for.
    const weekly = makeItem("ค่าขยะ", 50, { anchor_date: "2026-08-05", interval_unit: "week" });
    const loggedOnThe5th = [makeEntry("ค่าขยะ", 50, new Date(2026, 7, 5).toISOString())];
    // Asked on the 5th itself: that charge is today's, and it is logged.
    assert.equal(isRecurringLogged(weekly, loggedOnThe5th, new Date(2026, 7, 5)), true);
    // Asked on the 6th: the charge in question is the 12th's, still unpaid.
    assert.equal(isRecurringLogged(weekly, loggedOnThe5th, new Date(2026, 7, 6)), false);
    // ...and the same when the 5th's charge was typed in by hand that morning
    // rather than tapped at midnight, which is the only time one-tap logging
    // ever writes. A boundary on the instant rather than the day would hand
    // that row to the 12th and call it paid.
    const typedInThatMorning = [makeEntry("ค่าขยะ", 50, new Date(2026, 7, 5, 9, 15).toISOString())];
    assert.equal(isRecurringLogged(weekly, typedInThatMorning, new Date(2026, 7, 6)), false);
    assert.equal(isRecurringLogged(weekly, typedInThatMorning, new Date(2026, 7, 5)), true);
  });

  it("counts a bill logged a day early against the charge it was paying", () => {
    // Someone who types the bill in themselves when the SMS arrives dates it
    // a day or two before the billing date; that is still this charge.
    const entries = [makeEntry("Netflix", 199, new Date(2026, 8, 3, 9, 30).toISOString())];
    assert.equal(isRecurringLogged(monthly("Netflix", 199), entries, new Date(2026, 8, 3)), true);
  });
});

const anchor = new Date("2026-09-02T12:00:00");
const dayBefore = (offset: number) => new Date(anchor.getTime() - offset * MS_PER_DAY).toISOString();

// wallet_impact is what the summary reads; `amount` is only the display value.
function makeFlow(daysAgo: number, walletImpact: number, transaction_type: TransactionType = "personal_expense"): Entry {
  return {
    id: `${daysAgo}:${walletImpact}:${transaction_type}`, title: "x", category: "อื่น ๆ",
    amount: Math.abs(walletImpact), type: walletImpact > 0 ? "income" : "expense",
    transaction_type, wallet_impact: walletImpact, debt_impact: 0,
    user_share: Math.abs(walletImpact), partner_share: 0, debtor_name: "ไม่ระบุ",
    occurred_at: dayBefore(daysAgo),
  };
}

// A 28-day baseline of exactly 100/day, ending the day before the 7-day window.
const flatBaseline = Array.from({ length: 28 }, (_, index) => makeFlow(7 + index, -100));

describe("lastSevenDayCashFlow", () => {
  it("buckets the window into 7 days, oldest first, and totals each side", () => {
    const summary = lastSevenDayCashFlow([makeFlow(6, -50), makeFlow(0, -25), makeFlow(0, 900, "income")], anchor);
    assert.equal(summary.days.length, 7);
    assert.equal(summary.days[0].expense, 50);
    assert.equal(summary.days[6].expense, 25);
    assert.equal(summary.days[6].income, 900);
    assert.equal(summary.spend, 75);
    assert.equal(summary.income, 900);
  });

  it("ignores transfers, which only move money between the user's own wallets", () => {
    const summary = lastSevenDayCashFlow([makeFlow(1, -500, "transfer"), makeFlow(1, -20)], anchor);
    assert.equal(summary.spend, 20);
  });

  it("ignores a balance adjustment, so correcting the app is not a spending week", () => {
    // The card asks "am I spending more than usual?". A reconciliation is the
    // app admitting its own figure was wrong, so it must not answer yes.
    const summary = lastSevenDayCashFlow([makeFlow(1, -2179.96, "balance_adjustment"), makeFlow(1, -20)], anchor);
    assert.equal(summary.spend, 20);
    assert.equal(summary.days[6].income, 0);
  });

  it("reports a payday week as normal pace rather than as a windfall", () => {
    // The regression this card exists for: income lands once a month, so the
    // week it arrives must not read differently from any other week.
    const summary = lastSevenDayCashFlow([...flatBaseline, ...Array.from({ length: 7 }, (_, i) => makeFlow(i, -100)), makeFlow(3, 30000, "income")], anchor);
    assert.equal(summary.tone, "steady");
    assert.equal(summary.income, 30000);
  });

  it("calls a week above the baseline high, and one below it low", () => {
    const high = lastSevenDayCashFlow([...flatBaseline, ...Array.from({ length: 7 }, (_, i) => makeFlow(i, -150))], anchor);
    assert.equal(high.tone, "high");
    assert.equal(high.deltaPercent, 50);

    const low = lastSevenDayCashFlow([...flatBaseline, ...Array.from({ length: 7 }, (_, i) => makeFlow(i, -50))], anchor);
    assert.equal(low.tone, "low");
    assert.equal(low.deltaPercent, -50);
  });

  it("stays steady inside the tolerance band", () => {
    const summary = lastSevenDayCashFlow([...flatBaseline, ...Array.from({ length: 7 }, (_, i) => makeFlow(i, -105))], anchor);
    assert.equal(summary.tone, "steady");
    assert.equal(summary.deltaPercent, 5);
  });

  it("excludes the current window from its own baseline", () => {
    // Every baseline day is empty here, so a spending week must not be able
    // to average itself into looking normal.
    const summary = lastSevenDayCashFlow(Array.from({ length: 7 }, (_, i) => makeFlow(i, -100)), anchor);
    assert.equal(summary.baselineDaily, 0);
    assert.equal(summary.tone, "unknown");
  });

  it("withholds a verdict until the baseline covers enough history", () => {
    const short = lastSevenDayCashFlow([makeFlow(15, -100), makeFlow(1, -100)], anchor);
    assert.equal(short.tone, "unknown");
    assert.equal(short.deltaPercent, 0);
  });

  it("divides the baseline by the days it actually covers, not a flat 28", () => {
    // Account opened 21 days ago: 14 baseline days at 100/day. Averaging over
    // 28 would halve the baseline and make a normal week look like overspend.
    const history = Array.from({ length: 14 }, (_, index) => makeFlow(7 + index, -100));
    const summary = lastSevenDayCashFlow([...history, ...Array.from({ length: 7 }, (_, i) => makeFlow(i, -100))], anchor);
    assert.equal(summary.baselineDaily, 100);
    assert.equal(summary.tone, "steady");
  });

  it("has no verdict for an empty account", () => {
    const summary = lastSevenDayCashFlow([], anchor);
    assert.equal(summary.spend, 0);
    assert.equal(summary.avgDaily, 0);
    assert.equal(summary.tone, "unknown");
  });
});

describe("unpaidOwnDebts", () => {
  const card = (name: string, extra: Partial<Debtor> = {}): Debtor => ({
    id: name, user_id: "u1", name, note: null, opening_balance: 0, kind: "own",
    monthly_installment: null, total_installments: null, credit_limit: null,
    credit_card_min_payment_percent: null, icon: null, icon_color: null, ...extra,
  });
  const payment = (name: string, amount: number, occurred_at: string): Entry => ({
    ...makeEntry(`จ่าย ${name}`, amount, occurred_at),
    transaction_type: "debt_payment", debtor_name: name, debt_impact: -amount,
  });
  const balances = [{ name: "บัตรเครดิต", amount: 8200 }, { name: "ผ่อน iPhone", amount: 4000 }];

  it("lists what still owes money and has had nothing paid this cycle", () => {
    const result = unpaidOwnDebts([card("บัตรเครดิต"), card("ผ่อน iPhone")], balances, [], cycleRange);
    assert.deepEqual(result.map((item) => item.name), ["บัตรเครดิต", "ผ่อน iPhone"]);
  });

  it("drops the one that was paid inside the cycle", () => {
    const entries = [payment("บัตรเครดิต", 2000, "2026-08-26T00:00:00.000Z")];
    const result = unpaidOwnDebts([card("บัตรเครดิต"), card("ผ่อน iPhone")], balances, entries, cycleRange);
    assert.deepEqual(result.map((item) => item.name), ["ผ่อน iPhone"]);
  });

  it("does not count a payment from another cycle", () => {
    const entries = [payment("บัตรเครดิต", 2000, "2026-07-26T00:00:00.000Z")];
    assert.equal(unpaidOwnDebts([card("บัตรเครดิต")], balances, entries, cycleRange).length, 1);
  });

  it("says nothing about a debt that is already clear, or about people who owe the user", () => {
    assert.equal(unpaidOwnDebts([card("บัตรเครดิต")], [{ name: "บัตรเครดิต", amount: 0 }], [], cycleRange).length, 0);
    assert.equal(unpaidOwnDebts([card("เพื่อนเอ", { kind: "lend" })], [{ name: "เพื่อนเอ", amount: 500 }], [], cycleRange).length, 0);
  });

  it("works out the minimum from the card's percentage, or the instalment", () => {
    const percent = unpaidOwnDebts([card("บัตรเครดิต", { credit_card_min_payment_percent: 10 })], balances, [], cycleRange);
    assert.equal(percent[0].minimum, 820);
    const instalment = unpaidOwnDebts([card("ผ่อน iPhone", { monthly_installment: 1031.55 })], balances, [], cycleRange);
    assert.equal(instalment[0].minimum, 1031.55);
  });
});

describe("spendingByDay", () => {
  it("totals what left the wallet on each day, keyed as the heatmap indexes it", () => {
    const totals = spendingByDay([makeFlow(1, -50), makeFlow(1, -25), makeFlow(0, -10), makeFlow(0, 900, "income")]);
    assert.equal(totals.get(new Date(dayBefore(1)).toDateString()), 75);
    assert.equal(totals.get(new Date(dayBefore(0)).toDateString()), 10);
  });

  it("leaves out the three types that move a wallet without spending", () => {
    const totals = spendingByDay([
      makeFlow(0, -2179.96, "balance_adjustment"),
      makeFlow(0, -500, "transfer"),
      makeFlow(0, -1000, "investment_buy"),
      makeFlow(0, -40),
    ]);
    assert.equal(totals.get(new Date(dayBefore(0)).toDateString()), 40);
  });

  it("has no key at all for a day that only holds an adjustment", () => {
    // A day with nothing spent must stay an unlit cell, not a bucket-1 square.
    const totals = spendingByDay([makeFlow(2, -2179.96, "balance_adjustment")]);
    assert.equal(totals.size, 0);
  });
});

describe("summarizeDayEntries", () => {
  it("splits the day into what came in and what went out, with the largest expense", () => {
    const summary = summarizeDayEntries([makeFlow(0, -50), makeFlow(0, -120), makeFlow(0, 900, "income")]);
    assert.equal(summary.count, 3);
    assert.equal(summary.income, 900);
    assert.equal(summary.outflow, 170);
    assert.equal(summary.top?.wallet_impact, -120);
  });

  it("counts an adjustment as a row but not as money spent", () => {
    // The screen this feeds showed a reconciliation as both the day's entire
    // outflow and its "largest transaction".
    const summary = summarizeDayEntries([makeFlow(0, -2179.96, "balance_adjustment")]);
    assert.equal(summary.count, 1);
    assert.equal(summary.income, 0);
    assert.equal(summary.outflow, 0);
    assert.equal(summary.top, null);
  });

  it("keeps an upward adjustment out of the day's income", () => {
    const summary = summarizeDayEntries([makeFlow(0, 300, "balance_adjustment"), makeFlow(0, 900, "income")]);
    assert.equal(summary.count, 2);
    assert.equal(summary.income, 900);
  });
});

describe("buildWalletInsight", () => {
  const cycleEnd = new Date(Date.now() + 10 * MS_PER_DAY);

  it("says the opening balance was never set when there is no wallet", () => {
    // Zero with no wallet is not a quiet month -- it is an app that cannot
    // count anything yet, and the hero has to say which one it is.
    const insight = buildWalletInsight(0, 0, cycleEnd, false);
    assert.equal(insight.label, "ยังไม่เริ่ม");
    assert.equal(insight.perDay, 0);
  });

  it("reads a real wallet that has spent nothing yet as a fresh cycle", () => {
    const insight = buildWalletInsight(5000, 0, cycleEnd, true);
    assert.equal(insight.label, "เริ่มรอบใหม่");
  });

  it("defaults to having a wallet, so existing callers are unchanged", () => {
    assert.equal(buildWalletInsight(-500, 100, cycleEnd).label, "ต้องระวัง");
  });
});

describe("buildSetupChecklist", () => {
  const empty = { walletCount: 0, entryCount: 0, budgetCount: 0, recurringCount: 0, pinEnabled: false };

  it("points a brand-new account at the wallet first", () => {
    const { steps, remaining, next } = buildSetupChecklist(empty);
    assert.equal(steps.length, 4);
    assert.equal(remaining, 4);
    assert.equal(next?.key, "wallet");
  });

  it("counts either a budget or a recurring bill as planning done", () => {
    assert.equal(buildSetupChecklist({ ...empty, budgetCount: 1 }).steps[2].done, true);
    assert.equal(buildSetupChecklist({ ...empty, recurringCount: 1 }).steps[2].done, true);
  });

  it("stops asking once everything but the PIN is done, so it cannot nag forever", () => {
    const running = buildSetupChecklist({ walletCount: 1, entryCount: 40, budgetCount: 2, recurringCount: 0, pinEnabled: false });
    assert.equal(running.coreDone, true);
    assert.equal(running.remaining, 1);
  });

  it("has nothing left for an account that arrived already set up", () => {
    const { remaining, next } = buildSetupChecklist({ walletCount: 2, entryCount: 300, budgetCount: 3, recurringCount: 2, pinEnabled: true });
    assert.equal(remaining, 0);
    assert.equal(next, null);
  });
});

describe("similarEntries", () => {
  const at = (day: number) => new Date(2026, 8, day, 12, 0).toISOString();
  const row = (id: string, title: string, category: string, day: number, extra: Partial<Entry> = {}): Entry => ({
    ...makeEntry(title, 60, at(day)), id, category, ...extra,
  });

  it("puts the same title first, then the same category, newest first, without the entry itself", () => {
    const entry = row("a", "ข้าวมันไก่", "อาหาร", 20);
    const entries = [
      entry,
      row("b", "ก๋วยเตี๋ยว", "อาหาร", 19),
      row("c", " ข้าวมันไก่", "อาหาร", 10),
      row("d", "ข้าวมันไก่", "อาหาร", 15),
      row("e", "BTS", "เดินทาง", 21),
    ];
    assert.deepEqual(similarEntries(entry, entries, 10).map((item) => item.id), ["d", "c", "b"]);
  });

  it("leaves out the other rows of the same event", () => {
    const entry = row("a", "โอนเข้าออม", "อื่น ๆ", 20, { transfer_group_id: "g1" });
    const entries = [entry, row("b", "โอนเข้าออม", "อื่น ๆ", 20, { transfer_group_id: "g1" }), row("c", "โอนเข้าออม", "อื่น ๆ", 1)];
    assert.deepEqual(similarEntries(entry, entries, 10).map((item) => item.id), ["c"]);
  });

  it("stops at the limit", () => {
    const entry = row("a", "กาแฟ", "อาหาร", 20);
    const entries = [entry, ...Array.from({ length: 8 }, (_, index) => row(`x${index}`, "กาแฟ", "อาหาร", index + 1))];
    assert.equal(similarEntries(entry, entries, 6).length, 6);
  });
});

describe("sameTitleSummary", () => {
  it("counts rows of the same title and kind, and adds what each shows", () => {
    const entry = { ...makeEntry("กาแฟ", 65, new Date(2026, 8, 20).toISOString()), id: "a" };
    const entries = [
      entry,
      { ...makeEntry("กาแฟ ", 50, new Date(2026, 8, 19).toISOString()), id: "b" },
      { ...makeEntry("กาแฟ", 999, new Date(2026, 8, 18).toISOString()), id: "c", type: "income" as const, wallet_impact: 999 },
    ];
    assert.deepEqual(sameTitleSummary(entry, entries), { count: 2, total: 115 });
  });
});

describe("buildUpcoming", () => {
  const base = { entries: [] as Entry[], goals: [], windowDays: 30 };

  it("shows a bill due on the 1st as tomorrow on the 30th, across the cycle's edge", () => {
    // The cycle ends on the 30th (the next one starts on the 1st), and the
    // bill charges on the 1st: tomorrow, not next cycle's business.
    const now = new Date(2026, 8, 30, 21, 0);
    const bill = makeItem("ค่าเช่า", 8500, { id: "rent", anchor_date: "2026-07-01" });
    const items = buildUpcoming({ ...base, recurring: [bill], cycleEnd: new Date(2026, 9, 1), now });
    const rent = items.find((item) => item.kind === "bill")!;
    assert.equal(rent.daysUntil, 1);
    assert.equal(describeDaysUntil(rent.daysUntil), "พรุ่งนี้");
    assert.equal(items.find((item) => item.kind === "cycle")!.daysUntil, 1);
  });

  it("keeps to the window, leaves paused bills out, and puts the soonest first", () => {
    const now = new Date(2026, 8, 10, 9, 0);
    const recurring = [
      makeItem("ไกล", 100, { id: "far", anchor_date: "2026-10-20", interval_count: 12 }),
      makeItem("หยุดไว้", 100, { id: "paused", anchor_date: "2026-08-12", is_active: false }),
      makeItem("ค่าเน็ต", 599, { id: "net", anchor_date: "2026-08-14" }),
      makeItem("ค่าไฟ", 900, { id: "power", anchor_date: "2026-08-12" }),
    ];
    const goals = [
      { id: "g1", name: "ทริป", target: 1000, saved: 0, deadline: "2026-09-20" },
      { id: "g2", name: "ไกลมาก", target: 1000, saved: 0, deadline: "2027-01-01" },
    ];
    const items = buildUpcoming({ ...base, recurring, goals, cycleEnd: new Date(2026, 8, 25), now });
    assert.deepEqual(items.map((item) => item.key), ["bill:power", "bill:net", "goal:g1", "cycle"]);
  });

  it("does not list the cycle when the new one starts today", () => {
    const now = new Date(2026, 8, 25, 9, 0);
    assert.deepEqual(buildUpcoming({ ...base, recurring: [], cycleEnd: new Date(2026, 8, 25), now }), []);
  });
});
