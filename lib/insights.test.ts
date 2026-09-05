import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lastSevenDayCashFlow, isRecurringLogged, unpaidOwnDebts } from "./insights.ts";
import type { Debtor, Entry, RecurringExpense } from "./types.ts";
import type { TransactionType } from "./taxonomy.ts";
import { MS_PER_DAY } from "./constants.ts";

function makeItem(name: string, amount: number): RecurringExpense {
  return { id: "r1", user_id: "u1", name, amount, billing_day: 5, icon: null, icon_color: null };
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
  it("is false when no matching entry exists in the cycle", () => {
    const entries = [makeEntry("Netflix", 199, "2026-08-10T00:00:00.000Z")];
    assert.equal(isRecurringLogged(makeItem("Spotify", 129), entries, cycleRange), false);
  });

  it("is true when a matching title+amount entry exists in the cycle", () => {
    const entries = [makeEntry("Netflix", 199, "2026-08-10T00:00:00.000Z")];
    assert.equal(isRecurringLogged(makeItem("Netflix", 199), entries, cycleRange), true);
  });

  it("is false when the amount differs, even with the same title", () => {
    const entries = [makeEntry("Netflix", 199, "2026-08-10T00:00:00.000Z")];
    assert.equal(isRecurringLogged(makeItem("Netflix", 249), entries, cycleRange), false);
  });

  it("ignores a matching entry outside the cycle range", () => {
    const entries = [makeEntry("Netflix", 199, "2026-07-20T00:00:00.000Z")];
    assert.equal(isRecurringLogged(makeItem("Netflix", 199), entries, cycleRange), false);
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
