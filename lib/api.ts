import { supabase } from "./supabase.ts";

export async function authHeaders(): Promise<Record<string, string>> {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  return token ? { authorization: `Bearer ${token}` } : {};
}
