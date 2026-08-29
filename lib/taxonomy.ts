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
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const CATEGORIES = ["อาหาร", "เดินทาง", "ของใช้", "ที่อยู่อาศัย", "สุขภาพ", "บันเทิง", "รายได้", "บิลประจำ", "อื่น ๆ"] as const;

export type WalletTag = "cash" | "savings" | "other" | "petty";

// Transaction types that touch a debtor balance at all (either direction).
export const DEBT_TYPES: TransactionType[] = ["lend", "borrow", "split_half", "debt_repayment", "debt_payment", "card_charge"];

// Debt the user owes someone else (credit cards, personal debt payments,
// cash borrowed from an individual).
export const TYPES_USER_OWES: TransactionType[] = ["borrow", "debt_payment", "card_charge"];

// Money owed to the user (lent out, split bills, repayments coming back).
export const TYPES_OWED_TO_USER: TransactionType[] = ["lend", "split_half", "debt_repayment"];
