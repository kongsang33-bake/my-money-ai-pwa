// PIN lock (PBKDF2 hash + salt) and the WebAuthn/Face ID quick-unlock
// layered on top of it. Both are client-side device gates, not
// server-verified remote authentication -- see verifyFaceId's note below.
import { WEBAUTHN_TIMEOUT_MS } from "./constants.ts";
import { clampInteger } from "./format.ts";
import type { Profile } from "./types.ts";
import type { User } from "@supabase/supabase-js";

export const pinLength = 6;
export const pinMaxAttempts = 5;
export const pinBlockMs = 60 * 60 * 1000;
/**
 * How long the app may sit in the background before it asks for the PIN or
 * Face ID again — the owner's choice, because the right answer depends on
 * whose hands the phone passes through, which the app cannot know.
 *
 * It became a setting after the unavoidable half of the problem turned out
 * to be unavoidable: on iOS, Safari puts its own consent sheet in front of
 * every Face ID prompt a web app asks for, and no WebAuthn option removes
 * it. So the only lever left is how OFTEN that prompt happens, and two
 * minutes — the original — was less than a real errand. Checking the bank
 * app to read a balance, or following a notification and coming back, both
 * outlast it, so the app re-locked on almost every trip it sends you on.
 *
 * "never" means the lock only runs on a genuine cold start; coming back
 * from another app never re-locks. The phone's own auto-lock is the backstop
 * underneath every one of these.
 */
export type LockDelayKey = "instant" | "5m" | "15m" | "1h" | "never";

export const defaultLockDelay: LockDelayKey = "15m";

export const lockDelayOptions: { key: LockDelayKey; label: string; ms: number }[] = [
  { key: "instant", label: "ทันทีที่ออกจากแอพ", ms: 0 },
  { key: "5m", label: "หลังผ่านไป 5 นาที", ms: 5 * 60 * 1000 },
  { key: "15m", label: "หลังผ่านไป 15 นาที", ms: 15 * 60 * 1000 },
  { key: "1h", label: "หลังผ่านไป 1 ชั่วโมง", ms: 60 * 60 * 1000 },
  { key: "never", label: "ไม่ล็อกจนกว่าจะปิดแอพ", ms: Number.POSITIVE_INFINITY },
];

export function isLockDelayKey(value: unknown): value is LockDelayKey {
  return lockDelayOptions.some((option) => option.key === value);
}

/**
 * The delay a stored key means, in milliseconds. Anything unrecognised —
 * a hand-edited localStorage value, a key removed in a later version —
 * falls back to the default rather than to zero or to infinity, because
 * both of those are a surprise: one locks constantly, the other never.
 */
export function lockDelayMs(key: unknown): number {
  const match = lockDelayOptions.find((option) => option.key === key);
  if (match) return match.ms;
  return lockDelayOptions.find((option) => option.key === defaultLockDelay)!.ms;
}
export const pinHashIterations = 150000;
export const isSixDigitPin = (value: string) => /^\d{6}$/.test(value);

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}
export function base64ToBytes(value: string) {
  const binary = window.atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}
export async function hashPin(pin: string, salt: string) {
  const encoder = new TextEncoder();
  const key = await window.crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64ToBytes(salt),
      iterations: pinHashIterations,
    },
    key,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}
export function createPinSalt() {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}
export function pinBlocked(profile: Profile | null) {
  const blockedAt = profile?.pin_blocked_until ? new Date(profile.pin_blocked_until).getTime() : 0;
  return blockedAt > Date.now();
}

export type PinAttemptOutcome = {
  /** What pin_failed_attempts should become. */
  failedAttempts: number;
  /** ISO timestamp the block lifts, or null if this attempt did not block. */
  blockedUntil: string | null;
  /** Whether this attempt used up the last try. */
  blocked: boolean;
  /** What to show the user. */
  message: string;
};

/**
 * The lockout policy: given the profile as the server currently has it, what a
 * failed PIN entry should leave behind.
 *
 * Pulled out of verifyPin because it is the part with actual rules in it --
 * counting, clamping, deciding when to block, and telling the user how many
 * tries are left -- while everything around it in app/page.tsx is a Supabase
 * update and some setState. An off-by-one here either locks someone out of
 * their own money a try early or hands an attacker an extra guess, and until
 * now nothing checked either direction.
 *
 * `now` is a parameter so a test does not have to race the clock.
 */
export function recordFailedPinAttempt(profile: Profile | null, now = Date.now()): PinAttemptOutcome {
  // Sanitise the stored value BEFORE adding to it, not after. Clamping the sum
  // means a stored -10 comes out as 0 -- the floor -- so the failure is not
  // counted at all and the attacker gets a free guess for every unit the value
  // is negative. Clamping first turns any nonsense into 0 and this failure
  // into 1. clampInteger's fallback covers null, undefined and NaN the same
  // way; a stored value already past the cap stays at the cap.
  const stored = clampInteger(profile?.pin_failed_attempts, 0, pinMaxAttempts, 0);
  const failedAttempts = Math.min(pinMaxAttempts, stored + 1);
  const blocked = failedAttempts >= pinMaxAttempts;
  const blockHours = pinBlockMs / 3_600_000;

  return {
    failedAttempts,
    blocked,
    blockedUntil: blocked ? new Date(now + pinBlockMs).toISOString() : null,
    message: blocked
      ? `ใส่ PIN ผิดครบ ${pinMaxAttempts} ครั้ง บล็อกการเข้าใช้งาน ${blockHours} ชั่วโมง`
      : `PIN ไม่ถูกต้อง เหลือ ${pinMaxAttempts - failedAttempts} ครั้ง`,
  };
}

/**
 * Face ID / Touch ID quick-unlock, layered on top of the PIN above — never
 * a replacement. WebAuthn is the only way a web app can reach the
 * platform's biometric prompt; the app never sees the biometric data,
 * only whether the browser's promise resolved. Like the PIN, this is a
 * client-side device gate, not server-verified remote authentication:
 * treating a resolved navigator.credentials.get() as "unlocked" matches
 * the same trust level as comparing the PIN hash in the browser, so no
 * server-side WebAuthn signature verification is implemented here on
 * purpose — that would be a different, heavier feature.
 */
export function isWebAuthnSupported() {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function";
}
export async function isPlatformAuthenticatorAvailable() {
  if (!isWebAuthnSupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}
export function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return base64ToBytes(padded);
}
export async function registerFaceId(user: User): Promise<string | null> {
  if (!isWebAuthnSupported()) return null;
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);
  const userId = new TextEncoder().encode(user.id);
  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        rp: { name: "NUBTHUNG", id: window.location.hostname },
        user: { id: userId, name: user.email ?? user.id, displayName: user.email ?? "NUBTHUNG" },
        challenge,
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          // Ask for a credential this app looks up BY ID, not one the
          // platform lists in its own account chooser. A discoverable
          // credential (the default a synced passkey gets) makes iOS open
          // "Sign in to … with your passkey for <email>" and wait for a tap
          // before it will even offer Face ID -- a whole extra sheet in front
          // of what is meant to be a glance. We already know which credential
          // we want; verifyFaceId names it.
          residentKey: "discouraged",
          requireResidentKey: false,
        },
        timeout: WEBAUTHN_TIMEOUT_MS,
      },
    }) as PublicKeyCredential | null;
    return credential?.id ?? null;
  } catch {
    return null;
  }
}
export async function verifyFaceId(credentialId: string): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        // transports says "this one is on the device in your hand", which is
        // what lets the browser skip asking how you would like to sign in
        // (this device / a phone nearby / a security key) and go straight to
        // the biometric prompt.
        allowCredentials: [{ id: base64UrlToBytes(credentialId), type: "public-key", transports: ["internal"] }],
        userVerification: "required",
        timeout: WEBAUTHN_TIMEOUT_MS,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}
