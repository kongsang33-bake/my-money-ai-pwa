import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDebtSummary,
  buildPortfolioTrend,
  buildWalletLedger,
  calculateImpacts,
  expandTransferDraft,
  filterEntries,
  netWorthAsOf,
  normalizeEntry,
  unnamedDebtor,
  walletDeletionMove,
} from "./money.ts";
import type { Debtor, Entry, HistoryFilters, Investment, InvestmentPrice, Wallet } from "./types.ts";

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "e1",
    title: "test",
    category: "อื่น ๆ",
    amount: 100,
    type: "expense",
    transaction_type: "personal_expense",
    wallet_impact: -100,
    debt_impact: 0,
    user_share: 100,
    partner_share: 0,
    debtor_name: unnamedDebtor,
    occurred_at: "2026-01-15T10:00:00.000Z",
    ...overrides,
  };
}

function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: "w1",
    user_id: "u1",
    name: "เงินสด",
    tag: "cash",
    balance: 0,
    icon: null,
    icon_color: null,
    is_default: true,
    ...overrides,
  };
}

function makeDebtor(overrides: Partial<Debtor> = {}): Debtor {
  return {
    id: "d1",
    user_id: "u1",
    name: "เพื่อนเอ",
    note: null,
    opening_balance: 0,
    kind: "lend",
    monthly_installment: null,
    total_installments: null,
    credit_limit: null,
    credit_card_min_payment_percent: null,
    icon: null,
    icon_color: null,
    ...overrides,
  };
}

describe("calculateImpacts", () => {
  it("income: full amount lands in the wallet, no debt", () => {
    assert.deepEqual(calculateImpacts(100, "income"), { wallet_impact: 100, debt_impact: 0, user_share: 100, partner_share: 0 });
  });

  it("personal_expense (default branch): full amount leaves the wallet, no debt", () => {
    assert.deepEqual(calculateImpacts(100, "personal_expense"), { wallet_impact: -100, debt_impact: 0, user_share: 100, partner_share: 0 });
  });

  it("lend: money leaves the wallet, full amount becomes owed to the user", () => {
    assert.deepEqual(calculateImpacts(100, "lend"), { wallet_impact: -100, debt_impact: 100, user_share: 0, partner_share: 100 });
  });

  it("borrow: cash arrives in the wallet, and it's owed back in full", () => {
    assert.deepEqual(calculateImpacts(100, "borrow"), { wallet_impact: 100, debt_impact: 100, user_share: 0, partner_share: 0 });
  });

  it("split_half: only half leaves the wallet as user's own spend, half becomes debt", () => {
    assert.deepEqual(calculateImpacts(100, "split_half"), { wallet_impact: -100, debt_impact: 50, user_share: 50, partner_share: 50 });
  });

  it("debt_repayment: cash arrives, and debt owed to the user shrinks", () => {
    assert.deepEqual(calculateImpacts(100, "debt_repayment"), { wallet_impact: 100, debt_impact: -100, user_share: 0, partner_share: 0 });
  });

  it("debt_payment: cash leaves the wallet, and the user's own debt shrinks", () => {
    assert.deepEqual(calculateImpacts(100, "debt_payment"), { wallet_impact: -100, debt_impact: -100, user_share: 100, partner_share: 0 });
  });

  it("card_charge: no cash moves yet, but it adds to what the user owes", () => {
    assert.deepEqual(calculateImpacts(100, "card_charge"), { wallet_impact: 0, debt_impact: 100, user_share: 100, partner_share: 0 });
  });

  it("transfer: leaves the source wallet, touches no debt (direction is overridden by normalizeEntry)", () => {
    assert.deepEqual(calculateImpacts(100, "transfer"), { wallet_impact: -100, debt_impact: 0, user_share: 0, partner_share: 0 });
  });

  it("investment_buy: leaves the wallet, touches no debt", () => {
    assert.deepEqual(calculateImpacts(100, "investment_buy"), { wallet_impact: -100, debt_impact: 0, user_share: 0, partner_share: 0 });
  });

  it("gift: full amount leaves the wallet, no debt (falls to the default branch)", () => {
    assert.deepEqual(calculateImpacts(100, "gift"), { wallet_impact: -100, debt_impact: 0, user_share: 100, partner_share: 0 });
  });
});

describe("normalizeEntry", () => {
  it("defaults transaction_type from type when not given", () => {
    const entry = normalizeEntry({ id: "1", title: "โบนัส", category: "รายได้", amount: 500, type: "income", occurred_at: "2026-01-01T00:00:00.000Z" });
    assert.equal(entry.transaction_type, "income");
    assert.equal(entry.wallet_impact, 500);
  });

  it("falls back debtor_name to unnamedDebtor when applyDebtorDefault is true (the default)", () => {
    const entry = normalizeEntry({ id: "1", title: "กินข้าว", category: "อาหาร", amount: 100, occurred_at: "2026-01-01T00:00:00.000Z" });
    assert.equal(entry.debtor_name, unnamedDebtor);
  });

  it("leaves debtor_name blank when applyDebtorDefault is false (used while expanding transfer legs)", () => {
    const entry = normalizeEntry({ id: "1", title: "โอนเงิน", category: "อื่น ๆ", amount: 100, occurred_at: "2026-01-01T00:00:00.000Z" }, false);
    assert.equal(entry.debtor_name, "");
  });

  it("trusts the caller's wallet_impact for transfer instead of recomputing it", () => {
    const entry = normalizeEntry({ id: "1", title: "รับโอน", category: "อื่น ๆ", amount: 100, transaction_type: "transfer", wallet_impact: 100, occurred_at: "2026-01-01T00:00:00.000Z" });
    assert.equal(entry.wallet_impact, 100);
    assert.equal(entry.debt_impact, 0);
  });

  it("negative/garbage amounts are clamped to a non-negative number", () => {
    const entry = normalizeEntry({ id: "1", title: "x", category: "อื่น ๆ", amount: -50, occurred_at: "2026-01-01T00:00:00.000Z" });
    assert.equal(entry.amount, 0);
  });
});

describe("expandTransferDraft", () => {
  it("splits a transfer draft into two linked legs with opposite wallet_impact and a shared group id", () => {
    const wallets = [makeWallet({ id: "cash", name: "เงินสด" }), makeWallet({ id: "savings", name: "ออมทรัพย์", tag: "savings" })];
    const draft = normalizeEntry({
      id: "draft-1", title: "เก็บออม", category: "อื่น ๆ", amount: 200,
      transaction_type: "transfer", wallet_id: "cash", transfer_to_wallet_id: "savings",
      occurred_at: "2026-01-01T00:00:00.000Z",
    }, false);

    const [sourceLeg, destLeg] = expandTransferDraft(draft, wallets);

    assert.equal(sourceLeg.wallet_id, "cash");
    assert.equal(sourceLeg.wallet_impact, -200);
    assert.equal(destLeg.wallet_id, "savings");
    assert.equal(destLeg.wallet_impact, 200);
    assert.equal(sourceLeg.transfer_group_id, destLeg.transfer_group_id);
    assert.ok(sourceLeg.transfer_group_id);
  });

  it("passes a non-transfer draft through untouched", () => {
    const draft = normalizeEntry({ id: "1", title: "กินข้าว", category: "อาหาร", amount: 100, occurred_at: "2026-01-01T00:00:00.000Z" });
    assert.deepEqual(expandTransferDraft(draft, []), [draft]);
  });
});

describe("filterEntries", () => {
  const entries = [
    makeEntry({ id: "1", title: "กาแฟ", category: "อาหาร", wallet_impact: -65, note: "ร้านโปรด" }),
    makeEntry({ id: "2", title: "เงินเดือน", category: "รายได้", transaction_type: "income", wallet_impact: 30000, user_share: 0 }),
    makeEntry({ id: "3", title: "ออกให้เพื่อนเอ", category: "อื่น ๆ", transaction_type: "lend", wallet_impact: -500, debtor_name: "เพื่อนเอ" }),
  ];
  const baseFilters: HistoryFilters = { query: "", category: "", type: "all", minAmount: "", maxAmount: "" };

  it("matches query against title, category, debtor name, and note", () => {
    assert.deepEqual(filterEntries(entries, { ...baseFilters, query: "เพื่อนเอ" }).map((e) => e.id), ["3"]);
    assert.deepEqual(filterEntries(entries, { ...baseFilters, query: "ร้านโปรด" }).map((e) => e.id), ["1"]);
  });

  it("filters by category", () => {
    assert.deepEqual(filterEntries(entries, { ...baseFilters, category: "อาหาร" }).map((e) => e.id), ["1"]);
  });

  it("filters by transaction type", () => {
    assert.deepEqual(filterEntries(entries, { ...baseFilters, type: "lend" }).map((e) => e.id), ["3"]);
  });

  it("filters by amount range using the absolute wallet_impact", () => {
    assert.deepEqual(filterEntries(entries, { ...baseFilters, minAmount: "1000" }).map((e) => e.id), ["2"]);
    assert.deepEqual(filterEntries(entries, { ...baseFilters, maxAmount: "100" }).map((e) => e.id), ["1"]);
  });

  it("combines filters with AND semantics", () => {
    assert.deepEqual(filterEntries(entries, { ...baseFilters, category: "อื่น ๆ", type: "lend" }).map((e) => e.id), ["3"]);
  });
});

describe("buildWalletLedger", () => {
  it("adds each entry's wallet_impact onto its own wallet's stored balance", () => {
    const wallets = [makeWallet({ id: "cash", tag: "cash", balance: 1000 }), makeWallet({ id: "savings", tag: "savings", balance: 500, is_default: false })];
    const entries = [
      makeEntry({ id: "1", wallet_id: "cash", wallet_impact: -100 }),
      makeEntry({ id: "2", wallet_id: "savings", wallet_impact: 200 }),
    ];
    const ledger = buildWalletLedger(wallets, entries);
    assert.equal(ledger.totals.cash, 900);
    assert.equal(ledger.totals.savings, 700);
  });

  it("falls back an entry with no wallet_id to the default wallet", () => {
    const wallets = [makeWallet({ id: "cash", tag: "cash", balance: 1000, is_default: true })];
    const entries = [makeEntry({ id: "1", wallet_id: undefined, wallet_impact: -50 })];
    const ledger = buildWalletLedger(wallets, entries);
    assert.equal(ledger.totals.cash, 950);
  });
});

describe("buildDebtSummary", () => {
  it("starts from each debtor's opening balance and adds matching entries' debt_impact", () => {
    const debtors = [makeDebtor({ name: "เพื่อนเอ", kind: "lend", opening_balance: 100 })];
    const entries = [
      makeEntry({ transaction_type: "lend", debtor_name: "เพื่อนเอ", debt_impact: 200 }),
      makeEntry({ transaction_type: "debt_repayment", debtor_name: "เพื่อนเอ", debt_impact: -50 }),
    ];
    const summary = buildDebtSummary(debtors, entries, "lend", ["lend", "debt_repayment"]);
    assert.deepEqual(summary, [{ name: "เพื่อนเอ", amount: 250 }]);
  });

  it("keeps a zero/negative balance visible instead of hiding it", () => {
    const debtors = [makeDebtor({ name: "เพื่อนบี", kind: "own" })];
    const entries = [makeEntry({ transaction_type: "borrow", debtor_name: "เพื่อนบี", debt_impact: 100 }), makeEntry({ transaction_type: "debt_payment", debtor_name: "เพื่อนบี", debt_impact: -150 })];
    const summary = buildDebtSummary(debtors, entries, "own", ["borrow", "debt_payment"]);
    assert.deepEqual(summary, [{ name: "เพื่อนบี", amount: -50 }]);
  });
});

describe("netWorthAsOf", () => {
  it("wallets + receivable - payable, with no debts or investments", () => {
    const wallets = [makeWallet({ balance: 1000 })];
    const netWorth = netWorthAsOf(wallets, [], []);
    assert.equal(netWorth, 1000);
  });

  it("adds receivables (lend) and subtracts payables (own debt), full formula", () => {
    const wallets = [makeWallet({ balance: 1000 })];
    const debtors = [makeDebtor({ name: "เพื่อนเอ", kind: "lend" }), makeDebtor({ name: "บัตรเครดิต", kind: "own" })];
    // wallet_impact: 0 on both so this test isolates the debt math from the
    // wallet ledger -- calculateImpacts would set real wallet_impact values,
    // but that's covered by the calculateImpacts suite above.
    const entries = [
      makeEntry({ transaction_type: "lend", debtor_name: "เพื่อนเอ", debt_impact: 300, wallet_impact: 0 }),
      makeEntry({ transaction_type: "card_charge", debtor_name: "บัตรเครดิต", debt_impact: 200, wallet_impact: 0 }),
    ];
    const netWorth = netWorthAsOf(wallets, debtors, entries, 0, "full");
    assert.equal(netWorth, 1000 + 300 - 200);
  });

  it("obligation formula only subtracts the monthly installment due, not the full balance", () => {
    const wallets = [makeWallet({ balance: 1000 })];
    const debtors = [makeDebtor({ name: "ผ่อนรถ", kind: "own", monthly_installment: 100 })];
    // card_charge accrues debt (debt_impact > 0) so outstanding ends up 3000.
    const entries = [makeEntry({ transaction_type: "card_charge", debtor_name: "ผ่อนรถ", debt_impact: 3000, wallet_impact: 0 })];
    const netWorth = netWorthAsOf(wallets, debtors, entries, 0, "obligation");
    // outstanding 3000, monthly_installment 100 -> obligation is min(100, 3000) = 100
    assert.equal(netWorth, 1000 - 100);
  });

  it("adds portfolio value on top", () => {
    const wallets = [makeWallet({ balance: 1000 })];
    assert.equal(netWorthAsOf(wallets, [], [], 500), 1500);
  });
});

function makeInvestment(overrides: Partial<Investment> = {}): Investment {
  return { id: "i1", user_id: "u1", name: "SET50", code: "SET50", units: 10, cost_basis: 1000, icon: null, icon_color: null, ...overrides };
}

function makePrice(overrides: Partial<InvestmentPrice> = {}): InvestmentPrice {
  return { id: "p1", investment_id: "i1", nav: 100, recorded_at: "2026-01-01", ...overrides };
}

describe("buildPortfolioTrend", () => {
  it("uses each investment's latest price at or before each date, weighted by its current units", () => {
    const investments = [makeInvestment({ id: "a", units: 10 })];
    const prices = [
      makePrice({ id: "p1", investment_id: "a", recorded_at: "2026-01-01", nav: 100 }),
      makePrice({ id: "p2", investment_id: "a", recorded_at: "2026-01-05", nav: 110 }),
    ];
    const trend = buildPortfolioTrend(investments, prices);
    assert.deepEqual(trend, [
      { date: "2026-01-01", value: 1000 },
      { date: "2026-01-05", value: 1100 },
    ]);
  });

  it("contributes nothing for a date before an investment's first recorded price", () => {
    const investments = [makeInvestment({ id: "a", units: 5 }), makeInvestment({ id: "b", units: 2 })];
    const prices = [
      makePrice({ id: "p1", investment_id: "a", recorded_at: "2026-01-01", nav: 10 }),
      makePrice({ id: "p2", investment_id: "b", recorded_at: "2026-01-10", nav: 50 }),
    ];
    const trend = buildPortfolioTrend(investments, prices);
    // On 2026-01-01, "b" has no price yet -> contributes 0; only "a" counts.
    assert.deepEqual(trend[0], { date: "2026-01-01", value: 5 * 10 });
    // On 2026-01-10, "a" still uses its latest known price (10, unchanged),
    // "b" now has its first price (50).
    assert.deepEqual(trend[1], { date: "2026-01-10", value: 5 * 10 + 2 * 50 });
  });

  it("holds a NAV steady across dates where that investment has no new price logged", () => {
    const investments = [makeInvestment({ id: "a", units: 1 }), makeInvestment({ id: "b", units: 1 })];
    const prices = [
      makePrice({ id: "p1", investment_id: "a", recorded_at: "2026-01-01", nav: 100 }),
      makePrice({ id: "p2", investment_id: "b", recorded_at: "2026-01-02", nav: 200 }),
      makePrice({ id: "p3", investment_id: "a", recorded_at: "2026-01-03", nav: 105 }),
    ];
    const trend = buildPortfolioTrend(investments, prices);
    assert.deepEqual(trend, [
      { date: "2026-01-01", value: 100 }, // a=100, b=none
      { date: "2026-01-02", value: 300 }, // a still 100 (held), b=200
      { date: "2026-01-03", value: 305 }, // a=105, b still 200 (held)
    ]);
  });

  it("returns an empty trend when there are no prices at all", () => {
    assert.deepEqual(buildPortfolioTrend([makeInvestment()], []), []);
  });
});

describe("walletDeletionMove", () => {
  const petty = makeWallet({ id: "petty", name: "เหรียญสำรอง", tag: "petty", is_default: false });
  const cash = makeWallet({ id: "cash", name: "กระแสเงินสด", is_default: true });
  const savings = makeWallet({ id: "savings", name: "เงินออม", tag: "savings", is_default: false });

  it("moves the deleted wallet's entries to the default wallet", () => {
    const entries = [
      makeEntry({ id: "a", wallet_id: "petty" }),
      makeEntry({ id: "b", wallet_id: "cash" }),
      makeEntry({ id: "c", wallet_id: "petty" }),
    ];
    const move = walletDeletionMove(petty, [petty, cash, savings], entries);
    assert.equal(move.fallbackWallet?.id, "cash");
    assert.deepEqual(move.movingEntryIds, ["a", "c"]);
  });

  it("picks another wallet when the default itself is being deleted", () => {
    const move = walletDeletionMove(cash, [petty, cash, savings], [makeEntry({ wallet_id: "cash" })]);
    assert.equal(move.fallbackWallet?.id, "petty");
  });

  it("reports no destination when the last wallet is deleted", () => {
    const move = walletDeletionMove(cash, [cash], [makeEntry({ id: "a", wallet_id: "cash" })]);
    assert.equal(move.fallbackWallet, null);
    assert.deepEqual(move.movingEntryIds, ["a"]);
  });

  it("finds nothing to move when no entry uses the wallet", () => {
    const move = walletDeletionMove(savings, [petty, cash, savings], [makeEntry({ wallet_id: "cash" })]);
    assert.deepEqual(move.movingEntryIds, []);
  });
});
