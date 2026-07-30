import { GoogleGenAI } from "@google/genai";

export const GEMINI_MODEL = "gemini-flash-latest";

export function getGeminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY || null;
}

export function missingGeminiKeyResponse() {
  return Response.json({ error: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY" }, { status: 503 });
}

export function createGeminiClient(apiKey: string) {
  return new GoogleGenAI({ apiKey });
}
