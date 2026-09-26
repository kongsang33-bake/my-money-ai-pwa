import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jsQR from "jsqr";
import {
  CODE128_PATTERN_TABLE,
  buildPromptPayPayload,
  code128Symbols,
  code128Widths,
  crc16,
  describeScannedQr,
  encodeQr,
  formatAccountNumber,
  movePocketCard,
  pocketCardRow,
  pocketQrPayload,
  applyTicketReading,
  isPocketPast,
  normalizeTicketReading,
  orderPocketForDisplay,
  pocketCodeFormat,
  pocketDraftProblem,
  toPocketCard,
  formatPromptPayNumber,
  promptPayTarget,
  readEmvTags,
  type PocketCard,
} from "./pocket.ts";

/** Paints encodeQr's modules into RGBA pixels and asks a real decoder to read them. */
function decodeModules(modules: boolean[][]) {
  const scale = 4;
  const quiet = 4;
  const count = modules.length;
  const size = (count + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  modules.forEach((cells, row) => cells.forEach((dark, col) => {
    if (!dark) return;
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        const at = (((row + quiet) * scale + dy) * size + (col + quiet) * scale + dx) * 4;
        pixels[at] = pixels[at + 1] = pixels[at + 2] = 0;
      }
    }
  }));
  return jsQR(pixels, size, size)?.data;
}

const card = (patch: Partial<PocketCard> = {}): PocketCard => ({
  id: "c1", kind: "promptpay", label: "พร้อมเพย์", holder: null, bank: null, value: "0812345678", code: "qr", details: {}, hue: "--cat-bills", ...patch,
});

describe("crc16", () => {
  it("matches CRC-16/CCITT-FALSE's published check value", () => {
    assert.equal(crc16("123456789"), "29B1");
  });
});

describe("buildPromptPayPayload", () => {
  it("encodes a phone as 0066 plus the number without its leading zero", () => {
    const payload = buildPromptPayPayload("081-234-5678")!;
    const tags = readEmvTags(payload)!;
    assert.equal(tags.get("00"), "01");
    assert.equal(tags.get("01"), "11");
    assert.equal(tags.get("29"), "0016A000000677010111" + "01130066812345678");
    assert.equal(tags.get("53"), "764");
    assert.equal(tags.get("58"), "TH");
    assert.equal(tags.has("54"), false);
    assert.equal(payload.slice(-4), crc16(payload.slice(0, -4)));
  });

  it("carries a national ID as tag 02 and an amount as a dynamic QR", () => {
    const payload = buildPromptPayPayload("1234567890123", 75.5)!;
    const tags = readEmvTags(payload)!;
    assert.equal(tags.get("01"), "12");
    assert.equal(tags.get("29"), "0016A000000677010111" + "02131234567890123");
    assert.equal(tags.get("54"), "75.50");
  });

  it("refuses a number that is not a PromptPay target", () => {
    assert.equal(buildPromptPayPayload("12345"), null);
    assert.equal(promptPayTarget("1812345678"), null);
  });

  it("survives a round trip through a real QR encoder and decoder", () => {
    const payload = buildPromptPayPayload("0812345678")!;
    assert.equal(decodeModules(encodeQr(payload)), payload);
    assert.equal(describeScannedQr(payload), "พร้อมเพย์ เบอร์โทร");
  });
});

describe("encodeQr", () => {
  it("keeps Thai text intact rather than only each character's low byte", () => {
    const text = "ร้านบ้านเบค 0812345678";
    assert.equal(decodeModules(encodeQr(text)), text);
  });
});

describe("describeScannedQr", () => {
  it("names the account a PromptPay QR pays, not just that it is PromptPay", () => {
    assert.equal(describeScannedQr(buildPromptPayPayload("1234567890123")!), "พร้อมเพย์ เลขบัตรประชาชน");
    // TrueMoney's receive-money QR: an e-wallet ID under its provider code 140.
    assert.equal(describeScannedQr(buildPromptPayPayload("140000812345678")!), "TrueMoney Wallet");
    assert.equal(describeScannedQr(buildPromptPayPayload("999000812345678")!), "พร้อมเพย์ e-Wallet");
  });

  it("accepts a checksum written in lowercase hex", () => {
    const payload = buildPromptPayPayload("140000812345678")!;
    assert.equal(describeScannedQr(payload.slice(0, -4) + payload.slice(-4).toLowerCase()), "TrueMoney Wallet");
  });

  it("names a shop QR by the merchant name it carries", () => {
    const body = "000201" + "010211" + "3027" + "0016A000000677010112" + "0103ABC" + "5303764" + "5802TH" + "5909Baan Cafe" + "6304";
    assert.equal(describeScannedQr(body + crc16(body)), "QR ร้านค้า Baan Cafe");
  });

  it("does not call arbitrary text a payment QR", () => {
    assert.equal(describeScannedQr("https://line.me/ti/p/abc"), null);
  });

  it("rejects a payment QR whose checksum is wrong", () => {
    const payload = buildPromptPayPayload("0812345678")!;
    assert.equal(describeScannedQr(payload.slice(0, -4) + "0000"), null);
  });
});

describe("number formatting", () => {
  it("groups a phone and masks all but the end of a national ID", () => {
    assert.equal(formatPromptPayNumber("0812345678"), "081-234-5678");
    assert.equal(formatPromptPayNumber("1234567890123"), "x-xxxx-xxxxx-12-3");
    assert.equal(formatPromptPayNumber("1234567890123", false), "1-2345-67890-12-3");
  });

  it("groups a ten-digit account 3-1-5-1", () => {
    assert.equal(formatAccountNumber("1234567890"), "123-4-56789-0");
  });
});

describe("code128", () => {
  it("has 107 distinct patterns, each eleven modules wide (the stop thirteen)", () => {
    assert.equal(CODE128_PATTERN_TABLE.length, 107);
    assert.equal(new Set(CODE128_PATTERN_TABLE).size, 107);
    CODE128_PATTERN_TABLE.forEach((pattern, index) => {
      const width = [...pattern].reduce((sum, digit) => sum + Number(digit), 0);
      assert.equal(width, index === 106 ? 13 : 11, `symbol ${index}`);
    });
  });

  it("packs an even run of digits two to a symbol in set C", () => {
    // Start C (105), 12, 34, checksum (105 + 12 + 68) % 103 = 82, stop.
    assert.deepEqual(code128Symbols("1234"), [105, 12, 34, 82, 106]);
  });

  it("falls back to set B for anything else", () => {
    // Start B (104), "A" = 33, checksum (104 + 33) % 103 = 34, stop.
    assert.deepEqual(code128Symbols("A"), [104, 33, 34, 106]);
    assert.equal(code128Widths("A").length, 6 * 3 + 7);
  });

  it("encodes nothing it cannot", () => {
    assert.deepEqual(code128Symbols("บัตร"), []);
  });
});

describe("toPocketCard", () => {
  it("reads a row, emptying blank text to null", () => {
    assert.deepEqual(
      toPocketCard({ id: "a", kind: "account", label: "เงินเดือน", holder: " ", bank: "กรุงไทย", value: "1234567890", hue: "--cat-goods", sort_order: 0 }),
      { id: "a", kind: "account", label: "เงินเดือน", holder: null, bank: "กรุงไทย", value: "1234567890", code: "none", details: {}, hue: "--cat-goods" },
    );
  });

  it("drops a kind this build cannot draw and repairs an unknown hue", () => {
    assert.equal(toPocketCard({ id: "a", kind: "nfc", label: "x", value: "1", hue: "--cat-bills" }), null);
    assert.equal(toPocketCard({ id: "a", kind: "membership", label: "x", value: "1", hue: "#ff0000" })?.hue, "--cat-bills");
  });

  it("reads an older build's barcode card as a membership card with a barcode", () => {
    const read = toPocketCard({ id: "a", kind: "barcode", label: "The 1", value: "7001", hue: "--cat-bills" })!;
    assert.equal(read.kind, "membership");
    assert.equal(read.code, "barcode");
  });

  it("keeps a ticket with no code, and only the details it knows, cleaned", () => {
    const read = toPocketCard({
      id: "t", kind: "ticket", label: "หนัง", value: "", code_format: "none", hue: "--cat-food",
      details: { title: " Rain ", startsAt: "2026-10-01T19:30", seat: "", evil: "x", venue: 42 },
    })!;
    assert.deepEqual(read.details, { title: "Rain", startsAt: "2026-10-01T19:30" });
    assert.equal(read.code, "none");
    assert.equal(toPocketCard({ id: "p", kind: "promptpay", label: "x", value: "", hue: "--cat-bills" }), null);
  });

  it("drops a when that is not a real date", () => {
    assert.deepEqual(toPocketCard({ id: "t", kind: "ticket", label: "x", value: "", details: { startsAt: "tomorrow" }, hue: "--cat-bills" })!.details, {});
  });
});

describe("pocketCardRow", () => {
  it("keeps only digits for numbers and drops a bank the kind does not ask for", () => {
    const row = pocketCardRow(card({ value: "081-234-5678", bank: "กสิกรไทย", holder: "  เบค  ", label: " ส่วนตัว " }));
    assert.equal(row.value, "0812345678");
    assert.equal(row.bank, null);
    assert.equal(row.holder, "เบค");
    assert.equal(row.label, "ส่วนตัว");
  });

  it("stores a scanned QR's text exactly as read", () => {
    const text = " 0002 01 ";
    assert.equal(pocketCardRow(card({ kind: "qr", value: text })).value, text);
  });

  it("writes a general card's code format and details, and nothing for a payment card", () => {
    const ticket = pocketCardRow(card({ kind: "ticket", code: "none", value: "left over", bank: " Major ", details: { title: "Rain", seat: "" } }));
    assert.equal(ticket.code_format, "none");
    assert.equal(ticket.value, "");
    assert.equal(ticket.bank, "Major");
    assert.deepEqual(ticket.details, { title: "Rain" });
    const pay = pocketCardRow(card({ details: { title: "hidden" } }));
    assert.equal(pay.code_format, null);
    assert.equal(pay.details, null);
  });
});

describe("pocketCodeFormat", () => {
  it("is fixed for the payment kinds and the card's own otherwise", () => {
    assert.equal(pocketCodeFormat(card({ kind: "promptpay", code: "none" })), "qr");
    assert.equal(pocketCodeFormat(card({ kind: "account", code: "qr" })), "none");
    assert.equal(pocketCodeFormat(card({ kind: "membership", code: "barcode" })), "barcode");
  });
});

describe("past tickets", () => {
  const at = (iso: string) => new Date(iso).getTime();
  const ticket = (id: string, startsAt?: string) => card({ id, kind: "ticket", code: "none", value: "", details: startsAt ? { startsAt } : {} });

  it("counts a ticket as passed a few hours after it starts, or after its day ends", () => {
    const show = ticket("a", "2026-10-01T19:30");
    assert.equal(isPocketPast(show, at("2026-10-01T22:00")), false);
    assert.equal(isPocketPast(show, at("2026-10-02T02:00")), true);
    const allDay = ticket("b", "2026-10-01");
    assert.equal(isPocketPast(allDay, at("2026-10-01T23:00")), false);
    assert.equal(isPocketPast(allDay, at("2026-10-02T00:30")), true);
  });

  it("never passes a ticket with no date, or a card that is not a ticket", () => {
    assert.equal(isPocketPast(ticket("c"), at("2030-01-01T00:00")), false);
    assert.equal(isPocketPast(card({ kind: "membership", details: { startsAt: "2020-01-01" } }), at("2030-01-01T00:00")), false);
  });

  it("moves passed tickets to the back, each group in its saved order", () => {
    const cards = [ticket("old1", "2026-01-01"), card({ id: "pay" }), ticket("new", "2026-12-01"), ticket("old2", "2026-02-01")];
    assert.deepEqual(orderPocketForDisplay(cards, at("2026-06-01T12:00")).map((item) => item.id), ["pay", "new", "old1", "old2"]);
  });
});

describe("reading a ticket with AI", () => {
  it("bounds every field and keeps only a printed code it could draw", () => {
    const reading = normalizeTicketReading({
      label: "  Midnight Rain  ", issuer: "Major", holder: "", title: "Midnight Rain", venue: "โรง 5",
      starts_at: "2026-10-03T19:30", seat: "F12", code_text: "7001 2345",
    });
    assert.equal(reading.label, "Midnight Rain");
    assert.equal(reading.codeText, "70012345");
    assert.deepEqual(reading.details, { title: "Midnight Rain", venue: "โรง 5", startsAt: "2026-10-03T19:30", seat: "F12" });
    assert.equal(normalizeTicketReading({ code_text: "บัตร", starts_at: "เสาร์นี้" }).codeText, "");
    assert.deepEqual(normalizeTicketReading(null).details, {});
  });

  it("fills blanks and never overwrites what the user typed", () => {
    const draft = card({ kind: "ticket", code: "qr", value: "", label: "ของฉัน", details: { seat: "A1" } });
    const filled = applyTicketReading(draft, normalizeTicketReading({ label: "AI name", issuer: "SF", title: "Rain", seat: "Z9", code_text: "12345678" }));
    assert.equal(filled.label, "ของฉัน");
    assert.equal(filled.bank, "SF");
    assert.deepEqual(filled.details, { title: "Rain", seat: "A1" });
    assert.equal(filled.value, "12345678");
    assert.equal(filled.code, "barcode");
  });

  it("keeps a code read from the picture over one the AI read off the print", () => {
    const draft = card({ kind: "ticket", code: "qr", value: "QR-FROM-PHOTO" });
    const filled = applyTicketReading(draft, normalizeTicketReading({ code_text: "12345678" }));
    assert.equal(filled.value, "QR-FROM-PHOTO");
    assert.equal(filled.code, "qr");
  });
});

describe("movePocketCard", () => {
  const cards = [card({ id: "a" }), card({ id: "b" }), card({ id: "c" })];

  it("swaps with the neighbour and writes only the rows whose number changed", () => {
    const plan = movePocketCard(cards, "c", -1, new Map([["a", 0], ["b", 1], ["c", 2]]))!;
    assert.deepEqual(plan.cards.map((item) => item.id), ["a", "c", "b"]);
    assert.deepEqual(plan.updates, [{ id: "c", sort_order: 1 }, { id: "b", sort_order: 2 }]);
  });

  it("straightens out an order that had drifted", () => {
    const plan = movePocketCard(cards, "a", 1, new Map([["a", 0], ["b", 0], ["c", 7]]))!;
    assert.deepEqual(plan.updates, [{ id: "a", sort_order: 1 }, { id: "c", sort_order: 2 }]);
  });

  it("goes nowhere past either end", () => {
    assert.equal(movePocketCard(cards, "a", -1, new Map()), null);
    assert.equal(movePocketCard(cards, "c", 1, new Map()), null);
    assert.equal(movePocketCard(cards, "zz", 1, new Map()), null);
  });
});

describe("pocketDraftProblem", () => {
  it("accepts a complete card of each kind", () => {
    assert.equal(pocketDraftProblem(card()), null);
    assert.equal(pocketDraftProblem(card({ kind: "account", value: "1234567890" })), null);
    assert.equal(pocketDraftProblem(card({ kind: "membership", code: "barcode", value: "7001234567890123" })), null);
    assert.equal(pocketDraftProblem(card({ kind: "ticket", code: "none", value: "" })), null);
    assert.equal(pocketDraftProblem(card({ kind: "qr", value: buildPromptPayPayload("0812345678")! })), null);
  });

  it("names what is missing", () => {
    assert.match(pocketDraftProblem(card({ label: "  " }))!, /ชื่อ/);
    assert.match(pocketDraftProblem(card({ value: "12345" }))!, /10 หลัก/);
    assert.match(pocketDraftProblem(card({ kind: "qr", value: "" }))!, /QR/);
    assert.match(pocketDraftProblem(card({ kind: "membership", code: "barcode", value: "บัตร" }))!, /บาร์โค้ด/);
    assert.match(pocketDraftProblem(card({ kind: "ticket", code: "qr", value: " " }))!, /QR/);
    assert.match(pocketDraftProblem(card({ kind: "account", value: "123" }))!, /10-15/);
  });

  it("counts a QR's text in bytes, so Thai under the character limit that no QR holds is refused", () => {
    const thai = "ก".repeat(800); // 800 characters, 2,400 UTF-8 bytes
    assert.match(pocketDraftProblem(card({ kind: "ticket", code: "qr", value: thai }))!, /ยาวเกิน/);
    assert.equal(pocketDraftProblem(card({ kind: "ticket", code: "qr", value: "ก".repeat(700) })), null);
  });

  it("draws no QR for a saved card whose text no QR can hold, rather than throwing", () => {
    const saved = card({ kind: "ticket", code: "qr", value: "ก".repeat(1000) });
    assert.equal(pocketQrPayload(saved), null);
    assert.doesNotThrow(() => encodeQr("ก".repeat(777)));
  });
});
