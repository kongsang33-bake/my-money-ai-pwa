// Core money-calculation logic: how a transaction type maps to wallet/debt
// impact, wallet/debt ledger aggregation, net worth, and portfolio value.
// This is the highest-stakes logic in the app (get it wrong and balances
// are wrong) so it's kept as pure, dependency-free functions that
// lib/money.test.ts can exercise directly.
import { TYPES_OWED_TO_USER, TYPES_USER_OWES, transactionKind, walletTagLabels, type TransactionType, type WalletTag } from "./taxonomy.ts";
import { toFiniteNumber, toMoneyAmount } from "./format.ts";
import { cycleBounds, entriesInRange, shiftMonthKey } from "./cycle.ts";
import type {
  Debtor,
  DebtorKind,
  Draft,
  Entry,
  EntryInput,
  EntryKind,
  HistoryFilters,
  Investment,
  InvestmentPrice,
  NetWorthDebtFormula,
  PortfolioHolding,
  Wallet,
} from "./types.ts";

export const unnamedDebtor = "ไม่ระบุ";

export function calculateImpacts(amount: number, transactionType: TransactionType) {
  if (transactionType === "income") {
    return { wallet_impact: amount, debt_impact: 0, user_share: amount, partner_share: 0 };
  }
  if (transactionType === "lend") {
    return { wallet_impact: -amount, debt_impact: amount, user_share: 0, partner_share: amount };
  }
  if (transactionType === "borrow") {
    return { wallet_impact: amount, debt_impact: amount, user_share: 0, partner_share: 0 };
  }
  if (transactionType === "split_half") {
    return { wallet_impact: -amount, debt_impact: amount / 2, user_share: amount / 2, partner_share: amount / 2 };
  }
  if (transactionType === "debt_repayment") {
    return { wallet_impact: amount, debt_impact: -amount, user_share: 0, partner_share: 0 };
  }
  if (transactionType === "debt_payment") {
    return { wallet_impact: -amount, debt_impact: -amount, user_share: amount, partner_share: 0 };
  }
  if (transactionType === "card_charge") {
    return { wallet_impact: 0, debt_impact: amount, user_share: amount, partner_share: 0 };
  }
  if (transactionType === "transfer" || transactionType === "investment_buy") {
    return { wallet_impact: -amount, debt_impact: 0, user_share: 0, partner_share: 0 };
  }
  return { wallet_impact: -amount, debt_impact: 0, user_share: amount, partner_share: 0 };
}

export function categorySpendAmount(entry: Entry): number | null {
  if (entry.transaction_type === "transfer" || entry.transaction_type === "investment_buy") return null;
  if (entry.wallet_impact > 0 && entry.transaction_type !== "card_charge") return null;
  return entry.user_share > 0 ? entry.user_share : null;
}

export function entryDisplayImpact(entry: Entry): number {
  return entry.transaction_type === "card_charge" ? -entry.amount : entry.wallet_impact;
}

export function normalizeEntry(input: EntryInput, applyDebtorDefault = true): Entry {
  const transaction_type = input.transaction_type ?? (input.type === "income" ? "income" : "personal_expense");
  const amount = toMoneyAmount(input.amount);
  // A transfer's direction (which wallet loses money vs. gains it) can't be
  // derived from amount + type alone the way every other type can — the
  // caller (building one of the two linked legs) must supply the signed
  // wallet_impact explicitly, so it's trusted here instead of recomputed.
  const impacts = transaction_type === "transfer"
    ? { wallet_impact: input.wallet_impact ?? -amount, debt_impact: 0, user_share: 0, partner_share: 0 }
    : calculateImpacts(amount, transaction_type);
  const trimmedDebtorName = input.debtor_name?.trim() ?? "";
  return {
    ...input,
    amount,
    type: transactionKind[transaction_type],
    transaction_type,
    wallet_impact: impacts.wallet_impact,
    debt_impact: impacts.debt_impact,
    user_share: impacts.user_share,
    partner_share: impacts.partner_share,
    debtor_name: trimmedDebtorName || (applyDebtorDefault ? unnamedDebtor : trimmedDebtorName),
    wallet_id: input.wallet_id ?? null,
    note: input.note?.trim() || null,
    transfer_group_id: input.transfer_group_id ?? null,
    transfer_to_wallet_id: input.transfer_to_wallet_id ?? null,
    investment_id: input.investment_id ?? null,
    investment_units: input.investment_units ?? null,
  };
}

// A transfer draft carries one wallet_impact but needs to land as two linked
// rows (one negative leg on the source wallet, one positive on the
// destination) sharing a transfer_group_id — this expands it right before
// saving so both the AI-parsed path and manual entry can share the logic.
export function expandTransferDraft(draft: Draft, wallets: Wallet[]): Draft[] {
  if (draft.transaction_type !== "transfer" || !draft.transfer_to_wallet_id) return [draft];

  const sourceWallet = wallets.find((wallet) => wallet.id === draft.wallet_id);
  const destWallet = wallets.find((wallet) => wallet.id === draft.transfer_to_wallet_id);
  const groupId = crypto.randomUUID();
  const title = draft.title.trim();

  const sourceLeg = normalizeEntry({
    id: `${groupId}-out`, title: title || `โอนไป${destWallet?.name ?? "กระเป๋าอื่น"}`, category: "อื่น ๆ",
    amount: draft.amount, transaction_type: "transfer", debtor_name: "", occurred_at: draft.occurred_at,
    wallet_id: draft.wallet_id, wallet_impact: -draft.amount, note: draft.note, transfer_group_id: groupId,
  }, false);
  const destLeg = normalizeEntry({
    id: `${groupId}-in`, title: title || `โอนจาก${sourceWallet?.name ?? "กระเป๋าอื่น"}`, category: "อื่น ๆ",
    amount: draft.amount, transaction_type: "transfer", debtor_name: "", occurred_at: draft.occurred_at,
    wallet_id: draft.transfer_to_wallet_id, wallet_impact: draft.amount, note: draft.note, transfer_group_id: groupId,
  }, false);

  return [sourceLeg, destLeg];
}

/**
 * What deleting `wallet` does to the entries filed under it.
 *
 * transactions.wallet_id is ON DELETE SET NULL and buildWalletLedger counts a
 * null wallet_id against the default wallet, so those entries land on another
 * balance whether or not anyone chose that -- this names the wallet they
 * should move to (so the move is explicit and undoable) and which entries
 * move, for the confirmation text.
 */
export function walletDeletionMove(wallet: Wallet, wallets: Wallet[], entries: Entry[]) {
  const remaining = wallets.filter((item) => item.id !== wallet.id);
  return {
    // Prefer the default wallet: it is where the ledger would have put these
    // entries anyway, so the visible totals stay put.
    fallbackWallet: remaining.find((item) => item.is_default) ?? remaining[0] ?? null,
    movingEntryIds: entries.filter((entry) => entry.wallet_id === wallet.id).map((entry) => entry.id),
  };
}

export function defaultWalletId(wallets: Wallet[]) {
  return wallets.find((wallet) => wallet.is_default)?.id ?? wallets.find((wallet) => wallet.tag === "cash")?.id ?? wallets[0]?.id ?? null;
}

// The fields every transactions insert/update sends, shared by saveEntries,
// updateEntry (both its transfer-conversion legs and its plain-edit path),
// and restoreEntries -- each of those then spreads in only the handful of
// fields it actually needs beyond this (user_id, id, source_text,
// transfer_group_id), which differ by call site (e.g. a plain edit must
// NOT touch transfer_group_id, so it doesn't spread it in).
export function buildTransactionCore(entry: Draft, wallets: Wallet[]) {
  return {
    title: entry.title.trim(),
    category: entry.category,
    amount: entry.amount,
    kind: entry.type,
    transaction_type: entry.transaction_type,
    debtor_name: entry.debtor_name,
    wallet_impact: entry.wallet_impact,
    debt_impact: entry.debt_impact,
    user_share: entry.user_share,
    partner_share: entry.partner_share,
    occurred_at: entry.occurred_at,
    wallet_id: entry.wallet_id ?? defaultWalletId(wallets),
    note: entry.note,
  };
}

export function mapTransactionRow(row: {
  id: string;
  title: string;
  category: string;
  amount: number | string;
  kind: string;
  transaction_type: string | null;
  wallet_impact: number | string | null;
  debt_impact: number | string | null;
  user_share: number | string | null;
  partner_share: number | string | null;
  debtor_name: string | null;
  occurred_at: string;
  source_text: string | null;
  wallet_id: string | null;
  note: string | null;
  transfer_group_id?: string | null;
  investment_id?: string | null;
  investment_units?: number | string | null;
}): Entry {
  return normalizeEntry({
    id: row.id,
    title: row.title,
    category: row.category,
    amount: Number(row.amount),
    type: row.kind as EntryKind,
    transaction_type: (row.transaction_type as TransactionType | null) ?? undefined,
    wallet_impact: row.wallet_impact == null ? undefined : Number(row.wallet_impact),
    debt_impact: row.debt_impact == null ? undefined : Number(row.debt_impact),
    user_share: row.user_share == null ? undefined : Number(row.user_share),
    partner_share: row.partner_share == null ? undefined : Number(row.partner_share),
    debtor_name: row.debtor_name,
    occurred_at: row.occurred_at,
    source_text: row.source_text,
    wallet_id: row.wallet_id,
    note: row.note,
    transfer_group_id: row.transfer_group_id ?? null,
    investment_id: row.investment_id ?? null,
    investment_units: row.investment_units == null ? null : Number(row.investment_units),
  });
}

export function totalWallet(entries: Entry[], direction: EntryKind) {
  return entries
    .filter((entry) => entry.transaction_type !== "transfer" && entry.transaction_type !== "investment_buy" && (direction === "income" ? entry.wallet_impact > 0 : entry.wallet_impact < 0))
    .reduce((sum, entry) => sum + entry.wallet_impact, 0);
}

export function filterEntries(entries: Entry[], filters: HistoryFilters) {
  const query = filters.query.trim().toLowerCase();
  const minAmount = filters.minAmount === "" ? null : toFiniteNumber(filters.minAmount, NaN);
  const maxAmount = filters.maxAmount === "" ? null : toFiniteNumber(filters.maxAmount, NaN);

  return entries.filter((entry) => {
    const amount = Math.abs(entry.wallet_impact);
    if (query && !`${entry.title} ${entry.category} ${entry.debtor_name} ${entry.note ?? ""}`.toLowerCase().includes(query)) return false;
    if (filters.category && entry.category !== filters.category) return false;
    if (filters.type !== "all" && entry.transaction_type !== filters.type) return false;
    if (minAmount !== null && Number.isFinite(minAmount) && amount < minAmount) return false;
    if (maxAmount !== null && Number.isFinite(maxAmount) && amount > maxAmount) return false;
    return true;
  });
}

export function monthlyDebtObligation(debtor: Debtor, outstanding: number): number {
  if (debtor.credit_card_min_payment_percent) return outstanding * (debtor.credit_card_min_payment_percent / 100);
  if (debtor.monthly_installment) return Math.min(debtor.monthly_installment, outstanding);
  return outstanding;
}

export function payableForDisplay(debtors: Debtor[], payableSummary: { name: string; amount: number }[], formula: NetWorthDebtFormula) {
  if (formula === "full") return payableSummary.reduce((sum, item) => sum + item.amount, 0);
  return payableSummary.reduce((sum, item) => {
    const debtor = debtors.find((candidate) => candidate.name.trim().toLowerCase() === item.name.trim().toLowerCase());
    return sum + (debtor ? monthlyDebtObligation(debtor, item.amount) : item.amount);
  }, 0);
}

export function matchesAnyKeyword(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

export function transferWalletTag(entry: Entry, wallets: Wallet[]): Exclude<WalletTag, "cash"> | null {
  if (entry.wallet_impact >= 0 || entry.transaction_type !== "personal_expense") return null;

  const text = `${entry.title} ${entry.category} ${entry.source_text ?? ""}`.trim().toLowerCase();
  if (!text) return null;

  for (const wallet of wallets) {
    if (wallet.tag === "cash" || wallet.tag === "other" || wallet.tag === "petty") continue;
    const walletName = wallet.name.trim().toLowerCase();
    const walletLabel = walletTagLabels[wallet.tag].toLowerCase();
    if ((walletName && text.includes(walletName)) || (walletLabel && text.includes(walletLabel))) return wallet.tag;
  }

  if (matchesAnyKeyword(text, ["ออม", "เก็บเงิน", "เงินเก็บ"])) return "savings";

  return null;
}

export function buildWalletLedger(wallets: Wallet[], entries: Entry[]) {
  const totals: Record<WalletTag, number> = { cash: 0, savings: 0, other: 0, petty: 0 };
  const walletDeltas = new Map<string, number>();
  const fallbackWalletId = defaultWalletId(wallets);

  for (const wallet of wallets) {
    totals[wallet.tag] += wallet.balance;
    walletDeltas.set(wallet.id, 0);
  }

  for (const entry of entries) {
    const transferTag = transferWalletTag(entry, wallets);
    const walletId = entry.wallet_id ?? (transferTag ? wallets.find((wallet) => wallet.tag === transferTag)?.id : fallbackWalletId);
    if (walletId) walletDeltas.set(walletId, (walletDeltas.get(walletId) ?? 0) + entry.wallet_impact);
  }

  const displayWallets = wallets.map((wallet) => {
      const transaction_delta = walletDeltas.get(wallet.id) ?? 0;
      return {
        ...wallet,
        transaction_delta,
        display_balance: wallet.balance + transaction_delta,
      };
    });

  const nextTotals: Record<WalletTag, number> = { cash: 0, savings: 0, other: 0, petty: 0 };
  for (const wallet of displayWallets) nextTotals[wallet.tag] += wallet.display_balance;

  return { totals: nextTotals, wallets: displayWallets };
}

export function buildDebtSummary(debtors: Debtor[], entries: Entry[], kind: DebtorKind, types: TransactionType[]) {
  const map = new Map<string, number>();
  for (const debtor of debtors) {
    if (debtor.kind !== kind) continue;
    if (debtor.opening_balance) map.set(debtor.name, (map.get(debtor.name) ?? 0) + debtor.opening_balance);
  }
  for (const entry of entries) {
    if (!types.includes(entry.transaction_type)) continue;
    map.set(entry.debtor_name, (map.get(entry.debtor_name) ?? 0) + entry.debt_impact);
  }
  // No positive-amount filter here on purpose: a debtor whose balance comes
  // out at zero or negative (overpaid, or a data-entry mistake like a wrong
  // opening balance) should still show up with its real number rather than
  // silently falling back to a lying "฿0" wherever this gets looked up by
  // name and not found.
  return [...map.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Adds entries to the in-memory list and keeps it in the order the whole app
 * assumes: newest first. Six call sites in app/page.tsx were each writing this
 * spread-and-sort by hand -- save, restore, edit, log-a-recurring-bill, two
 * investment paths -- which is six chances to get the comparator backwards and
 * silently show a user's history upside down on one screen only.
 */
export function withEntries(current: Entry[], incoming: Entry[]): Entry[] {
  return [...incoming, ...current].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
}

/** Replaces one entry by id, leaving order alone (an edit cannot reorder). */
export function replaceEntry(current: Entry[], next: Entry): Entry[] {
  return current.map((item) => (item.id === next.id ? next : item));
}

export type EntryUpdatePlan =
  | { kind: "rejected"; message: string }
  | { kind: "update"; entry: Entry }
  | { kind: "convert-to-transfer"; sourceLeg: Draft; destLeg: Draft };

/**
 * Decides what editing an entry should do, without doing any of it.
 *
 * Almost all edits are a plain update, but turning an existing entry into a
 * transfer is not: a transfer is two rows, so the original row is rewritten as
 * the outgoing leg and a second row has to be created for the incoming one.
 * Getting that wrong doubles or loses money, and it used to be decided inline
 * between two awaits where nothing could test it.
 *
 * `original` is the entry as it currently exists (used only to tell whether
 * this edit is the conversion); `edited` is what the user has on screen.
 */
export function planEntryUpdate(
  edited: Entry,
  original: Entry | undefined,
  wallets: Wallet[],
  transferToWalletId?: string | null,
): EntryUpdatePlan {
  const convertingToTransfer = edited.transaction_type === "transfer" && original?.transaction_type !== "transfer";
  if (!convertingToTransfer) return { kind: "update", entry: normalizeEntry(edited) };

  // A transfer to the wallet it came from is not a transfer, and would net to
  // zero across two rows while still looking like activity in the ledger.
  if (!transferToWalletId || transferToWalletId === edited.wallet_id) {
    return { kind: "rejected", message: "กรุณาเลือกกระเป๋าปลายทาง" };
  }

  const [sourceLeg, destLeg] = expandTransferDraft(
    { ...edited, wallet_id: edited.wallet_id ?? defaultWalletId(wallets), transfer_to_wallet_id: transferToWalletId },
    wallets,
  );
  return { kind: "convert-to-transfer", sourceLeg, destLeg };
}

/**
 * The entry a "log this bill now" tap creates from a recurring expense. Pure
 * apart from the id, which the caller supplies so a test can pin it.
 */
export function recurringExpenseEntry(
  item: { name: string; amount: number },
  billingDate: Date,
  wallets: Wallet[],
  id: string,
): Entry {
  return normalizeEntry({
    id,
    title: item.name,
    category: "บิลประจำ",
    amount: item.amount,
    transaction_type: "personal_expense",
    occurred_at: billingDate.toISOString(),
    wallet_id: defaultWalletId(wallets),
  });
}

export function netWorthAsOf(wallets: Wallet[], debtors: Debtor[], entriesUpToCutoff: Entry[], portfolioValue = 0, debtFormula: NetWorthDebtFormula = "full") {
  const ledger = buildWalletLedger(wallets, entriesUpToCutoff);
  const walletTotal = Object.values(ledger.totals).reduce((sum, amount) => sum + amount, 0);
  const receivable = buildDebtSummary(debtors, entriesUpToCutoff, "lend", TYPES_OWED_TO_USER).reduce((sum, item) => sum + item.amount, 0);
  const payableSummary = buildDebtSummary(debtors, entriesUpToCutoff, "own", TYPES_USER_OWES);
  const payable = payableForDisplay(debtors, payableSummary, debtFormula);
  return walletTotal + receivable - payable + portfolioValue;
}

// portfolioValue is today's portfolio market value, held constant across every
// past point in the trend (no historical per-day reconstruction of holdings/
// NAV is available) so at least the most recent point matches the live net
// worth figure shown elsewhere; older points understate how much of that
// net worth was already invested at the time.
export function buildMonthlyTrend(entries: Entry[], wallets: Wallet[], debtors: Debtor[], selectedMonth: string, monthStartDay: number, months = 6, portfolioValue = 0, debtFormula: NetWorthDebtFormula = "full") {
  return Array.from({ length: months }, (_, index) => {
    const key = shiftMonthKey(selectedMonth, index - months + 1);
    const range = cycleBounds(key, monthStartDay);
    const monthEntries = entriesInRange(entries, range.start, range.end);
    const income = totalWallet(monthEntries, "income");
    const outflow = Math.abs(totalWallet(monthEntries, "expense"));
    const entriesUpToCutoff = entries.filter((entry) => new Date(entry.occurred_at) < range.end);
    const netWorth = netWorthAsOf(wallets, debtors, entriesUpToCutoff, portfolioValue, debtFormula);
    return { key, label: new Date(`${key}-01T00:00:00`).toLocaleDateString("th-TH", { month: "short" }), income, outflow, netWorth };
  });
}

// Always derived from the real outstanding balance rather than a manually
// maintained counter — a stored "paid so far" count drifts the moment a
// payment is logged in-app without someone remembering to also bump it by
// hand, which is exactly what happened before this was changed.
export function installmentsRemaining(debtor: Debtor, outstanding: number): number | null {
  if (!debtor.monthly_installment) return null;
  if (outstanding <= 0.005) return 0;
  return Math.ceil(outstanding / debtor.monthly_installment);
}

export function installmentStatusText(debtor: Debtor, outstanding: number): string {
  if (!debtor.monthly_installment) return "";
  const remaining = installmentsRemaining(debtor, outstanding);
  if (remaining === null) return "";
  if (debtor.total_installments != null) {
    const paid = Math.max(0, debtor.total_installments - remaining);
    return ` · จ่ายแล้ว ${paid}/${debtor.total_installments} งวด (เหลือ ${remaining} งวด)`;
  }
  return outstanding > 0.005 ? ` · เหลืออีกประมาณ ${remaining} เดือน` : "";
}

export function latestPriceFor(investmentId: string, prices: InvestmentPrice[]): InvestmentPrice | null {
  let latest: InvestmentPrice | null = null;
  for (const price of prices) {
    if (price.investment_id !== investmentId) continue;
    if (!latest || price.recorded_at > latest.recorded_at) latest = price;
  }
  return latest;
}

export function buildPortfolioHoldings(investments: Investment[], prices: InvestmentPrice[]): PortfolioHolding[] {
  return investments.map((investment) => {
    const avgCost = investment.units > 0 ? investment.cost_basis / investment.units : 0;
    const latest = latestPriceFor(investment.id, prices);
    const latestNav = latest?.nav ?? null;
    const marketValue = latestNav != null ? latestNav * investment.units : investment.cost_basis;
    const gain = marketValue - investment.cost_basis;
    const gainPercent = investment.cost_basis > 0 ? (gain / investment.cost_basis) * 100 : null;
    return { ...investment, avgCost, latestNav, latestNavDate: latest?.recorded_at ?? null, marketValue, gain, gainPercent };
  });
}

// Approximates portfolio value over time using each holding's CURRENT unit
// count against its historical NAV on each date a price was logged — not a
// true point-in-time reconstruction (units held may have changed since),
// but enough to show whether the trend is up or down.
//
// Groups prices per investment and sorted once, then walks each
// investment's pointer forward as `date` advances (both the outer date
// list and each investment's price list are chronological, so the pointer
// never needs to go backwards) -- O(dates x investments) instead of the
// O(dates x investments x prices) a naive re-filter per date would cost,
// which matters once a couple of years of daily NAVs pile up.
export function buildPortfolioTrend(investments: Investment[], prices: InvestmentPrice[]) {
  const pricesByInvestment = new Map<string, InvestmentPrice[]>();
  for (const price of prices) {
    const list = pricesByInvestment.get(price.investment_id);
    if (list) list.push(price);
    else pricesByInvestment.set(price.investment_id, [price]);
  }
  for (const list of pricesByInvestment.values()) list.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));

  const dates = [...new Set(prices.map((price) => price.recorded_at))].sort();
  const pointers = new Map<string, number>();

  return dates.map((date) => {
    const value = investments.reduce((sum, investment) => {
      const list = pricesByInvestment.get(investment.id);
      if (!list || !list.length) return sum;
      let pointer = pointers.get(investment.id) ?? 0;
      while (pointer + 1 < list.length && list[pointer + 1].recorded_at <= date) pointer += 1;
      pointers.set(investment.id, pointer);
      if (list[pointer].recorded_at > date) return sum;
      return sum + list[pointer].nav * investment.units;
    }, 0);
    return { date, value };
  });
}
