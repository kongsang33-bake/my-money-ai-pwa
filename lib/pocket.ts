// The billboard's back: a pocket of the user's own payment cards -- a
// PromptPay number, a QR lifted out of a bank app's screenshot, a membership
// barcode, a plain bank account. Everything here is pure so it can be tested
// on its own; drawing and sharing live in components/pocket.tsx.
//
// Nothing here stores a picture. A PromptPay QR is text built from the number
// (buildPromptPayPayload), a bank app's QR is text read out of the screenshot
// once and kept as text, and a barcode is its digits -- the app draws each one
// itself, so a stored card is a few short strings, never an image.

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
