import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAiExamples, buildCategoryMemory, textSimilarity } from "./ai-memory.ts";
import type { Entry } from "./types.ts";
import type { TransactionType } from "./taxonomy.ts";

function makeEntry(overrides: Partial<Entry> & { title: string }): Entry {
  const amount = overrides.amount ?? 100;
  const transaction_type: TransactionType = overrides.transaction_type ?? "personal_expense";
  return {
    id: overrides.id ?? overrides.title,
    category: "อื่น ๆ",
    amount,
    type: "expense",
    transaction_type,
    wallet_impact: -amount,
    debt_impact: 0,
    user_share: amount,
    partner_share: 0,
    debtor_name: "ไม่ระบุ",
    occurred_at: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

// A saved transfer is two rows sharing a transfer_group_id -- coins out of the
// petty wallet, notes into the cash wallet (see expandTransferDraft).
function makeTransferLegs(title: string, occurred_at: string, groupId = "g1") {
  return [
    makeEntry({ id: `${groupId}-out`, title, transaction_type: "transfer", wallet_impact: -100, user_share: 0, wallet_id: "petty", transfer_group_id: groupId, occurred_at }),
    makeEntry({ id: `${groupId}-in`, title, transaction_type: "transfer", wallet_impact: 100, user_share: 0, wallet_id: "cash", transfer_group_id: groupId, occurred_at }),
  ];
}

describe("textSimilarity", () => {
  it("ignores digits, spaces and punctuation", () => {
    assert.equal(textSimilarity("ลูกบ้านแลกเหรียญ 100 บาท", "ลูกบ้านแลกเหรียญ100บาท"), 1);
  });

  it("scores unrelated Thai phrases near zero", () => {
    assert.ok(textSimilarity("ลูกบ้านแลกเหรียญ", "ค่ากาแฟร้านประจำ") < 0.1);
  });

  it("scores a reworded version of the same phrase highly", () => {
    assert.ok(textSimilarity("ลูกบ้านแลกเหรียญ 100", "ลูกบ้านแลกเหรียญ") > 0.6);
  });

  it("is zero when either side has no letters", () => {
    assert.equal(textSimilarity("100", "ลูกบ้านแลกเหรียญ"), 0);
  });
});

describe("buildCategoryMemory", () => {
  it("keeps the most recent category per title", () => {
    const memory = buildCategoryMemory([
      makeEntry({ title: "ข้าวเที่ยง", category: "อื่น ๆ", occurred_at: "2026-08-01T00:00:00.000Z" }),
      makeEntry({ id: "2", title: "ข้าวเที่ยง", category: "อาหาร", occurred_at: "2026-08-20T00:00:00.000Z" }),
    ]);
    assert.equal(memory.get("ข้าวเที่ยง"), "อาหาร");
  });
});

describe("buildAiExamples", () => {
  it("returns the past entry whose wording matches the new text", () => {
    const entries = [
      makeEntry({ title: "ค่ากาแฟ", category: "อาหาร" }),
      ...makeTransferLegs("ลูกบ้านแลกเหรียญ", "2026-08-30T00:00:00.000Z"),
    ];
    const examples = buildAiExamples(entries, "ลูกบ้านแลกเหรียญ 100 บาท");
    assert.equal(examples.length, 1);
    assert.deepEqual(examples[0], {
      text: "ลูกบ้านแลกเหรียญ",
      transaction_type: "transfer",
      category: "อื่น ๆ",
      wallet_id: "petty",
      transfer_to_wallet_id: "cash",
      debtor_name: "ไม่ระบุ",
    });
  });

  it("returns nothing when no past entry is similar enough", () => {
    const entries = [makeEntry({ title: "ค่ากาแฟ", category: "อาหาร" })];
    assert.deepEqual(buildAiExamples(entries, "ลูกบ้านแลกเหรียญ 100 บาท"), []);
  });

  it("matches on the original AI input text, not just the renamed title", () => {
    const entries = [makeEntry({ title: "เก็บเหรียญเครื่องซักผ้า", source_text: "ลูกบ้านแลกเหรียญ 200", transaction_type: "income", wallet_id: "petty" })];
    const examples = buildAiExamples(entries, "ลูกบ้านแลกเหรียญ 100");
    assert.equal(examples.length, 1);
    assert.equal(examples[0].text, "เก็บเหรียญเครื่องซักผ้า");
  });

  it("dedupes repeated titles, keeping the newest, and respects the limit", () => {
    const entries = [
      ...makeTransferLegs("ลูกบ้านแลกเหรียญ", "2026-07-01T00:00:00.000Z", "old"),
      ...makeTransferLegs("ลูกบ้านแลกเหรียญ", "2026-08-30T00:00:00.000Z", "new"),
      makeEntry({ title: "ลูกบ้านแลกเหรียญเพิ่ม", transaction_type: "income", wallet_id: "petty" }),
    ];
    const examples = buildAiExamples(entries, "ลูกบ้านแลกเหรียญ 100");
    assert.deepEqual(examples.map((example) => example.text), ["ลูกบ้านแลกเหรียญ", "ลูกบ้านแลกเหรียญเพิ่ม"]);
    assert.equal(buildAiExamples(entries, "ลูกบ้านแลกเหรียญ 100", 1).length, 1);
  });

  it("returns nothing for an empty input", () => {
    assert.deepEqual(buildAiExamples([makeEntry({ title: "ค่ากาแฟ" })], "   "), []);
  });
});
