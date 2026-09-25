import { describe, it } from "node:test";
import assert from "node:assert/strict";
import qrcode from "qrcode-generator";
import jsQR from "jsqr";
import {
  CODE128_PATTERN_TABLE,
  buildPromptPayPayload,
  code128Symbols,
  code128Widths,
  crc16,
  describeScannedQr,
  formatAccountNumber,
  formatPromptPayNumber,
  promptPayTarget,
  readEmvTags,
} from "./pocket.ts";

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
    const qr = qrcode(0, "M");
    qr.addData(payload);
    qr.make();
    const scale = 4;
    const quiet = 4;
    const size = (qr.getModuleCount() + quiet * 2) * scale;
    const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let row = 0; row < qr.getModuleCount(); row++) {
      for (let col = 0; col < qr.getModuleCount(); col++) {
        if (!qr.isDark(row, col)) continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const at = (((row + quiet) * scale + dy) * size + (col + quiet) * scale + dx) * 4;
            pixels[at] = pixels[at + 1] = pixels[at + 2] = 0;
          }
        }
      }
    }
    assert.equal(jsQR(pixels, size, size)?.data, payload);
    assert.equal(describeScannedQr(payload), "พร้อมเพย์");
  });
});

describe("describeScannedQr", () => {
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
