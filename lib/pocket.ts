// The billboard's back: a pocket of the user's own payment cards -- a
// PromptPay number, a QR lifted out of a bank app's screenshot, a membership
// barcode, a plain bank account. Everything here is pure so it can be tested
// on its own; drawing and sharing live in components/pocket.tsx.
//
// Nothing here stores a picture. A PromptPay QR is text built from the number
// (buildPromptPayPayload), a bank app's QR is text read out of the screenshot
// once and kept as text, and a barcode is its digits -- the app draws each one
// itself, so a stored card is a few short strings, never an image.

import qrcode from "qrcode-generator";
import {
  POCKET_BANK_MAX_LENGTH,
  POCKET_HOLDER_MAX_LENGTH,
  POCKET_LABEL_MAX_LENGTH,
  POCKET_VALUE_MAX_LENGTH,
} from "./constants.ts";

export type PocketCardKind = "promptpay" | "qr" | "barcode" | "account";

export type PocketCard = {
  id: string;
  kind: PocketCardKind;
  /** What the user calls it: "พร้อมเพย์ส่วนตัว", "K+ ร้านกาแฟ", "The 1". */
  label: string;
  /** Whose it is, shown under the code so the person scanning can check. */
  holder: string | null;
  /** The bank or issuer, for "account" and optional elsewhere. */
  bank: string | null;
  /**
   * promptpay: the phone or ID digits; qr: the decoded QR text; barcode: the
   * code; account: the account number digits.
   */
  value: string;
  /** A --cat-* slot, the card's own --hue (never a colour picked ad hoc). */
  hue: string;
};

export const POCKET_KIND_LABELS: Record<PocketCardKind, string> = {
  promptpay: "พร้อมเพย์",
  qr: "QR จากแอปธนาคาร",
  barcode: "บาร์โค้ด",
  account: "บัญชีธนาคาร",
};

export const POCKET_HUES = [
  "--cat-bills",
  "--cat-travel",
  "--cat-goods",
  "--cat-entertainment",
  "--cat-food",
  "--cat-home",
  "--cat-health",
  "--cat-other",
] as const;

export const POCKET_BANKS = ["กสิกรไทย", "ไทยพาณิชย์", "กรุงเทพ", "กรุงไทย", "กรุงศรี", "ทีทีบี", "ออมสิน", "ธ.ก.ส.", "ยูโอบี", "ซีไอเอ็มบี", "เกียรตินาคินภัทร", "อื่น ๆ"];

export const digitsOnly = (value: string) => value.replace(/\D/g, "");

const POCKET_KIND_SET = new Set<string>(Object.keys(POCKET_KIND_LABELS));
const POCKET_HUE_SET = new Set<string>(POCKET_HUES);

/**
 * A pocket_cards row as the app holds it, or null for a row this version
 * cannot draw (a kind added by a newer build). An unknown hue falls back to
 * the first slot rather than dropping the card.
 */
export function toPocketCard(row: Record<string, unknown>): PocketCard | null {
  const kind = String(row.kind ?? "");
  const value = String(row.value ?? "");
  if (!POCKET_KIND_SET.has(kind) || !value) return null;
  const text = (field: unknown) => (typeof field === "string" && field.trim() ? field : null);
  const hue = String(row.hue ?? "");
  return {
    id: String(row.id),
    kind: kind as PocketCardKind,
    label: String(row.label ?? ""),
    holder: text(row.holder),
    bank: text(row.bank),
    value,
    hue: POCKET_HUE_SET.has(hue) ? hue : POCKET_HUES[0],
  };
}

/** What gets written for a card: the form's values, trimmed, emptied to null. */
export function pocketCardRow(card: PocketCard) {
  const optional = (field: string | null) => (field && field.trim() ? field.trim() : null);
  return {
    kind: card.kind,
    label: card.label.trim(),
    holder: optional(card.holder),
    // Only the kinds whose form asks for it keep a bank: switching a card from
    // "account" to "promptpay" hides the field, and a hidden value that still
    // saved would turn up again with nothing on screen to change it.
    bank: card.kind === "account" || card.kind === "barcode" ? optional(card.bank) : null,
    value: card.kind === "qr" || card.kind === "barcode" ? card.value : digitsOnly(card.value),
    hue: card.hue,
  };
}

/**
 * Moves one card a step up or down. Returns the new order and the rows whose
 * sort_order changed -- every card is renumbered to its index, so an order
 * that drifted (two cards on the same number, a gap left by a delete) is
 * straightened out by the first move rather than carried forever. Null when
 * the move goes nowhere.
 */
export function movePocketCard(cards: PocketCard[], id: string, delta: -1 | 1, currentOrder: Map<string, number>) {
  const from = cards.findIndex((card) => card.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= cards.length) return null;
  const next = [...cards];
  [next[from], next[to]] = [next[to], next[from]];
  const updates = next
    .map((card, index) => ({ id: card.id, sort_order: index }))
    .filter((row) => currentOrder.get(row.id) !== row.sort_order);
  return { cards: next, updates };
}

/** Why a card cannot be saved yet, in words, or null when it can. */
export function pocketDraftProblem(draft: PocketCard): string | null {
  const label = draft.label.trim();
  if (!label) return "ตั้งชื่อการ์ด";
  if (label.length > POCKET_LABEL_MAX_LENGTH) return `ชื่อการ์ดยาวได้ไม่เกิน ${POCKET_LABEL_MAX_LENGTH} ตัวอักษร`;
  if ((draft.holder ?? "").trim().length > POCKET_HOLDER_MAX_LENGTH) return `ชื่อเจ้าของยาวได้ไม่เกิน ${POCKET_HOLDER_MAX_LENGTH} ตัวอักษร`;
  if ((draft.bank ?? "").trim().length > POCKET_BANK_MAX_LENGTH) return `ชื่อธนาคารหรือร้านยาวได้ไม่เกิน ${POCKET_BANK_MAX_LENGTH} ตัวอักษร`;
  if (draft.kind === "promptpay" && !promptPayTarget(draft.value)) return "ใส่เบอร์ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก";
  if (draft.kind === "qr" && !draft.value) return "เลือกรูป QR จากแอปธนาคาร";
  if (draft.kind === "qr" && draft.value.length > POCKET_VALUE_MAX_LENGTH) return "QR นี้มีข้อมูลยาวเกินกว่าจะเก็บได้";
  if (draft.kind === "barcode" && !canEncodeCode128(draft.value)) return "ใส่เลขบาร์โค้ด (ตัวเลขหรือตัวอักษรภาษาอังกฤษ)";
  if (draft.kind === "barcode" && draft.value.length > 80) return "เลขบาร์โค้ดยาวเกินไป";
  if (draft.kind === "account" && (digitsOnly(draft.value).length < 10 || digitsOnly(draft.value).length > 15)) return "เลขบัญชีต้องมี 10-15 หลัก";
  return null;
}

// ---------------------------------------------------------------------------
// PromptPay (Thai QR Payment, EMVCo merchant-presented, static)
// ---------------------------------------------------------------------------

const PROMPTPAY_AID = "A000000677010111";

/** What a PromptPay number is, by its length -- the one thing the spec keys on. */
export function promptPayTarget(value: string): "phone" | "national_id" | "ewallet" | null {
  const digits = digitsOnly(value);
  if (digits.length === 10 && digits.startsWith("0")) return "phone";
  if (digits.length === 13) return "national_id";
  if (digits.length === 15) return "ewallet";
  return null;
}

function tlv(tag: string, value: string) {
  return `${tag}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC-16/CCITT-FALSE, which EMVCo's tag 63 carries as four hex digits. */
export function crc16(text: string) {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * The text a PromptPay QR carries. With no amount it is the reusable kind
 * any banking app asks the payer to type a figure into; with one, it opens
 * with that figure already filled in. Null when the number is not a
 * PromptPay target (promptPayTarget).
 */
export function buildPromptPayPayload(value: string, amount?: number): string | null {
  const digits = digitsOnly(value);
  const target = promptPayTarget(digits);
  if (!target) return null;
  const account =
    target === "phone"
      ? tlv("01", `0066${digits.slice(1)}`.padStart(13, "0"))
      : target === "national_id"
        ? tlv("02", digits)
        : tlv("03", digits);
  const hasAmount = amount !== undefined && Number.isFinite(amount) && amount > 0;
  const body = [
    tlv("00", "01"),
    tlv("01", hasAmount ? "12" : "11"),
    tlv("29", tlv("00", PROMPTPAY_AID) + account),
    tlv("53", "764"),
    hasAmount ? tlv("54", amount!.toFixed(2)) : "",
    tlv("58", "TH"),
  ].join("");
  const withCrcTag = `${body}6304`;
  return withCrcTag + crc16(withCrcTag);
}

/**
 * Reads a scanned QR's text back into its top-level tags. Only as far as the
 * card needs -- whether it is a Thai payment QR and which kind -- not a full
 * EMVCo parser. Null when the text is not TLV at all (a URL, a LINE ID).
 */
export function readEmvTags(payload: string): Map<string, string> | null {
  const tags = new Map<string, string>();
  let at = 0;
  while (at < payload.length) {
    const tag = payload.slice(at, at + 2);
    const length = Number(payload.slice(at + 2, at + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(length) || at + 4 + length > payload.length) return null;
    tags.set(tag, payload.slice(at + 4, at + 4 + length));
    at += 4 + length;
  }
  return tags.size ? tags : null;
}

/** "พร้อมเพย์" / "QR ร้านค้า" / null for a QR that is not a Thai payment one. */
export function describeScannedQr(payload: string): string | null {
  const tags = readEmvTags(payload);
  if (!tags || tags.get("00") !== "01") return null;
  const crcOk = payload.endsWith(crc16(payload.slice(0, -4)));
  if (!crcOk) return null;
  if (tags.get("29")?.includes(PROMPTPAY_AID)) return "พร้อมเพย์";
  if (tags.has("30")) return "QR ร้านค้า";
  return "QR ชำระเงิน";
}

// ---------------------------------------------------------------------------
// How a card's number reads on screen
// ---------------------------------------------------------------------------

/** 0812345678 -> 081-234-5678; a national ID keeps only its last three. */
export function formatPromptPayNumber(value: string, masked = true) {
  const digits = digitsOnly(value);
  const target = promptPayTarget(digits);
  if (target === "phone") return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (target === "national_id") {
    const shown = masked ? `${"x".repeat(10)}${digits.slice(10)}` : digits;
    return `${shown[0]}-${shown.slice(1, 5)}-${shown.slice(5, 10)}-${shown.slice(10, 12)}-${shown[12]}`;
  }
  return digits;
}

/** A Thai bank account's usual 3-1-5-1 grouping when it has ten digits. */
export function formatAccountNumber(value: string) {
  const digits = digitsOnly(value);
  if (digits.length !== 10) return digits;
  return `${digits.slice(0, 3)}-${digits[3]}-${digits.slice(4, 9)}-${digits[9]}`;
}

/** The one line under a card's code saying what it is, in words. */
export function pocketCardCaption(card: PocketCard) {
  const parts: string[] = [];
  if (card.kind === "promptpay") parts.push(`พร้อมเพย์ ${formatPromptPayNumber(card.value)}`);
  else if (card.kind === "account") parts.push(card.bank ?? "บัญชีธนาคาร");
  else if (card.kind === "qr") parts.push(describeScannedQr(card.value) ?? "QR");
  else parts.push(card.bank ?? "บาร์โค้ด");
  if (card.holder) parts.push(card.holder);
  return parts.join(" · ");
}

/** What "คัดลอก" puts on the clipboard: the number someone would type. */
export function pocketCopyValue(card: PocketCard): { label: string; text: string } | null {
  if (card.kind === "promptpay") return { label: promptPayTarget(card.value) === "phone" ? "เบอร์พร้อมเพย์" : "เลขพร้อมเพย์", text: digitsOnly(card.value) };
  if (card.kind === "account") return { label: "เลขบัญชี", text: digitsOnly(card.value) };
  if (card.kind === "barcode") return { label: "เลขบาร์โค้ด", text: card.value };
  return null;
}

/** The text a card's QR carries, or null for a card that draws no QR. */
export function pocketQrPayload(card: PocketCard): string | null {
  if (card.kind === "promptpay") return buildPromptPayPayload(card.value);
  if (card.kind === "qr") return card.value;
  return null;
}

// ---------------------------------------------------------------------------
// QR modules
// ---------------------------------------------------------------------------

/**
 * A QR's dark modules, row by row. The text goes in as UTF-8 bytes: the
 * library's own default keeps only the low byte of each character, which
 * turned any Thai in a scanned QR (an EMV merchant name in tag 64, say) into
 * different text the moment it was redrawn.
 */
export function encodeQr(payload: string): boolean[][] {
  const qr = qrcode(0, "M");
  const bytes = Array.from(new TextEncoder().encode(payload));
  // addData takes a string and runs it through stringToBytes; handing it one
  // character per byte makes that round trip exact.
  qr.addData(String.fromCharCode(...bytes), "Byte");
  qr.make();
  const count = qr.getModuleCount();
  return Array.from({ length: count }, (_, row) => Array.from({ length: count }, (_, col) => qr.isDark(row, col)));
}

// ---------------------------------------------------------------------------
// Code 128 -- what membership cards print
// ---------------------------------------------------------------------------

// Bar/space widths for symbols 0-105; 106 is the stop, which has a seventh
// element (the final bar).
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];
export const CODE128_PATTERN_TABLE: readonly string[] = CODE128_PATTERNS;

const START_B = 104;
const START_C = 105;
const STOP = 106;

/** Printable ASCII, the only characters a membership code is made of. */
export function canEncodeCode128(value: string) {
  return value.length > 0 && /^[\x20-\x7e]+$/.test(value);
}

/**
 * The symbols a value encodes to: set C (two digits a symbol) for an
 * all-digit even-length code, which is what most loyalty cards are, set B
 * otherwise. Includes the start, checksum and stop symbols.
 */
export function code128Symbols(value: string): number[] {
  if (!canEncodeCode128(value)) return [];
  const setC = /^\d+$/.test(value) && value.length % 2 === 0;
  const data = setC
    ? value.match(/\d\d/g)!.map(Number)
    : [...value].map((ch) => ch.charCodeAt(0) - 32);
  const start = setC ? START_C : START_B;
  const checksum = data.reduce((sum, symbol, index) => sum + symbol * (index + 1), start) % 103;
  return [start, ...data, checksum, STOP];
}

/** Alternating bar/space widths in modules, starting with a bar. */
export function code128Widths(value: string): number[] {
  return code128Symbols(value).flatMap((symbol) => [...CODE128_PATTERNS[symbol]].map(Number));
}
