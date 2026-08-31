import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GeminiChainError, classifyGeminiFailure, describeGeminiError, dominantFailureCode, generateGeminiContent, isTimeoutError, sameModelRetryDelayMs, thinkingConfigForModel } from "./gemini.ts";
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
//
// `behaviour` is keyed on the attempt number rather than the model name on
// purpose: generateGeminiContent remembers the last model that worked for the
// life of the module, so which model leads the chain depends on what ran
// before -- assertions here are about chain BEHAVIOUR, not model names.
function fakeAi(behaviour: (model: string, attemptIndex: number) => "hang" | "ok") {
  const attempts: string[] = [];
  const ai = {
    models: {
      generateContent: (params: { model: string; config?: { abortSignal?: AbortSignal } }) => {
        attempts.push(params.model);
        if (behaviour(params.model, attempts.length - 1) === "ok") return Promise.resolve({ text: "{}" } as GenerateContentResponse);
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
  it("gives the first candidate a shorter leash than the models behind it", async () => {
    const { ai, attempts } = fakeAi((_model, attemptIndex) => (attemptIndex === 0 ? "hang" : "ok"));
    const startedAt = Date.now();
    await generateGeminiContent(ai, { contents: [{ text: "กาแฟ 20" }] }, { timeoutMs: 4000, budgetMs: 8000 });
    const elapsed = Date.now() - startedAt;
    // The head of the chain is cut off at a fraction of the per-attempt
    // timeout, so a bad first candidate cannot eat the whole wait.
    assert.equal(attempts.length, 2);
    assert.ok(elapsed < 3000, `first model held the request for ${elapsed}ms, expected well under the 4s per-attempt timeout`);
  });

  it("falls through to the next model as soon as one stops answering", async () => {
    const { ai, attempts } = fakeAi((_model, attemptIndex) => (attemptIndex === 0 ? "hang" : "ok"));
    const startedAt = Date.now();
    await generateGeminiContent(ai, { contents: [{ text: "ลูกบ้านแลกเหรียญ 100" }] }, { timeoutMs: 200, budgetMs: 1000 });
    // One dead attempt, then a different model -- no same-model retries in between.
    assert.equal(attempts.length, 2);
    assert.notEqual(attempts[0], attempts[1]);
    assert.ok(Date.now() - startedAt < 600, "should not spend more than the one timed-out attempt");
  });

  it("gives up inside the budget instead of walking every remaining model", async () => {
    const { ai, attempts } = fakeAi(() => "hang");
    const startedAt = Date.now();
    await assert.rejects(
      generateGeminiContent(ai, { contents: [{ text: "ลูกบ้านแลกเหรียญ 100" }] }, { timeoutMs: 200, budgetMs: 500 }),
      (error: unknown) => {
        // The wrapper is what the error message shown to the user is built
        // from: which models went quiet, and how long they were given.
        assert.ok(error instanceof GeminiChainError);
        assert.ok(error.attempted.length >= 1);
        assert.ok(isTimeoutError(error.cause), "keeps the underlying timeout as the cause");
        return true;
      },
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

describe("classifyGeminiFailure", () => {
  it("names each failure the API actually returns", () => {
    assert.equal(classifyGeminiFailure(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}')), "429");
    assert.equal(classifyGeminiFailure(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}')), "503");
    assert.equal(classifyGeminiFailure(new Error("models/gemini-1.5-flash is not found (404)")), "404");
    assert.equal(classifyGeminiFailure(timeoutError()), "timeout");
    assert.equal(classifyGeminiFailure(new Error("boom")), "error");
  });
});

describe("dominantFailureCode", () => {
  it("reports quota over a retired model, whatever order they happened in", () => {
    // The exact shape of the bug this exists for: the good models were out of
    // quota, the chain ended on a dead one, and the app blamed the dead one.
    assert.equal(dominantFailureCode(["429", "429", "404", "404"]), "429");
  });

  it("falls back to the worst thing present when there is no quota failure", () => {
    assert.equal(dominantFailureCode(["404", "timeout"]), "timeout");
    assert.equal(dominantFailureCode(["404"]), "404");
    assert.equal(dominantFailureCode([]), "error");
  });
});

describe("describeGeminiError", () => {
  it("blames quota, not the retired model the chain happened to end on", () => {
    const chainError = new GeminiChainError(
      [{ model: "gemini-3.6-flash", code: "429" }, { model: "gemini-2.0-flash", code: "404" }],
      7000,
      new Error("models/gemini-2.0-flash is not found (404)"),
    );
    const described = describeGeminiError(chainError, "วิเคราะห์รายการ");
    assert.match(described, /มีคนใช้งานเยอะ/);
    // And it still shows what was tried, with the reason per model.
    assert.match(described, /gemini-3\.6-flash·429/);
    assert.match(described, /gemini-2\.0-flash·404/);
  });
});
