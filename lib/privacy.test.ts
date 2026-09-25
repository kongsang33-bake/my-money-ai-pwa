import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPrivacyAck, recordPrivacyAck } from "./privacy.ts";
import { PRIVACY_POLICY_VERSION, TABLES } from "./constants.ts";

// The acknowledgement is evidence, so what gets written -- and that a second
// write cannot replace the first -- matters more than the call itself. A fake
// client records what the query builder was asked to do.
type Call = { table: string; op: string; args: unknown[] };

function fakeClient(result: { data?: unknown; error?: { message: string } | null }) {
  const calls: Call[] = [];
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "eq", "limit", "upsert"]) {
      chain[op] = (...args: unknown[]) => {
        calls.push({ table, op, args });
        return op === "limit" || op === "upsert" ? Promise.resolve({ data: result.data ?? null, error: result.error ?? null }) : chain;
      };
    }
    return chain;
  };
  return { client: { from: builder } as unknown as SupabaseClient, calls };
}

describe("fetchPrivacyAck", () => {
  it("looks for this user's acknowledgement of the current version", async () => {
    const { client, calls } = fakeClient({ data: [{ id: "a" }] });
    assert.equal(await fetchPrivacyAck(client, "user-1"), true);
    assert.deepEqual(calls.filter((c) => c.op === "eq").map((c) => c.args), [["user_id", "user-1"], ["policy_version", PRIVACY_POLICY_VERSION]]);
    assert.equal(calls[0].table, TABLES.privacyAcknowledgements);
  });

  it("says no when there is none on record", async () => {
    const { client } = fakeClient({ data: [] });
    assert.equal(await fetchPrivacyAck(client, "user-1"), false);
  });

  it("says it does not know when the read fails, rather than no", async () => {
    const { client } = fakeClient({ error: { message: "offline" } });
    assert.equal(await fetchPrivacyAck(client, "user-1"), null);
  });
});

describe("recordPrivacyAck", () => {
  it("writes the current version and where it was given, keeping the first write", async () => {
    const { client, calls } = fakeClient({});
    assert.equal(await recordPrivacyAck(client, "user-1", "landing"), null);
    const [row, options] = calls[0].args as [Record<string, unknown>, Record<string, unknown>];
    assert.equal(row.user_id, "user-1");
    assert.equal(row.policy_version, PRIVACY_POLICY_VERSION);
    assert.equal(row.source, "landing");
    // No client-side timestamp: acknowledged_at is the database's own now().
    assert.equal("acknowledged_at" in row, false);
    assert.deepEqual(options, { onConflict: "user_id,policy_version", ignoreDuplicates: true });
  });

  it("hands back the error so the in-app gate can stay shut", async () => {
    const { client } = fakeClient({ error: { message: "denied" } });
    assert.deepEqual(await recordPrivacyAck(client, "user-1", "in_app"), { message: "denied" });
  });
});
