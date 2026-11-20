import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AI_DAILY_LIMIT, RPC } from "./constants.ts";

// The daily ceiling on AI requests per account (AI_DAILY_LIMIT), counted
// across every AI route together by consume_ai_quota in the database.
//
// It counts as the caller -- a client carrying their own token -- so the
// function's auth.uid() is who is asking and the server never needs a
// service key. A request is counted when it arrives, before Gemini is called:
// a failed answer still spent a request, and counting only successes would
// let a client retry a timing-out prompt without end.
//
// If the count itself cannot be read (the migration not applied yet, the
// database briefly unreachable) the request goes ahead: this guards the
// app's quota against abuse, and failing closed would switch every AI
// feature off for everyone over a counter.

export type AiQuotaResult =
  | { allowed: true; used: number | null }
  | { allowed: false; used: number };

type QuotaRow = { allowed: boolean; used: number };

/** Reads consume_ai_quota's answer; anything unexpected fails open. */
export function readQuotaResponse(data: unknown, error: unknown): AiQuotaResult {
  if (error) return { allowed: true, used: null };
  const row = (Array.isArray(data) ? data[0] : data) as Partial<QuotaRow> | null | undefined;
  if (!row || typeof row.allowed !== "boolean") return { allowed: true, used: null };
  const used = typeof row.used === "number" ? row.used : null;
  if (row.allowed) return { allowed: true, used };
  return { allowed: false, used: used ?? AI_DAILY_LIMIT };
}

export async function consumeAiQuota(client: SupabaseClient, limit: number = AI_DAILY_LIMIT): Promise<AiQuotaResult> {
  try {
    const { data, error } = await client.rpc(RPC.consumeAiQuota, { p_limit: limit });
    if (error) console.error("consume_ai_quota failed; letting the request through", error);
    return readQuotaResponse(data, error);
  } catch (error) {
    console.error("consume_ai_quota threw; letting the request through", error);
    return { allowed: true, used: null };
  }
}

/** A Supabase client acting as the signed-in caller. */
export function clientForToken(token: string): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function quotaExceededResponse() {
  return Response.json(
    { error: `วันนี้ใช้ AI ครบ ${AI_DAILY_LIMIT} ครั้งแล้ว ใช้ได้อีกครั้งหลังเที่ยงคืน ระหว่างนี้ยังจดรายการเองได้ตามปกติ` },
    { status: 429 },
  );
}

/**
 * The one call every AI route makes after requireUser: null when the request
 * may go ahead, or the 429 to return when today's ceiling is reached.
 */
export async function enforceAiQuota(user: { token: string }): Promise<Response | null> {
  const client = clientForToken(user.token);
  if (!client) return null;
  const result = await consumeAiQuota(client);
  return result.allowed ? null : quotaExceededResponse();
}
