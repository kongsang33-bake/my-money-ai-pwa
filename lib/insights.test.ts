import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isRecurringLogged } from "./insights.ts";
import type { Entry, RecurringExpense } from "./types.ts";

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
