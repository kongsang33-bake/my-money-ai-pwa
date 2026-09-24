// What one AI-parsed draft means, in words, for the review step of the Add
// tab -- the read-only half of DraftRow.
//
// The review used to open every draft as a full form, so checking four
// parsed items meant reading forty fields, and the fields folded behind
// "แก้ไขวันที่ / กระเป๋า / หมายเหตุ" hid their values along with their
// controls: a wrong date the AI guessed was invisible until the user opened
// every card. The summary this builds shows every guessed value (the facts)
// and what saving will do (the effects), so a draft can be checked by reading
// one card, and opened only to change something.
//
// Nothing here does arithmetic of its own. The effects are read off the rows
// expandDraftForSave turns the draft into -- the same rows draftTotals sums
// for the batch total -- so the sentence on a card cannot disagree with what
// gets saved, or with the total underneath it.
import { dayLabel } from "./cycle.ts";
import { formatMoney, moneySign } from "./format.ts";
import {
  CARD_FUNDABLE_TYPES,
  SHARED_EXPENSE_TYPES,
  categorySpendAmount,
  defaultWalletId,
  expandDraftForSave,
  sameDebtorName,
  splitDebtorNames,
  splitPinMismatch,
  unnamedDebtor,
} from "./money.ts";
import { DEBT_TYPES, TYPES_OWED_TO_USER, TYPES_USER_OWES, transactionTypeLabels } from "./taxonomy.ts";
import type { Debtor, DebtorKind, Draft, Wallet } from "./types.ts";

export type DraftFactKey = "type" | "date" | "source" | "people" | "note";
export type DraftFact = { key: DraftFactKey; text: string };
export type DraftEffectTone = "out" | "in" | "owed" | "owe" | "neutral";
export type DraftEffect = { text: string; tone: DraftEffectTone };
export type DraftAttention = {
  text: string;
  /** Blocking reasons also keep the save button disabled (see page.tsx). */
  blocking: boolean;
};

export type DraftReview = {
  facts: DraftFact[];
  effects: DraftEffect[];
  attention: DraftAttention[];
};

const baht = (value: number) => `${moneySign}${formatMoney(Math.abs(value))}`;
const satang = (value: number) => Math.round(value * 100) / 100;

const walletName = (id: string | null | undefined, wallets: Wallet[]) =>
  wallets.find((wallet) => wallet.id === (id || defaultWalletId(wallets)))?.name ?? "กระเป๋า";

/**
 * Names on a debt draft that are in neither of the user's books yet, and so
 * become a new debtor on save. Worth flagging because a typo here does not
 * fail -- it quietly opens a second record for the same person.
 */
export function newDebtorNames(draft: Draft, debtors: Debtor[]): string[] {
  const fresh: string[] = [];
  if (DEBT_TYPES.includes(draft.transaction_type)) {
    const kind: DebtorKind = TYPES_USER_OWES.includes(draft.transaction_type) ? "own" : "lend";
    const known = debtors.filter((debtor) => debtor.kind === kind).map((debtor) => debtor.name);
    const names = SHARED_EXPENSE_TYPES.includes(draft.transaction_type) ? splitDebtorNames(draft.debtor_name) : [draft.debtor_name.trim()];
    fresh.push(...names.filter((name) => name && name !== unnamedDebtor && !known.some((item) => sameDebtorName(item, name))));
  }
  // Whoever fronted the bill is looked for in both books, the way
  // fundingLegType looks: someone who owes the user is not a new creditor.
  const funder = CARD_FUNDABLE_TYPES.includes(draft.transaction_type) ? draft.funding_card_name?.trim() : "";
  if (funder && !debtors.some((debtor) => sameDebtorName(debtor.name, funder)) && !fresh.some((name) => sameDebtorName(name, funder))) {
    fresh.push(funder);
  }
  return fresh;
}

/**
 * Why a draft wants the user's eyes before it is saved, most important first.
 * An empty list means the AI's reading can be taken as it stands, which is
 * what decides whether the card starts folded.
 */
export function draftAttention(draft: Draft, debtors: Debtor[]): DraftAttention[] {
  const reasons: DraftAttention[] = [];
  if (draft.transaction_type === "transfer" && (!draft.transfer_to_wallet_id || draft.transfer_to_wallet_id === draft.wallet_id)) {
    reasons.push({ text: "ยังไม่ได้เลือกกระเป๋าปลายทาง", blocking: true });
  }
  const mismatch = splitPinMismatch(draft);
  if (mismatch) reasons.push({ text: "ยอดรายคนรวมกันไม่เท่ากับยอดบิล", blocking: true });
  if (draft.ambiguous) reasons.push({ text: "AI ไม่แน่ใจว่าให้เปล่าหรือให้ยืม เลือกชนิดรายการให้ถูก", blocking: false });
  if (!(draft.amount > 0)) reasons.push({ text: "ยังไม่มีจำนวนเงิน", blocking: false });
  if (DEBT_TYPES.includes(draft.transaction_type) && draft.transaction_type !== "card_charge") {
    const named = SHARED_EXPENSE_TYPES.includes(draft.transaction_type) ? splitDebtorNames(draft.debtor_name).length : draft.debtor_name.trim() && draft.debtor_name.trim() !== unnamedDebtor ? 1 : 0;
    if (!named) reasons.push({ text: "ยังไม่ได้ใส่ชื่อคน", blocking: false });
  }
  const fresh = newDebtorNames(draft, debtors);
  if (fresh.length) reasons.push({ text: `ชื่อใหม่ ${fresh.join(", ")} · จะสร้างให้ตอนบันทึก เช็กการสะกดก่อน`, blocking: false });
  return reasons;
}

/**
 * The values the AI filled in, as short phrases: when, paid from what, with
 * whom. Every one of them is shown on the folded card -- the point is that
 * nothing the AI guessed is out of sight.
 */
export function draftFacts(draft: Draft, wallets: Wallet[]): DraftFact[] {
  const facts: DraftFact[] = [];
  const type = draft.transaction_type;
  facts.push({ key: "type", text: type === "transfer" ? transactionTypeLabels[type] : `${transactionTypeLabels[type]} · ${draft.category}` });
  facts.push({ key: "date", text: dayLabel(draft.occurred_at) });

  const funder = draft.funding_card_name?.trim();
  if (type === "transfer") {
    const to = draft.transfer_to_wallet_id ? walletName(draft.transfer_to_wallet_id, wallets) : "?";
    facts.push({ key: "source", text: `${walletName(draft.wallet_id, wallets)} → ${to}` });
  } else if (funder && CARD_FUNDABLE_TYPES.includes(type)) {
    facts.push({ key: "source", text: `${funder} ออกให้ก่อน` });
  } else if (type !== "card_charge" && wallets.length) {
    facts.push({ key: "source", text: walletName(draft.wallet_id, wallets) });
  }

  if (DEBT_TYPES.includes(type)) {
    const names = SHARED_EXPENSE_TYPES.includes(type) ? splitDebtorNames(draft.debtor_name) : [draft.debtor_name.trim()].filter((name) => name && name !== unnamedDebtor);
    if (names.length) {
      const heads = type === "split_half" && names.length > 1 ? ` · หาร ${names.length + 1} คน` : "";
      facts.push({ key: "people", text: `${names.join(", ")}${heads}` });
    }
  }
  if (draft.note?.trim()) facts.push({ key: "note", text: draft.note.trim() });
  return facts;
}

/**
 * What saving this draft does, one phrase per balance it moves: money out of
 * (or into) a wallet, a debt that grows or shrinks, and -- where it is not
 * simply the bill -- how much of it is the user's own spending.
 *
 * Read off expandDraftForSave's rows so a split between four people, a bill a
 * card paid, and a bill a friend who owed the user paid all come out right
 * without this knowing the rules for any of them.
 */
export function draftEffects(draft: Draft, wallets: Wallet[], debtors: Debtor[]): DraftEffect[] {
  if (draft.transaction_type === "transfer") {
    const to = draft.transfer_to_wallet_id ? walletName(draft.transfer_to_wallet_id, wallets) : "กระเป๋าปลายทาง";
    return [{ text: `ย้าย ${baht(draft.amount)} จาก ${walletName(draft.wallet_id, wallets)} ไป ${to}`, tone: "neutral" }];
  }

  const rows = expandDraftForSave(draft, wallets, debtors);
  const effects: DraftEffect[] = [];

  const walletMoves = new Map<string, number>();
  const debtMoves = new Map<string, { name: string; owedToUser: boolean; amount: number }>();
  let spend = 0;
  for (const row of rows) {
    if (row.wallet_impact !== 0) {
      const name = walletName(row.wallet_id, wallets);
      walletMoves.set(name, (walletMoves.get(name) ?? 0) + row.wallet_impact);
    }
    if (row.debt_impact !== 0) {
      const owedToUser = TYPES_OWED_TO_USER.includes(row.transaction_type);
      if (owedToUser || TYPES_USER_OWES.includes(row.transaction_type)) {
        const name = row.debtor_name?.trim() || unnamedDebtor;
        const key = `${owedToUser ? "lend" : "own"}|${name.toLowerCase()}`;
        const current = debtMoves.get(key) ?? { name, owedToUser, amount: 0 };
        debtMoves.set(key, { ...current, amount: current.amount + row.debt_impact });
      }
    }
    spend += categorySpendAmount(row) ?? 0;
  }

  let walletOut = 0;
  for (const [name, amount] of walletMoves) {
    const value = satang(amount);
    if (value === 0) continue;
    if (value < 0) walletOut += -value;
    effects.push(value < 0
      ? { text: `จ่ายจาก ${name} ${baht(value)}`, tone: "out" }
      : { text: `เข้า ${name} ${baht(value)}`, tone: "in" });
  }

  const debts = [...debtMoves.values()].map((item) => ({ ...item, amount: satang(item.amount) })).filter((item) => item.amount !== 0);
  // Four friends owing the same 300 read better as one phrase than as four.
  const owedGrowing = debts.filter((item) => item.owedToUser && item.amount > 0);
  const sameShare = owedGrowing.length > 2 && owedGrowing.every((item) => item.amount === owedGrowing[0].amount);
  for (const item of debts) {
    if (sameShare && owedGrowing.includes(item)) continue;
    effects.push(item.owedToUser
      ? item.amount > 0
        ? { text: `${item.name} ติดคุณเพิ่ม ${baht(item.amount)}`, tone: "owed" }
        : { text: `${item.name} ติดคุณลดลง ${baht(item.amount)}`, tone: "neutral" }
      : item.amount > 0
        ? { text: `คุณติด ${item.name} เพิ่ม ${baht(item.amount)}`, tone: "owe" }
        : { text: `คุณติด ${item.name} ลดลง ${baht(item.amount)}`, tone: "neutral" });
  }
  if (sameShare) {
    const total = satang(owedGrowing.reduce((sum, item) => sum + item.amount, 0));
    effects.push({ text: `${owedGrowing.length} คนติดคุณคนละ ${baht(owedGrowing[0].amount)} · รวม ${baht(total)}`, tone: "owed" });
  }

  // The user's own share only needs saying when it isn't just "the money that
  // left the wallet" -- a split, or a bill someone else paid.
  const ownSpend = satang(spend);
  if (ownSpend > 0 && Math.abs(ownSpend - walletOut) > 0.005) {
    effects.push({ text: `เป็นรายจ่ายของคุณ ${baht(ownSpend)}`, tone: "neutral" });
  }
  return effects;
}

export function reviewDraft(draft: Draft, wallets: Wallet[], debtors: Debtor[]): DraftReview {
  return {
    facts: draftFacts(draft, wallets),
    effects: draftEffects(draft, wallets, debtors),
    attention: draftAttention(draft, debtors),
  };
}

/** Drafts with something blocking the save, in list order -- for the save bar's "go to it". */
export function blockingDraftIds(drafts: Draft[], debtors: Debtor[]): string[] {
  return drafts.filter((draft) => draftAttention(draft, debtors).some((reason) => reason.blocking)).map((draft) => draft.id);
}
