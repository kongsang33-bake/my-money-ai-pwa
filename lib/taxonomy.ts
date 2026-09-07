export const TRANSACTION_TYPES = [
  "income",
  "personal_expense",
  "lend",
  "borrow",
  "split_half",
  "debt_repayment",
  "debt_payment",
  "card_charge",
  "transfer",
  "gift",
  "investment_buy",
  "balance_adjustment",
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

// What the AI parser is allowed to come back with. A balance adjustment is
// something the user does deliberately from the wallet screen after counting
// their real money -- never something to infer from a sentence about a
// coffee, and never something a model should be able to write into a wallet.
export const PARSEABLE_TRANSACTION_TYPES = TRANSACTION_TYPES.filter(
  (type) => type !== "balance_adjustment",
);

// A wallet moved, but nobody earned or spent anything: a transfer lands the
// same money in another of the user's own wallets, an investment buy turns it
// into units, and a balance adjustment is the app admitting its own figure was
// wrong. Every "how much came in / went out" number has to skip all three --
// monthly totals, category and budget spend, the spending calendar, the day
// summary, the 7-day pace -- or a reconciliation the user made to *correct*
// the app reads back as the biggest thing they spent money on that day.
export function countsAsEarnedOrSpent(type: TransactionType): boolean {
  return type !== "transfer" && type !== "investment_buy" && type !== "balance_adjustment";
}

export const CATEGORIES = ["อาหาร", "เดินทาง", "ของใช้", "ที่อยู่อาศัย", "สุขภาพ", "บันเทิง", "รายได้", "บิลประจำ", "อื่น ๆ"] as const;

export type WalletTag = "cash" | "savings" | "other" | "petty";

// Every wallet_impact/entries.kind column only ever stores one of these two
// values -- whether a given transaction_type counts as income or expense
// for that purpose is transactionKind below.
export type EntryKind = "expense" | "income";

// Transaction types that touch a debtor balance at all (either direction).
export const DEBT_TYPES: TransactionType[] = ["lend", "borrow", "split_half", "debt_repayment", "debt_payment", "card_charge"];

// Debt the user owes someone else (credit cards, personal debt payments,
// cash borrowed from an individual).
export const TYPES_USER_OWES: TransactionType[] = ["borrow", "debt_payment", "card_charge"];

// Money owed to the user (lent out, split bills, repayments coming back).
export const TYPES_OWED_TO_USER: TransactionType[] = ["lend", "split_half", "debt_repayment"];

export const transactionTypeLabels: Record<TransactionType, string> = {
  income: "รายรับ",
  personal_expense: "จ่ายเอง",
  lend: "ออกให้ก่อน",
  borrow: "ยืมเงินมา",
  split_half: "หารร่วมกัน",
  debt_repayment: "รับชำระหนี้",
  debt_payment: "ผ่อนชำระหนี้",
  card_charge: "จ่ายด้วยบัตรเครดิต",
  transfer: "โอนเงินระหว่างกระเป๋า",
  gift: "ให้โดยไม่คิดคืน",
  investment_buy: "ลงทุน",
  balance_adjustment: "ปรับยอดให้ตรงบัญชี",
};

// Neither of these can be typed into an entry form. The signed wallet_impact
// that makes them mean anything is built somewhere else -- units and cost
// basis on the portfolio screen for an investment buy, the difference between
// the app's figure and the counted money on the wallet screen for an
// adjustment (balanceAdjustmentEntry) -- and normalizeEntry takes that impact
// as given rather than deriving it from the amount. Picked from a form there
// is no impact to take, so the row shows an amount and moves nothing: ~700
// on screen, zero out of the wallet, and filtered out of every total by
// countsAsEarnedOrSpent. A row that already is one of these still names its
// own type in the edit sheet, which is what `keepType` is for.
export const FORM_ONLY_DERIVED_TYPES: TransactionType[] = ["investment_buy", "balance_adjustment"];

export function isFormOnlyDerivedType(type: TransactionType): boolean {
  return FORM_ONLY_DERIVED_TYPES.includes(type);
}

// The options a transaction-type <select> may offer, in label order. Pass the
// row's existing type as `keepType` so an already-saved investment buy or
// balance adjustment can still display itself.
export function transactionTypeOptions(keepType?: TransactionType): [TransactionType, string][] {
  return (Object.entries(transactionTypeLabels) as [TransactionType, string][])
    .filter(([value]) => !isFormOnlyDerivedType(value) || value === keepType);
}

export const transactionKind: Record<TransactionType, EntryKind> = {
  income: "income",
  debt_repayment: "income",
  borrow: "income",
  personal_expense: "expense",
  lend: "expense",
  split_half: "expense",
  debt_payment: "expense",
  card_charge: "expense",
  transfer: "expense",
  gift: "expense",
  investment_buy: "expense",
  // The direction lives in wallet_impact, which normalizeEntry takes as given
  // for this type the way it does for a transfer; kind only has "income" and
  // "expense" to offer and an adjustment is neither.
  balance_adjustment: "expense",
};

export const walletTagLabels: Record<WalletTag, string> = {
  cash: "เงินสด",
  savings: "ออมทรัพย์",
  other: "อื่น ๆ",
  petty: "เงินสดย่อย",
};

export const walletTagHints: Record<WalletTag, string> = {
  cash: "รวมเป็นยอดกระเป๋าหลักบนหน้าแรก",
  savings: "แยกยอดออกจากหน้าแรก เหมาะกับเงินเก็บระยะยาว",
  other: "แยกยอดออกจากหน้าแรก สำหรับเงินที่ไม่เข้าพวกไหนเลย",
  petty: "แยกยอดออกจากหน้าแรก เหมาะกับเงินสดที่กันไว้ใช้จ่ายจิปาถะหรือทอนลูกค้า เช่น เงินทอนหน้าร้าน เงินสำรองแลกเหรียญ",
};
