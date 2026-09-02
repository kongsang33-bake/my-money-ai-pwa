// Core money-tracking domain types shared by lib/money.ts, lib/cycle.ts,
// and lib/insights.ts, plus the handful of UI-facing types (Profile, Toast,
// sheet input shapes, ...) that more than one components/*.tsx file needs
// to import. A type used by exactly one file stays declared right there
// instead of being added here -- Tab is the main example, since only
// app/page.tsx's own routing state needs it.
import type { EntryKind, TransactionType, WalletTag } from "./taxonomy.ts";

export type { EntryKind };

export type Entry = {
  id: string;
  title: string;
  category: string;
  amount: number;
  type: EntryKind;
  transaction_type: TransactionType;
  wallet_impact: number;
  debt_impact: number;
  user_share: number;
  partner_share: number;
  debtor_name: string;
  occurred_at: string;
  source_text?: string | null;
  wallet_id?: string | null;
  note?: string | null;
  transfer_group_id?: string | null;
  transfer_to_wallet_id?: string | null;
  investment_id?: string | null;
  investment_units?: number | null;
};

// `ambiguous` is a transient, client-only hint from the AI-parse step (the
// model wasn't sure whether a named person gave/received money for free or
// as a loan) — it never gets persisted; saveEntries builds its Supabase
// payload from an explicit field list that doesn't include it.
export type Draft = Omit<Entry, "id"> & { id: string; ambiguous?: boolean };

export type EntryInput = {
  id: string;
  title: string;
  category: string;
  amount: number;
  type?: EntryKind;
  transaction_type?: TransactionType;
  wallet_impact?: number;
  debt_impact?: number;
  user_share?: number;
  partner_share?: number;
  debtor_name?: string | null;
  occurred_at: string;
  source_text?: string | null;
  wallet_id?: string | null;
  note?: string | null;
  transfer_group_id?: string | null;
  transfer_to_wallet_id?: string | null;
  investment_id?: string | null;
  investment_units?: number | null;
};

export type DebtorKind = "lend" | "own";

export type Debtor = {
  id: string;
  user_id: string;
  name: string;
  note: string | null;
  opening_balance: number;
  kind: DebtorKind;
  monthly_installment: number | null;
  total_installments: number | null;
  credit_limit: number | null;
  credit_card_min_payment_percent: number | null;
  icon: string | null;
  icon_color: string | null;
};

export type Wallet = {
  id: string;
  user_id: string;
  name: string;
  tag: WalletTag;
  balance: number;
  icon: string | null;
  icon_color: string | null;
  is_default: boolean;
};

export type WalletDisplay = Wallet & {
  display_balance: number;
  transaction_delta: number;
};

export type RecurringExpense = {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  billing_day: number;
  icon: string | null;
  icon_color: string | null;
};

export type Investment = {
  id: string;
  user_id: string;
  name: string;
  code: string | null;
  units: number;
  cost_basis: number;
  icon: string | null;
  icon_color: string | null;
};

export type InvestmentPrice = {
  id: string;
  investment_id: string;
  nav: number;
  recorded_at: string;
};

export type PortfolioHolding = Investment & {
  avgCost: number;
  latestNav: number | null;
  latestNavDate: string | null;
  marketValue: number;
  gain: number;
  gainPercent: number | null;
};

export type HistoryFilters = {
  query: string;
  category: string;
  type: "all" | TransactionType;
  minAmount: string;
  maxAmount: string;
};

export type ReportPeriod = "month" | "year";

// "full" subtracts every baht of outstanding debt principal from net worth;
// "obligation" subtracts only what's actually due this cycle (installment /
// card minimum), matching how the debt page already presents "หนี้ของฉัน" —
// see monthlyDebtObligation in lib/money.ts. Full-principal net worth reads
// as much scarier than the household's actual month-to-month position for
// anyone paying debt down on a fixed schedule.
export type NetWorthDebtFormula = "full" | "obligation";

export type NetWorthDisplaySettings = { formula: NetWorthDebtFormula; hideCard: boolean };

export type Theme = "light" | "dark";

export type PinMode = "checking" | "setup" | "locked" | "unlocked";

export type Profile = {
  user_id: string;
  nickname: string | null;
  app_icon: string | null;
  app_icon_image: string | null;
  month_start_day: number;
  pin_hash: string | null;
  pin_salt: string | null;
  pin_failed_attempts: number;
  pin_blocked_until: string | null;
  webauthn_credential_id: string | null;
  webauthn_enabled: boolean;
  net_worth_formula: NetWorthDebtFormula;
  net_worth_hide_card: boolean;
  // Free-text vocabulary/business context the user writes for the AI —
  // injected into the parsing prompt and the finance chat. See
  // AI_CONTEXT_MAX_LENGTH in lib/constants.ts.
  ai_context: string | null;
};

export type AiFinanceContext = {
  periodLabel: string;
  totals: { income: number; outflow: number; balance: number; cashAvailable: number; walletBalance: number; netWorth: number };
  walletBalances: { name: string; balance: number }[];
  categories: { category: string; amount: number }[];
  recurringTotal: number;
  receivableTotal: number;
  payableTotal: number;
  transactionCount: number;
  transactions: Pick<Entry, "title" | "category" | "amount" | "transaction_type" | "wallet_impact" | "occurred_at">[];
};

export type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type InvestmentDraftItem = {
  investment_name: string;
  code: string;
  amount: number;
  date: string;
  wallet_id: string;
  note: string;
};

export type Toast = { id: number; tone: "success" | "info" | "error"; title: string; detail?: string; action?: { label: string; onClick: () => void } };

export type ConfirmDialogState = {
  title: string;
  detail: string;
  confirmLabel: string;
  tone?: "danger" | "default";
  resolve: (confirmed: boolean) => void;
};

export type EmptyAction = { label: string; onClick: () => void };

export type SlipImage = {
  id: string;
  name: string;
  mimeType: string;
  data: string;
  preview: string;
};

// "target"/"saved" are plain baht amounts the user types in -- no cents
// tracking, no currency conversion, this is a simple visual progress goal.
// One entry the user logs often enough that the app offers it as a one-tap
// shortcut. Derived by deriveQuickShortcuts (lib/insights.ts); `count` is how
// many times it was seen, which is what ranks the shortcuts against each
// other.
export type QuickShortcut = {
  title: string;
  category: string;
  transaction_type: TransactionType;
  amount: number;
  count: number;
};

// One chip in the AI composer's "tap an example to start fast" row. Some
// chips are generic starters that just seed the textarea; the ones derived
// from the user's own history carry the shortcut they came from, so tapping
// them adds the entry outright instead of typing it out for the model.
export type AiSuggestion = {
  label: string;
  detail: string;
  text: string;
  shortcut?: QuickShortcut;
};

// The shape app/page.tsx will accept as a pre-seeded state, used only by the
// end-to-end suite (see e2e/fixture.ts). It lives here rather than in the test
// folder because app/page.tsx needs the type too, and a type-only import
// leaves nothing behind in the bundle -- which is the whole point: the fixture
// itself is injected by the browser at test time and is never imported by
// application code, so it cannot ride along into a production build.
export type PreviewSeed = {
  entries: Entry[];
  wallets: Wallet[];
  debtors: Debtor[];
  recurringExpenses: RecurringExpense[];
  goals: MoneyGoal[];
  budgets: Record<string, number>;
  user: { id: string; email: string; user_metadata: { full_name: string } };
  profile: Record<string, unknown>;
};

export type MoneyGoal = { id: string; name: string; target: number; saved: number; deadline: string };
