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

// Per-attempt Gemini timeouts, by what the request actually has to do. A
// plain text entry comes back in a couple of seconds once thinking is
// minimized, so 10s means "this model isn't answering" rather than "it needs
// longer" -- it was 7s when the parsing prompt was smaller, which a
// three-item entry could genuinely overrun; a receipt photo adds
// OCR plus per-line itemization and genuinely runs longer; a chat answer is
// long-form generation that shouldn't get cut off mid-sentence.
// lib/gemini.ts caps the TOTAL time spent walking the model chain at a
// multiple of whichever of these a caller passes.
export const GEMINI_TEXT_TIMEOUT_MS = 10000;
export const GEMINI_IMAGE_TIMEOUT_MS = 25000;
export const GEMINI_CHAT_TIMEOUT_MS = 12000;

// Free-text personal context (profiles.ai_context) the user writes for the
// AI. Long enough for a paragraph of household/business vocabulary, short
// enough that it can't crowd out the parsing rules in the prompt itself.
export const AI_CONTEXT_MAX_LENGTH = 1000;

// How many past entries of the user's own get replayed to the model as
// "you recorded something like this before" examples, and how similar the
// wording has to be to qualify -- see lib/ai-memory.ts. Few and strict on
// purpose: these examples outrank the model's own guess, so a loose match
// would teach it the wrong pattern.
export const AI_EXAMPLE_LIMIT = 5;
export const AI_EXAMPLE_MIN_SIMILARITY = 0.3;

// Cap on the example text sent per past entry (its title) -- an entry title
// is short by nature, this only guards against a pathological one.
export const AI_EXAMPLE_TEXT_MAX_LENGTH = 120;

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
  budgets: "budgets",
  moneyGoals: "money_goals",
} as const;

// Every entries.select(...) in app/page.tsx pulls this same column list —
// keep it in one place so a renamed/added column can't silently drift out
// of sync between call sites.
export const TRANSACTION_COLUMNS =
  "id,title,category,amount,kind,transaction_type,wallet_impact,debt_impact,user_share,partner_share,debtor_name,occurred_at,source_text,wallet_id,note,transfer_group_id,investment_id,investment_units";

export const PROFILE_COLUMNS =
  "user_id,nickname,app_icon,app_icon_image,month_start_day,pin_hash,pin_salt,pin_failed_attempts,pin_blocked_until,webauthn_credential_id,webauthn_enabled,net_worth_formula,net_worth_hide_card,ai_context";

export const DEBTOR_COLUMNS =
  "id,user_id,name,note,opening_balance,kind,monthly_installment,total_installments,credit_limit,credit_card_min_payment_percent,icon,icon_color";

export const WALLET_COLUMNS = "id,user_id,name,tag,balance,icon,icon_color,is_default";

export const RECURRING_EXPENSE_COLUMNS = "id,user_id,name,amount,billing_day,icon,icon_color";

export const INVESTMENT_COLUMNS = "id,user_id,name,code,units,cost_basis,icon,icon_color";

export const INVESTMENT_PRICE_COLUMNS = "id,investment_id,nav,recorded_at";

export const AI_CHAT_MESSAGE_COLUMNS = "id,role,content,created_at";

// Chat turns loaded when the finance-chat sheet opens. The thread is stored
// forever, but only the tail is worth rendering -- and the prompt itself only
// ever replays the last handful of turns (MAX_HISTORY_TURNS in /api/ask), so
// loading the whole history just grows the payload with every conversation.
export const AI_CHAT_HISTORY_LIMIT = 50;

export const BUDGET_COLUMNS = "category,amount";

export const MONEY_GOAL_COLUMNS = "id,name,target,saved,deadline";

// Guards the one-time import of budgets/goals/net-worth-display settings
// from localStorage into Supabase for a user who had them set before this
// data moved server-side -- set once per user after a successful import so
// it never re-runs (and never re-overwrites a value the user has since
// changed in the DB) on a later login.
export const LOCAL_DATA_MIGRATED_KEY_PREFIX = "money-ai-migrated:v1:";

// PostgREST puts an `.in("id", [...])` filter in the query string, so a
// restore that touches a long history is sent in batches rather than as one
// request long enough for a proxy to reject.
export const RESTORE_ID_BATCH_SIZE = 200;

// Caps how many rows a cross-month search result renders -- searching spans
// every entry ever recorded (not just the selected cycle), so this keeps a
// broad query from dumping years of history into the DOM at once.
export const SEARCH_RESULT_LIMIT = 200;

// How many transaction rows loadEntries asks for per request.
//
// This exists because PostgREST caps every response at the project's
// `db-max-rows` (1,000 by default on hosted Supabase) and truncates
// SILENTLY -- no error, just fewer rows than the table holds. That is a
// correctness problem here, not a performance one: buildWalletLedger and
// buildDebtSummary fold *every* transaction ever recorded to derive wallet
// balances and debtor outstandings, so a read that quietly stops at the cap
// doesn't show a broken screen, it shows wrong money.
//
// This is only a request size, never an assumption: loadEntries pages until
// it has as many rows as the server's own exact count says exist, advancing
// by however many rows actually came back. A server cap lower than this
// changes the number of round-trips and nothing else.
export const ENTRY_PAGE_SIZE = 1000;

// Hard stop for that loop so a server that keeps handing back rows can never
// spin forever. At ENTRY_PAGE_SIZE per request this allows 200k transactions,
// far past any real personal-finance history.
export const ENTRY_PAGE_MAX_REQUESTS = 200;

// How long the boot splash (app/layout.tsx + the #app-splash keyframes in
// app/globals.css) stays up at minimum, measured from window.__splashStartedAt
// rather than from React mounting so a fast load doesn't cut the animation
// off mid-bounce. Its own sequence -- halo and logo bounce at 0.05s, wordmark
// at 0.7s, underline finishing at ~1.25s -- is what sets the floor: raise
// this only if that sequence gets longer, never as a "let the brand breathe"
// pause, since every millisecond past the animation is dead time in front of
// an app that is already rendered and waiting behind it.
export const SPLASH_MIN_VISIBLE_MS = 1300;
