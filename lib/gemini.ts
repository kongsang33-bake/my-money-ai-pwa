import { GoogleGenAI } from "@google/genai";

// Pinned to a dated, stable release rather than the "-latest" alias — the
// alias can point at a newly-promoted model whose serving capacity hasn't
// ramped up yet, which shows up as spurious 503 UNAVAILABLE ("high demand")
// errors. Google retires dated releases on notice (a retired model 404s
// with "no longer available to new users"), so this is also overridable
// via env without a code change/redeploy when that happens.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

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

const RETRY_DELAYS_MS = [1000, 2000, 4000];

// Gemini's "high demand" 503s are transient overload on Google's side, not
// something wrong with the request — a short retry with backoff clears most
// of them without the user ever seeing an error.
export async function withGeminiRetry<T>(call: () => Promise<T>): Promise<T> {
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
