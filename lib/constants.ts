// Cross-cutting limits/config shared across app/page.tsx and the API routes.
// Domain taxonomy (transaction types, categories) lives in lib/taxonomy.ts —
// this file is for everything else that would otherwise get re-typed per file.

export const MS_PER_DAY = 86_400_000;

export const DEFAULT_TIMEZONE = "Asia/Bangkok";

export const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const MAX_SLIP_IMAGES = 3;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function imageBytes(base64: string) {
  return Math.floor((base64.length * 3) / 4);
}

export const GEMINI_EXTRACTION_TEMPERATURE = 0.1;

export const WEBAUTHN_TIMEOUT_MS = 60_000;

export const MONTH_START_DAY_MIN = 1;
export const MONTH_START_DAY_MAX = 28;

// Alpha percent used for the standard (non-selected) category-dot tint —
// see categoryTint() in app/page.tsx. Selected/highlighted states use their
// own deliberately higher alpha values (16, 20) and stay inline.
export const CATEGORY_DOT_TINT_ALPHA = 13;

export const THEME_STORAGE_KEY = "money-ai-theme";

export const TABLES = {
  transactions: "transactions",
  profiles: "profiles",
  debtors: "debtors",
  wallets: "wallets",
  recurringExpenses: "recurring_expenses",
  investments: "investments",
  investmentPrices: "investment_prices",
  aiChatMessages: "ai_chat_messages",
} as const;

// Every entries.select(...) in app/page.tsx pulls this same column list —
// keep it in one place so a renamed/added column can't silently drift out
// of sync between call sites.
export const TRANSACTION_COLUMNS =
  "id,title,category,amount,kind,transaction_type,wallet_impact,debt_impact,user_share,partner_share,debtor_name,occurred_at,source_text,wallet_id,note,transfer_group_id,investment_id,investment_units";

export const PROFILE_COLUMNS =
  "user_id,nickname,app_icon,app_icon_image,month_start_day,pin_hash,pin_salt,pin_failed_attempts,pin_blocked_until,webauthn_credential_id,webauthn_enabled";

export const DEBTOR_COLUMNS =
  "id,user_id,name,note,opening_balance,kind,monthly_installment,total_installments,credit_limit,credit_card_min_payment_percent,icon,icon_color";

export const WALLET_COLUMNS = "id,user_id,name,tag,balance,icon,icon_color,is_default";

export const RECURRING_EXPENSE_COLUMNS = "id,user_id,name,amount,billing_day,icon,icon_color";

export const INVESTMENT_COLUMNS = "id,user_id,name,code,units,cost_basis,icon,icon_color";

export const INVESTMENT_PRICE_COLUMNS = "id,investment_id,nav,recorded_at";

export const AI_CHAT_MESSAGE_COLUMNS = "id,role,content,created_at";
