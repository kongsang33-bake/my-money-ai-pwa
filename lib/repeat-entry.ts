// "จดซ้ำ": log an entry again, as a new draft that goes through the review
// like any other (so expandDraftForSave is still the only thing that turns it
// into rows, and the user still sees what the save will do).

import { SHARED_EXPENSE_TYPES, defaultWalletId, normalizeEntry } from "./money.ts";
import { isFormOnlyDerivedType } from "./taxonomy.ts";
import type { Draft, Entry, Wallet } from "./types.ts";

/**
 * Whether an entry can be logged again on its own. Not one leg of a pair --
 * a transfer, or a bill paid by a card or a friend (transfer_group_id ties
 * those): repeating one leg alone would write half an event. Not a balance
 * adjustment or an investment purchase either, which are made from their own
 * forms against real counts and units, never retyped.
 *
 * One person's row of a bill split evenly between several names is offered:
 * those rows are kept apart on purpose (only the funded shape is grouped), and
 * each is whole by itself -- "จูน borrowed 100" logs again as exactly that.
 * Repeating the whole dinner is a new entry, not a repeat of one of its rows.
 */
export function canLogAgain(entry: Entry): boolean {
  if (entry.transfer_group_id) return false;
  if (entry.transaction_type === "transfer") return false;
  if (isFormOnlyDerivedType(entry.transaction_type)) return false;
  if (entry.investment_id) return false;
  return true;
}

/**
 * The draft that logs `entry` again on `occurredAt`: what it was (title,
 * category, amount, type), who with and from where, and -- on a split -- the
 * other person's share as it was: partner_share is a real stored number, and
 * left out it would fall back to half (partnerShareOf), quietly turning a
 * 300 bill where จูน owed 100 into one where she owes 150. Not its note,
 * which was about that day, and not what a save works out (the impacts).
 * The wallet only if it still exists: a deleted one leaves its rows with
 * none (`on delete set null`), and a repeat with no wallet would move no
 * money -- so it falls back to the default, as the AI's drafts do.
 */
export function repeatDraftFromEntry(entry: Entry, occurredAt: string, id: string, wallets: Wallet[]): Draft {
  const walletId = entry.wallet_id && wallets.some((wallet) => wallet.id === entry.wallet_id) ? entry.wallet_id : defaultWalletId(wallets);
  return normalizeEntry({
    id,
    title: entry.title,
    category: entry.category,
    amount: entry.amount,
    transaction_type: entry.transaction_type,
    debtor_name: entry.debtor_name,
    partner_share: SHARED_EXPENSE_TYPES.includes(entry.transaction_type) ? entry.partner_share : undefined,
    wallet_id: walletId,
    occurred_at: occurredAt,
    source_text: "จดซ้ำ",
  }, false);
}
