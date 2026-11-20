import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { consumeAiQuota, readQuotaResponse } from "./ai-quota.ts";
import { AI_DAILY_LIMIT, RPC } from "./constants.ts";

// The ceiling exists to protect the app's Gemini quota, not to gate features:
// when the counter itself cannot answer, the request has to go ahead rather
// than switch every AI feature off for everyone.

describe("readQuotaResponse", () => {
  it("allows a request the function counted", () => {
    assert.deepEqual(readQuotaResponse([{ allowed: true, used: 3 }], null), { allowed: true, used: 3 });
  });

  it("refuses one the function turned away", () => {
    assert.deepEqual(readQuotaResponse([{ allowed: false, used: AI_DAILY_LIMIT }], null), { allowed: false, used: AI_DAILY_LIMIT });
  });

  it("reads a single object as well as a one-row array", () => {
    assert.deepEqual(readQuotaResponse({ allowed: false, used: 7 }, null), { allowed: false, used: 7 });
  });

  it("fails open on an error, an empty answer or a malformed row", () => {
    assert.equal(readQuotaResponse(null, { message: "function does not exist" }).allowed, true);
    assert.equal(readQuotaResponse([], null).allowed, true);
    assert.equal(readQuotaResponse([{ used: 5 }], null).allowed, true);
  });
});

describe("consumeAiQuota", () => {
  function fakeClient(rpc: (name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>) {
    return { rpc } as unknown as SupabaseClient;
  }

  it("asks the database with the shared limit", async () => {
    const calls: Array<[string, unknown]> = [];
    const client = fakeClient(async (name, args) => {
      calls.push([name, args]);
      return { data: [{ allowed: true, used: 1 }], error: null };
    });
    await consumeAiQuota(client);
    assert.deepEqual(calls, [[RPC.consumeAiQuota, { p_limit: AI_DAILY_LIMIT }]]);
  });

  it("lets the request through when the call throws", async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const client = fakeClient(async () => { throw new Error("network down"); });
      assert.deepEqual(await consumeAiQuota(client), { allowed: true, used: null });
    } finally {
      console.error = original;
    }
  });
});
