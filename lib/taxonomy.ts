export const TRANSACTION_TYPES = [
  "income",
  "personal_expense",
  "lend",
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
