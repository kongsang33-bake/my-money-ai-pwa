import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canLogAgain, repeatDraftFromEntry } from "./repeat-entry.ts";
import { normalizeEntry } from "./money.ts";
import type { Entry, Wallet } from "./types.ts";

const entry = (overrides: Partial<Entry> = {}): Entry => ({
  ...normalizeEntry({
    id: "e1", title: "กาแฟ", category: "อาหาร", amount: 65, transaction_type: "personal_expense",
    occurred_at: "2026-11-01T08:00:00.000Z", wallet_id: "w1", note: "ร้านหน้าออฟฟิศ",
  }, false),
  ...overrides,
});

describe("canLogAgain", () => {
  it("allows a plain expense", () => {
    assert.equal(canLogAgain(entry()), true);
  });
  it("allows a loan to a named person", () => {
    assert.equal(canLogAgain(entry({ transaction_type: "lend", debtor_name: "จูน" })), true);
  });
  it("refuses one leg of a paired event", () => {
    assert.equal(canLogAgain(entry({ transfer_group_id: "g1" })), false);
  });
  it("refuses a transfer", () => {
    assert.equal(canLogAgain(entry({ transaction_type: "transfer" })), false);
  });
  it("refuses a balance adjustment and an investment purchase", () => {
    assert.equal(canLogAgain(entry({ transaction_type: "balance_adjustment" })), false);
    assert.equal(canLogAgain(entry({ transaction_type: "investment_buy" })), false);
    assert.equal(canLogAgain(entry({ investment_id: "i1" })), false);
  });
});

const wallet = (id: string, is_default = false): Wallet => ({ id, user_id: "u", name: id, tag: "cash", balance: 0, icon: null, icon_color: null, is_default });
const wallets = [wallet("w1"), wallet("w2", true)];

describe("repeatDraftFromEntry", () => {
  const draft = repeatDraftFromEntry(entry({ transaction_type: "lend", debtor_name: "จูน" }), "2026-11-21T09:00:00.000Z", "d1", wallets);
  it("keeps what it was, who with and from where", () => {
    assert.equal(draft.title, "กาแฟ");
    assert.equal(draft.category, "อาหาร");
    assert.equal(draft.amount, 65);
    assert.equal(draft.transaction_type, "lend");
    assert.equal(draft.debtor_name, "จูน");
    assert.equal(draft.wallet_id, "w1");
  });
  it("is new, dated now, and says where it came from", () => {
    assert.equal(draft.id, "d1");
    assert.equal(draft.occurred_at, "2026-11-21T09:00:00.000Z");
    assert.equal(draft.source_text, "จดซ้ำ");
  });
  it("leaves the old day's note behind", () => {
    assert.ok(!draft.note);
  });

  it("keeps a split's own share rather than falling back to half", () => {
    const split = entry({ transaction_type: "split_half", amount: 300, debtor_name: "จูน", partner_share: 100 });
    const again = repeatDraftFromEntry(split, "2026-11-21T09:00:00.000Z", "d2", wallets);
    assert.equal(again.partner_share, 100);
    assert.equal(again.debt_impact, 100);
    assert.equal(again.user_share, 200);
  });

  it("falls back to the default wallet when the old one is gone", () => {
    assert.equal(repeatDraftFromEntry(entry({ wallet_id: "deleted" }), "2026-11-21T09:00:00.000Z", "d3", wallets).wallet_id, "w2");
    assert.equal(repeatDraftFromEntry(entry({ wallet_id: null }), "2026-11-21T09:00:00.000Z", "d4", wallets).wallet_id, "w2");
  });
});
