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

function isRetryableGeminiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("503") || message.includes("UNAVAILABLE") || message.includes("429") || message.includes("RESOURCE_EXHAUSTED");
}

// A model that's retired or not yet available reports 404/NOT_FOUND (or the
// "no longer available" text Google puts in the message) — that's a signal
// to move on to the next model in the chain, not to retry the same one.
function isUnavailableModelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("404") || message.includes("NOT_FOUND") || message.includes("no longer available");
}

const RETRY_DELAYS_MS = [1000, 2000, 4000];

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
// ai.models.generateContent directly. Handles both failure modes Gemini has
// actually thrown in this app: transient "high demand" 503s (retried with
// backoff on the same model) and a model being retired/unavailable (falls
// through to the next candidate in MODEL_CHAIN). Callers pass params without
// `model` — this fills it in per attempt.
export async function generateGeminiContent(
  ai: GoogleGenAI,
  params: Omit<GenerateContentParameters, "model">
): Promise<GenerateContentResponse> {
  const chain = lastWorkingModel ? [lastWorkingModel, ...MODEL_CHAIN.filter((model) => model !== lastWorkingModel)] : MODEL_CHAIN;
  let lastError: unknown;
  for (const model of chain) {
    try {
      const response = await withGeminiRetry(() => ai.models.generateContent({ ...params, model }));
      lastWorkingModel = model;
      return response;
    } catch (error) {
      lastError = error;
      if (!isUnavailableModelError(error)) throw error;
      console.error(`Gemini model ${model} unavailable, trying next candidate`, error);
    }
  }
  throw lastError;
}
