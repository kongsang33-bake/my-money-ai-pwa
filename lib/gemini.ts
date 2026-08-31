import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";
import { GEMINI_TEXT_TIMEOUT_MS } from "./constants.ts";

// Candidates tried in order on every request, newest first. Google
// periodically retires dated releases (a retired model 404s with "no
// longer available to new users") and promotes new ones, so this list is
// the thing to edit when that happens — no other code change needed. An
// optional GEMINI_MODEL env var, if set, is tried first of all so a model
// swap can also be done from hosting config without touching code.
const MODEL_CHAIN = [
  ...(process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []),
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
].filter((model, index, all) => all.indexOf(model) === index);

// Remembers the last model that actually worked, in-process, so once a
// retired/overloaded model is bypassed once, subsequent requests on this
// server instance stop wasting a round trip on it and start at the known-good
// one instead. Resets on redeploy/restart — that's fine, it's just a warm cache.
let lastWorkingModel: string | null = null;

export function getGeminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY || null;
}

export function missingGeminiKeyResponse() {
  return Response.json({ error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY" }, { status: 503 });
}

export function createGeminiClient(apiKey: string) {
  return new GoogleGenAI({ apiKey });
}

// The per-attempt timeout firing. AbortSignal.timeout rejects with a
// TimeoutError/AbortError DOMException, not a Gemini error message, so this
// is name-based rather than text-based.
export function isTimeoutError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  return name === "TimeoutError" || name === "AbortError";
}

// The model is up but momentarily swamped -- unlike a timeout, this one does
// tend to clear within a second. 429 is deliberately NOT here: see
// isRateLimitedError.
function isOverloadedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("503") || message.includes("UNAVAILABLE");
}

// Transient conditions that mean "this model didn't answer" rather than
// "the request itself is bad" -- worth continuing down the model chain.
function isRetryableGeminiError(error: unknown): boolean {
  return isTimeoutError(error) || isOverloadedError(error);
}

// A rate-limited model (429/RESOURCE_EXHAUSTED) won't clear within the few
// seconds a user is waiting on this request, so retrying it on the SAME
// model is pure wasted latency -- this skips straight to the next candidate
// in MODEL_CHAIN instead of spending a retry on it.
function isRateLimitedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("429") || message.includes("RESOURCE_EXHAUSTED");
}

// A model that's retired or not yet available reports 404/NOT_FOUND (or the
// "no longer available" text Google puts in the message) — that's a signal
// to move on to the next model in the chain, not to retry the same one.
function isUnavailableModelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("404") || message.includes("NOT_FOUND") || message.includes("no longer available");
}

const OVERLOAD_RETRY_DELAY_MS = 500;

/**
 * How long to wait before trying the SAME model again, or null to move on to
 * the next candidate in MODEL_CHAIN.
 *
 * A model that blew the per-attempt cap once rarely answers on the next try,
 * and the chain is itself the better retry -- so a timeout moves on
 * immediately. A 503 is usually a momentary spike, so it gets one quick retry
 * first. Both used to get two same-model retries with backoff, which is how a
 * single unresponsive model could eat 23s (7s x 3 attempts plus 2s of
 * backoff) before any other model was tried at all.
 */
export function sameModelRetryDelayMs(error: unknown, attempt: number): number | null {
  if (attempt > 0) return null;
  return isTimeoutError(error) ? null : OVERLOAD_RETRY_DELAY_MS;
}

// Total wall-clock one request may spend walking the chain (attempts plus
// backoff), as a multiple of the caller's per-attempt timeout. Without a
// ceiling, worst case is every model x every retry stacked end to end; with
// it, the user gets a plain error while still willing to retry by hand.
const GEMINI_BUDGET_MULTIPLIER = 2;

// Below this much remaining budget there isn't room for an attempt that could
// realistically finish, so the request stops instead of burning the remainder.
// Clamped to the caller's own per-attempt timeout below, since a caller that
// allows less than this per attempt still wants its attempts to happen.
const GEMINI_MIN_ATTEMPT_MS = 1500;

// The single entry point every route should call instead of
// ai.models.generateContent directly. Handles every failure mode Gemini has
// actually thrown in this app: a transient "high demand" 503 (one quick
// same-model retry), a per-attempt timeout, and a model being rate-limited or
// retired/unavailable (all three move straight down MODEL_CHAIN rather than
// failing the whole call). `budgetMs` caps the total wall-clock spent across
// the whole chain, so an unresponsive model can no longer make the user wait
// out every remaining candidate.
// Callers pass params without `model` — this fills it in per attempt.
export async function generateGeminiContent(
  ai: GoogleGenAI,
  params: Omit<GenerateContentParameters, "model">,
  options?: { timeoutMs?: number; budgetMs?: number }
): Promise<GenerateContentResponse> {
  const attemptTimeoutMs = options?.timeoutMs ?? GEMINI_TEXT_TIMEOUT_MS;
  const budgetMs = options?.budgetMs ?? attemptTimeoutMs * GEMINI_BUDGET_MULTIPLIER;
  const minAttemptMs = Math.min(GEMINI_MIN_ATTEMPT_MS, attemptTimeoutMs);
  const chain = lastWorkingModel ? [lastWorkingModel, ...MODEL_CHAIN.filter((model) => model !== lastWorkingModel)] : MODEL_CHAIN;
  const startedAt = Date.now();
  const remainingMs = () => budgetMs - (Date.now() - startedAt);
  const modelsAttempted: string[] = [];
  let lastError: unknown;

  for (const model of chain) {
    for (let attempt = 0; ; attempt++) {
      // Never let one attempt run past the request's overall budget: an
      // attempt the caller will abandon anyway is time the next model could
      // have used.
      const timeoutMs = Math.min(attemptTimeoutMs, remainingMs());
      if (timeoutMs < minAttemptMs) {
        console.error("Gemini request ran out of budget", { modelsAttempted, budgetMs, totalElapsedMs: Date.now() - startedAt });
        throw lastError ?? new Error("Gemini request ran out of budget");
      }
      if (attempt === 0) modelsAttempted.push(model);

      try {
        const response = await ai.models.generateContent({
          ...params,
          model,
          config: { ...params.config, abortSignal: AbortSignal.timeout(timeoutMs) },
        });
        lastWorkingModel = model;
        console.log("Gemini request succeeded", { model, modelsAttempted, totalElapsedMs: Date.now() - startedAt });
        return response;
      } catch (error) {
        lastError = error;
        // Rate-limited, retired, timed out or overloaded -- all of these mean
        // "try the next model", not "give up entirely". Anything else is a
        // real problem with the request and fails the whole call.
        if (!isUnavailableModelError(error) && !isRateLimitedError(error) && !isRetryableGeminiError(error)) throw error;

        // A retired/rate-limited model is never worth a same-model retry:
        // neither clears in the seconds a user is waiting.
        const retryDelayMs = isUnavailableModelError(error) || isRateLimitedError(error) ? null : sameModelRetryDelayMs(error, attempt);
        if (retryDelayMs === null) {
          console.error(`Gemini model ${model} unavailable, trying next candidate`, error);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  console.error("Gemini request failed on every model", { modelsAttempted, totalElapsedMs: Date.now() - startedAt });
  throw lastError;
}

// Turns a Gemini SDK error into a short Thai message safe to show a user —
// never the raw error, which is often a stringified JSON blob from Google
// ("{"error":{"code":503,"message":...") that reads as the app being
// broken. Logs the real error server-side for debugging; `action` names
// what the app was trying to do, e.g. "วิเคราะห์รายการ", "ตอบคำถาม".
export function describeGeminiError(error: unknown, action: string): string {
  console.error(`Gemini ${action} failed`, error);
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED")) {
    return `AI${action}ไม่สำเร็จ เพราะมีคนใช้งานเยอะในขณะนี้ กรุณาลองใหม่อีกครั้งในอีกสักครู่`;
  }
  if (message.includes("503") || message.includes("UNAVAILABLE")) {
    return `AI${action}ไม่สำเร็จ เพราะระบบ AI มีผู้ใช้งานหนาแน่นในขณะนี้ กรุณาลองใหม่อีกครั้ง`;
  }
  if (message.includes("404") || message.includes("NOT_FOUND") || message.includes("no longer available")) {
    return `AI${action}ไม่สำเร็จ ระบบ AI ขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง`;
  }
  // Reached when every model in the chain timed out (or the overall budget
  // ran out mid-chain) -- worth saying plainly that it was slow, not broken,
  // because retrying right away often lands on a healthy model.
  if (isTimeoutError(error)) {
    return `AI${action}ไม่สำเร็จ เพราะระบบ AI ตอบช้ากว่าปกติ กรุณาลองใหม่อีกครั้ง`;
  }
  return `AI${action}ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง`;
}
