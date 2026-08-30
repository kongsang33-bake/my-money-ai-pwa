import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cycleBounds, entriesInRange, nextBillingInfo, shiftMonthKey } from "./cycle.ts";
import type { Entry, RecurringExpense } from "./types.ts";

describe("cycleBounds", () => {
  it("startDay 1 matches the plain calendar month", () => {
    const { start, end } = cycleBounds("2026-03", 1);
    assert.equal(start.toISOString().slice(0, 10), "2026-03-01");
    assert.equal(end.toISOString().slice(0, 10), "2026-04-01");
  });

  it("startDay 15 into a short month (Feb): majority falls short of the requested key, so it shifts back a month", () => {
    // Starting the "2026-02" cycle directly at Feb 15 would run through
    // Mar 15 -- 13 days in Feb, 15 in March, so its own majority key is
    // "2026-03", not "2026-02". cycleBounds falls back to the cycle
    // starting a month earlier (Jan 15 - Feb 15) instead, whose majority
    // (17 days in Feb) genuinely is "2026-02".
    const { start, end } = cycleBounds("2026-02", 15);
    assert.equal(start.toISOString().slice(0, 10), "2026-01-15");
    assert.equal(end.toISOString().slice(0, 10), "2026-02-15");
  });

  it("startDay 28 near a December/January boundary", () => {
    const { start, end } = cycleBounds("2026-01", 28);
    assert.equal(start.getFullYear(), 2025);
    assert.equal(start.getMonth(), 11); // December
    assert.equal(start.getDate(), 28);
    assert.equal(end.getFullYear(), 2026);
    assert.equal(end.getMonth(), 0); // January
    assert.equal(end.getDate(), 28);
  });
});

describe("entriesInRange", () => {
  function makeEntry(occurred_at: string): Entry {
    return {
      id: occurred_at, title: "x", category: "อื่น ๆ", amount: 1, type: "expense",
      transaction_type: "personal_expense", wallet_impact: -1, debt_impact: 0,
      user_share: 1, partner_share: 0, debtor_name: "ไม่ระบุ", occurred_at,
    };
  }

  it("includes the start boundary and excludes the end boundary", () => {
    const start = new Date("2026-03-01T00:00:00.000Z");
    const end = new Date("2026-04-01T00:00:00.000Z");
    const entries = [
      makeEntry("2026-02-28T23:59:59.999Z"),
      makeEntry("2026-03-01T00:00:00.000Z"),
      makeEntry("2026-03-31T23:59:59.999Z"),
      makeEntry("2026-04-01T00:00:00.000Z"),
    ];
    const result = entriesInRange(entries, start, end);
    assert.deepEqual(result.map((e) => e.id), ["2026-03-01T00:00:00.000Z", "2026-03-31T23:59:59.999Z"]);
  });
});

describe("nextBillingInfo", () => {
  function makeItem(billing_day: number): RecurringExpense {
    return { id: "r1", user_id: "u1", name: "Netflix", amount: 199, billing_day, icon: null, icon_color: null };
  }

  it("clamps billing_day 31 to the 28th in February (non-leap year)", () => {
    const now = new Date(2026, 1, 1); // Feb 1, 2026 (not a leap year)
    const { billingDate } = nextBillingInfo(makeItem(31), now);
    assert.equal(billingDate.getMonth(), 1);
    assert.equal(billingDate.getDate(), 28);
  });

  it("rolls to next month once this month's billing date has passed", () => {
    const now = new Date(2026, 2, 20); // March 20, 2026
    const { billingDate, daysUntil } = nextBillingInfo(makeItem(5), now);
    assert.equal(billingDate.getMonth(), 3); // April
    assert.equal(billingDate.getDate(), 5);
    assert.ok(daysUntil > 0);
  });

  it("billing today counts as 0 days until", () => {
    const now = new Date(2026, 2, 15);
    const { daysUntil } = nextBillingInfo(makeItem(15), now);
    assert.equal(daysUntil, 0);
  });
});

describe("shiftMonthKey", () => {
  it("shifts across a year boundary in both directions", () => {
    assert.equal(shiftMonthKey("2026-01", -1), "2025-12");
    assert.equal(shiftMonthKey("2025-12", 1), "2026-01");
  });
});
