import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clampInteger, formatSignedMoney, normalizeBillingDay, toFiniteNumber, toMoneyAmount } from "./format.ts";

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
