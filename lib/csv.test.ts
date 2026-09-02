import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildReportCsv, csvCell, csvRow } from "./csv.ts";
import { normalizeEntry } from "./money.ts";
import type { Entry, Wallet } from "./types.ts";
import type { TransactionType } from "./taxonomy.ts";

function makeEntry(
  overrides: { title: string; amount: number; occurred_at: string; transaction_type?: TransactionType } & Partial<Entry>,
): Entry {
  const { title, amount, occurred_at, transaction_type = "personal_expense", ...rest } = overrides;
  return normalizeEntry({ id: `${title}-${occurred_at}`, title, category: "อาหาร", amount, transaction_type, occurred_at, ...rest }, false);
}

const wallets: Wallet[] = [
  { id: "w1", user_id: "u1", name: "บัญชีหลัก", tag: "cash", balance: 1000, icon: null, icon_color: null, is_default: true },
  { id: "w2", user_id: "u1", name: 'กระเป๋า "ออม"', tag: "savings", balance: 500, icon: null, icon_color: null, is_default: false },
];

function buildAugust(entries: Entry[], extra: Partial<Parameters<typeof buildReportCsv>[0]> = {}) {
  return buildReportCsv({
    entries,
    wallets,
    receivableSummary: [],
    payableSummary: [],
    period: "month",
    selectedMonth: "2026-08",
    selectedYear: 2026,
    monthStartDay: 1,
    ...extra,
  });
}

describe("csvCell", () => {
  it("always quotes, so a comma in a title cannot split a column", () => {
    assert.equal(csvCell("ข้าว, น้ำ"), '"ข้าว, น้ำ"');
  });

  it("doubles embedded quotes, the CSV escape", () => {
    assert.equal(csvCell('เขา"ยืม"เงิน'), '"เขา""ยืม""เงิน"');
  });

  it("renders null and undefined as an empty cell, not the words", () => {
    assert.equal(csvCell(null), '""');
    assert.equal(csvCell(undefined), '""');
  });

  it("keeps 0 as 0 rather than blanking it", () => {
    // `value == null` and not `!value`: a falsy-check here would silently turn
    // every zero amount in the ledger into an empty cell.
    assert.equal(csvCell(0), '"0"');
    assert.equal(csvCell(""), '""');
  });

  it("keeps a newline inside the quoted cell", () => {
    assert.equal(csvCell("บรรทัด1\nบรรทัด2"), '"บรรทัด1\nบรรทัด2"');
  });
});

describe("csvRow", () => {
  it("joins quoted cells with commas", () => {
    assert.equal(csvRow(["a", 1, null]), '"a","1",""');
  });

  it("emits an empty row for an empty list", () => {
    assert.equal(csvRow([]), "");
  });
});

describe("buildReportCsv", () => {
  const inAugust = [
    makeEntry({ title: "กาแฟ", amount: 100, occurred_at: "2026-08-05T03:00:00.000Z" }),
    makeEntry({ title: "เงินเดือน", amount: 45000, occurred_at: "2026-08-01T03:00:00.000Z", transaction_type: "income" }),
  ];

  it("starts with a UTF-8 BOM so Excel opens Thai text correctly", () => {
    // Without it Excel reads the file as the local ANSI codepage and every
    // Thai字 comes out as mojibake -- the single most likely way a report
    // "looks broken" to someone who never opens a text editor.
    assert.equal(buildAugust(inAugust).charCodeAt(0), 0xfeff);
  });

  it("separates rows with CRLF", () => {
    const csv = buildAugust(inAugust);
    assert.ok(csv.includes("\r\n"));
    assert.ok(!/[^\r]\n/.test(csv.replace(/\r\n/g, "")), "no bare LF row separators");
  });

  it("totals income and outflow for the period", () => {
    const csv = buildAugust(inAugust);
    assert.ok(csv.includes('"รายรับ","45000"'), csv.slice(0, 400));
    assert.ok(csv.includes('"รายจ่าย","100"'));
    assert.ok(csv.includes('"สุทธิ","44900"'));
    assert.ok(csv.includes('"จำนวนรายการ","2"'));
  });

  it("excludes entries outside the selected cycle", () => {
    const csv = buildAugust([
      ...inAugust,
      makeEntry({ title: "นอกรอบ", amount: 999, occurred_at: "2026-07-15T03:00:00.000Z" }),
    ]);
    assert.ok(!csv.includes("นอกรอบ"));
    assert.ok(csv.includes('"จำนวนรายการ","2"'), "the out-of-range row must not be counted either");
  });

  it("orders the ledger oldest first, regardless of input order", () => {
    // The app holds entries newest-first; a report reads as a statement, so
    // this function re-sorts. Assert the direction, not just that it sorted.
    const csv = buildAugust(inAugust);
    assert.ok(csv.indexOf("เงินเดือน") < csv.indexOf("กาแฟ"));
  });

  it("resolves wallet_id to the wallet's name", () => {
    const csv = buildAugust([makeEntry({ title: "กาแฟ", amount: 100, occurred_at: "2026-08-05T03:00:00.000Z", wallet_id: "w1" })]);
    assert.ok(csv.includes('"บัญชีหลัก"'));
  });

  it("falls back to the raw id for a wallet that no longer exists", () => {
    const csv = buildAugust([makeEntry({ title: "กาแฟ", amount: 100, occurred_at: "2026-08-05T03:00:00.000Z", wallet_id: "deleted-wallet" })]);
    assert.ok(csv.includes('"deleted-wallet"'), "better a traceable id than a blank cell");
  });

  it("escapes a quote in a wallet name in the wallets section", () => {
    assert.ok(buildAugust(inAugust).includes('"กระเป๋า ""ออม"""'));
  });

  it("leaves transfers out of the category breakdown", () => {
    // A transfer moves money between the user's own wallets; counting it as
    // spending would inflate every category total it touched.
    const csv = buildAugust([
      makeEntry({ title: "โอนเข้าออม", amount: 5000, occurred_at: "2026-08-06T03:00:00.000Z", transaction_type: "transfer", category: "อื่น ๆ" }),
      makeEntry({ title: "กาแฟ", amount: 100, occurred_at: "2026-08-05T03:00:00.000Z" }),
    ]);
    const categorySection = csv.slice(csv.indexOf("สรุปหมวดหมู่รายจ่าย"), csv.indexOf("ลูกหนี้คงค้าง"));
    assert.ok(categorySection.includes('"อาหาร","100"'));
    assert.ok(!categorySection.includes("5000"));
  });

  it("sorts categories by spend, biggest first", () => {
    const csv = buildAugust([
      makeEntry({ title: "กาแฟ", amount: 100, occurred_at: "2026-08-05T03:00:00.000Z", category: "อาหาร" }),
      makeEntry({ title: "ค่าไฟ", amount: 900, occurred_at: "2026-08-07T03:00:00.000Z", category: "บิล" }),
    ]);
    const categorySection = csv.slice(csv.indexOf("สรุปหมวดหมู่รายจ่าย"), csv.indexOf("ลูกหนี้คงค้าง"));
    assert.ok(categorySection.indexOf("บิล") < categorySection.indexOf("อาหาร"));
  });

  it("writes the debtor sections from the summaries it is handed", () => {
    const csv = buildAugust(inAugust, {
      receivableSummary: [{ name: "เอก", amount: 1500 }],
      payableSummary: [{ name: "บัตรเครดิต", amount: 8200 }],
    });
    assert.ok(csv.includes('"เอก","1500"'));
    assert.ok(csv.includes('"บัตรเครดิต","8200"'));
  });

  it("still produces every section header when there is nothing to report", () => {
    const csv = buildAugust([]);
    for (const heading of ["สรุปยอด", "สรุปหมวดหมู่รายจ่าย", "ลูกหนี้คงค้าง", "กระเป๋า/กองเงิน", "รายการละเอียด"]) {
      assert.ok(csv.includes(heading), `missing section: ${heading}`);
    }
    assert.ok(csv.includes('"จำนวนรายการ","0"'));
  });

  it("covers the whole year when the period is year", () => {
    const csv = buildReportCsv({
      entries: [
        makeEntry({ title: "มกรา", amount: 10, occurred_at: "2026-01-15T03:00:00.000Z" }),
        makeEntry({ title: "ธันวา", amount: 20, occurred_at: "2026-12-15T03:00:00.000Z" }),
        makeEntry({ title: "ปีก่อน", amount: 30, occurred_at: "2025-12-15T03:00:00.000Z" }),
      ],
      wallets,
      receivableSummary: [],
      payableSummary: [],
      period: "year",
      selectedMonth: "2026-08",
      selectedYear: 2026,
      monthStartDay: 1,
    });
    assert.ok(csv.includes("มกรา"));
    assert.ok(csv.includes("ธันวา"));
    assert.ok(!csv.includes("ปีก่อน"));
  });
});
