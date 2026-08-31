// What the app remembers about how *this* user records money, derived from
// their own saved entries and replayed to the AI parser on the next entry.
//
// The parsing prompt in /api/analyze can only encode rules the app's authors
// anticipated. Anything personal -- an apartment manager's "ลูกบ้านแลกเหรียญ"
// (a tenant swapping notes for coins: a wallet-to-wallet transfer, not income
// and not an expense) -- is invisible to it, so the model guesses, and guesses
// the same way again next month. These helpers close that loop: once the user
// has fixed a parse by hand, that correction becomes the example the model
// sees the next time similar wording shows up.
import { AI_EXAMPLE_LIMIT, AI_EXAMPLE_MIN_SIMILARITY, AI_EXAMPLE_TEXT_MAX_LENGTH } from "./constants.ts";
import type { TransactionType } from "./taxonomy.ts";
import type { Entry } from "./types.ts";

// One past entry, flattened into the shape the prompt shows the model.
export type AiEntryExample = {
  text: string;
  transaction_type: TransactionType;
  category: string;
  wallet_id: string | null;
  transfer_to_wallet_id: string | null;
  debtor_name: string;
};

// Thai text has no word boundaries, so similarity here is character-level:
// digits, punctuation and spaces are dropped (the amount in "ลูกบ้านแลกเหรียญ
// 100 บาท" carries no meaning for matching) and what's left is compared as a
// bag of trigrams.
function normalizeForMatch(value: string) {
  return value.toLowerCase().replace(/[^\p{L}]+/gu, "");
}

function trigrams(value: string) {
  const grams = new Set<string>();
  if (value.length < 3) {
    if (value) grams.add(value);
    return grams;
  }
  for (let index = 0; index <= value.length - 3; index += 1) grams.add(value.slice(index, index + 3));
  return grams;
}

/** Dice coefficient over character trigrams: 0 = nothing in common, 1 = same text. */
export function textSimilarity(left: string, right: string) {
  const a = trigrams(normalizeForMatch(left));
  const b = trigrams(normalizeForMatch(right));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

/**
 * Most recent category the user filed each entry title under, keyed by
 * lowercased title. Used to override the AI's category guess for a title the
 * user has already categorised themselves.
 */
export function buildCategoryMemory(entries: Entry[]) {
  const map = new Map<string, string>();
  for (const entry of [...entries].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))) {
    const key = entry.title.trim().toLowerCase();
    if (key && !map.has(key)) map.set(key, entry.category);
  }
  return map;
}

// A saved transfer is stored as two legs sharing a transfer_group_id (see
// expandTransferDraft in lib/money.ts). The model emits a transfer as ONE item
// with a source and a destination wallet, so the legs are folded back into
// that single shape here -- otherwise the examples would teach it to emit two
// half-transfers.
function foldTransferLegs(entries: Entry[]) {
  const folded: Entry[] = [];
  const transferGroups = new Map<string, Entry[]>();

  for (const entry of entries) {
    if (entry.transaction_type === "transfer" && entry.transfer_group_id) {
      const group = transferGroups.get(entry.transfer_group_id);
      if (group) group.push(entry);
      else transferGroups.set(entry.transfer_group_id, [entry]);
      continue;
    }
    folded.push(entry);
  }

  for (const group of transferGroups.values()) {
    const source = group.find((leg) => leg.wallet_impact < 0);
    const destination = group.find((leg) => leg.wallet_impact > 0);
    if (!source || !destination) {
      // A half-recorded transfer (one leg deleted, say) is left as-is rather
      // than dropped -- it's still evidence of how the user words this.
      folded.push(...group);
      continue;
    }
    folded.push({ ...source, transfer_to_wallet_id: destination.wallet_id ?? null });
  }

  return folded;
}

/**
 * The user's own past entries whose wording is close to what they just typed,
 * newest first, deduped by title. Fed to /api/analyze as precedents.
 *
 * Deliberately similarity-gated rather than "last N entries": an example
 * outranks the model's own reasoning, so an unrelated one is worse than none.
 */
export function buildAiExamples(entries: Entry[], input: string, limit = AI_EXAMPLE_LIMIT): AiEntryExample[] {
  const text = input.trim();
  if (!text || !entries.length) return [];

  const scored = foldTransferLegs(entries)
    .map((entry) => ({
      entry,
      // Matching looks at the original typed text too (an AI-parsed entry
      // keeps it in source_text) so a renamed entry still matches the phrase
      // that produced it; the example itself always shows the title, which is
      // the part that maps one-to-one onto this entry.
      similarity: textSimilarity(text, `${entry.title} ${entry.source_text ?? ""}`),
    }))
    .filter(({ entry, similarity }) => entry.title.trim() && similarity >= AI_EXAMPLE_MIN_SIMILARITY)
    .sort((a, b) => (b.similarity - a.similarity) || (a.entry.occurred_at < b.entry.occurred_at ? 1 : -1));

  const examples: AiEntryExample[] = [];
  const seen = new Set<string>();

  for (const { entry } of scored) {
    const title = entry.title.trim().slice(0, AI_EXAMPLE_TEXT_MAX_LENGTH);
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    examples.push({
      text: title,
      transaction_type: entry.transaction_type,
      category: entry.category,
      wallet_id: entry.wallet_id ?? null,
      transfer_to_wallet_id: entry.transfer_to_wallet_id ?? null,
      debtor_name: entry.debtor_name ?? "",
    });
    if (examples.length >= limit) break;
  }

  return examples;
}
