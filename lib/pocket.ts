// The billboard's back: a pocket of the user's own cards -- ways to be paid
// (a PromptPay number, a QR lifted out of a bank or wallet app, a bank
// account) and cards and tickets of any kind (a membership barcode, a film
// ticket's QR). Everything here is pure so it can be tested
// on its own; drawing and sharing live in components/pocket.tsx.
//
// Nothing here stores a picture. A PromptPay QR is text built from the number
// (buildPromptPayPayload), a bank app's QR is text read out of the screenshot
// once and kept as text, and a barcode is its digits -- the app draws each one
// itself, so a stored card is a few short strings, never an image.

import qrcode from "qrcode-generator";
import {
  POCKET_BANK_MAX_LENGTH,
  POCKET_BARCODE_MAX_LENGTH,
  POCKET_DETAIL_MAX_LENGTH,
  POCKET_HOLDER_MAX_LENGTH,
  POCKET_LABEL_MAX_LENGTH,
  POCKET_QR_MAX_BYTES,
  POCKET_PAST_GRACE_HOURS,
  POCKET_VALUE_MAX_LENGTH,
} from "./constants.ts";

/**
 * What a card is. The first three are ways to be paid; the rest are cards and
 * tickets of any kind. "barcode" is a kind older builds wrote -- it is read as
 * a membership card carrying a barcode (toPocketCard) and never written.
 */
export type PocketCardKind = "promptpay" | "qr" | "account" | "membership" | "ticket" | "other";

/** What code a card carries, decided apart from what the card is. */
export type PocketCodeFormat = "qr" | "barcode" | "none";

/**
 * What is printed on a ticket or card beyond its code. `startsAt` is the
 * wall-clock time on the ticket, "YYYY-MM-DDTHH:mm", or just "YYYY-MM-DD"
 * when it gives a day and no time.
 */
export type PocketDetails = {
  title?: string;
  venue?: string;
  startsAt?: string;
  seat?: string;
};

export type PocketCard = {
  id: string;
  kind: PocketCardKind;
  /** What the user calls it: "พร้อมเพย์ส่วนตัว", "K+ ร้านกาแฟ", "The 1". */
  label: string;
  /** Whose it is, shown under the code so the person scanning can check. */
  holder: string | null;
  /** The bank for an account; the issuer, shop or organiser for a card. */
  bank: string | null;
  /**
   * promptpay: the phone or ID digits; qr: the decoded QR text; account: the
   * account number digits; a general card: its QR text or barcode, or "".
   */
  value: string;
  /** A general card's code format; the payment kinds' is fixed (pocketCodeFormat). */
  code: PocketCodeFormat;
  details: PocketDetails;
  /** A --cat-* slot, the card's own --hue (never a colour picked ad hoc). */
  hue: string;
};

export const POCKET_KIND_LABELS: Record<PocketCardKind, string> = {
  promptpay: "พร้อมเพย์",
  qr: "QR รับเงิน",
  account: "บัญชีธนาคาร",
  membership: "บัตรสมาชิก",
  ticket: "ตั๋ว",
  other: "บัตรอื่น ๆ",
};

/**
 * The kind picker's groups, in order. A new kind is one more entry here and in
 * POCKET_KIND_LABELS (plus the database's kind check).
 */
export const POCKET_KIND_GROUPS: { label: string; kinds: { kind: PocketCardKind; label: string }[] }[] = [
  {
    label: "รับเงิน",
    kinds: [
      { kind: "promptpay", label: "พร้อมเพย์ (เบอร์/เลขบัตรประชาชน)" },
      { kind: "qr", label: "QR รับเงิน (แอปธนาคาร/วอลเล็ต)" },
      { kind: "account", label: "บัญชีธนาคาร" },
    ],
  },
  {
    label: "บัตรและตั๋ว",
    kinds: [
      { kind: "membership", label: "บัตรสมาชิก/สะสมแต้ม" },
      { kind: "ticket", label: "ตั๋วหนัง/คอนเสิร์ต/อีเวนต์" },
      { kind: "other", label: "บัตรอื่น ๆ ที่มี QR หรือบาร์โค้ด" },
    ],
  },
];

/** Cards and tickets, as opposed to ways to be paid: the only ones AI may read. */
const GENERAL_KINDS = new Set<PocketCardKind>(["membership", "ticket", "other"]);
export const isGeneralPocketKind = (kind: PocketCardKind) => GENERAL_KINDS.has(kind);

export const POCKET_CODE_LABELS: Record<PocketCodeFormat, string> = {
  qr: "QR",
  barcode: "บาร์โค้ด",
  none: "ไม่มีโค้ด",
};

/** The code a card shows: fixed for the payment kinds, the card's own otherwise. */
export function pocketCodeFormat(card: Pick<PocketCard, "kind" | "code">): PocketCodeFormat {
  if (card.kind === "promptpay" || card.kind === "qr") return "qr";
  if (card.kind === "account") return "none";
  return card.code;
}

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
const POCKET_CODE_SET = new Set<string>(Object.keys(POCKET_CODE_LABELS));
const STARTS_AT_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
const DETAIL_KEYS = ["title", "venue", "startsAt", "seat"] as const;

/** Keeps only the known, non-empty detail strings, each cut to its limit. */
export function cleanPocketDetails(raw: unknown): PocketDetails {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const details: PocketDetails = {};
  for (const key of DETAIL_KEYS) {
    const value = typeof source[key] === "string" ? (source[key] as string).trim().slice(0, POCKET_DETAIL_MAX_LENGTH) : "";
    if (!value) continue;
    if (key === "startsAt" && !STARTS_AT_PATTERN.test(value)) continue;
    details[key] = value;
  }
  return details;
}

/**
 * A pocket_cards row as the app holds it, or null for a row this version
 * cannot draw (a kind added by a newer build). An unknown hue falls back to
 * the first slot rather than dropping the card.
 */
export function toPocketCard(row: Record<string, unknown>): PocketCard | null {
  let kind = String(row.kind ?? "");
  let code = String(row.code_format ?? "");
  if (kind === "barcode") {
    kind = "membership";
    code = "barcode";
  }
  if (!POCKET_KIND_SET.has(kind)) return null;
  const value = String(row.value ?? "");
  const text = (field: unknown) => (typeof field === "string" && field.trim() ? field : null);
  const hue = String(row.hue ?? "");
  const card: PocketCard = {
    id: String(row.id),
    kind: kind as PocketCardKind,
    label: String(row.label ?? ""),
    holder: text(row.holder),
    bank: text(row.bank),
    value,
    // A payment card's code follows from what it is; a general card's is its
    // own, and a row with none recorded draws what its value can be.
    code: !GENERAL_KINDS.has(kind as PocketCardKind)
      ? pocketCodeFormat({ kind: kind as PocketCardKind, code: "none" })
      : POCKET_CODE_SET.has(code) ? (code as PocketCodeFormat) : value ? "qr" : "none",
    details: cleanPocketDetails(row.details),
    hue: POCKET_HUE_SET.has(hue) ? hue : POCKET_HUES[0],
  };
  // A payment card without its number cannot draw anything.
  if (!isGeneralPocketKind(card.kind) && !value) return null;
  return card;
}

/** What gets written for a card: the form's values, trimmed, emptied to null. */
export function pocketCardRow(card: PocketCard) {
  const optional = (field: string | null) => (field && field.trim() ? field.trim() : null);
  const general = isGeneralPocketKind(card.kind);
  const code = pocketCodeFormat(card);
  const details = general ? cleanPocketDetails(card.details) : {};
  let value: string;
  if (card.kind === "promptpay" || card.kind === "account") value = digitsOnly(card.value);
  else if (general && code === "none") value = "";
  else value = card.value;
  return {
    kind: card.kind,
    label: card.label.trim(),
    holder: optional(card.holder),
    // Only the kinds whose form asks for it keep a bank or issuer: switching
    // a card to "promptpay" hides the field, and a hidden value that still
    // saved would turn up again with nothing on screen to change it.
    bank: card.kind === "account" || general ? optional(card.bank) : null,
    value,
    code_format: general ? code : null,
    details: Object.keys(details).length ? details : null,
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
  if ((draft.bank ?? "").trim().length > POCKET_BANK_MAX_LENGTH) return `ชื่อธนาคารหรือผู้ออกบัตรยาวได้ไม่เกิน ${POCKET_BANK_MAX_LENGTH} ตัวอักษร`;
  if (draft.kind === "promptpay" && !promptPayTarget(draft.value)) return "ใส่เบอร์ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก";
  if (draft.kind === "qr" && !draft.value) return "เลือกรูป QR รับเงินจากแอปธนาคารหรือวอลเล็ต";
  if (draft.kind === "account" && (digitsOnly(draft.value).length < 10 || digitsOnly(draft.value).length > 15)) return "เลขบัญชีต้องมี 10-15 หลัก";
  const code = pocketCodeFormat(draft);
  if (code === "qr" && (draft.value.length > POCKET_VALUE_MAX_LENGTH || !qrPayloadFits(draft.value))) return "QR นี้มีข้อมูลยาวเกินกว่าจะเก็บได้";
  if (isGeneralPocketKind(draft.kind)) {
    if (code === "qr" && !draft.value.trim()) return "เลือกรูปที่มี QR หรือพิมพ์ข้อความใน QR";
    if (code === "barcode" && !canEncodeCode128(draft.value)) return "ใส่เลขบาร์โค้ด (ตัวเลขหรือตัวอักษรภาษาอังกฤษ)";
    if (code === "barcode" && draft.value.length > POCKET_BARCODE_MAX_LENGTH) return "เลขบาร์โค้ดยาวเกินไป";
    if (draft.details.startsAt && !STARTS_AT_PATTERN.test(draft.details.startsAt)) return "วันเวลาไม่ถูกต้อง";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tickets: when, and whether it has passed
// ---------------------------------------------------------------------------

/**
 * When a ticket's event is, as a Date in the device's own time, or null.
 * A day with no time counts as the end of that day.
 */
export function pocketEventTime(details: PocketDetails): Date | null {
  const at = details.startsAt;
  if (!at || !STARTS_AT_PATTERN.test(at)) return null;
  const date = new Date(at.length === 10 ? `${at}T23:59` : at);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A ticket whose event is over: POCKET_PAST_GRACE_HOURS after it started, so
 * a ticket is still up front while its film is still running.
 */
export function isPocketPast(card: PocketCard, now: number): boolean {
  if (card.kind !== "ticket") return false;
  const at = pocketEventTime(card.details);
  if (!at) return false;
  const grace = (card.details.startsAt?.length ?? 0) > 10 ? POCKET_PAST_GRACE_HOURS * 3_600_000 : 0;
  return now > at.getTime() + grace;
}

/** The order the billboard's back swipes through: past tickets go last, each group in its saved order. */
export function orderPocketForDisplay(cards: PocketCard[], now: number): PocketCard[] {
  return [...cards.filter((card) => !isPocketPast(card, now)), ...cards.filter((card) => isPocketPast(card, now))];
}

const WHEN_FORMAT = new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const DAY_FORMAT = new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** "ส. 27 ก.ย. 19:30" -- a ticket's when, in words. */
export function formatPocketWhen(details: PocketDetails): string | null {
  const at = pocketEventTime(details);
  if (!at) return null;
  return (details.startsAt?.length ?? 0) > 10 ? WHEN_FORMAT.format(at) : DAY_FORMAT.format(at);
}

/** The line under a ticket's name: when, and the seat. */
export function pocketDetailLine(card: PocketCard): string | null {
  if (!isGeneralPocketKind(card.kind)) return null;
  const parts = [formatPocketWhen(card.details), card.details.seat ? `ที่นั่ง ${card.details.seat}` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

// ---------------------------------------------------------------------------
// Reading a ticket with AI (/api/analyze-ticket)
// ---------------------------------------------------------------------------

/** What the AI read off a ticket, every field already cleaned. */
export type PocketTicketReading = {
  label: string;
  issuer: string;
  holder: string;
  codeText: string;
  details: PocketDetails;
};

/**
 * Bounds and validates the model's answer before it touches a form: every
 * field trimmed to its column's limit, a when that is not a real date dropped,
 * and a printed code kept only if it could be drawn as a barcode.
 */
export function normalizeTicketReading(raw: unknown): PocketTicketReading {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const text = (key: string, max: number) => (typeof source[key] === "string" ? (source[key] as string).trim().slice(0, max) : "");
  const code = text("code_text", POCKET_BARCODE_MAX_LENGTH).replace(/\s+/g, "");
  return {
    label: text("label", POCKET_LABEL_MAX_LENGTH),
    issuer: text("issuer", POCKET_BANK_MAX_LENGTH),
    holder: text("holder", POCKET_HOLDER_MAX_LENGTH),
    codeText: canEncodeCode128(code) ? code : "",
    details: cleanPocketDetails({ title: source.title, venue: source.venue, startsAt: source.starts_at, seat: source.seat }),
  };
}

/**
 * Pours a reading into a draft without overwriting anything the user already
 * typed: AI fills blanks, it does not correct the person holding the ticket.
 * A printed code is used only when no code was read from the picture itself.
 */
export function applyTicketReading(draft: PocketCard, reading: PocketTicketReading): PocketCard {
  const details: PocketDetails = { ...reading.details, ...cleanPocketDetails(draft.details) };
  const next: PocketCard = {
    ...draft,
    label: draft.label.trim() ? draft.label : reading.label || draft.label,
    bank: draft.bank?.trim() ? draft.bank : reading.issuer || draft.bank,
    holder: draft.holder?.trim() ? draft.holder : reading.holder || draft.holder,
    details,
  };
  if (!draft.value.trim() && reading.codeText) {
    next.value = reading.codeText;
    next.code = "barcode";
  }
  return next;
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

// An e-wallet's PromptPay ID opens with its provider's three-digit code.
// Only the ones known for certain are named; any other reads as an e-wallet.
const EWALLET_PROVIDERS: Record<string, string> = {
  "140": "TrueMoney Wallet",
};

/** The provider an e-wallet PromptPay ID belongs to, when it is one we know. */
export function ewalletProvider(id: string): string | null {
  const digits = digitsOnly(id);
  return digits.length === 15 ? EWALLET_PROVIDERS[digits.slice(0, 3)] ?? null : null;
}

/**
 * What a scanned QR pays, in words, or null for a QR that is not a Thai
 * payment one. A TrueMoney, or any e-wallet's, "receive money" QR runs on
 * PromptPay too, so stopping at "it is PromptPay" named a TrueMoney card
 * "พร้อมเพย์"; tag 29's own sub-tag says which kind of account it pays.
 */
export function describeScannedQr(payload: string): string | null {
  const tags = readEmvTags(payload);
  if (!tags || tags.get("00") !== "01") return null;
  // Some wallets (TrueMoney's own variant) write the checksum in lowercase.
  const crcOk = payload.slice(-4).toUpperCase() === crc16(payload.slice(0, -4));
  if (!crcOk) return null;
  const promptPay = tags.get("29");
  if (promptPay?.includes(PROMPTPAY_AID)) {
    const proxy = readEmvTags(promptPay);
    if (proxy?.has("03")) return ewalletProvider(proxy.get("03")!) ?? "พร้อมเพย์ e-Wallet";
    if (proxy?.has("02")) return "พร้อมเพย์ เลขบัตรประชาชน";
    if (proxy?.has("01")) return "พร้อมเพย์ เบอร์โทร";
    return "พร้อมเพย์";
  }
  const merchant = tags.get("59")?.trim();
  if (tags.has("30")) return merchant ? `QR ร้านค้า ${merchant}` : "QR ร้านค้า";
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
  const parts: (string | null | undefined)[] = [];
  if (card.kind === "promptpay") parts.push(`${ewalletProvider(card.value) ?? "พร้อมเพย์"} ${formatPromptPayNumber(card.value)}`);
  else if (card.kind === "account") parts.push(card.bank ?? "บัญชีธนาคาร");
  else if (card.kind === "qr") parts.push(describeScannedQr(card.value) ?? "QR");
  else parts.push(card.bank ?? POCKET_KIND_LABELS[card.kind], card.details.venue);
  if (card.holder) parts.push(card.holder);
  return parts.filter(Boolean).join(" · ");
}

/** What "คัดลอก" puts on the clipboard: the number someone would type. */
export function pocketCopyValue(card: PocketCard): { label: string; text: string } | null {
  if (card.kind === "promptpay") return { label: promptPayTarget(card.value) === "phone" ? "เบอร์พร้อมเพย์" : "เลขพร้อมเพย์", text: digitsOnly(card.value) };
  if (card.kind === "account") return { label: "เลขบัญชี", text: digitsOnly(card.value) };
  if (isGeneralPocketKind(card.kind) && card.code === "barcode" && card.value) return { label: "เลขบาร์โค้ด", text: card.value };
  return null;
}

/** Whether a QR can carry this text at all (POCKET_QR_MAX_BYTES). */
export function qrPayloadFits(payload: string) {
  return new TextEncoder().encode(payload).length <= POCKET_QR_MAX_BYTES;
}

/**
 * The text a card's QR carries, or null for a card that draws no QR -- which
 * includes one saved before the byte limit was checked whose text no QR can
 * hold: encoding it threw, on Home, on every launch.
 */
export function pocketQrPayload(card: PocketCard): string | null {
  if (card.kind === "promptpay") return buildPromptPayPayload(card.value);
  if (pocketCodeFormat(card) === "qr" && card.value && qrPayloadFits(card.value)) return card.value;
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
