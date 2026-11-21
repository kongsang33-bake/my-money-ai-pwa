// The pure half of swipe-from-the-left-edge to go back (EdgeSwipeBack in
// components/primitives.tsx owns the listeners and the DOM).

import { EDGE_SWIPE_BACK_FRACTION, EDGE_SWIPE_SLOP, EDGE_SWIPE_ZONE, SHEET_DRAG_FLICK_MIN_PX, SHEET_DRAG_FLICK_VELOCITY } from "./constants.ts";

/** Whether a touch starting at this x is close enough to the left edge to be a back swipe at all. */
export function startsAtEdge(x: number): boolean {
  return x >= 0 && x <= EDGE_SWIPE_ZONE;
}

/**
 * What an edge touch is turning into after moving dx/dy: undecided until it
 * passes the slop, then a back swipe only if it went right and mostly
 * sideways -- a touch that starts near the edge and goes down is a scroll.
 */
export function edgeSwipeIntent(dx: number, dy: number): "pending" | "swipe" | "ignore" {
  if (Math.hypot(dx, dy) < EDGE_SWIPE_SLOP) return "pending";
  return dx > 0 && dx > Math.abs(dy) ? "swipe" : "ignore";
}

/**
 * Whether letting go goes back: past the share of the screen, or a quick
 * flick to the right that went further than a twitch. `velocity` is px/ms
 * over the last stretch, positive to the right.
 */
export function shouldGoBack(offset: number, velocity: number, width: number): boolean {
  if (offset <= 0) return false;
  if (width > 0 && offset >= width * EDGE_SWIPE_BACK_FRACTION) return true;
  return velocity >= SHEET_DRAG_FLICK_VELOCITY && offset >= SHEET_DRAG_FLICK_MIN_PX;
}
