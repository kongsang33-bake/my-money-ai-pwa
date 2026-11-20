// Geometry for the entry morph (components/morph.ts): the tapped row's icon
// and amount fly into EntryDetailSheet's header instead of the sheet simply
// appearing over them. Pure, so the arithmetic is tested apart from the DOM.

export type Box = { left: number; top: number; width: number; height: number };

export type MorphPart = "icon" | "amount";
export const MORPH_PARTS: readonly MorphPart[] = ["icon", "amount"];

/**
 * The transform that lays a box drawn at `from` over `to`. The ghost is
 * placed at `from` with its origin at the top left, so translating by the
 * offset and scaling by the size ratio lands it exactly on `to`.
 *
 * Scaled uniformly, by height: an amount's text is wider or narrower at the
 * sheet's size depending on its digits, and a non-uniform scale would stretch
 * the figures. Height is what a type size changes in proportion.
 */
export function morphTransform(from: Box, to: Box) {
  const scale = from.height > 0 ? to.height / from.height : 1;
  return {
    dx: to.left - from.left,
    dy: to.top - from.top,
    scale,
  };
}

/**
 * Whether a source is worth flying from: drawn at all, and on screen. A tile
 * scrolled out of its rail, or a row behind a parked tab, has a rect but is
 * not where the user's eye is -- a ghost from there would arrive from nowhere.
 */
export function isOnScreen(box: Box, viewport: { width: number; height: number }) {
  if (box.width <= 0 || box.height <= 0) return false;
  return box.left < viewport.width && box.left + box.width > 0 && box.top < viewport.height && box.top + box.height > 0;
}

/** "240ms" / "0.24s" (a --t-* token as getComputedStyle returns it) to ms. */
export function parseDuration(value: string, fallbackMs: number) {
  const text = value.trim();
  const match = /^(-?[\d.]+)(ms|s)$/.exec(text);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) return fallbackMs;
  return match[2] === "s" ? amount * 1000 : amount;
}
