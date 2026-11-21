import { createClient } from "@supabase/supabase-js";

// The caller's id, plus the token they sent, so a route can act as them
// (lib/ai-quota.ts counts against the caller's own session, never a service key).
export async function requireUser(request: Request): Promise<{ id: string; token: string } | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  const client = createClient(url, key);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, token };
}

export function unauthorizedResponse() {
  return Response.json({ error: "กรุณาเข้าสู่ระบบก่อนใช้งาน" }, { status: 401 });
}
