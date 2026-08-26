import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse } from "@google/genai";

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

// 503/UNAVAILABLE and a per-attempt timeout firing (AbortSignal.timeout
// rejects with a TimeoutError/AbortError DOMException, not a Gemini error
// message) -- genuine transient conditions worth a couple of quick retries
// on the same model. 429 is deliberately NOT here: see isRateLimitedError.
function isRetryableGeminiError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") return true;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("503") || message.includes("UNAVAILABLE");
}

// A rate-limited model (429/RESOURCE_EXHAUSTED) won't clear within the few
// seconds a user is waiting on this request, so retrying it on the SAME
// model is pure wasted latency -- this should skip straight to the next
// candidate in MODEL_CHAIN instead of going through withGeminiRetry's backoff.
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

const RETRY_DELAYS_MS = [500, 1500];
const GEMINI_ATTEMPT_TIMEOUT_MS = 12000;

async function withGeminiRetry<T>(call: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await call();
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_DELAYS_MS.length || !isRetryableGeminiError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
}

// The single entry point every route should call instead of
// ai.models.generateContent directly. Handles every failure mode Gemini has
// actually thrown in this app: transient "high demand" 503s and per-attempt
// timeouts (a couple of quick retries on the same model), a model being
// rate-limited or retired/unavailable (skips straight to the next candidate
// in MODEL_CHAIN, no same-model retry), and falls through to the next model
// even when a 503 survives its retries instead of failing the whole chain.
// Callers pass params without `model` — this fills it in per attempt.
export async function generateGeminiContent(
  ai: GoogleGenAI,
  params: Omit<GenerateContentParameters, "model">
): Promise<GenerateContentResponse> {
  const chain = lastWorkingModel ? [lastWorkingModel, ...MODEL_CHAIN.filter((model) => model !== lastWorkingModel)] : MODEL_CHAIN;
  const startedAt = Date.now();
  const modelsAttempted: string[] = [];
  let lastError: unknown;
  for (const model of chain) {
    modelsAttempted.push(model);
    try {
      const response = await withGeminiRetry(() => ai.models.generateContent({
        ...params,
        model,
        config: { ...params.config, abortSignal: AbortSignal.timeout(GEMINI_ATTEMPT_TIMEOUT_MS) },
      }));
      lastWorkingModel = model;
      console.log("Gemini request succeeded", { model, modelsAttempted, totalElapsedMs: Date.now() - startedAt });
      return response;
    } catch (error) {
      lastError = error;
      // Rate-limited, retired, or still failing after its own retries --
      // any of these means "try the next model", not "give up entirely".
      if (!isUnavailableModelError(error) && !isRateLimitedError(error) && !isRetryableGeminiError(error)) throw error;
      console.error(`Gemini model ${model} unavailable, trying next candidate`, error);
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
  return `AI${action}ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง`;
}
