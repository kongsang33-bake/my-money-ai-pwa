// The pure half of swipe-down-to-close on a sheet (useSheetDrag in
// components/primitives.tsx owns the touch listeners and the DOM writes).

import { SHEET_DRAG_CLOSE_FRACTION, SHEET_DRAG_FLICK_MIN_PX, SHEET_DRAG_FLICK_VELOCITY, SHEET_DRAG_SLOP, SHEET_STRETCH_MAX } from "./constants.ts";

export type DragIntent = "pending" | "drag" | "ignore";

/**
 * What a touch that started with the sheet scrolled to its top is turning
 * into, once it has moved `dx`/`dy` from where it began. Until it passes the
 * slop it is still undecided; then it is a drag only if it went down and
 * mostly down -- a sideways swipe belongs to a rail or the pocket's cards,
 * and an upward one is the sheet's own scroll. Unless the sheet has nothing
 * to scroll (`canScroll` false): then up is a drag too, which only ever
 * stretches it (rubberBand), the way an iOS sheet gives under a push.
 */
export function sheetDragIntent(dx: number, dy: number, canScroll = true): DragIntent {
  if (Math.hypot(dx, dy) < SHEET_DRAG_SLOP) return "pending";
  if (Math.abs(dx) >= Math.abs(dy)) return "ignore";
  if (dy > 0) return "drag";
  return canScroll ? "ignore" : "drag";
}

/**
 * Where a sheet sits for a finger `travel` px below (positive) or above
 * (negative) where the drag began. Down, it follows the finger. Up, it gives
 * with growing resistance and never more than SHEET_STRETCH_MAX -- there is
 * nowhere to open to, so the stretch only says the push was felt.
 */
export function rubberBand(travel: number): number {
  if (travel >= 0) return travel;
  const pull = -travel;
  return -SHEET_STRETCH_MAX * (1 - 1 / (1 + pull / (SHEET_STRETCH_MAX * 2)));
}

/**
 * Whether letting go closes the sheet: far enough (a share of its height),
 * or a quick enough flick downwards that travelled more than a twitch.
 * `velocity` is px/ms, positive downwards, over the last stretch of the drag.
 */
export function shouldCloseSheet(offset: number, velocity: number, height: number): boolean {
  if (offset <= 0) return false;
  if (height > 0 && offset >= height * SHEET_DRAG_CLOSE_FRACTION) return true;
  return velocity >= SHEET_DRAG_FLICK_VELOCITY && offset >= SHEET_DRAG_FLICK_MIN_PX;
}

/** How much of the scrim is left while the sheet is `offset` down: it fades with the sheet, never below a third. */
export function scrimOpacityFor(offset: number, height: number): number {
  if (height <= 0 || offset <= 0) return 1;
  return Math.max(1 / 3, 1 - offset / height);
}
