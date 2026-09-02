import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Profile } from "./types.ts";

// lib/pin.ts reaches for window.crypto / window.btoa / window.atob rather than
// the bare globals. In a browser those are the same objects, but Node only has
// the globals, so point a `window` at globalThis before importing the module.
// Deliberately a shim and not a change to pin.ts: this suite is here to pin
// down the behaviour that ships today, and rewriting the module in the same
// commit would mean the tests were never run against the code they were
// written for.
(globalThis as unknown as { window: typeof globalThis }).window = globalThis;

const {
  base64ToBytes, base64UrlToBytes, bytesToBase64, createPinSalt, hashPin,
  isSixDigitPin, pinBlocked, pinHashIterations, pinLength, pinMaxAttempts,
  timingSafeEqual,
} = await import("./pin.ts");

function profileWithBlock(pin_blocked_until: string | null): Profile {
  return { pin_blocked_until } as unknown as Profile;
}

describe("isSixDigitPin", () => {
  it("accepts exactly six digits", () => {
    assert.equal(isSixDigitPin("000000"), true);
    assert.equal(isSixDigitPin("123456"), true);
  });

  it("rejects the wrong length", () => {
    assert.equal(isSixDigitPin("12345"), false);
    assert.equal(isSixDigitPin("1234567"), false);
    assert.equal(isSixDigitPin(""), false);
  });

  it("rejects anything that is not a digit", () => {
    assert.equal(isSixDigitPin("12345a"), false);
    assert.equal(isSixDigitPin("12 456"), false);
    assert.equal(isSixDigitPin("１２３４５６"), false, "full-width digits are not ASCII digits");
  });

  it("rejects a six-digit run buried in a longer string", () => {
    // ^...$ rather than a bare \d{6}: without the anchors "abc123456" would
    // pass and a PIN field could be fed padding.
    assert.equal(isSixDigitPin("abc123456"), false);
    assert.equal(isSixDigitPin("123456\n"), false);
  });

  it("agrees with pinLength", () => {
    assert.equal(isSixDigitPin("1".repeat(pinLength)), true);
    assert.equal(isSixDigitPin("1".repeat(pinLength + 1)), false);
  });
});

describe("timingSafeEqual", () => {
  it("is true for identical strings", () => {
    assert.equal(timingSafeEqual("abc123", "abc123"), true);
    assert.equal(timingSafeEqual("", ""), true);
  });

  it("is false when any character differs", () => {
    assert.equal(timingSafeEqual("abc123", "abc124"), false);
    assert.equal(timingSafeEqual("abc123", "Abc123"), false);
  });

  it("is false for different lengths", () => {
    assert.equal(timingSafeEqual("abc", "abcd"), false);
    assert.equal(timingSafeEqual("abcd", "abc"), false);
  });

  it("returns false for a mismatch at either end of the string", () => {
    // Note what this does and does not prove. It pins the *result* for an
    // early and a late mismatch alike, so a rewrite that bailed out of the
    // loop still has to answer false. It cannot observe timing, so it cannot
    // prove the XOR accumulator is still doing its real job of taking the
    // same time either way -- that part is guarded by reading the code, and
    // by this comment being here when someone is tempted to "optimise" the
    // loop with an early return.
    const reference = "aaaaaaaaaa";
    assert.equal(timingSafeEqual(reference, "baaaaaaaaa"), false);
    assert.equal(timingSafeEqual(reference, "aaaaaaaaab"), false);
  });

  it("compares by code unit, so equal-looking strings that differ still fail", () => {
    assert.equal(timingSafeEqual("á", "á"), false);
  });
});

describe("bytesToBase64 / base64ToBytes", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 200, 255]);
    assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
  });

  it("round-trips every byte value", () => {
    const bytes = new Uint8Array(256).map((_, index) => index);
    assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
  });

  it("encodes to the standard base64 alphabet, with + and / rather than - and _", () => {
    assert.equal(bytesToBase64(new Uint8Array([255, 255, 255])), "////");
    assert.equal(bytesToBase64(new Uint8Array([255, 255, 251])), "///7");
    assert.equal(bytesToBase64(new Uint8Array([0, 0, 0])), "AAAA");
  });

  it("pads a length that is not a multiple of three", () => {
    assert.equal(bytesToBase64(new Uint8Array([0])), "AA==");
    assert.equal(bytesToBase64(new Uint8Array([0, 0])), "AAA=");
  });

  it("round-trips an empty array", () => {
    assert.deepEqual(base64ToBytes(bytesToBase64(new Uint8Array())), new Uint8Array());
  });
});

describe("base64UrlToBytes", () => {
  it("decodes base64url, which uses - and _ instead of + and /", () => {
    const bytes = new Uint8Array([255, 255, 255, 251, 255]);
    const standard = bytesToBase64(bytes);
    const urlSafe = standard.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    assert.deepEqual(base64UrlToBytes(urlSafe), bytes);
  });

  it("restores stripped padding", () => {
    // WebAuthn credential ids come back unpadded; atob rejects that, so the
    // padEnd in base64UrlToBytes is load-bearing for Face ID unlock.
    assert.deepEqual(base64UrlToBytes("AAA"), base64ToBytes("AAA="));
    assert.deepEqual(base64UrlToBytes("AA"), base64ToBytes("AA=="));
  });

  it("leaves already-padded input alone", () => {
    assert.deepEqual(base64UrlToBytes("AAA="), base64ToBytes("AAA="));
  });
});

describe("createPinSalt", () => {
  it("produces a 16-byte salt", () => {
    assert.equal(base64ToBytes(createPinSalt()).length, 16);
  });

  it("produces a different salt every time", () => {
    const salts = new Set(Array.from({ length: 32 }, () => createPinSalt()));
    assert.equal(salts.size, 32, "a repeated salt would mean getRandomValues is not being used");
  });
});

describe("hashPin", () => {
  it("is deterministic for the same pin and salt", async () => {
    const salt = createPinSalt();
    assert.equal(await hashPin("123456", salt), await hashPin("123456", salt));
  });

  it("differs for a different pin under the same salt", async () => {
    const salt = createPinSalt();
    assert.notEqual(await hashPin("123456", salt), await hashPin("123457", salt));
  });

  it("differs for the same pin under a different salt", async () => {
    // This is what the per-user salt buys: two people with the same PIN must
    // not share a hash, or one leaked hash would identify every account using
    // that PIN.
    assert.notEqual(await hashPin("123456", createPinSalt()), await hashPin("123456", createPinSalt()));
  });

  it("returns 256 bits of base64", async () => {
    assert.equal(base64ToBytes(await hashPin("123456", createPinSalt())).length, 32);
  });

  it("uses a work factor high enough to be worth calling a hash", () => {
    // Not a behavioural assertion so much as a tripwire: PBKDF2 iterations
    // only ever protect anything while they stay high, and a value that
    // quietly drifts down is exactly the kind of change nothing else notices.
    assert.ok(pinHashIterations >= 100000, `expected >= 100000 iterations, got ${pinHashIterations}`);
  });
});

describe("pinBlocked", () => {
  it("is false when there is no profile", () => {
    assert.equal(pinBlocked(null), false);
  });

  it("is false when the profile has never been blocked", () => {
    assert.equal(pinBlocked(profileWithBlock(null)), false);
  });

  it("is true while the block is still in the future", () => {
    assert.equal(pinBlocked(profileWithBlock(new Date(Date.now() + 60_000).toISOString())), true);
  });

  it("is false once the block has passed", () => {
    assert.equal(pinBlocked(profileWithBlock(new Date(Date.now() - 1_000).toISOString())), false);
  });

  it("is false for an unparseable timestamp rather than blocking forever", () => {
    // new Date("nonsense").getTime() is NaN, and NaN > Date.now() is false —
    // so a corrupt value fails open. Worth stating out loud: the alternative
    // (failing closed) would lock a user out of their own money with no way
    // back, and the PIN is a convenience lock on an already-authenticated
    // session, not the thing keeping an attacker out.
    assert.equal(pinBlocked(profileWithBlock("not a date")), false);
  });

  it("agrees with pinMaxAttempts being a real limit", () => {
    assert.ok(pinMaxAttempts > 0 && pinMaxAttempts <= 10);
  });
});
