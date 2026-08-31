import { GoogleGenAI, ThinkingLevel, type GenerateContentParameters, type GenerateContentResponse, type ThinkingConfig } from "@google/genai";
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

// Pulling apart "ซื้อข้าวเช้า 170 / กาแฟ 20 / น้ำยาปรับผ้านุ่ม 49" into JSON is
// extraction, not reasoning -- but a Flash model still spends thinking tokens
// on it by default, and that thinking is most of the wall clock a user waits
// on. Asking for the least thinking the model allows is the difference between
// an answer inside the timeout and a timeout.
//
// How to ask differs by generation, and asking the wrong way is a hard 400:
// thinking_budget is rejected from Gemini 3.5 onward (use thinking_level),
// while models older than 2.5 have no thinking to configure at all.
export function thinkingConfigForModel(model: string): ThinkingConfig | undefined {
  if (/^gemini-3\./.test(model)) return { thinkingLevel: ThinkingLevel.MINIMAL };
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 0 };
  return undefined;
}

// Any "the request itself is wrong" answer, checked ONLY on an attempt that
// carried a thinking config: the config is the newest, least-tested thing in
// the request, so it is dropped and the same model tried once more rather than
// failing the whole call over a hint we added. Deliberately not matched on the
// word "thinking" -- the wording of these 400s varies by model generation, and
// guessing wrong would turn a recoverable request into a dead one. A 400 with
// some other cause just fails again on the retry, one fast round trip later.
function isInvalidArgumentError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("400") || message.includes("INVALID_ARGUMENT");
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

// The head of MODEL_CHAIN gets a shorter leash than the models behind it.
// Nothing carries a known-good model across cold starts (lastWorkingModel is
// per-instance), so every cold request re-tests the same first candidate --
// and when that one is having a bad day it was eating half the budget before
// anything else got a turn. A model that answers normally comes back well
// inside this; one that doesn't costs a fraction of the wait it used to.
const GEMINI_FIRST_MODEL_TIMEOUT_RATIO = 0.45;

/**
 * Thrown when no model in the chain produced an answer. Carries what was
 * actually tried and for how long, so the failure can say which models went
 * quiet instead of just "the AI was slow" -- the app has no other way to
 * surface a server-side log line to whoever is looking at the screen.
 */
export class GeminiChainError extends Error {
  readonly attempted: string[];
  readonly elapsedMs: number;

  constructor(attempted: string[], elapsedMs: number, cause: unknown) {
    super(`Gemini produced no answer after ${attempted.join(", ") || "no attempts"} (${elapsedMs}ms)`, { cause });
    this.name = "GeminiChainError";
    this.attempted = attempted;
    this.elapsedMs = elapsedMs;
  }
}

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
  options?: { timeoutMs?: number; budgetMs?: number; minimizeThinking?: boolean }
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
    // Dropped for the rest of this model's attempts if the model turns out to
    // reject it (see isThinkingConfigRejection below).
    let thinkingConfig = options?.minimizeThinking && !params.config?.thinkingConfig ? thinkingConfigForModel(model) : undefined;

    // Only the first candidate is on the short leash, and only when there is
    // something else to fall through to.
    const modelTimeoutMs = model === chain[0] && chain.length > 1
      ? Math.max(minAttemptMs, Math.round(attemptTimeoutMs * GEMINI_FIRST_MODEL_TIMEOUT_RATIO))
      : attemptTimeoutMs;

    for (let attempt = 0; ; attempt++) {
      // Never let one attempt run past the request's overall budget: an
      // attempt the caller will abandon anyway is time the next model could
      // have used.
      const timeoutMs = Math.min(modelTimeoutMs, remainingMs());
      if (timeoutMs < minAttemptMs) {
        console.error("Gemini request ran out of budget", { modelsAttempted, budgetMs, totalElapsedMs: Date.now() - startedAt });
        throw new GeminiChainError(modelsAttempted, Date.now() - startedAt, lastError);
      }
      if (attempt === 0) modelsAttempted.push(model);

      try {
        const response = await ai.models.generateContent({
          ...params,
          model,
          config: {
            ...params.config,
            ...(thinkingConfig ? { thinkingConfig } : {}),
            abortSignal: AbortSignal.timeout(timeoutMs),
          },
        });
        lastWorkingModel = model;
        console.log("Gemini request succeeded", { model, modelsAttempted, totalElapsedMs: Date.now() - startedAt });
        return response;
      } catch (error) {
        lastError = error;

        // The model answers fine without the thinking hint -- take it off and
        // try this same model again rather than losing the model over it.
        if (thinkingConfig && isInvalidArgumentError(error)) {
          console.error(`Gemini model ${model} rejected the thinking config, retrying without it`, error);
          thinkingConfig = undefined;
          continue;
        }

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
  throw new GeminiChainError(modelsAttempted, Date.now() - startedAt, lastError);
}

// Turns a Gemini SDK error into a short Thai message safe to show a user —
// never the raw error, which is often a stringified JSON blob from Google
// ("{"error":{"code":503,"message":...") that reads as the app being
// broken. Logs the real error server-side for debugging; `action` names
// what the app was trying to do, e.g. "วิเคราะห์รายการ", "ตอบคำถาม".
export function describeGeminiError(error: unknown, action: string): string {
  console.error(`Gemini ${action} failed`, error);
  // A chain failure classifies by what actually went wrong on the last model,
  // and names the models it burned the wait on -- server logs are not
  // something the person holding the phone can go and read.
  const chainError = error instanceof GeminiChainError ? error : null;
  const detail = chainError ? ` (ลองแล้ว: ${chainError.attempted.join(", ")} · ${Math.round(chainError.elapsedMs / 1000)} วิ)` : "";
  const cause = chainError?.cause ?? error;
  const message = cause instanceof Error ? cause.message : String(cause);
  if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED")) {
    return `AI${action}ไม่สำเร็จ เพราะมีคนใช้งานเยอะในขณะนี้ กรุณาลองใหม่อีกครั้งในอีกสักครู่${detail}`;
  }
  if (message.includes("503") || message.includes("UNAVAILABLE")) {
    return `AI${action}ไม่สำเร็จ เพราะระบบ AI มีผู้ใช้งานหนาแน่นในขณะนี้ กรุณาลองใหม่อีกครั้ง${detail}`;
  }
  if (message.includes("404") || message.includes("NOT_FOUND") || message.includes("no longer available")) {
    return `AI${action}ไม่สำเร็จ ระบบ AI ขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง${detail}`;
  }
  // Reached when every model in the chain timed out (or the overall budget
  // ran out mid-chain) -- worth saying plainly that it was slow, not broken,
  // because retrying right away often lands on a healthy model.
  if (isTimeoutError(cause)) {
    return `AI${action}ไม่สำเร็จ เพราะระบบ AI ตอบช้ากว่าปกติ กรุณาลองใหม่อีกครั้ง${detail}`;
  }
  return `AI${action}ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง${detail}`;
}
