import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateGeminiContent, isTimeoutError, sameModelRetryDelayMs } from "./gemini.ts";
import type { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// AbortSignal.timeout rejects with a DOMException whose *name* is TimeoutError
// while its message says nothing about timing out -- which is why the check is
// name-based, and why it's worth pinning here.
function timeoutError() {
  const error = new Error("The operation was aborted due to timeout");
  error.name = "TimeoutError";
  return error;
}

describe("isTimeoutError", () => {
  it("recognises an aborted attempt by name, not message", () => {
    assert.equal(isTimeoutError(timeoutError()), true);
    const aborted = new Error("signal is aborted without reason");
    aborted.name = "AbortError";
    assert.equal(isTimeoutError(aborted), true);
  });

  it("does not treat a Gemini status error as a timeout", () => {
    assert.equal(isTimeoutError(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}')), false);
  });
});

describe("sameModelRetryDelayMs", () => {
  it("moves straight to the next model when an attempt times out", () => {
    assert.equal(sameModelRetryDelayMs(timeoutError(), 0), null);
  });

  it("gives an overloaded model one quick retry", () => {
    assert.equal(sameModelRetryDelayMs(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'), 0), 500);
  });

  it("never retries the same model twice", () => {
    assert.equal(sameModelRetryDelayMs(new Error("503 UNAVAILABLE"), 1), null);
  });
});

// Stands in for the SDK: every attempt honours the abortSignal the chain hands it,
// so the fake fails exactly the way a real unresponsive model does.
function fakeAi(behaviour: (model: string) => "hang" | "ok") {
  const attempts: string[] = [];
  const ai = {
    models: {
      generateContent: (params: { model: string; config?: { abortSignal?: AbortSignal } }) => {
        attempts.push(params.model);
        if (behaviour(params.model) === "ok") return Promise.resolve({ text: "{}" } as GenerateContentResponse);
        return new Promise<GenerateContentResponse>((_resolve, reject) => {
          // AbortSignal.timeout's own timer is unref'd, so with a fake SDK
          // there is nothing holding the event loop open while this "hangs"
          // and Node ends the test before the abort ever fires. A real
          // request keeps the loop alive; this ref'd timer stands in for it.
          const keepAlive = setTimeout(() => {}, 60_000);
          params.config?.abortSignal?.addEventListener("abort", () => {
            clearTimeout(keepAlive);
            const error = new Error("The operation was aborted due to timeout");
            error.name = "TimeoutError";
            reject(error);
          });
        });
      },
    },
  };
  return { ai: ai as unknown as GoogleGenAI, attempts };
}

describe("generateGeminiContent", () => {
  it("falls through to the next model as soon as one stops answering", async () => {
    const { ai, attempts } = fakeAi((model) => (model === "gemini-3.6-flash" ? "hang" : "ok"));
    const startedAt = Date.now();
    await generateGeminiContent(ai, { contents: [{ text: "ลูกบ้านแลกเหรียญ 100" }] }, { timeoutMs: 200, budgetMs: 1000 });
    // One dead attempt, then the next model -- no same-model retries in between.
    assert.deepEqual(attempts, ["gemini-3.6-flash", "gemini-2.5-flash"]);
    assert.ok(Date.now() - startedAt < 600, "should not spend more than the one timed-out attempt");
  });

  it("gives up inside the budget instead of walking every remaining model", async () => {
    const { ai, attempts } = fakeAi(() => "hang");
    const startedAt = Date.now();
    await assert.rejects(
      generateGeminiContent(ai, { contents: [{ text: "ลูกบ้านแลกเหรียญ 100" }] }, { timeoutMs: 200, budgetMs: 500 }),
      (error: Error) => error.name === "TimeoutError",
    );
    const elapsed = Date.now() - startedAt;
    assert.ok(elapsed < 900, `gave up in ${elapsed}ms, expected to stop near the 500ms budget`);
    assert.ok(attempts.length < 5, `tried ${attempts.length} models, expected the budget to cut the chain short`);
  });
});
