"use client";

// A short tap of the phone's own haptic engine, for the moments a gesture
// crosses a line (a sheet that will close if let go, a pull that will
// refresh) and for a result the eye might miss (saved, wrong PIN).
//
// Android: navigator.vibrate. iOS Safari has no vibrate at all, but since
// iOS 18 toggling an <input type="checkbox" switch> plays the system's own
// switch haptic -- also when the toggle is a script clicking its label, which
// is the whole trick (the same one the `ios-haptics` package uses). Older iOS,
// a desktop, or a browser that drops the trick later simply does nothing:
// nothing may depend on a haptic having happened. iOS may also only play it
// while a touch is being handled, so the ones fired after a save's network
// round trip are a bonus there, not a promise.

export type HapticKind = "light" | "success" | "warning";

const VIBRATE_PATTERNS: Record<HapticKind, number | number[]> = {
  light: 8,
  success: 16,
  warning: [24, 60, 24],
};

/** How many switch taps each kind is on iOS, and the gap between them. */
const IOS_TAPS: Record<HapticKind, number> = { light: 1, success: 1, warning: 2 };
const IOS_TAP_GAP_MS = 90;

function tapSwitch() {
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.appendChild(input);
  document.head.appendChild(label);
  label.click();
  label.remove();
}

/** Only phones and tablets: a mouse user has no haptic engine to feel. */
function hasTouch() {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
}

export function haptic(kind: HapticKind = "light") {
  if (!hasTouch()) return;
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(VIBRATE_PATTERNS[kind]);
      return;
    }
    tapSwitch();
    for (let index = 1; index < IOS_TAPS[kind]; index++) window.setTimeout(tapSwitch, IOS_TAP_GAP_MS * index);
  } catch {
    // A haptic is never worth an error.
  }
}
