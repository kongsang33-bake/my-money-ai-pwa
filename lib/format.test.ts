import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clampInteger, formatChatTime, formatSignedMoney, normalizeBillingDay, roundMoney, roundMoneyDeep, toFiniteNumber, toMoneyAmount } from "./format.ts";

describe("toFiniteNumber", () => {
  it("parses numeric strings", () => {
    assert.equal(toFiniteNumber("42.5"), 42.5);
  });

  it("falls back to the given fallback for non-numeric input", () => {
    assert.equal(toFiniteNumber("not a number", 7), 7);
    assert.equal(toFiniteNumber(undefined, 7), 7);
    assert.equal(toFiniteNumber(NaN, 7), 7);
  });

  it("defaults the fallback to 0", () => {
    assert.equal(toFiniteNumber("abc"), 0);
  });
});

describe("toMoneyAmount", () => {
  it("clamps negative amounts to 0", () => {
    assert.equal(toMoneyAmount(-50), 0);
  });

  it("passes through a valid positive amount", () => {
    assert.equal(toMoneyAmount("120.5"), 120.5);
  });
});

describe("clampInteger", () => {
  it("clamps to the max", () => {
    assert.equal(clampInteger(50, 1, 28, 1), 28);
  });

  it("clamps to the min", () => {
    assert.equal(clampInteger(-5, 1, 28, 1), 1);
  });

  it("truncates a non-integer within range", () => {
    assert.equal(clampInteger(15.9, 1, 28, 1), 15);
  });

  it("falls back when the input isn't a finite number", () => {
    assert.equal(clampInteger("garbage", 1, 28, 5), 5);
  });
});

describe("normalizeBillingDay", () => {
  it("accepts a valid day of month", () => {
    assert.equal(normalizeBillingDay(15), 15);
  });

  it("clamps an out-of-range day into 1-31", () => {
    assert.equal(normalizeBillingDay(45), 31);
    assert.equal(normalizeBillingDay(0), 1);
  });
});

describe("formatSignedMoney", () => {
  it("prefixes a positive amount with +", () => {
    assert.equal(formatSignedMoney(100), "+฿ 100");
  });

  it("prefixes a negative amount with a minus sign (U+2212, not a hyphen)", () => {
    assert.equal(formatSignedMoney(-100), "−฿ 100");
    assert.ok(formatSignedMoney(-100).startsWith("−"));
  });

  it("treats zero as non-negative", () => {
    assert.equal(formatSignedMoney(0), "+฿ 0");
  });
});

describe("formatChatTime", () => {
  const now = new Date(2026, 8, 2, 14, 30);

  it("shows only the clock for a message sent today", () => {
    const stamp = formatChatTime(new Date(2026, 8, 2, 9, 5).toISOString(), now);
    assert.match(stamp, /^\d{2}:\d{2}$/);
  });

  it("adds the day once the message is from another date", () => {
    // Without this an old thread reads as if every message arrived today.
    const stamp = formatChatTime(new Date(2026, 7, 28, 9, 5).toISOString(), now);
    assert.ok(stamp.length > 5, `expected a dated stamp, got ${stamp}`);
    assert.match(stamp, /\d{2}:\d{2}$/);
  });

  it("does not treat the same day-of-month in another month as today", () => {
    const stamp = formatChatTime(new Date(2026, 7, 2, 14, 30).toISOString(), now);
    assert.ok(stamp.length > 5, `expected a dated stamp, got ${stamp}`);
  });
});

describe("roundMoney", () => {
  it("clears the float noise a run of sums accumulates", () => {
    // The exact values the AI chat quoted back at the user, digit for digit.
    assert.equal(roundMoney(11886.669999999998), 11886.67);
    assert.equal(roundMoney(11848.330000000002), 11848.33);
  });

  it("leaves whole numbers and already-clean amounts alone", () => {
    assert.equal(roundMoney(23735), 23735);
    assert.equal(roundMoney(12840.29), 12840.29);
    assert.equal(roundMoney(0), 0);
  });

  it("handles negatives", () => {
    assert.equal(roundMoney(-11886.669999999998), -11886.67);
    // Math.round breaks an exact half toward +Infinity, where formatMoney's
    // toLocaleString breaks it away from zero -- so the two can disagree by a
    // satang on a value landing exactly on .xx5, which a float sum does not
    // produce. Pinned so the difference is a known one, not a surprise.
    assert.equal(roundMoney(-0.015), -0.01);
  });
});

describe("roundMoneyDeep", () => {
  it("reaches every number in a nested payload", () => {
    const context = {
      totals: { balance: 11886.669999999998, income: 23735 },
      walletBalances: [{ name: "หลัก", balance: 12840.289999999999 }],
      categories: [{ category: "อาหาร", amount: 1840.0000000000002 }],
    };
    assert.deepEqual(roundMoneyDeep(context), {
      totals: { balance: 11886.67, income: 23735 },
      walletBalances: [{ name: "หลัก", balance: 12840.29 }],
      categories: [{ category: "อาหาร", amount: 1840 }],
    });
  });

  it("leaves non-numbers untouched, including the ISO dates in the payload", () => {
    const context = { occurred_at: "2026-09-02T06:00:00.000Z", title: "กาแฟ", note: null, flagged: true };
    assert.deepEqual(roundMoneyDeep(context), context);
  });

  it("passes non-finite numbers through rather than turning them into NaN maths", () => {
    assert.deepEqual(roundMoneyDeep({ a: Infinity, b: NaN }), { a: Infinity, b: NaN });
  });
});
