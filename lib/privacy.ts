import type { SupabaseClient } from "@supabase/supabase-js";
import { PRIVACY_ACK_STORAGE_KEY, PRIVACY_POLICY_VERSION, TABLES } from "./constants.ts";

// Acknowledging the privacy policy, in two places: this device's storage
// (given on the landing page before there is an account to write it to), and
// public.privacy_acknowledgements, the record kept as evidence once there is.

export type PrivacyAckSource = "landing" | "in_app";

/** Whether this device acknowledged the current policy version. */
export function readLocalPrivacyAck() {
  try {
    return window.localStorage.getItem(PRIVACY_ACK_STORAGE_KEY) === PRIVACY_POLICY_VERSION;
  } catch {
    return false;
  }
}

export function writeLocalPrivacyAck() {
  try {
    window.localStorage.setItem(PRIVACY_ACK_STORAGE_KEY, PRIVACY_POLICY_VERSION);
  } catch {
    // Private mode or blocked storage: the server record still gets written
    // once signed in; this device just asks again next time.
  }
}

/**
 * Reads whether this user has acknowledged the current version on record.
 * `null` when the read itself failed -- the caller decides what an unknown
 * means rather than this guessing "no" and walling off the app.
 */
export async function fetchPrivacyAck(client: SupabaseClient, userId: string): Promise<boolean | null> {
  const { data, error } = await client
    .from(TABLES.privacyAcknowledgements)
    .select("id")
    .eq("user_id", userId)
    .eq("policy_version", PRIVACY_POLICY_VERSION)
    .limit(1);
  if (error) return null;
  return data.length > 0;
}

/**
 * Writes the acknowledgement of the current version. A second write for the
 * same user and version is ignored, so the first one -- the earliest time it
 * was given -- is the one that stands.
 */
export async function recordPrivacyAck(client: SupabaseClient, userId: string, source: PrivacyAckSource) {
  const { error } = await client
    .from(TABLES.privacyAcknowledgements)
    .upsert(
      {
        user_id: userId,
        policy_version: PRIVACY_POLICY_VERSION,
        source,
        user_agent: typeof navigator === "undefined" ? null : navigator.userAgent.slice(0, 500),
      },
      { onConflict: "user_id,policy_version", ignoreDuplicates: true },
    );
  return error;
}
