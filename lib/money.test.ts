import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  balanceAdjustmentEntry,
  categorySpendAmount,
  mapTransactionRow,
  totalWallet,
  buildDebtSummary,
  buildPortfolioTrend,
  buildBalanceHistory,
  buildWalletLedger,
  calculateImpacts,
  describeDraftSave,
  draftRowCount,
  entryDisplayImpact,
  draftTotals,
  describeWalletDeletion,
  draftSaveTotal,
  expandDraftForSave,
  expandTransferDraft,
  incompleteTransferDrafts,
  isFundedLeg,
  fundingLegType,
  sameDebtorName,
  isMultiPersonSplit,
  splitDebtorNames,
  splitPinMismatch,
  splitSharesBetween,
  spendByCategory,
  matchDebtorName,
  filterEntries,
  netWorthAsOf,
  mismatchedSplitDrafts,
  normalizeEntry,
  partnerShareForPeople,
  peopleFromPartnerShare,
  planDebtSettlement,
  planEntryUpdate,
  receiptMismatch,
  recurringExpenseEntries,
  recurringTotals,
  recurringYearlyAmount,
  replaceEntry,
  retargetPartnerShare,
  retypedTo,
  unnamedDebtor,
  walletDeletionMove,
  withEntries,
} from "./money.ts";
import { TYPES_OWED_TO_USER } from "./taxonomy.ts";
import type { Debtor, Draft, Entry, HistoryFilters, Investment, InvestmentPrice, RecurringExpense, Wallet } from "./types.ts";

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

  it("split_half: an uneven share moves the debt without changing what left the wallet", () => {
    // "Dinner was 163, จูน is paying 100 of it": the whole bill still left the
    // wallet, but only 63 of it was the user's own spending.
    assert.deepEqual(calculateImpacts(163, "split_half", { partnerShare: 100 }), {
      wallet_impact: -163, debt_impact: 100, user_share: 63, partner_share: 100,
    });
  });

  it("split_half: a share outside the bill is clamped rather than believed", () => {
    assert.equal(calculateImpacts(100, "split_half", { partnerShare: 250 }).debt_impact, 100);
    assert.equal(calculateImpacts(100, "split_half", { partnerShare: -40 }).debt_impact, 0);
    assert.equal(calculateImpacts(100, "split_half", { partnerShare: Number.NaN }).debt_impact, 50);
  });

  it("split_half on a card: the debt is the partner's share and no wallet moves", () => {
    assert.deepEqual(calculateImpacts(163, "split_half", { funded: true }), {
      wallet_impact: 0, debt_impact: 81.5, user_share: 81.5, partner_share: 81.5,
    });
  });

  it("lend on a card: still owed in full, but the money came off the card", () => {
    assert.deepEqual(calculateImpacts(500, "lend", { funded: true }), {
      wallet_impact: 0, debt_impact: 500, user_share: 0, partner_share: 500,
    });
  });

  it("card_charge as a split's funding leg: the card owes it all, the user spent none of it here", () => {
    assert.deepEqual(calculateImpacts(163, "card_charge", { funded: true }), {
      wallet_impact: 0, debt_impact: 163, user_share: 0, partner_share: 0,
    });
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
  it("reads a stored uneven split back as it was saved", () => {
    // The impacts are recomputed on every read rather than trusted, so an
    // uneven share only survives a reload because partner_share is one of the
    // inputs to that recomputation.
    const entry = normalizeEntry({
      id: "1", title: "ข้าวมื้อเย็น", category: "อาหาร", amount: 163, transaction_type: "split_half",
      partner_share: 100, debtor_name: "จูน", occurred_at: "2026-09-05T00:00:00.000Z",
    });
    assert.equal(entry.partner_share, 100);
    assert.equal(entry.user_share, 63);
    assert.equal(entry.debt_impact, 100);
  });

  it("recognises a card-funded leg from the group id it was stored with", () => {
    const entry = normalizeEntry({
      id: "1", title: "ข้าวมื้อเย็น", category: "อาหาร", amount: 163, transaction_type: "split_half",
      debtor_name: "จูน", occurred_at: "2026-09-05T00:00:00.000Z", transfer_group_id: "g1",
    });
    assert.equal(entry.wallet_impact, 0);
    assert.equal(entry.debt_impact, 81.5);
  });

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

describe("buildBalanceHistory", () => {
  const now = new Date(2026, 8, 24, 15, 0);
  const at = (day: number, hour = 12) => new Date(2026, 8, day, hour, 0).toISOString();

  it("ends on the ledger's own balance and walks back one day at a time", () => {
    const wallets = [makeWallet({ id: "cash", tag: "cash", balance: 1000 })];
    const entries = [
      makeEntry({ id: "1", wallet_id: "cash", wallet_impact: -100, occurred_at: at(22) }),
      makeEntry({ id: "2", wallet_id: "cash", wallet_impact: 500, occurred_at: at(23) }),
      makeEntry({ id: "3", wallet_id: "cash", wallet_impact: -50, occurred_at: at(24, 9) }),
    ];
    const history = buildBalanceHistory(wallets, entries, "cash", 4, now);
    assert.deepEqual(history, [1000, 900, 1400, 1350]);
    assert.equal(history.at(-1), buildWalletLedger(wallets, entries).totals.cash);
  });

  it("counts only wallets with the tag, assigned the way the ledger assigns them", () => {
    const wallets = [
      makeWallet({ id: "cash", tag: "cash", balance: 1000, is_default: true }),
      makeWallet({ id: "savings", tag: "savings", balance: 5000, is_default: false }),
    ];
    const entries = [
      makeEntry({ id: "1", wallet_id: "savings", wallet_impact: -999, occurred_at: at(24) }),
      // No wallet_id: the ledger puts it in the default wallet, so must this.
      makeEntry({ id: "2", wallet_id: undefined, wallet_impact: -200, occurred_at: at(24) }),
    ];
    assert.deepEqual(buildBalanceHistory(wallets, entries, "cash", 2, now), [1000, 800]);
  });

  it("keeps a future-dated row in today's figure and out of every past day", () => {
    const wallets = [makeWallet({ id: "cash", tag: "cash", balance: 1000 })];
    const entries = [makeEntry({ id: "1", wallet_id: "cash", wallet_impact: -300, occurred_at: at(28) })];
    assert.deepEqual(buildBalanceHistory(wallets, entries, "cash", 2, now), [1000, 700]);
  });

  it("returns nothing for no days", () => {
    assert.deepEqual(buildBalanceHistory([], [], "cash", 0, now), []);
  });
});

describe("spendByCategory", () => {
  it("adds each category's own share, biggest first, and leaves out what was not spending", () => {
    const entries = [
      makeEntry({ id: "1", category: "อาหาร", transaction_type: "personal_expense", wallet_impact: -100, user_share: 100 }),
      makeEntry({ id: "2", category: "เดินทาง", transaction_type: "personal_expense", wallet_impact: -300, user_share: 300 }),
      makeEntry({ id: "3", category: "อาหาร", transaction_type: "personal_expense", wallet_impact: -250, user_share: 250 }),
      // Income is not spending, and neither is a wallet top-up.
      makeEntry({ id: "4", category: "รายได้", transaction_type: "income", wallet_impact: 5000, user_share: 5000 }),
    ];
    assert.deepEqual(spendByCategory(entries), [
      { category: "อาหาร", amount: 350 },
      { category: "เดินทาง", amount: 300 },
    ]);
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


const cashWallet: Wallet = { id: "cash", user_id: "u1", name: "เงินสด", tag: "cash", balance: 0, icon: null, icon_color: null, is_default: true };
const savingsWallet: Wallet = { id: "savings", user_id: "u1", name: "ออม", tag: "savings", balance: 0, icon: null, icon_color: null, is_default: false };

describe("withEntries", () => {
  it("keeps the list newest first", () => {
    const older = makeEntry({ id: "old", occurred_at: "2026-01-01T00:00:00.000Z" });
    const newer = makeEntry({ id: "new", occurred_at: "2026-03-01T00:00:00.000Z" });
    const middle = makeEntry({ id: "mid", occurred_at: "2026-02-01T00:00:00.000Z" });
    assert.deepEqual(withEntries([newer, older], [middle]).map((entry) => entry.id), ["new", "mid", "old"]);
  });

  it("puts a brand new entry at the top", () => {
    const existing = makeEntry({ id: "old", occurred_at: "2026-01-01T00:00:00.000Z" });
    const fresh = makeEntry({ id: "fresh", occurred_at: "2026-09-01T00:00:00.000Z" });
    assert.equal(withEntries([existing], [fresh])[0].id, "fresh");
  });

  it("adds several at once", () => {
    const result = withEntries([makeEntry({ id: "a", occurred_at: "2026-02-01T00:00:00.000Z" })], [
      makeEntry({ id: "b", occurred_at: "2026-01-01T00:00:00.000Z" }),
      makeEntry({ id: "c", occurred_at: "2026-03-01T00:00:00.000Z" }),
    ]);
    assert.deepEqual(result.map((entry) => entry.id), ["c", "a", "b"]);
  });

  it("does not mutate the list it was given", () => {
    const current = [makeEntry({ id: "a" })];
    withEntries(current, [makeEntry({ id: "b" })]);
    assert.deepEqual(current.map((entry) => entry.id), ["a"]);
  });

  it("handles an empty addition", () => {
    const current = [makeEntry({ id: "a" })];
    assert.deepEqual(withEntries(current, []).map((entry) => entry.id), ["a"]);
  });
});

describe("replaceEntry", () => {
  it("swaps the matching entry in place", () => {
    const current = [makeEntry({ id: "a", title: "เก่า" }), makeEntry({ id: "b" })];
    const result = replaceEntry(current, makeEntry({ id: "a", title: "ใหม่" }));
    assert.equal(result[0].title, "ใหม่");
    assert.equal(result[1].id, "b");
  });

  it("keeps position, since an edit must not reorder the list", () => {
    const current = [makeEntry({ id: "a" }), makeEntry({ id: "b" }), makeEntry({ id: "c" })];
    const result = replaceEntry(current, makeEntry({ id: "b", title: "แก้ไข" }));
    assert.deepEqual(result.map((entry) => entry.id), ["a", "b", "c"]);
  });

  it("leaves the list alone when nothing matches", () => {
    const current = [makeEntry({ id: "a" })];
    assert.deepEqual(replaceEntry(current, makeEntry({ id: "zzz" })), current);
  });
});

describe("planEntryUpdate", () => {
  const wallets = [cashWallet, savingsWallet];

  it("plans a plain update for an ordinary edit", () => {
    const edited = makeEntry({ id: "e1", title: "กาแฟ", amount: 120 });
    const plan = planEntryUpdate(edited, makeEntry({ id: "e1" }), wallets);
    assert.equal(plan.kind, "update");
    if (plan.kind !== "update") return;
    assert.equal(plan.entry.title, "กาแฟ");
    assert.equal(plan.entry.amount, 120);
  });

  it("normalizes the edited entry rather than trusting the form", () => {
    // wallet_impact is derived, not typed in: an edit that changed the amount
    // but left the old impact behind would otherwise be written straight to
    // the database and quietly move the wallet balance by the wrong number.
    const edited = makeEntry({ id: "e1", amount: 300, wallet_impact: -100, user_share: 100 });
    const plan = planEntryUpdate(edited, makeEntry({ id: "e1" }), wallets);
    assert.equal(plan.kind, "update");
    if (plan.kind !== "update") return;
    assert.equal(plan.entry.wallet_impact, -300);
  });

  it("treats an entry that was already a transfer as a plain update", () => {
    // Only the conversion needs the two-row dance. Editing an existing
    // transfer must not create a third row.
    const edited = makeEntry({ id: "e1", transaction_type: "transfer", wallet_id: "cash", transfer_to_wallet_id: "savings" });
    const plan = planEntryUpdate(edited, makeEntry({ id: "e1", transaction_type: "transfer" }), wallets, "savings");
    assert.equal(plan.kind, "update");
  });

  it("plans both legs when converting an entry into a transfer", () => {
    const edited = makeEntry({ id: "e1", amount: 500, transaction_type: "transfer", wallet_id: "cash" });
    const plan = planEntryUpdate(edited, makeEntry({ id: "e1", transaction_type: "personal_expense" }), wallets, "savings");
    assert.equal(plan.kind, "convert-to-transfer");
    if (plan.kind !== "convert-to-transfer") return;
    assert.equal(plan.sourceLeg.wallet_id, "cash");
    assert.equal(plan.destLeg.wallet_id, "savings");
    assert.equal(plan.sourceLeg.wallet_impact, -500);
    assert.equal(plan.destLeg.wallet_impact, 500);
  });

  it("ties the two legs together with one transfer_group_id", () => {
    // The pairing is what lets a later delete remove both sides; without it
    // deleting one leg leaves the other behind and the books stop balancing.
    const edited = makeEntry({ id: "e1", transaction_type: "transfer", wallet_id: "cash" });
    const plan = planEntryUpdate(edited, makeEntry({ id: "e1" }), wallets, "savings");
    assert.equal(plan.kind, "convert-to-transfer");
    if (plan.kind !== "convert-to-transfer") return;
    assert.ok(plan.sourceLeg.transfer_group_id);
    assert.equal(plan.sourceLeg.transfer_group_id, plan.destLeg.transfer_group_id);
  });

  it("rejects a conversion with no destination", () => {
    const edited = makeEntry({ id: "e1", transaction_type: "transfer", wallet_id: "cash" });
    const plan = planEntryUpdate(edited, makeEntry({ id: "e1" }), wallets, null);
    assert.equal(plan.kind, "rejected");
  });

  it("rejects a transfer to the wallet it came from", () => {
    // Two rows that net to zero, but still show up as activity in the ledger.
    const edited = makeEntry({ id: "e1", transaction_type: "transfer", wallet_id: "cash" });
    const plan = planEntryUpdate(edited, makeEntry({ id: "e1" }), wallets, "cash");
    assert.equal(plan.kind, "rejected");
  });

  it("falls back to the default wallet when the entry has none", () => {
    const edited = makeEntry({ id: "e1", transaction_type: "transfer", wallet_id: null });
    const plan = planEntryUpdate(edited, makeEntry({ id: "e1" }), wallets, "savings");
    assert.equal(plan.kind, "convert-to-transfer");
    if (plan.kind !== "convert-to-transfer") return;
    assert.equal(plan.sourceLeg.wallet_id, "cash", "cash is is_default");
  });

  it("treats a missing original as a conversion, not an edit", () => {
    // An entry the local list has not caught up with yet still has to produce
    // both legs, or the incoming half is never written.
    const edited = makeEntry({ id: "e1", transaction_type: "transfer", wallet_id: "cash" });
    const plan = planEntryUpdate(edited, undefined, wallets, "savings");
    assert.equal(plan.kind, "convert-to-transfer");
  });
});

describe("recurringYearlyAmount", () => {
  it("counts a monthly bill twelve times", () => {
    assert.equal(recurringYearlyAmount({ amount: 100, interval_unit: "month", interval_count: 1 }), 1200);
  });

  it("counts a yearly bill once", () => {
    // The comparison the app could not make before: a 1,200 yearly domain and
    // a 100 monthly subscription cost the same, and reading the stored amounts
    // straight off the rows called the domain twelve times the cheaper one.
    assert.equal(recurringYearlyAmount({ amount: 1200, interval_unit: "month", interval_count: 12 }), 1200);
  });

  it("counts a quarterly bill four times", () => {
    assert.equal(recurringYearlyAmount({ amount: 600, interval_unit: "month", interval_count: 3 }), 2400);
  });

  it("counts a weekly bill by the year's weeks, not by the month's", () => {
    assert.equal(recurringYearlyAmount({ amount: 100, interval_unit: "week", interval_count: 1 }), 5200);
    assert.equal(recurringYearlyAmount({ amount: 100, interval_unit: "week", interval_count: 2 }), 2600);
  });

  it("treats a nonsense interval count as one rather than dividing by zero", () => {
    assert.equal(recurringYearlyAmount({ amount: 100, interval_unit: "month", interval_count: 0 }), 1200);
  });
});

describe("recurringTotals", () => {
  const bill = (overrides: Partial<RecurringExpense>): RecurringExpense => ({
    id: "r1", user_id: "u1", name: "x", amount: 100, anchor_date: "2026-09-01",
    interval_unit: "month", interval_count: 1, icon: null, icon_color: null,
    wallet_id: null, funding_card_name: null, is_active: true, ...overrides,
  });

  it("spreads bills on different cycles over the same month", () => {
    const totals = recurringTotals([
      bill({ id: "a", amount: 100 }),
      bill({ id: "b", amount: 1200, interval_count: 12 }),
    ]);
    assert.equal(totals.yearly, 2400);
    assert.equal(totals.monthly, 200);
  });

  it("leaves a paused bill out of both figures", () => {
    const totals = recurringTotals([bill({ id: "a" }), bill({ id: "b", amount: 900, is_active: false })]);
    assert.equal(totals.yearly, 1200);
    assert.equal(totals.monthly, 100);
  });

  it("rounds to satang instead of handing on float noise", () => {
    // 419 a month divided back out per month is 418.99999... in binary, and
    // the AI context prints whatever it is given verbatim.
    assert.equal(recurringTotals([bill({ amount: 419 })]).monthly, 419);
  });

  it("is zero for a list with nothing running", () => {
    assert.deepEqual(recurringTotals([]), { monthly: 0, yearly: 0 });
  });
});

describe("recurringExpenseEntries", () => {
  const billingDate = new Date("2026-09-05T00:00:00.000Z");
  const wallets = [savingsWallet, cashWallet];

  it("books the bill as a personal expense in the bills category", () => {
    const [entry] = recurringExpenseEntries({ name: "Netflix", amount: 419 }, billingDate, [cashWallet], "id-1");
    assert.equal(entry.title, "Netflix");
    assert.equal(entry.category, "บิลประจำ");
    assert.equal(entry.transaction_type, "personal_expense");
    assert.equal(entry.amount, 419);
  });

  it("takes money out of the wallet rather than putting it in", () => {
    const [entry] = recurringExpenseEntries({ name: "Netflix", amount: 419 }, billingDate, [cashWallet], "id-1");
    assert.equal(entry.wallet_impact, -419);
    assert.equal(entry.debt_impact, 0);
  });

  it("dates the entry to the billing day, not to today", () => {
    // A bill logged late still belongs to the cycle it was charged in, or it
    // lands in the wrong month's totals.
    const [entry] = recurringExpenseEntries({ name: "ค่าเน็ต", amount: 599 }, billingDate, [cashWallet], "id-1");
    assert.equal(entry.occurred_at, billingDate.toISOString());
  });

  it("falls back to the default wallet when the bill names none", () => {
    const [entry] = recurringExpenseEntries({ name: "Netflix", amount: 419 }, billingDate, wallets, "id-1");
    assert.equal(entry.wallet_id, "cash");
  });

  it("takes the bill out of the wallet the user picked, not the default one", () => {
    const [entry] = recurringExpenseEntries({ name: "Netflix", amount: 419, wallet_id: "savings" }, billingDate, wallets, "id-1");
    assert.equal(entry.wallet_id, "savings");
  });

  it("uses the id it is given", () => {
    assert.equal(recurringExpenseEntries({ name: "x", amount: 1 }, billingDate, [cashWallet], "chosen")[0].id, "chosen");
  });

  it("writes a card-paid bill as the same two linked rows a card-paid dinner is", () => {
    const rows = recurringExpenseEntries(
      { name: "Netflix", amount: 419, funding_card_name: "บัตรเครดิต" },
      billingDate,
      wallets,
      "id-1",
    );
    assert.equal(rows.length, 2);
    const [expense, charge] = rows;
    assert.equal(expense.transaction_type, "personal_expense");
    assert.equal(charge.transaction_type, "card_charge");
    assert.equal(charge.debtor_name, "บัตรเครดิต");
    assert.ok(expense.transfer_group_id);
    assert.equal(expense.transfer_group_id, charge.transfer_group_id);
  });

  it("leaves the wallet alone when the card paid, and puts the whole bill on the card", () => {
    // The bank has not taken the money yet -- that happens when the card's own
    // bill is paid. Deducting it here would be the app spending money twice.
    const [expense, charge] = recurringExpenseEntries(
      { name: "Netflix", amount: 419, funding_card_name: "บัตรเครดิต" },
      billingDate,
      wallets,
      "id-1",
    );
    assert.equal(expense.wallet_impact, 0);
    assert.equal(charge.wallet_impact, 0);
    assert.equal(charge.debt_impact, 419);
  });

  it("counts a card-paid bill once as spending, on the expense leg only", () => {
    const [expense, charge] = recurringExpenseEntries(
      { name: "Netflix", amount: 419, funding_card_name: "บัตรเครดิต" },
      billingDate,
      wallets,
      "id-1",
    );
    assert.equal(expense.user_share, 419);
    assert.equal(charge.user_share, 0);
  });

  it("ignores a stored wallet when a card is what pays", () => {
    // Both columns can hold a value if the row was edited oddly; the card is
    // the one that decides, the same way a draft's funding card overrides its
    // wallet.
    const rows = recurringExpenseEntries(
      { name: "Netflix", amount: 419, wallet_id: "savings", funding_card_name: "บัตรเครดิต" },
      billingDate,
      wallets,
      "id-1",
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0].wallet_impact, 0);
  });

  it("takes a bill the partner pays off what they owe instead of owing them for it", () => {
    // ค่าเน็ตจูนจ่ายทุกเดือน แล้วหักจากยอดที่จูนติดเรา: one bill, no wallet
    // movement, no new debt of the user's -- จูน is simply owed 599 less.
    const [expense, funding] = recurringExpenseEntries(
      { name: "ค่าเน็ต", amount: 599, funding_card_name: "จูน" },
      billingDate,
      wallets,
      "id-1",
      [makeDebtor({ name: "จูน", kind: "lend" })],
    );
    assert.equal(expense.wallet_impact, 0);
    assert.equal(expense.user_share, 599);
    assert.equal(funding.transaction_type, "debt_repayment");
    assert.equal(funding.debt_impact, -599);
    assert.equal(funding.wallet_impact, 0);
  });

  it("treats a blank card name as no card at all", () => {
    const rows = recurringExpenseEntries({ name: "Netflix", amount: 419, funding_card_name: "   " }, billingDate, wallets, "id-1");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].wallet_impact, -419);
  });
});

describe("describeWalletDeletion", () => {
  const cash: Wallet = { id: "cash", user_id: "u1", name: "บัญชีหลัก", tag: "cash", balance: 1000, icon: null, icon_color: null, is_default: true };
  const petty: Wallet = { id: "petty", user_id: "u1", name: "กระเป๋าย่อย", tag: "petty", balance: 200, icon: null, icon_color: null, is_default: false };

  it("names the wallet being deleted", () => {
    assert.ok(describeWalletDeletion(petty, [cash, petty], [], 0).detail.includes("กระเป๋าย่อย"));
  });

  it("says how many entries move and where they go", () => {
    // The number and the destination are the two facts the user is agreeing
    // to. Either one wrong and they consented to something else.
    const entries = [makeEntry({ id: "a", wallet_id: "petty" }), makeEntry({ id: "b", wallet_id: "petty" })];
    const summary = describeWalletDeletion(petty, [cash, petty], entries, 0);
    assert.deepEqual(summary.movingEntryIds, ["a", "b"]);
    assert.equal(summary.fallbackWallet?.id, "cash");
    assert.ok(summary.detail.includes("2 รายการ"), summary.detail);
    assert.ok(summary.detail.includes("บัญชีหลัก"), summary.detail);
  });

  it("warns that entries will be left with no wallet when none is left", () => {
    const summary = describeWalletDeletion(cash, [cash], [makeEntry({ id: "a", wallet_id: "cash" })], 0);
    assert.equal(summary.fallbackWallet, null);
    assert.ok(summary.detail.includes("ไม่เหลือกระเป๋าอื่น"), summary.detail);
  });

  it("says nothing about moving when nothing moves", () => {
    const summary = describeWalletDeletion(petty, [cash, petty], [makeEntry({ wallet_id: "cash" })], 0);
    assert.deepEqual(summary.movingEntryIds, []);
    assert.ok(!summary.detail.includes("รายการ"), summary.detail);
  });

  it("warns about a balance that is still in the wallet", () => {
    const summary = describeWalletDeletion(petty, [cash, petty], [], 250);
    assert.equal(summary.hasBalance, true);
    assert.ok(summary.detail.includes("250"), summary.detail);
  });

  it("warns about a negative balance too", () => {
    // An overdrawn wallet is at least as important to mention as a full one.
    const summary = describeWalletDeletion(petty, [cash, petty], [], -80);
    assert.equal(summary.hasBalance, true);
    assert.ok(summary.detail.includes("80"), summary.detail);
  });

  it("stays quiet about a rounding residue", () => {
    // Warning "there is still ฿0.00 left" on every empty wallet teaches people
    // to click through the dialog without reading it.
    for (const residue of [0, 0.001, -0.004]) {
      const summary = describeWalletDeletion(petty, [cash, petty], [], residue);
      assert.equal(summary.hasBalance, false, `${residue} should not count as a balance`);
      assert.ok(!summary.detail.includes("ยอดเหลือ"), summary.detail);
    }
  });

  it("warns about anything above the rounding threshold", () => {
    assert.equal(describeWalletDeletion(petty, [cash, petty], [], 0.01).hasBalance, true);
  });

  it("uses the balance after transactions, not the opening balance", () => {
    // wallet.balance is what the wallet started with; the number that matters
    // is what is in it now, which only the caller's ledger knows.
    const summary = describeWalletDeletion(petty, [cash, petty], [], 4321);
    assert.equal(summary.balance, 4321);
    assert.ok(summary.detail.includes("4,321"), summary.detail);
  });

  it("falls back to the opening balance when the ledger has no row", () => {
    const summary = describeWalletDeletion(petty, [cash, petty], []);
    assert.equal(summary.balance, 200);
  });

  it("mentions both the balance and the move when both apply", () => {
    const summary = describeWalletDeletion(petty, [cash, petty], [makeEntry({ id: "a", wallet_id: "petty" })], 500);
    assert.ok(summary.detail.includes("500"), summary.detail);
    assert.ok(summary.detail.includes("1 รายการ"), summary.detail);
  });
});

function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return { ...makeEntry(), ...overrides } as Draft;
}

describe("incompleteTransferDrafts", () => {
  it("finds a transfer with no destination", () => {
    const drafts = [makeDraft({ id: "t", transaction_type: "transfer", wallet_id: "cash", transfer_to_wallet_id: null })];
    assert.deepEqual(incompleteTransferDrafts(drafts).map((draft) => draft.id), ["t"]);
  });

  it("finds a transfer pointed back at its own wallet", () => {
    const drafts = [makeDraft({ id: "t", transaction_type: "transfer", wallet_id: "cash", transfer_to_wallet_id: "cash" })];
    assert.deepEqual(incompleteTransferDrafts(drafts).map((draft) => draft.id), ["t"]);
  });

  it("accepts a finished transfer", () => {
    const drafts = [makeDraft({ transaction_type: "transfer", wallet_id: "cash", transfer_to_wallet_id: "savings" })];
    assert.deepEqual(incompleteTransferDrafts(drafts), []);
  });

  it("ignores non-transfer drafts with no destination", () => {
    // Every ordinary expense has transfer_to_wallet_id unset; treating that as
    // unfinished would disable the save button on every AI parse.
    assert.deepEqual(incompleteTransferDrafts([makeDraft({ transaction_type: "personal_expense" })]), []);
  });

  it("returns only the offending drafts out of a mixed batch", () => {
    const drafts = [
      makeDraft({ id: "ok", transaction_type: "personal_expense" }),
      makeDraft({ id: "bad", transaction_type: "transfer", wallet_id: "cash", transfer_to_wallet_id: null }),
      makeDraft({ id: "fine", transaction_type: "transfer", wallet_id: "cash", transfer_to_wallet_id: "savings" }),
    ];
    assert.deepEqual(incompleteTransferDrafts(drafts).map((draft) => draft.id), ["bad"]);
  });
});

describe("draftSaveTotal / describeDraftSave", () => {
  it("adds up the drafts", () => {
    assert.equal(draftSaveTotal([makeDraft({ amount: 100 }), makeDraft({ amount: 250 })]), 350);
  });

  it("leaves transfers out of the total", () => {
    // Moving 5,000 between your own wallets is not 5,000 of spending, and the
    // saved toast is the number the user reads back.
    const drafts = [
      makeDraft({ amount: 100, transaction_type: "personal_expense" }),
      makeDraft({ amount: 5000, transaction_type: "transfer", wallet_id: "cash", transfer_to_wallet_id: "savings" }),
    ];
    assert.equal(draftSaveTotal(drafts), 100);
  });

  it("counts income toward the total", () => {
    // Income is money the batch records; only transfers are excluded.
    assert.equal(draftSaveTotal([makeDraft({ amount: 45000, transaction_type: "income" })]), 45000);
  });

  it("names the count and the total in the saved toast", () => {
    const detail = describeDraftSave([makeDraft({ amount: 100 }), makeDraft({ amount: 250 })]);
    assert.ok(detail.includes("2 รายการ"), detail);
    assert.ok(detail.includes("350"), detail);
  });

  it("handles an empty batch without producing NaN", () => {
    assert.equal(draftSaveTotal([]), 0);
    assert.ok(!describeDraftSave([]).includes("NaN"));
  });
});

describe("receiptMismatch", () => {
  const drafts = [makeDraft({ amount: 100 }), makeDraft({ amount: 250 })];

  it("says nothing when there is no slip total to compare against", () => {
    assert.equal(receiptMismatch(drafts, 0), null);
  });

  it("says nothing when the totals agree", () => {
    assert.equal(receiptMismatch(drafts, 350), null);
  });

  it("tolerates a rounding difference of up to one baht either way", () => {
    // A receipt's own total is computed before its per-item prices are
    // rounded, so an exact match is not something a correct parse can promise
    // -- and a warning that fires on every slip is one nobody reads.
    assert.equal(receiptMismatch(drafts, 351), null);
    assert.equal(receiptMismatch(drafts, 349), null);
  });

  it("warns once the gap is bigger than the tolerance", () => {
    const mismatch = receiptMismatch(drafts, 352);
    assert.ok(mismatch);
    assert.equal(mismatch?.parsedTotal, 350);
    assert.equal(mismatch?.receiptTotal, 352);
  });

  it("warns when the parse read too much as well as too little", () => {
    // Over-reading a slip inflates the user's spending just as wrongly as
    // under-reading it hides some.
    assert.ok(receiptMismatch(drafts, 300), "parsed more than the slip says");
    assert.ok(receiptMismatch(drafts, 400), "parsed less than the slip says");
  });

  it("puts both numbers in the message", () => {
    const mismatch = receiptMismatch(drafts, 500);
    assert.ok(mismatch?.detail.includes("350"), mismatch?.detail);
    assert.ok(mismatch?.detail.includes("500"), mismatch?.detail);
  });

  it("counts transfers toward the parsed total", () => {
    // Unlike the save confirmation: the question here is whether the slip was
    // read correctly, not how much was spent, so every row the parser produced
    // has to be on the scale.
    const withTransfer = [makeDraft({ amount: 100 }), makeDraft({ amount: 250, transaction_type: "transfer" })];
    assert.equal(receiptMismatch(withTransfer, 350), null);
  });

  it("ignores a negative slip total rather than treating it as a mismatch", () => {
    assert.equal(receiptMismatch(drafts, -50), null);
  });
});

describe("isFundedLeg", () => {
  it("is a leg only when a split/lend/funding row carries a group id", () => {
    assert.equal(isFundedLeg({ transaction_type: "split_half", transfer_group_id: "g1" }), true);
    assert.equal(isFundedLeg({ transaction_type: "lend", transfer_group_id: "g1" }), true);
    assert.equal(isFundedLeg({ transaction_type: "card_charge", transfer_group_id: "g1" }), true);
    assert.equal(isFundedLeg({ transaction_type: "debt_repayment", transfer_group_id: "g1" }), true);
    assert.equal(isFundedLeg({ transaction_type: "split_half", transfer_group_id: null }), false);
  });

  it("leaves a repayment that was actually paid in cash alone", () => {
    // planDebtSettlement writes one of these with no group, and it has to keep
    // moving a wallet -- being a leg is what makes a repayment weightless.
    assert.equal(isFundedLeg({ transaction_type: "debt_repayment", transfer_group_id: null }), false);
  });

  it("never mistakes a transfer leg for one", () => {
    // Transfers are the other thing that shares a transfer_group_id, and were
    // the only thing that did before funded bills existed.
    assert.equal(isFundedLeg({ transaction_type: "transfer", transfer_group_id: "g1" }), false);
  });
});

describe("fundingLegType", () => {
  const debtors = [makeDebtor({ id: "d1", name: "SPay", kind: "own" }), makeDebtor({ id: "d2", name: "จูน", kind: "lend" })];

  it("puts a bill a card paid onto the card as a new charge", () => {
    assert.equal(fundingLegType("SPay", debtors), "card_charge");
  });

  it("takes a bill someone who owes the user paid off their balance instead", () => {
    assert.equal(fundingLegType("จูน", debtors), "debt_repayment");
    assert.equal(fundingLegType("  จูน ", debtors), "debt_repayment");
  });

  it("treats a name in neither book as someone the user now owes", () => {
    assert.equal(fundingLegType("อ้อน", debtors), "card_charge");
    assert.equal(fundingLegType("จูน", []), "card_charge");
  });
});

describe("sameDebtorName", () => {
  it("ignores case and surrounding space", () => {
    assert.equal(sameDebtorName(" SPay ", "spay"), true);
  });

  it("is never true for a missing name", () => {
    assert.equal(sameDebtorName("", ""), false);
    assert.equal(sameDebtorName(null, undefined), false);
  });
});

describe("retargetPartnerShare", () => {
  it("keeps an even split even when the bill changes", () => {
    assert.equal(retargetPartnerShare(100, 50, 163), 81.5);
  });

  it("leaves a share the user set alone", () => {
    assert.equal(retargetPartnerShare(163, 100, 200), 100);
  });

  it("clamps a kept share into a bill that shrank below it", () => {
    assert.equal(retargetPartnerShare(163, 100, 80), 80);
  });
});

describe("expandDraftForSave: a bill paid with a card", () => {
  const cardSplit: Draft = {
    id: "d1",
    title: "ข้าวมื้อเย็น",
    category: "อาหาร",
    amount: 163,
    type: "expense",
    transaction_type: "split_half",
    wallet_impact: -163,
    debt_impact: 81.5,
    user_share: 81.5,
    partner_share: 81.5,
    debtor_name: "จูน",
    occurred_at: "2026-09-05T12:00:00.000Z",
    wallet_id: "w1",
    note: null,
    funding_card_name: "SPay",
  };

  it("leaves a draft that isn't card-funded alone", () => {
    assert.deepEqual(expandDraftForSave({ ...cardSplit, funding_card_name: null }, []), [{ ...cardSplit, funding_card_name: null }]);
    assert.equal(expandDraftForSave({ ...cardSplit, transaction_type: "gift" }, []).length, 1);
  });

  it("writes the charge to the card and the share to the person, and moves no wallet money", () => {
    const [expense, card] = expandDraftForSave(cardSplit, []);

    assert.equal(expense.transaction_type, "split_half");
    assert.equal(expense.debtor_name, "จูน");
    assert.equal(expense.debt_impact, 81.5);
    assert.equal(expense.user_share, 81.5);
    assert.equal(expense.wallet_impact, 0);
    assert.equal(expense.wallet_id, null);

    assert.equal(card.transaction_type, "card_charge");
    assert.equal(card.debtor_name, "SPay");
    assert.equal(card.debt_impact, 163);
    // The dinner counts once: 81.5 of food, not 163 + 81.5.
    assert.equal(card.user_share, 0);

    assert.equal(expense.wallet_impact + card.wallet_impact, 0);
    assert.equal(expense.transfer_group_id, card.transfer_group_id);
    assert.ok(expense.transfer_group_id);
  });

  it("keeps an uneven share when it splits", () => {
    const [expense, card] = expandDraftForSave({ ...cardSplit, partner_share: 100 }, []);
    assert.equal(expense.debt_impact, 100);
    assert.equal(expense.user_share, 63);
    assert.equal(card.debt_impact, 163);
  });

  it("says which card paid when the user left no note of their own", () => {
    assert.equal(expandDraftForSave(cardSplit, [])[0].note, "จ่ายด้วย SPay");
    assert.equal(expandDraftForSave({ ...cardSplit, note: "กับที่ทำงาน" }, [])[0].note, "กับที่ทำงาน");
  });

  it("survives the save path's re-normalize with its numbers intact", () => {
    // saveEntries normalizes again after expanding; the legs have to be
    // idempotent under that or the wallet_impact it just zeroed comes back.
    const [expense, card] = expandDraftForSave(cardSplit, []).map((leg) => normalizeEntry(leg));
    assert.equal(expense.wallet_impact, 0);
    assert.equal(card.user_share, 0);
  });
});

describe("expandDraftForSave", () => {
  const wallets: Wallet[] = [
    { id: "w1", user_id: "u1", name: "เงินสด", tag: "cash", is_default: true, balance: 0, icon: null, icon_color: null },
    { id: "w2", user_id: "u1", name: "เงินออม", tag: "savings", is_default: false, balance: 0, icon: null, icon_color: null },
  ];
  const base: Draft = {
    id: "d1", title: "โอน", category: "อื่น ๆ", amount: 500, type: "expense", transaction_type: "transfer",
    wallet_impact: -500, debt_impact: 0, user_share: 0, partner_share: 0, debtor_name: "",
    occurred_at: "2026-09-05T12:00:00.000Z", wallet_id: "w1", transfer_to_wallet_id: "w2", note: null,
  };

  it("still expands a transfer into its two legs", () => {
    assert.equal(expandDraftForSave(base, wallets).length, 2);
  });

  it("expands a card-funded split too", () => {
    const split = { ...base, transaction_type: "split_half" as const, transfer_to_wallet_id: null, debtor_name: "จูน", funding_card_name: "SPay" };
    assert.equal(expandDraftForSave(split, wallets).length, 2);
  });

  it("leaves an ordinary draft as one row", () => {
    assert.equal(expandDraftForSave({ ...base, transaction_type: "personal_expense", transfer_to_wallet_id: null }, wallets).length, 1);
  });
});

describe("matchDebtorName", () => {
  const cards = ["SPay", "กรุงศรีเฟิร์สช้อย"];

  it("matches regardless of case and spacing", () => {
    assert.equal(matchDebtorName(cards, "spay"), "SPay");
    assert.equal(matchDebtorName(cards, "  SPAY "), "SPay");
  });

  it("matches a name the user wrote longer than the model did", () => {
    assert.equal(matchDebtorName(["บัตร SPay"], "spay"), "บัตร SPay");
  });

  it("resolves to nothing rather than guessing between two cards", () => {
    assert.equal(matchDebtorName(["บัตร A", "บัตร B"], "บัตร"), null);
  });

  it("resolves to nothing for a card the user does not have", () => {
    assert.equal(matchDebtorName(cards, "กสิกร"), null);
    assert.equal(matchDebtorName(cards, ""), null);
    assert.equal(matchDebtorName(cards, undefined), null);
  });
});

describe("entryDisplayImpact", () => {
  const row = (overrides: Partial<Entry>) => normalizeEntry({
    id: "1", title: "ข้าวเที่ยง", category: "อาหาร", amount: 70, transaction_type: "personal_expense",
    occurred_at: "2026-09-05T00:00:00.000Z", ...overrides,
  }, false);

  it("shows an ordinary row's wallet movement", () => {
    assert.equal(entryDisplayImpact(row({})), -70);
  });

  it("puts the number on the funding leg, whichever kind it is", () => {
    // Both legs of a funded bill are on screen together, so exactly one of
    // them may carry the amount.
    assert.equal(entryDisplayImpact(row({ transfer_group_id: "g1" })), 0);
    assert.equal(entryDisplayImpact(row({ transaction_type: "card_charge", debtor_name: "SPay", transfer_group_id: "g1" })), -70);
    assert.equal(entryDisplayImpact(row({ transaction_type: "debt_repayment", debtor_name: "จูน", transfer_group_id: "g1" })), -70);
  });

  it("still shows cash coming back as cash coming back", () => {
    assert.equal(entryDisplayImpact(row({ transaction_type: "debt_repayment", debtor_name: "จูน" })), 70);
  });
});

describe("expandDraftForSave: a bill paid by someone who already owed the user", () => {
  // The offset the user used to write by hand as two rows -- "จูนคืนเงิน 70"
  // plus "ซื้อข้าว 70" -- which balanced the wallet but told the month it had
  // earned 70 baht it never saw.
  const debtors = [makeDebtor({ id: "d1", name: "จูน", kind: "lend" }), makeDebtor({ id: "d2", name: "SPay", kind: "own" })];
  const lunch: Draft = {
    id: "d1", title: "ข้าวเที่ยง", category: "อาหาร", amount: 70, type: "expense",
    transaction_type: "personal_expense", wallet_impact: -70, debt_impact: 0, user_share: 70,
    partner_share: 0, debtor_name: "", occurred_at: "2026-09-05T12:00:00.000Z",
    wallet_id: "w1", note: null, funding_card_name: "จูน",
  };

  it("spends the money without moving a wallet, and takes it off what she owes", () => {
    const [expense, funding] = expandDraftForSave(lunch, [], debtors);

    assert.equal(expense.transaction_type, "personal_expense");
    assert.equal(expense.user_share, 70);
    assert.equal(expense.wallet_impact, 0);
    assert.equal(expense.wallet_id, null);

    assert.equal(funding.transaction_type, "debt_repayment");
    assert.equal(funding.debtor_name, "จูน");
    assert.equal(funding.debt_impact, -70);
    assert.equal(funding.wallet_impact, 0);
    assert.equal(funding.transfer_group_id, expense.transfer_group_id);
  });

  it("invents no income, which is the whole reason the pair exists", () => {
    const rows = expandDraftForSave(lunch, [], debtors).map((row) => normalizeEntry(row));
    assert.equal(totalWallet(rows, "income"), 0);
    assert.equal(totalWallet(rows, "expense"), 0);
    assert.equal(rows.reduce((sum, row) => sum + (categorySpendAmount(row) ?? 0), 0), 70);
  });

  it("moves her balance by the difference when the bill was shared", () => {
    // 140 split down the middle and จูน paid: she is owed 70 less, not 140.
    const shared = { ...lunch, amount: 140, transaction_type: "split_half" as const, debtor_name: "จูน", partner_share: 70, user_share: 70 };
    const rows = expandDraftForSave(shared, [], debtors).map((row) => normalizeEntry(row));
    const summary = buildDebtSummary(debtors, rows as Entry[], "lend", TYPES_OWED_TO_USER);
    assert.deepEqual(summary, [{ name: "จูน", amount: -70 }]);
  });

  it("still charges the card when the funder is one, and still owes a stranger", () => {
    assert.equal(expandDraftForSave({ ...lunch, funding_card_name: "SPay" }, [], debtors)[1].transaction_type, "card_charge");
    assert.equal(expandDraftForSave({ ...lunch, funding_card_name: "พี่แอน" }, [], debtors)[1].transaction_type, "card_charge");
    // No debtor list at all is how every caller behaved before there was a
    // second direction, and it has to keep meaning "they are owed for it".
    assert.equal(expandDraftForSave(lunch, [], [])[1].transaction_type, "card_charge");
  });

  it("says in the note why her balance dropped, unless the user wrote their own", () => {
    assert.match(expandDraftForSave(lunch, [], debtors)[1].note ?? "", /หักจากยอดที่จูนติดเรา/);
    assert.equal(expandDraftForSave({ ...lunch, note: "มื้อเย็น" }, [], debtors)[1].note, "มื้อเย็น");
  });
});

describe("splitting a bill between people", () => {
  it("leaves the user with their own share and the rest owed back", () => {
    // The party case: 1200 six ways is 200 each, so 1000 comes back.
    assert.equal(partnerShareForPeople(1200, 6), 1000);
    assert.equal(1200 - partnerShareForPeople(1200, 6), 200);
  });

  it("matches the old even split at two people", () => {
    assert.equal(partnerShareForPeople(163, 2), 81.5);
  });

  it("rounds to satang rather than handing the user 108.66666666666667", () => {
    assert.equal(partnerShareForPeople(163, 3), 108.67);
  });

  it("holds a headcount inside the supported range", () => {
    assert.equal(partnerShareForPeople(100, 1), partnerShareForPeople(100, 2));
    assert.equal(partnerShareForPeople(100, 999), partnerShareForPeople(100, 50));
  });

  it("reads the headcount back off a share it produced", () => {
    assert.equal(peopleFromPartnerShare(1200, 1000), 6);
    assert.equal(peopleFromPartnerShare(163, 108.67), 3);
    assert.equal(peopleFromPartnerShare(163, 81.5), 2);
  });

  it("reports no headcount for a share the user typed themselves", () => {
    assert.equal(peopleFromPartnerShare(163, 100), null);
  });

  it("keeps the same headcount when the bill changes", () => {
    // 1200 six ways, re-read as 1800: still six ways, not "1000 of 1800".
    assert.equal(retargetPartnerShare(1200, 1000, 1800), 1500);
  });
});

describe("splitDebtorNames", () => {
  it("reads several people out of the one field", () => {
    assert.deepEqual(splitDebtorNames("อ้อน, แบงค์, วิน, พี่พัก"), ["อ้อน", "แบงค์", "วิน", "พี่พัก"]);
  });

  it("trims, drops blanks and the unnamed placeholder, and keeps each person once", () => {
    assert.deepEqual(splitDebtorNames(" อ้อน ,, ไม่ระบุ , อ้อน , แบงค์ "), ["อ้อน", "แบงค์"]);
    assert.deepEqual(splitDebtorNames(""), []);
    assert.deepEqual(splitDebtorNames(null), []);
  });

  it("only counts as a multi-person split on a type that can be shared", () => {
    assert.equal(isMultiPersonSplit({ transaction_type: "split_half", debtor_name: "อ้อน, แบงค์" }), true);
    assert.equal(isMultiPersonSplit({ transaction_type: "lend", debtor_name: "อ้อน, แบงค์" }), true);
    assert.equal(isMultiPersonSplit({ transaction_type: "split_half", debtor_name: "อ้อน" }), false);
    assert.equal(isMultiPersonSplit({ transaction_type: "personal_expense", debtor_name: "อ้อน, แบงค์" }), false);
  });
});

describe("expandDraftForSave: a bill split between named people", () => {
  const beers: Draft = {
    id: "d1", title: "ค่าเบียร์", category: "อาหาร", amount: 1500, type: "expense",
    transaction_type: "split_half", wallet_impact: -1500, debt_impact: 1200, user_share: 300,
    partner_share: 1200, debtor_name: "อ้อน, แบงค์, วิน, พี่พัก",
    occurred_at: "2026-09-05T12:00:00.000Z", wallet_id: "w1", note: null,
  };

  it("writes one debt per person and keeps the user's own share", () => {
    const rows = expandDraftForSave(beers, []);
    assert.equal(rows.length, 5);

    const debts = rows.filter((row) => row.transaction_type === "lend");
    assert.deepEqual(debts.map((row) => row.debtor_name), ["อ้อน", "แบงค์", "วิน", "พี่พัก"]);
    assert.deepEqual(debts.map((row) => row.debt_impact), [300, 300, 300, 300]);

    const mine = rows.find((row) => row.transaction_type === "personal_expense")!;
    assert.equal(mine.amount, 300);
    assert.equal(mine.user_share, 300);
    assert.equal(mine.debt_impact, 0);
  });

  it("takes exactly the bill out of the wallet, no more and no less", () => {
    const rows = expandDraftForSave(beers, []);
    assert.equal(rows.reduce((sum, row) => sum + row.wallet_impact, 0), -1500);
    assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 1500);
  });

  it("gives the rounding remainder to the one holding the receipt", () => {
    // 1000 three ways is 333.33 each; the odd satang is the user's, not a
    // friend's, and the rows still add up to the bill.
    const rows = expandDraftForSave({ ...beers, amount: 1000, debtor_name: "อ้อน, แบงค์" }, []);
    assert.deepEqual(rows.filter((row) => row.transaction_type === "lend").map((row) => row.amount), [333.33, 333.33]);
    assert.equal(rows.find((row) => row.transaction_type === "personal_expense")!.amount, 333.34);
    assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 1000);
  });

  it("leaves the user out of a lend, since none of it was theirs", () => {
    const rows = expandDraftForSave({ ...beers, transaction_type: "lend", amount: 900, debtor_name: "อ้อน, แบงค์, วิน" }, []);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((row) => row.amount), [300, 300, 300]);
    assert.equal(rows.every((row) => row.user_share === 0), true);
  });

  it("does not group plain per-person rows, which each moved their own money", () => {
    // The group id is also what marks a row as having moved no wallet money,
    // so grouping these would zero out the 1500 that really did leave.
    assert.equal(expandDraftForSave(beers, []).every((row) => !row.transfer_group_id), true);
  });

  it("says how many ways it went, on rows that could not otherwise say", () => {
    assert.equal(expandDraftForSave(beers, [])[0].note, "หารกัน 5 คน");
    assert.equal(expandDraftForSave({ ...beers, note: "ปาร์ตี้บริษัท" }, [])[0].note, "ปาร์ตี้บริษัท");
  });

  it("leaves a bill with one person named as the single split row it already was", () => {
    const rows = expandDraftForSave({ ...beers, debtor_name: "จูน", amount: 163, partner_share: 81.5 }, []);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].transaction_type, "split_half");
  });

  it("puts a card-funded party on the card once and moves no wallet money", () => {
    const rows = expandDraftForSave({ ...beers, funding_card_name: "SPay" }, []);
    assert.equal(rows.length, 6);
    assert.equal(rows.reduce((sum, row) => sum + row.wallet_impact, 0), 0);

    const card = rows.find((row) => row.transaction_type === "card_charge")!;
    assert.equal(card.debtor_name, "SPay");
    assert.equal(card.debt_impact, 1500);
    assert.equal(card.user_share, 0);

    // Four friends owe 300 each, and the dinner cost the user 300 -- once.
    assert.equal(rows.filter((row) => row.transaction_type === "lend").reduce((sum, row) => sum + row.debt_impact, 0), 1200);
    assert.equal(rows.reduce((sum, row) => sum + row.user_share, 0), 300);
    assert.equal(new Set(rows.map((row) => row.transfer_group_id)).size, 1);
  });
});

describe("draftRowCount", () => {
  const draft: Draft = {
    id: "d1", title: "ค่าเบียร์", category: "อาหาร", amount: 1500, type: "expense",
    transaction_type: "split_half", wallet_impact: -1500, debt_impact: 1200, user_share: 300,
    partner_share: 1200, debtor_name: "จูน", occurred_at: "2026-09-05T12:00:00.000Z", wallet_id: "w1", note: null,
  };

  it("counts what each draft will really become", () => {
    assert.equal(draftRowCount(draft), 1);
    assert.equal(draftRowCount({ ...draft, funding_card_name: "SPay" }), 2);
    assert.equal(draftRowCount({ ...draft, debtor_name: "อ้อน, แบงค์, วิน, พี่พัก" }), 5);
    assert.equal(draftRowCount({ ...draft, debtor_name: "อ้อน, แบงค์, วิน, พี่พัก", funding_card_name: "SPay" }), 6);
  });

  it("agrees with what expandDraftForSave actually writes", () => {
    for (const candidate of [
      draft,
      { ...draft, funding_card_name: "SPay" },
      { ...draft, debtor_name: "อ้อน, แบงค์, วิน, พี่พัก" },
      { ...draft, debtor_name: "อ้อน, แบงค์, วิน, พี่พัก", funding_card_name: "SPay" },
      { ...draft, transaction_type: "lend" as const, debtor_name: "อ้อน, แบงค์" },
    ]) {
      assert.equal(draftRowCount(candidate), expandDraftForSave(candidate, []).length, candidate.debtor_name);
    }
  });

  it("says so in the confirmation only when a draft splits", () => {
    assert.match(describeDraftSave([{ ...draft, debtor_name: "อ้อน, แบงค์, วิน, พี่พัก" }]), /แยกเป็น 5 แถว/);
    assert.doesNotMatch(describeDraftSave([draft]), /แยกเป็น/);
  });
});

describe("splitSharesBetween: pinning what someone pays", () => {
  const three = ["อ้อน", "แบงค์", "วิน"];

  it("divides what is left after the user's own share", () => {
    // "ค่าเบียร์ 1000 ผมออก 500 ส่วนที่เหลือหาร 3 คน มีอ้อน แบงค์ วิน"
    const { shares, userShare } = splitSharesBetween(1000, three, "split_half", { self: 500 });
    assert.deepEqual(shares, [166.67, 166.67, 166.66]);
    assert.equal(userShare, 500);
    assert.equal(shares.reduce((sum, share) => sum + share, 0) + userShare, 1000);
  });

  it("divides what is left after one person's pinned share", () => {
    const { shares, userShare } = splitSharesBetween(1000, three, "split_half", { people: [400, null, null] });
    assert.equal(shares[0], 400);
    assert.deepEqual(shares.slice(1), [200, 200]);
    assert.equal(userShare, 200);
  });

  it("still adds up when every slot is pinned", () => {
    const { shares, userShare } = splitSharesBetween(1000, three, "split_half", { people: [300, 200, 100], self: 400 });
    assert.equal(shares.reduce((sum, share) => sum + share, 0) + userShare, 1000);
  });

  it("cannot pin more than the bill", () => {
    // A pin of 900 on a 500 bill takes the 500 that exists and no more.
    const { shares, userShare } = splitSharesBetween(500, three, "split_half", { people: [900, null, null] });
    assert.equal(shares[0], 500);
    assert.deepEqual(shares.slice(1), [0, 0]);
    assert.equal(userShare, 0);
  });

  it("ignores a pin that is not a number", () => {
    assert.deepEqual(splitSharesBetween(900, three, "split_half", { self: Number.NaN }).shares, [225, 225, 225]);
  });

  it("keeps a lend out of the user's pocket even when pinned", () => {
    const { shares, userShare } = splitSharesBetween(900, three, "lend", { people: [500, null, null] });
    assert.deepEqual(shares, [500, 200, 200]);
    assert.equal(userShare, 0);
  });

  it("writes the pinned rows the save path will store", () => {
    const draft: Draft = {
      id: "d1", title: "ค่าเบียร์", category: "อาหาร", amount: 1000, type: "expense",
      transaction_type: "split_half", wallet_impact: -1000, debt_impact: 500, user_share: 500,
      partner_share: 500, debtor_name: "อ้อน, แบงค์, วิน", occurred_at: "2026-09-05T12:00:00.000Z",
      wallet_id: "w1", note: null, split_self_share: 500,
    };
    const rows = expandDraftForSave(draft, []);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.filter((row) => row.transaction_type === "lend").map((row) => row.amount), [166.67, 166.67, 166.66]);
    assert.equal(rows.find((row) => row.transaction_type === "personal_expense")!.amount, 500);
    assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 1000);
    assert.equal(rows.reduce((sum, row) => sum + row.wallet_impact, 0), -1000);
  });
});

describe("splitPinMismatch", () => {
  const bill: Draft = {
    id: "d1", title: "ซื้อตั๋ว", category: "อื่น ๆ", amount: 900, type: "expense",
    transaction_type: "lend", wallet_impact: -900, debt_impact: 900, user_share: 0,
    partner_share: 900, debtor_name: "อ้อน, แบงค์, วิน", occurred_at: "2026-09-05T12:00:00.000Z",
    wallet_id: "w1", note: null,
  };

  it("says nothing while the pins still leave something to divide", () => {
    assert.equal(splitPinMismatch(bill), null);
    assert.equal(splitPinMismatch({ ...bill, split_shares: [500, null, null] }), null);
  });

  it("says nothing when every pin adds up to the bill", () => {
    assert.equal(splitPinMismatch({ ...bill, split_shares: [400, 300, 200] }), null);
  });

  it("catches a lend whose people were all pinned to less than the bill", () => {
    // Without this the last person quietly becomes 300 instead of the 100
    // that was typed.
    const mismatch = splitPinMismatch({ ...bill, split_shares: [500, 100, 100] })!;
    assert.equal(mismatch.difference, -200);
    assert.match(mismatch.detail, /ขาดอีก/);
  });

  it("catches a pin larger than the bill itself", () => {
    const mismatch = splitPinMismatch({ ...bill, split_shares: [1200, null, null] })!;
    assert.equal(mismatch.difference, 300);
    assert.match(mismatch.detail, /เกินยอดบิล/);
  });

  it("counts the user's own share as one of the slots on a split", () => {
    const split = { ...bill, transaction_type: "split_half" as const };
    // Three people pinned but the user's share still open: it takes what is
    // left, so nothing is wrong yet.
    assert.equal(splitPinMismatch({ ...split, split_shares: [300, 300, 200] }), null);
    // Pin that too and the four numbers have to be the bill.
    assert.equal(splitPinMismatch({ ...split, split_shares: [300, 300, 200], split_self_share: 100 }), null);
    assert.equal(splitPinMismatch({ ...split, split_shares: [300, 300, 200], split_self_share: 50 })!.difference, -50);
  });

  it("only asks the question of bills split between people", () => {
    assert.equal(splitPinMismatch({ ...bill, debtor_name: "อ้อน", split_shares: [50] }), null);
    assert.equal(splitPinMismatch({ ...bill, transaction_type: "personal_expense", split_shares: [50, 50] }), null);
  });

  it("collects the drafts a save has to stop for", () => {
    assert.equal(mismatchedSplitDrafts([bill, { ...bill, id: "d2", split_shares: [500, 100, 100] }]).length, 1);
  });
});

describe("balanceAdjustmentEntry", () => {
  const wallet = { id: "w1", display_balance: 10187.52 };
  const at = new Date("2026-09-05T12:00:00.000Z");

  it("writes the difference between the app and the bank, in the right direction", () => {
    const entry = balanceAdjustmentEntry(wallet, 8148.22, "adj-1", at)!;
    assert.equal(entry.transaction_type, "balance_adjustment");
    assert.equal(entry.amount, 2039.3);
    assert.equal(entry.wallet_impact, -2039.3);
    assert.equal(entry.wallet_id, "w1");
  });

  it("goes the other way when the app is the one that is short", () => {
    const entry = balanceAdjustmentEntry(wallet, 11000, "adj-1", at)!;
    assert.equal(entry.wallet_impact, 812.48);
    assert.equal(entry.amount, 812.48);
  });

  it("writes nothing when the two already agree", () => {
    assert.equal(balanceAdjustmentEntry(wallet, 10187.52, "adj-1", at), null);
  });

  it("is neither income nor spending", () => {
    const entry = balanceAdjustmentEntry(wallet, 8148.22, "adj-1", at)!;
    // Not in the month's เงินเข้า/เงินออก...
    assert.equal(totalWallet([entry], "expense"), 0);
    assert.equal(totalWallet([entry], "income"), 0);
    // ...and not spending in any category either.
    assert.equal(categorySpendAmount(entry), null);
    assert.equal(entry.debt_impact, 0);
  });

  it("survives a round trip through the row it is stored as", () => {
    const entry = balanceAdjustmentEntry(wallet, 8148.22, "adj-1", at)!;
    const row = mapTransactionRow({
      id: entry.id, title: entry.title, category: entry.category, amount: entry.amount, kind: entry.type,
      transaction_type: entry.transaction_type, wallet_impact: entry.wallet_impact, debt_impact: entry.debt_impact,
      user_share: entry.user_share, partner_share: entry.partner_share, debtor_name: entry.debtor_name,
      occurred_at: entry.occurred_at, source_text: null, wallet_id: entry.wallet_id ?? null, note: entry.note ?? null,
    });
    assert.equal(row.wallet_impact, -2039.3);
  });
});

describe("expandDraftForSave: an expense someone else fronted", () => {
  // "โปรแรก 778 หาร 2 กับอ้อน (อ้อนออกก่อน)": the user's own 389, paid by
  // อ้อน. No wallet moves, the user owes อ้อน, and it is still their spending.
  const fronted: Draft = {
    id: "d1", title: "ค่าเบียร์", category: "อาหาร", amount: 389, type: "expense",
    transaction_type: "personal_expense", wallet_impact: -389, debt_impact: 0, user_share: 389,
    partner_share: 0, debtor_name: "", occurred_at: "2026-09-05T12:00:00.000Z",
    wallet_id: "w1", note: null, funding_card_name: "อ้อน",
  };

  it("owes the person instead of moving money", () => {
    const [expense, funder] = expandDraftForSave(fronted, []);
    assert.equal(expense.wallet_impact, 0);
    assert.equal(expense.user_share, 389);
    assert.equal(funder.transaction_type, "card_charge");
    assert.equal(funder.debtor_name, "อ้อน");
    assert.equal(funder.debt_impact, 389);
    // ...and the round is counted once, not twice.
    assert.equal(funder.user_share, 0);
    assert.equal(expense.wallet_impact + funder.wallet_impact, 0);
  });

  it("goes back to a plain one-row expense without a funder", () => {
    const rows = expandDraftForSave({ ...fronted, funding_card_name: null }, []);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].wallet_impact, -389);
  });

  it("counts as two rows in the confirmation", () => {
    assert.equal(draftRowCount(fronted), 2);
  });
});

describe("planDebtSettlement", () => {
  const at = new Date("2026-09-05T12:00:00.000Z");
  const ids = { receive: "r1", pay: "p1" };

  it("takes both sides to zero and moves only the difference", () => {
    // อ้อน got the first round in (the user owes 389), the user got the
    // second (she owes 259.33): one 129.67 transfer settles it.
    const plan = planDebtSettlement("อ้อน", 259.33, 389, ids, at);
    assert.equal(plan.entries.length, 2);
    // Rounded because adding two exact satang figures is still floating
    // point; what matters is that the pair moves the difference and no more.
    assert.equal(Math.round(plan.entries.reduce((sum, entry) => sum + entry.wallet_impact, 0) * 100) / 100, -129.67);
    assert.equal(plan.net, -129.67);

    const receive = plan.entries.find((entry) => entry.transaction_type === "debt_repayment")!;
    const pay = plan.entries.find((entry) => entry.transaction_type === "debt_payment")!;
    assert.equal(receive.debt_impact, -259.33);
    assert.equal(pay.debt_impact, -389);
    assert.equal(receive.debtor_name, "อ้อน");
    assert.equal(pay.debtor_name, "อ้อน");
  });

  it("writes one row when only one side owes anything", () => {
    assert.deepEqual(planDebtSettlement("เอก", 500, 0, ids, at).entries.map((entry) => entry.transaction_type), ["debt_repayment"]);
    assert.deepEqual(planDebtSettlement("บัตร", 0, 800, ids, at).entries.map((entry) => entry.transaction_type), ["debt_payment"]);
  });

  it("writes nothing when there is nothing to settle", () => {
    const plan = planDebtSettlement("เอก", 0, 0, ids, at);
    assert.equal(plan.entries.length, 0);
    assert.match(plan.detail, /ไม่มียอดค้าง/);
  });

  it("ignores a negative balance rather than paying it out", () => {
    assert.equal(planDebtSettlement("เอก", -500, 0, ids, at).entries.length, 0);
  });

  it("says what it is about to do", () => {
    assert.match(planDebtSettlement("อ้อน", 259.33, 389, ids, at).detail, /รับคืน.*จ่ายคืน.*สุทธิ/);
  });
});

describe("draftTotals", () => {
  const base: Draft = {
    id: "d1", title: "ค่าเบียร์", category: "อาหาร", amount: 389, type: "expense",
    transaction_type: "personal_expense", wallet_impact: -389, debt_impact: 0, user_share: 389,
    partner_share: 0, debtor_name: "", occurred_at: "2026-09-05T12:00:00.000Z", wallet_id: "w1", note: null,
  };

  it("does not take money out of a wallet that never paid", () => {
    // "โปรแรก 389, อ้อนออกก่อน": the draft still carries -389 of its own,
    // because the zeroing belongs to the leg it becomes.
    const fronted = { ...base, funding_card_name: "อ้อน" };
    assert.equal(fronted.wallet_impact, -389);
    assert.deepEqual(draftTotals([fronted], []), { wallet: 0, receivable: 0, payable: 389 });
  });

  it("adds up an evening the way it will be saved", () => {
    // 778 split three ways that the user paid, 389 that อ้อน paid, 259 back
    // from แบงค์, 130 handed to อ้อน: 649 out of pocket, not 1,038.
    const evening: Draft[] = [
      { ...base, funding_card_name: "อ้อน" },
      { ...base, id: "d2", amount: 778, transaction_type: "split_half" as const, debtor_name: "อ้อน, แบงค์", wallet_impact: -778 },
      { ...base, id: "d3", amount: 259, transaction_type: "debt_repayment" as const, debtor_name: "แบงค์", wallet_impact: 259 },
      { ...base, id: "d4", amount: 130, transaction_type: "debt_payment" as const, debtor_name: "อ้อน", wallet_impact: -130 },
    ].map((draft) => normalizeEntry(draft, false) as Draft);

    const totals = draftTotals(evening, []);
    assert.equal(totals.wallet, -649);
    // The two books stay apart: friends end up owing 259.66 (อ้อน's share of
    // the round the user paid, plus แบงค์'s 33 satang of rounding), the user
    // ends up owing อ้อน 259. Added together they were reported as 518 of
    // debt appearing out of an evening that ended roughly square.
    assert.equal(totals.receivable, 259.66);
    assert.equal(totals.payable, 259);
  });

  it("leaves a plain draft exactly as it is", () => {
    assert.deepEqual(draftTotals([base], []), { wallet: -389, receivable: 0, payable: 0 });
  });

  it("reports a bill fronted by someone who owes the user as their balance falling", () => {
    // Not 389 of new debt: จูน is owed 389 less, which is the same reading the
    // row's own preview gives two lines above it.
    const fronted = { ...base, funding_card_name: "จูน" };
    const debtors = [makeDebtor({ name: "จูน", kind: "lend" })];
    assert.deepEqual(draftTotals([fronted], [], debtors), { wallet: 0, receivable: -389, payable: 0 });
  });
});

describe("retypedTo", () => {
  const dinner = makeEntry({ amount: 300, title: "ข้าวเย็น", category: "อาหาร" });

  it("splits a plain expense down the middle when it becomes a split", () => {
    // partner_share is 0 on every non-split type, and 0 is a share the user
    // could have chosen -- so carried across as-is it read as "จูน owes
    // nothing" and saved the whole 300 as the user's own spending.
    const split = normalizeEntry({ ...dinner, ...retypedTo("split_half"), debtor_name: "จูน" }, false);
    assert.equal(split.partner_share, 150);
    assert.equal(split.user_share, 150);
    assert.equal(split.debt_impact, 150);
    assert.equal(split.wallet_impact, -300);
  });

  it("does the same from the other side, where the partner owed all of it", () => {
    const lent = normalizeEntry({ ...dinner, transaction_type: "lend", debtor_name: "จูน" }, false);
    assert.equal(lent.partner_share, 300);
    const split = normalizeEntry({ ...lent, ...retypedTo("split_half") }, false);
    assert.equal(split.partner_share, 150);
    assert.equal(split.user_share, 150);
  });

  it("leaves a share the user set alone while the type stays put", () => {
    const split = normalizeEntry({ ...dinner, transaction_type: "split_half", partner_share: 200, debtor_name: "จูน" }, false);
    const renamed = normalizeEntry({ ...split, title: "ข้าวเย็นกับจูน" }, false);
    assert.equal(renamed.partner_share, 200);
  });
});

describe("expandDraftForSave: a slot left with nothing to owe", () => {
  const party: Draft = {
    id: "d1", title: "ค่าเบียร์", category: "อาหาร", amount: 1000, type: "expense",
    transaction_type: "split_half", wallet_impact: -1000, debt_impact: 0, user_share: 1000,
    partner_share: 0, debtor_name: "อ้อน, แบงค์, วิน", occurred_at: "2026-09-05T12:00:00.000Z",
    wallet_id: "w1", note: null,
  };

  it("writes no row for someone a pin left owing zero", () => {
    // "ผมออกเอง" on the whole bill: the parts still add up, so splitPinMismatch
    // has nothing to complain about -- but three 0-baht debts would sit in the
    // history saying nothing, and open three debtor records besides.
    const rows = expandDraftForSave({ ...party, split_self_share: 1000 }, []);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].transaction_type, "personal_expense");
    assert.equal(rows[0].amount, 1000);
    assert.equal(draftRowCount({ ...party, split_self_share: 1000 }), 1);
  });

  it("keeps the people who do owe something", () => {
    const rows = expandDraftForSave({ ...party, split_shares: [600, null, null], split_self_share: 400 }, []);
    assert.deepEqual(rows.map((row) => [row.debtor_name, row.amount]), [["อ้อน", 600], ["", 400]]);
    assert.equal(draftRowCount({ ...party, split_shares: [600, null, null], split_self_share: 400 }), 2);
  });

  it("still saves a bill of nothing as itself rather than dropping it", () => {
    const rows = expandDraftForSave({ ...party, amount: 0 }, []);
    assert.equal(rows.length, 1);
    assert.equal(draftRowCount({ ...party, amount: 0 }), 1);
  });
});
