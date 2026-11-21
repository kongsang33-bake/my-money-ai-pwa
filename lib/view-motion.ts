// How a screen arrives, from where it sits relative to the one it replaced.
// The CSS for each is the `.phone[data-motion]` block in app/globals.css.
//
// - "rise": the first screen after launch -- nothing to come from.
// - "fade": a move between two screens at the same level (one tab to
//   another, or one money tool to the next from the desk's side nav).
//   Tabs are places side by side; sliding them would claim an order the nav
//   does not have.
// - "forward": into a screen that has a back button (a money tool, the
//   account), which comes in from the right.
// - "back": out of one, to where it was opened from, which comes in from
//   the left -- the way the back chevron says it will.

export type ViewMotion = "rise" | "fade" | "forward" | "back";

/** `depth` is 0 for a tab, 1 for a screen with a back button. */
export function viewMotion(fromDepth: number, toDepth: number): ViewMotion {
  if (toDepth > fromDepth) return "forward";
  if (toDepth < fromDepth) return "back";
  return "fade";
}
