import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cycleBounds, entriesInRange, nextBillingInfo, shiftMonthKey } from "./cycle.ts";
import type { Entry } from "./types.ts";

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
  const monthly = (anchor_date: string, interval_count = 1) => ({ anchor_date, interval_unit: "month" as const, interval_count });
  const weekly = (anchor_date: string, interval_count = 1) => ({ anchor_date, interval_unit: "week" as const, interval_count });

  it("clamps a day-31 anchor to the 28th in February (non-leap year)", () => {
    const now = new Date(2026, 1, 1); // Feb 1, 2026 (not a leap year)
    const { billingDate } = nextBillingInfo(monthly("2026-01-31"), now);
    assert.equal(billingDate.getMonth(), 1);
    assert.equal(billingDate.getDate(), 28);
  });

  it("goes back to the 31st in March rather than staying on February's 28th", () => {
    // The bug this guards: stepping a month on from the *clamped* date walks
    // the bill permanently backwards, losing a day a year.
    const { billingDate } = nextBillingInfo(monthly("2026-01-31"), new Date(2026, 2, 1));
    assert.equal(billingDate.getMonth(), 2);
    assert.equal(billingDate.getDate(), 31);
  });

  it("rolls to next month once this month's billing date has passed", () => {
    const now = new Date(2026, 2, 20); // March 20, 2026
    const { billingDate, daysUntil } = nextBillingInfo(monthly("2026-01-05"), now);
    assert.equal(billingDate.getMonth(), 3); // April
    assert.equal(billingDate.getDate(), 5);
    assert.ok(daysUntil > 0);
  });

  it("billing today counts as 0 days until", () => {
    const now = new Date(2026, 2, 15);
    assert.equal(nextBillingInfo(monthly("2026-01-15"), now).daysUntil, 0);
  });

  it("leaves a bill that has not started yet on its first billing date", () => {
    // A first charge next month is the answer, not a date to roll forward
    // from -- which is the whole reason the schedule is a date and not a day.
    const { billingDate, daysUntil } = nextBillingInfo(monthly("2026-04-10"), new Date(2026, 2, 15));
    assert.equal(billingDate.getMonth(), 3);
    assert.equal(billingDate.getDate(), 10);
    assert.equal(daysUntil, 26);
  });

  it("keeps a quarterly bill on its own quarters, not on the next month", () => {
    const { billingDate } = nextBillingInfo(monthly("2026-01-10", 3), new Date(2026, 2, 15));
    assert.equal(billingDate.getMonth(), 3); // April, not March
    assert.equal(billingDate.getDate(), 10);
  });

  it("skips a whole year for a yearly bill whose date has passed", () => {
    const { billingDate } = nextBillingInfo(monthly("2026-03-01", 12), new Date(2026, 2, 15));
    assert.equal(billingDate.getFullYear(), 2027);
    assert.equal(billingDate.getMonth(), 2);
    assert.equal(billingDate.getDate(), 1);
  });

  it("lands on the same weekday for a weekly bill anchored long ago", () => {
    const { billingDate } = nextBillingInfo(weekly("2024-01-03"), new Date(2026, 2, 15));
    assert.equal(billingDate.getDay(), new Date(2024, 0, 3).getDay());
    assert.ok(billingDate >= new Date(2026, 2, 15));
    assert.ok(billingDate < new Date(2026, 2, 22));
  });

  it("counts a fortnightly bill in two-week steps", () => {
    const { billingDate } = nextBillingInfo(weekly("2026-03-02", 2), new Date(2026, 2, 3));
    assert.equal(billingDate.getMonth(), 2);
    assert.equal(billingDate.getDate(), 16);
  });

  it("falls back to today rather than an invalid date when the anchor is unusable", () => {
    const { daysUntil } = nextBillingInfo(monthly(""), new Date());
    assert.equal(daysUntil, 0);
  });
});

describe("shiftMonthKey", () => {
  it("shifts across a year boundary in both directions", () => {
    assert.equal(shiftMonthKey("2026-01", -1), "2025-12");
    assert.equal(shiftMonthKey("2025-12", 1), "2026-01");
  });
});
