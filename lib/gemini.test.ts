import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateGeminiContent, isTimeoutError, sameModelRetryDelayMs, thinkingConfigForModel } from "./gemini.ts";
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

describe("thinkingConfigForModel", () => {
  it("asks Gemini 3.x for the minimum thinking level", () => {
    assert.deepEqual(thinkingConfigForModel("gemini-3.6-flash"), { thinkingLevel: "MINIMAL" });
  });

  it("uses the older budget field on 2.5, which rejects thinking_level", () => {
    assert.deepEqual(thinkingConfigForModel("gemini-2.5-flash"), { thinkingBudget: 0 });
  });

  it("sends nothing to models with no thinking to configure", () => {
    assert.equal(thinkingConfigForModel("gemini-2.0-flash"), undefined);
    assert.equal(thinkingConfigForModel("gemini-1.5-flash"), undefined);
  });
});

describe("generateGeminiContent thinking handling", () => {
  function recordingAi(onCall: (model: string, thinking: unknown, callIndex: number) => "ok" | "reject-thinking") {
    const calls: { model: string; thinking: unknown }[] = [];
    const ai = {
      models: {
        generateContent: (params: { model: string; config?: { thinkingConfig?: unknown } }) => {
          const thinking = params.config?.thinkingConfig;
          calls.push({ model: params.model, thinking });
          if (onCall(params.model, thinking, calls.length - 1) === "ok") return Promise.resolve({ text: "{}" } as GenerateContentResponse);
          return Promise.reject(new Error('{"error":{"code":400,"status":"INVALID_ARGUMENT","message":"thinking_budget is not supported"}}'));
        },
      },
    };
    return { ai: ai as unknown as GoogleGenAI, calls };
  }

  it("only sends a thinking config when the caller asks for it", async () => {
    const { ai, calls } = recordingAi(() => "ok");
    await generateGeminiContent(ai, { contents: [{ text: "กาแฟ 20" }] }, { timeoutMs: 500 });
    assert.equal(calls[0].thinking, undefined);
  });

  it("gives up when the request is bad for a reason other than the thinking config", async () => {
    const { ai, calls } = recordingAi(() => "reject-thinking");
    await assert.rejects(generateGeminiContent(ai, { contents: [{ text: "กาแฟ 20" }] }, { timeoutMs: 500, minimizeThinking: true }));
    // One try with the config, one without -- then the 400 is taken at face value.
    assert.equal(calls.length, 2);
  });

  it("retries the same model without the thinking config when the model rejects it", async () => {
    const { ai, calls } = recordingAi((_model, thinking) => (thinking ? "reject-thinking" : "ok"));
    await generateGeminiContent(ai, { contents: [{ text: "กาแฟ 20" }] }, { timeoutMs: 500, minimizeThinking: true });
    assert.equal(calls.length, 2, "should retry the same model, not fall through to the next one");
    assert.equal(calls[0].model, calls[1].model);
    assert.ok(calls[0].thinking, "first attempt carries the thinking config");
    assert.equal(calls[1].thinking, undefined, "retry drops it");
  });
});
