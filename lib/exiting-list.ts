// The pure half of the row-exit animation (components/exiting-list.ts): a row
// removed from a list is kept on screen a moment longer, marked as exiting,
// so it can fold away instead of vanishing and letting the rows under it jump.
//
// Ported from the rental app's useExitingList, with its two lessons kept:
// - A list is compared by its keys (keySig), never by identity. A caller that
//   builds its list fresh every render (`entries.filter(...)`) would otherwise
//   look "changed" on every render, and the state update made during render
//   would loop into "Too many re-renders".
// The same snapshot also notices the opposite: a row that was not anywhere
// in the list before (`known`, the source's keys) has just been added, and
// opens up in place (`entering`) rather than shoving the rows under it down
// in one frame. A filter cleared brings back rows that were known all along,
// so they simply appear.
// - A row that is filtered or searched out has not been deleted. Given the
//   whole list before filtering (`sourceKeys`), only a row gone from that
//   folds away; the rest simply disappear, as a filter should make them.

/** More rows than this gone (or new) at once is a new list (a month changed, the first load), not a delete or a save: no fold, no opening. */
export const MAX_EXITING_ROWS = 3;

/** `at` is a stamp from nextExitStamp, not a time: exits are expired by batch. */
export type ExitEntry<T> = { item: T; key: string; index: number; at: number };
export type ExitSnap<T> = {
  sig: string;
  items: T[];
  exiting: ExitEntry<T>[];
  scope?: string;
  /** Every key the list has had, filtered or not -- what "new" is measured against. */
  known: readonly string[];
  /** Keys added by the change that made this snapshot. */
  entering: readonly string[];
};

export function keySig<T>(items: readonly T[], getKey: (item: T) => string): string {
  return items.map(getKey).join("\u0001");
}

export function initialExitSnap<T>(items: T[], getKey: (item: T) => string, scope?: string, sourceKeys?: ReadonlySet<string>): ExitSnap<T> {
  return { sig: keySig(items, getKey), items, exiting: [], scope, known: knownKeys(items, getKey, sourceKeys), entering: [] };
}

function knownKeys<T>(items: readonly T[], getKey: (item: T) => string, sourceKeys?: ReadonlySet<string>): string[] {
  return sourceKeys ? [...sourceKeys] : items.map(getKey);
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
  if (scope !== snap.scope) return { sig, items, exiting: [], scope, known: knownKeys(items, getKey, sourceKeys), entering: [] };
  if (sig === snap.sig) return null;
  const nextKeys = new Set(items.map(getKey));
  // New since the last snapshot, anywhere in the list -- not merely back
  // from behind a filter. Nothing known yet means the list is still loading,
  // and its first rows are an arrival, not an addition.
  const known = new Set(snap.known);
  const added = items.map(getKey).filter((key) => !known.has(key));
  const entering = snap.known.length > 0 && added.length <= MAX_EXITING_ROWS ? added : [];
  const nextKnown = [...new Set([...snap.known, ...knownKeys(items, getKey, sourceKeys)])];
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
  return { sig, items, scope, exiting, known: nextKnown, entering };
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
  entering: readonly string[] = [],
): { item: T; key: string; exiting: boolean; entering: boolean }[] {
  const opening = new Set(entering);
  const rows = items.map((item) => {
    const key = getKey(item);
    return { item, key, exiting: false, entering: opening.has(key) };
  });
  const present = new Set(rows.map((row) => row.key));
  for (const entry of [...exiting].sort((a, b) => a.index - b.index)) {
    if (present.has(entry.key)) continue;
    rows.splice(Math.min(entry.index, rows.length), 0, { item: entry.item, key: entry.key, exiting: true, entering: false });
    present.add(entry.key);
  }
  return rows;
}
