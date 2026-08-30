// PIN lock (PBKDF2 hash + salt) and the WebAuthn/Face ID quick-unlock
// layered on top of it. Both are client-side device gates, not
// server-verified remote authentication -- see verifyFaceId's note below.
import { WEBAUTHN_TIMEOUT_MS } from "./constants.ts";
import type { Profile } from "./types.ts";
import type { User } from "@supabase/supabase-js";

export const pinLength = 6;
export const pinMaxAttempts = 5;
export const pinBlockMs = 60 * 60 * 1000;
export const pinBackgroundLockMs = 2 * 60 * 1000;
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
        rp: { name: "Monii", id: window.location.hostname },
        user: { id: userId, name: user.email ?? user.id, displayName: user.email ?? "Monii" },
        challenge,
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
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
        allowCredentials: [{ id: base64UrlToBytes(credentialId), type: "public-key" }],
        userVerification: "required",
        timeout: WEBAUTHN_TIMEOUT_MS,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}
