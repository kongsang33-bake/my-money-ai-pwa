import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORIES, DEBT_TYPES, TRANSACTION_TYPES, TYPES_OWED_TO_USER, TYPES_USER_OWES,
  transactionKind, transactionTypeLabels, walletTagHints, walletTagLabels,
} from "./taxonomy.ts";

const WALLET_TAGS = ["cash", "savings", "other", "petty"] as const;

// taxonomy.ts is data, not logic, so these are consistency invariants rather
// than behaviour. They exist because the tables here are read by code spread
// across lib/money.ts, lib/csv.ts and half the components: adding a
// transaction type and updating three of the five tables that mention it is
// the realistic failure, and TypeScript's Record<TransactionType, ...> only
// catches the two that are keyed by the type.
describe("transaction type tables", () => {
  it("labels every type with something non-empty", () => {
    for (const type of TRANSACTION_TYPES) {
      assert.ok(transactionTypeLabels[type]?.trim(), `no label for ${type}`);
    }
  });

  it("has no label or kind left over from a removed type", () => {
    assert.deepEqual(Object.keys(transactionTypeLabels).sort(), [...TRANSACTION_TYPES].sort());
    assert.deepEqual(Object.keys(transactionKind).sort(), [...TRANSACTION_TYPES].sort());
  });

  it("classifies every type as income or expense", () => {
    for (const type of TRANSACTION_TYPES) {
      assert.ok(["income", "expense"].includes(transactionKind[type]), `bad kind for ${type}`);
    }
  });

  it("has no duplicate type in the list", () => {
    assert.equal(new Set(TRANSACTION_TYPES).size, TRANSACTION_TYPES.length);
  });
});

describe("debt type groupings", () => {
  it("splits DEBT_TYPES exactly into 'they owe me' and 'I owe them'", () => {
    // The one invariant here that nothing else enforces, and the expensive one
    // to get wrong: buildDebtSummary walks TYPES_OWED_TO_USER and
    // TYPES_USER_OWES, while other code gates on DEBT_TYPES. A type added to
    // DEBT_TYPES but to neither direction list would touch a debtor's balance
    // in some screens and be invisible in the totals.
    assert.deepEqual([...DEBT_TYPES].sort(), [...TYPES_OWED_TO_USER, ...TYPES_USER_OWES].sort());
  });

  it("never puts a type in both directions", () => {
    const both = TYPES_OWED_TO_USER.filter((type) => TYPES_USER_OWES.includes(type));
    assert.deepEqual(both, [], "a type owed both ways would be double counted");
  });

  it("only lists real transaction types", () => {
    for (const type of DEBT_TYPES) {
      assert.ok(TRANSACTION_TYPES.includes(type), `${type} is not a transaction type`);
    }
  });

  it("keeps transfer and investment_buy out of debt entirely", () => {
    // Both move the user's own money around; treating either as debt would
    // invent a creditor out of nothing.
    assert.ok(!DEBT_TYPES.includes("transfer"));
    assert.ok(!DEBT_TYPES.includes("investment_buy"));
  });
});

describe("wallet tag tables", () => {
  it("labels and explains every tag", () => {
    for (const tag of WALLET_TAGS) {
      assert.ok(walletTagLabels[tag]?.trim(), `no label for ${tag}`);
      assert.ok(walletTagHints[tag]?.trim(), `no hint for ${tag}`);
    }
  });

  it("has no leftover keys", () => {
    assert.deepEqual(Object.keys(walletTagLabels).sort(), [...WALLET_TAGS].sort());
    assert.deepEqual(Object.keys(walletTagHints).sort(), [...WALLET_TAGS].sort());
  });

  it("gives each tag a distinct label", () => {
    assert.equal(new Set(Object.values(walletTagLabels)).size, WALLET_TAGS.length);
  });
});

describe("categories", () => {
  it("has no duplicates and no blank entries", () => {
    assert.equal(new Set(CATEGORIES).size, CATEGORIES.length);
    for (const category of CATEGORIES) assert.ok(category.trim(), "blank category");
  });

  it("includes the two the app special-cases by name", () => {
    // "รายได้" is what the AI parser and the income breakdown look for, and
    // "อื่น ๆ" is the fallback every unmatched category lands on.
    assert.ok(CATEGORIES.includes("รายได้"));
    assert.ok(CATEGORIES.includes("อื่น ๆ"));
  });
});
