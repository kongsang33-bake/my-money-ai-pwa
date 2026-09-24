import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { blockingDraftIds, draftAttention, draftEffects, draftFacts, newDebtorNames } from "./draft-review.ts";
import { draftTotals, normalizeEntry } from "./money.ts";
import type { Debtor, Draft, Wallet } from "./types.ts";

function wallet(overrides: Partial<Wallet> = {}): Wallet {
  return { id: "cash", user_id: "u1", name: "เงินสด", tag: "cash", balance: 0, icon: null, icon_color: null, is_default: true, ...overrides };
}

function debtor(overrides: Partial<Debtor> = {}): Debtor {
  return {
    id: "d1", user_id: "u1", name: "จูน", note: null, opening_balance: 0, kind: "lend",
    monthly_installment: null, total_installments: null, credit_limit: null,
    credit_card_min_payment_percent: null, icon: null, icon_color: null, ...overrides,
  };
}

// Built through normalizeEntry, the way the AI parse and the fixture build one,
// so the impacts are the real ones and not hand-typed.
function draft(overrides: Partial<Draft> = {}): Draft {
  return normalizeEntry({
    id: "d-1", title: "ข้าว", category: "อาหาร", amount: 100, transaction_type: "personal_expense",
    debtor_name: "", occurred_at: new Date().toISOString(), wallet_id: "cash", ...overrides,
  }, false) as Draft;
}

const wallets = [wallet(), wallet({ id: "bank", name: "กสิกร", tag: "savings", is_default: false })];
const texts = (items: { text: string }[]) => items.map((item) => item.text);

describe("draftEffects", () => {
  it("says a plain expense leaves its wallet, and nothing else", () => {
    assert.deepEqual(texts(draftEffects(draft(), wallets, [])), ["จ่ายจาก เงินสด ฿ 100"]);
  });

  it("names the wallet the draft actually points at", () => {
    assert.deepEqual(texts(draftEffects(draft({ wallet_id: "bank" }), wallets, [])), ["จ่ายจาก กสิกร ฿ 100"]);
  });

  it("spells out a split: the wallet, who owes what, and the user's own share", () => {
    // The screenshot this came from: 15 split two ways with จูน read as
    // "กระเป๋า −฿15 หนี้ +฿7.5".
    const effects = texts(draftEffects(draft({ amount: 15, transaction_type: "split_half", debtor_name: "จูน" }), wallets, [debtor()]));
    assert.deepEqual(effects, ["จ่ายจาก เงินสด ฿ 15", "จูน ติดคุณเพิ่ม ฿ 7.5", "เป็นรายจ่ายของคุณ ฿ 7.5"]);
  });

  it("folds a party of equal shares into one phrase", () => {
    const effects = texts(draftEffects(draft({ amount: 1500, transaction_type: "split_half", debtor_name: "อ้อน, แบงค์, วิน, พี่พัก" }), wallets, []));
    assert.deepEqual(effects, ["จ่ายจาก เงินสด ฿ 1,500", "4 คนติดคุณคนละ ฿ 300 · รวม ฿ 1,200", "เป็นรายจ่ายของคุณ ฿ 300"]);
  });

  it("puts a card-paid bill on the card, not the wallet", () => {
    const effects = texts(draftEffects(
      draft({ amount: 163, transaction_type: "split_half", debtor_name: "จูน", funding_card_name: "บัตรเครดิต" }),
      wallets,
      [debtor(), debtor({ id: "d2", name: "บัตรเครดิต", kind: "own" })],
    ));
    assert.ok(!effects.some((text) => text.startsWith("จ่ายจาก")), effects.join(" | "));
    assert.ok(effects.includes("คุณติด บัตรเครดิต เพิ่ม ฿ 163"), effects.join(" | "));
    assert.ok(effects.includes("จูน ติดคุณเพิ่ม ฿ 81.5"), effects.join(" | "));
  });

  it("takes a bill fronted by someone who owes the user off their balance", () => {
    const effects = texts(draftEffects(draft({ amount: 70, funding_card_name: "จูน" }), wallets, [debtor()]));
    assert.deepEqual(effects, ["จูน ติดคุณลดลง ฿ 70", "เป็นรายจ่ายของคุณ ฿ 70"]);
  });

  it("says a transfer moves money between two wallets", () => {
    const effects = texts(draftEffects(draft({ amount: 500, transaction_type: "transfer", wallet_id: "cash", transfer_to_wallet_id: "bank" }), wallets, []));
    assert.deepEqual(effects, ["ย้าย ฿ 500 จาก เงินสด ไป กสิกร"]);
  });

  it("agrees with the batch total underneath it", () => {
    const items = [
      draft({ amount: 15, transaction_type: "split_half", debtor_name: "จูน" }),
      draft({ id: "d-2", amount: 40 }),
    ];
    const outOfWallet = items
      .flatMap((item) => draftEffects(item, wallets, [debtor()]))
      .filter((effect) => effect.tone === "out")
      .reduce((sum, effect) => sum + Number(effect.text.replace(/[^\d.]/g, "")), 0);
    assert.equal(-outOfWallet, draftTotals(items, wallets, [debtor()]).wallet);
  });
});

describe("draftFacts", () => {
  it("shows every value the AI guessed", () => {
    const facts = draftFacts(draft({ transaction_type: "split_half", debtor_name: "จูน", note: "มื้อเย็น" }), wallets);
    assert.deepEqual(facts.map((fact) => fact.key), ["type", "date", "source", "people", "note"]);
    assert.equal(facts.find((fact) => fact.key === "date")?.text, "วันนี้");
    assert.equal(facts.find((fact) => fact.key === "source")?.text, "เงินสด");
  });

  it("names whoever fronted the bill instead of a wallet", () => {
    const facts = draftFacts(draft({ funding_card_name: "อ้อน" }), wallets);
    assert.equal(facts.find((fact) => fact.key === "source")?.text, "อ้อน ออกให้ก่อน");
  });

  it("counts the user into a named party's headcount", () => {
    const facts = draftFacts(draft({ transaction_type: "split_half", debtor_name: "อ้อน, แบงค์" }), wallets);
    assert.equal(facts.find((fact) => fact.key === "people")?.text, "อ้อน, แบงค์ · หาร 3 คน");
  });
});

describe("draftAttention", () => {
  it("has nothing to say about a plain expense", () => {
    assert.deepEqual(draftAttention(draft(), []), []);
  });

  it("blocks a transfer with nowhere to go", () => {
    const reasons = draftAttention(draft({ transaction_type: "transfer", transfer_to_wallet_id: null }), []);
    assert.deepEqual(reasons, [{ text: "ยังไม่ได้เลือกกระเป๋าปลายทาง", blocking: true }]);
  });

  it("blocks a split whose pinned shares miss the bill", () => {
    const reasons = draftAttention(draft({ amount: 900, transaction_type: "lend", debtor_name: "อ้อน, แบงค์", split_shares: [100, 100] }), [debtor({ name: "อ้อน" }), debtor({ name: "แบงค์" })]);
    assert.ok(reasons.some((reason) => reason.blocking), JSON.stringify(reasons));
  });

  it("flags, without blocking, a guess and a name it has never seen", () => {
    const reasons = draftAttention(draft({ transaction_type: "lend", debtor_name: "พี่แอน", ambiguous: true }), []);
    assert.deepEqual(reasons.map((reason) => reason.blocking), [false, false]);
    assert.ok(reasons[1].text.includes("พี่แอน"));
  });

  it("asks for a name on a debt that has none", () => {
    assert.ok(draftAttention(draft({ transaction_type: "lend", debtor_name: "" }), []).some((reason) => reason.text === "ยังไม่ได้ใส่ชื่อคน"));
  });
});

describe("newDebtorNames", () => {
  it("matches known names however they were spaced or cased", () => {
    assert.deepEqual(newDebtorNames(draft({ transaction_type: "split_half", debtor_name: " จูน , Bank" }), [debtor(), debtor({ name: "bank" })]), []);
  });

  it("counts whoever fronted the bill, unless either book already has them", () => {
    assert.deepEqual(newDebtorNames(draft({ funding_card_name: "อ้อน" }), [debtor()]), ["อ้อน"]);
    assert.deepEqual(newDebtorNames(draft({ funding_card_name: "จูน" }), [debtor()]), []);
  });

  it("looks in the book the type writes to", () => {
    // จูน owes the user; borrowing from her opens the other book.
    assert.deepEqual(newDebtorNames(draft({ transaction_type: "borrow", debtor_name: "จูน" }), [debtor()]), ["จูน"]);
  });
});

describe("blockingDraftIds", () => {
  it("lists only the drafts that stop the save, in order", () => {
    const items = [
      draft({ id: "a", ambiguous: true, transaction_type: "gift" }),
      draft({ id: "b", transaction_type: "transfer", transfer_to_wallet_id: null }),
      draft({ id: "c" }),
    ];
    assert.deepEqual(blockingDraftIds(items, []), ["b"]);
  });
});
