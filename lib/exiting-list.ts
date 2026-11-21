// The pure half of the row-exit animation (components/exiting-list.ts): a row
// removed from a list is kept on screen a moment longer, marked as exiting,
// so it can fold away instead of vanishing and letting the rows under it jump.
//
// Ported from the rental app's useExitingList, with its two lessons kept:
// - A list is compared by its keys (keySig), never by identity. A caller that
//   builds its list fresh every render (`entries.filter(...)`) would otherwise
//   look "changed" on every render, and the state update made during render
//   would loop into "Too many re-renders".
// - A row that is filtered or searched out has not been deleted. Given the
//   whole list before filtering (`sourceKeys`), only a row gone from that
//   folds away; the rest simply disappear, as a filter should make them.

/** More rows than this gone at once is a new list (a month changed), not a delete: no fold. */
export const MAX_EXITING_ROWS = 3;

/** `at` is a stamp from nextExitStamp, not a time: exits are expired by batch. */
export type ExitEntry<T> = { item: T; key: string; index: number; at: number };
export type ExitSnap<T> = { sig: string; items: T[]; exiting: ExitEntry<T>[]; scope?: string };

export function keySig<T>(items: readonly T[], getKey: (item: T) => string): string {
  return items.map(getKey).join("\u0001");
}

export function initialExitSnap<T>(items: T[], getKey: (item: T) => string, scope?: string): ExitSnap<T> {
  return { sig: keySig(items, getKey), items, exiting: [], scope };
}

/**
 * The next snapshot when the list's keys changed, or null when they did not
 * (so the caller can update state during render without looping).
 */
export function nextExitSnap<T>(
  snap: ExitSnap<T>,
  items: T[],
  getKey: (item: T) => string,
  stamp: number,
  sourceKeys?: ReadonlySet<string>,
  scope?: string,
): ExitSnap<T> | null {
  const sig = keySig(items, getKey);
  // A new scope (another month, the other debt book) is a different list
  // altogether, not a delete: nothing from the old one folds into it.
  if (scope !== snap.scope) return { sig, items, exiting: [], scope };
  if (sig === snap.sig) return null;
  const nextKeys = new Set(items.map(getKey));
  const removed: ExitEntry<T>[] = [];
  snap.items.forEach((item, index) => {
    const key = getKey(item);
    if (nextKeys.has(key)) return;
    if (sourceKeys?.has(key)) return; // still exists, only filtered out
    removed.push({ item, key, index, at: stamp });
  });
  // A row that came back (undo, or a filter cleared) stops exiting.
  const keep = snap.exiting.filter((entry) => !nextKeys.has(entry.key) && !sourceKeys?.has(entry.key));
  const exiting = removed.length > 0 && removed.length <= MAX_EXITING_ROWS ? [...keep, ...removed] : keep;
  return { sig, items, scope, exiting };
}

/** The stamp for exits made now: one past the newest still running. */
export function nextExitStamp<T>(exiting: ExitEntry<T>[]): number {
  return exiting.reduce((newest, entry) => Math.max(newest, entry.at), 0) + 1;
}

/** Drops every exit stamped at or before `through` -- the batch whose timer just ran out. */
export function expireExits<T>(exiting: ExitEntry<T>[], through: number): ExitEntry<T>[] {
  return exiting.filter((entry) => entry.at > through);
}

/** The rows to draw: the current list, with exiting rows back in their old places. */
export function mergeExitRows<T>(
  items: T[],
  getKey: (item: T) => string,
  exiting: ExitEntry<T>[],
): { item: T; key: string; exiting: boolean }[] {
  const rows = items.map((item) => ({ item, key: getKey(item), exiting: false }));
  const present = new Set(rows.map((row) => row.key));
  for (const entry of [...exiting].sort((a, b) => a.index - b.index)) {
    if (present.has(entry.key)) continue;
    rows.splice(Math.min(entry.index, rows.length), 0, { item: entry.item, key: entry.key, exiting: true });
    present.add(entry.key);
  }
  return rows;
}
