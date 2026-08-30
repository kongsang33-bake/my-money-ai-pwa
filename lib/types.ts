// Core money-tracking domain types shared by lib/money.ts, lib/cycle.ts, and
// lib/insights.ts. UI-only types (Tab, Theme, Toast, sheet input shapes,
// etc.) stay in app/page.tsx next to the components that use them -- these
// are only the shapes the calculation/formatting logic itself needs.
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
