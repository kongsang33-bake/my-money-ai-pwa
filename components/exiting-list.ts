"use client";

import { useEffect, useState } from "react";
import { expireExits, initialExitSnap, mergeExitRows, nextExitSnap, nextExitStamp, type ExitSnap } from "@/lib/exiting-list";
import { parseDuration } from "@/lib/morph";

// A deleted row folds away -- fades, then its height closes -- instead of
// vanishing and letting the rows under it jump up. The pure half (what is
// exiting, and where) is lib/exiting-list.ts.
//
//   const rows = useExitingList(visible, (item) => item.id, { source: all, scope: month });
//   rows.map(({ item, key, exiting }) => <Row key={key} ref={exiting ? collapseOnExit : restoreRow} />)
//
// - source: the whole list before any filter or search. Pass it whenever the
//   visible list can be filtered, or a filter change would fold rows away.
// - scope: anything that swaps the list wholesale (the month, a tab). A new
//   scope starts clean.
// The snapshot is worked out during render, not in an effect: waiting for an
// effect would show the row gone for one frame before it came back to fold.

let cachedTiming: { durationMs: number; easing: string } | null = null;

/** The fold's length and curve: the motion tokens, read once from :root. */
function exitTiming() {
  if (cachedTiming) return cachedTiming;
  if (typeof document === "undefined") return { durationMs: 240, easing: "ease-out" };
  const root = getComputedStyle(document.documentElement);
  cachedTiming = {
    durationMs: parseDuration(root.getPropertyValue("--t-3"), 240),
    easing: root.getPropertyValue("--e-in-out").trim() || "ease-in-out",
  };
  return cachedTiming;
}

export function useExitingList<T>(
  items: T[],
  getKey: (item: T) => string,
  options: { source?: readonly T[]; scope?: string } = {},
): { item: T; key: string; exiting: boolean }[] {
  const { source, scope } = options;
  const [snap, setSnap] = useState<ExitSnap<T>>(() => initialExitSnap(items, getKey, scope));

  const next = nextExitSnap(snap, items, getKey, nextExitStamp(snap.exiting), source ? new Set(source.map(getKey)) : undefined, scope);
  if (next) setSnap(next);

  // Once a fold has had its time, its rows go for real. A second delete
  // inside that window restarts the wait for both: the first is already at
  // height 0 by then, so lingering costs nothing visible.
  useEffect(() => {
    if (!snap.exiting.length) return;
    const through = nextExitStamp(snap.exiting) - 1;
    const timer = window.setTimeout(() => {
      setSnap((current) => ({ ...current, exiting: expireExits(current.exiting, through) }));
    }, exitTiming().durationMs + 20);
    return () => window.clearTimeout(timer);
  }, [snap.exiting]);

  return mergeExitRows(items, getKey, (next ?? snap).exiting);
}

/**
 * Ref for a row that is leaving: measures its real height and closes it to
 * zero, fading first. Web Animations rather than a CSS height transition,
 * because height: auto -> 0 does not interpolate in Safari.
 */
export function collapseOnExit(element: HTMLElement | null) {
  if (!element || element.dataset.collapsing) return;
  element.dataset.collapsing = "1";
  element.style.pointerEvents = "none";
  element.style.overflow = "hidden";
  element.setAttribute("aria-hidden", "true");
  const { durationMs, easing } = exitTiming();
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1, fill: "forwards" });
    return;
  }
  const height = element.getBoundingClientRect().height;
  element.animate(
    [
      { height: `${height}px`, opacity: 1 },
      { height: `${height}px`, opacity: 0, offset: 0.35 },
      { height: "0px", opacity: 0, paddingTop: "0px", paddingBottom: "0px", marginTop: "0px", marginBottom: "0px", borderTopWidth: "0px", borderBottomWidth: "0px" },
    ],
    { duration: durationMs, easing, fill: "forwards" },
  );
}

/**
 * Ref for an ordinary row. A row that was folding and came back (undo, a
 * cleared search) is the same element under the same key, so its fold has to
 * be undone here -- left alone it stays at height 0, invisible and untappable.
 */
export function restoreRow(element: HTMLElement | null) {
  if (!element || !element.dataset.collapsing) return;
  element.getAnimations().forEach((animation) => animation.cancel());
  delete element.dataset.collapsing;
  element.style.pointerEvents = "";
  element.style.overflow = "";
  element.removeAttribute("aria-hidden");
}
