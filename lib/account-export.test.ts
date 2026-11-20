import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AccountExportError, accountExportFilename, buildAccountExport, fetchAccountExport } from "./account-export.ts";
import { ENTRY_PAGE_SIZE, TABLES } from "./constants.ts";

type Reply = { data?: Record<string, unknown>[]; error?: { message: string; code?: string } | null };

// A fake client that serves each table from a list and honours range(), so
// paging is exercised for real. `failing` makes one table answer with an error.
function fakeClient(tables: Record<string, Record<string, unknown>[]>, failing: Record<string, { message: string; code?: string }> = {}) {
  const from = (table: string) => {
    const rows = tables[table] ?? [];
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      range: (start: number, end: number): Promise<Reply & { count: number }> =>
        Promise.resolve(failing[table]
          ? { data: undefined, error: failing[table], count: 0 }
          : { data: rows.slice(start, end + 1), error: null, count: rows.length }),
    };
    return chain;
  };
  return { from } as unknown as SupabaseClient;
}

const NOW = new Date("2026-11-20T18:30:00Z");

describe("buildAccountExport", () => {
  it("labels the file so an importer can refuse one it does not know", () => {
    const file = buildAccountExport({}, { exportedAt: NOW, userEmail: "a@b.c" });
    assert.equal(file.format, "nubmon-account-export");
    assert.equal(file.version, 1);
    assert.equal(file.exportedAt, "2026-11-20T18:30:00.000Z");
    assert.equal(file.userEmail, "a@b.c");
  });

  it("has every exported table, empty when there is nothing in it, keyed by the TABLES names", () => {
    const { tables } = buildAccountExport({}, { exportedAt: NOW, userEmail: null });
    assert.deepEqual(Object.keys(tables).sort(), [
      TABLES.transactions, TABLES.wallets, TABLES.debtors, TABLES.recurringExpenses, TABLES.investments,
      TABLES.investmentPrices, TABLES.budgets, TABLES.moneyGoals, TABLES.pocketCards, TABLES.profiles,
    ].sort());
    assert.deepEqual(tables[TABLES.wallets], []);
  });

  it("keeps the PIN and passkey columns out of the profile, and any secret added later", () => {
    const file = buildAccountExport({
      [TABLES.profiles]: [{
        user_id: "u1", nickname: "Jun", month_start_day: 25, ai_context: "note",
        pin_hash: "x", pin_salt: "y", pin_failed_attempts: 2, pin_blocked_until: "t",
        webauthn_credential_id: "c", webauthn_enabled: true, some_future_secret: "s",
      }],
    }, { exportedAt: NOW, userEmail: null });
    const [profile] = file.tables[TABLES.profiles];
    assert.deepEqual(profile, { user_id: "u1", nickname: "Jun", month_start_day: 25, ai_context: "note" });
    assert.doesNotMatch(JSON.stringify(file), /pin_|webauthn|some_future_secret/);
  });

  it("leaves out chat history, privacy records and the quota counter", () => {
    const file = buildAccountExport({}, { exportedAt: NOW, userEmail: null });
    assert.ok(!(TABLES.aiChatMessages in file.tables));
    assert.ok(!(TABLES.privacyAcknowledgements in file.tables));
  });
});

describe("fetchAccountExport", () => {
  it("reads a table that is longer than one page, in full", async () => {
    const many = Array.from({ length: ENTRY_PAGE_SIZE + 5 }, (_, index) => ({ id: `t${index}` }));
    const file = await fetchAccountExport(fakeClient({ [TABLES.transactions]: many, [TABLES.wallets]: [{ id: "w" }] }), null, NOW);
    assert.equal(file.tables[TABLES.transactions].length, ENTRY_PAGE_SIZE + 5);
    assert.deepEqual(file.tables[TABLES.wallets], [{ id: "w" }]);
  });

  it("throws instead of producing a file when a table cannot be read", async () => {
    await assert.rejects(
      fetchAccountExport(fakeClient({}, { [TABLES.debtors]: { message: "boom" } }), null, NOW),
      (error: unknown) => error instanceof AccountExportError && error.message === "boom",
    );
  });

  it("treats a pocket_cards table that does not exist yet as empty", async () => {
    const file = await fetchAccountExport(fakeClient({}, { [TABLES.pocketCards]: { message: "no table", code: "PGRST205" } }), null, NOW);
    assert.deepEqual(file.tables[TABLES.pocketCards], []);
  });

  it("does not forgive a missing table that is not the optional one", async () => {
    await assert.rejects(fetchAccountExport(fakeClient({}, { [TABLES.wallets]: { message: "no table", code: "PGRST205" } }), null, NOW));
  });
});

describe("accountExportFilename", () => {
  it("dates the file by the day in Thailand", () => {
    // 18:30 UTC is already the next morning in Bangkok.
    assert.equal(accountExportFilename(NOW), "nubmon-backup-2026-11-21.json");
  });
});
