"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { MORPH_PARTS, isOnScreen, morphTransform, parseDuration, type Box, type MorphPart } from "@/lib/morph";

// The entry morph: when EntryDetailSheet opens from a row, the row's icon and
// amount fly into the sheet's header while the sheet slides in, so the sheet
// reads as that row opened up rather than a panel dropped over it.
//
// A source marks itself with morphSource(part, entry.id); the sheet's header
// marks its landing spots with morphTarget(part). Nothing is threaded through
// props -- the source is looked up by attribute when the sheet mounts, which
// is why any list can join in by adding the two attributes.
//
// It is a "ghost": a copy of the source, fixed to the viewport, animated with
// one transform from where the row drew it to where the header will be once
// the slide-in has finished. The real source and target are hidden for the
// flight so the thing seems to move rather than duplicate. Only the first
// open morphs: tapping a similar entry inside the sheet changes what it
// shows without the sheet arriving from anywhere.

const SOURCE_ATTR = "data-morph-source";
const ID_ATTR = "data-morph-id";
const TARGET_ATTR = "data-morph-target";

export function morphSource(part: MorphPart, entryId: string) {
  return { [SOURCE_ATTR]: part, [ID_ATTR]: entryId };
}

export function morphTarget(part: MorphPart) {
  return { [TARGET_ATTR]: part };
}

// Copied onto the ghost from the source's computed style: the source's look
// often comes from its ancestors (a tile's --hue, a row's colour class), none
// of which the ghost has once it lives under <body>.
const COPIED_STYLES = [
  "color", "background-color", "background-image", "border-radius", "box-sizing", "padding",
  "display", "align-items", "justify-content", "font-family", "font-size", "font-weight",
  "line-height", "letter-spacing", "font-variant-numeric", "white-space",
] as const;

function toBox(rect: DOMRect): Box {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function findSource(part: MorphPart, entryId: string, sheet: Element, viewport: { width: number; height: number }) {
  const candidates = document.querySelectorAll<HTMLElement>(`[${SOURCE_ATTR}="${part}"][${ID_ATTR}="${CSS.escape(entryId)}"]`);
  for (const element of candidates) {
    if (sheet.contains(element)) continue;
    const box = toBox(element.getBoundingClientRect());
    if (isOnScreen(box, viewport)) return { element, box };
  }
  return null;
}

/**
 * Where each target will be once the sheet's own entrance animation has
 * finished: the sheet is still at the animation's first frame (off screen, or
 * translated) when this runs, so its animations are moved to their end for
 * the measurement and put back before anything is painted.
 */
function measureLanding(sheet: HTMLElement, targets: HTMLElement[]) {
  const animations = sheet.getAnimations();
  const saved = animations.map((animation) => animation.currentTime);
  for (const animation of animations) {
    const end = animation.effect?.getComputedTiming().endTime;
    if (typeof end === "number" && Number.isFinite(end)) animation.currentTime = end;
  }
  const boxes = targets.map((target) => toBox(target.getBoundingClientRect()));
  animations.forEach((animation, index) => { animation.currentTime = saved[index]; });
  return boxes;
}

function makeGhost(source: HTMLElement, box: Box) {
  const ghost = source.cloneNode(true) as HTMLElement;
  for (const element of [ghost, ...ghost.querySelectorAll<HTMLElement>(`[${SOURCE_ATTR}]`)]) {
    element.removeAttribute(SOURCE_ATTR);
    element.removeAttribute(ID_ATTR);
  }
  const computed = getComputedStyle(source);
  for (const property of COPIED_STYLES) ghost.style.setProperty(property, computed.getPropertyValue(property));
  ghost.classList.add("morph-ghost");
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.left = `${box.left}px`;
  ghost.style.top = `${box.top}px`;
  ghost.style.width = `${box.width}px`;
  ghost.style.height = `${box.height}px`;
  return ghost;
}

/**
 * Called by the sheet with a ref to any element inside it. Runs once, before
 * the first paint, and never when the user asked for reduced motion.
 */
export function useEntryMorph(entryId: string, insideSheetRef: RefObject<HTMLElement | null>) {
  const firstIdRef = useRef(entryId);

  useLayoutEffect(() => {
    const inside = insideSheetRef.current;
    const sheet = inside?.closest<HTMLElement>("[role='dialog']");
    if (!sheet) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof sheet.getAnimations !== "function") return;

    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const pairs = MORPH_PARTS.flatMap((part) => {
      const target = sheet.querySelector<HTMLElement>(`[${TARGET_ATTR}="${part}"]`);
      const source = findSource(part, firstIdRef.current, sheet, viewport);
      return target && source ? [{ part, target, source }] : [];
    });
    if (!pairs.length) return;

    const landing = measureLanding(sheet, pairs.map(({ target }) => target));
    const root = getComputedStyle(document.documentElement);
    const duration = parseDuration(root.getPropertyValue("--t-3"), 240);
    const easing = root.getPropertyValue("--e-out").trim() || "ease-out";

    const flights = pairs.map(({ target, source }, index) => {
      const to = landing[index];
      const ghost = makeGhost(source.element, source.box);
      document.body.appendChild(ghost);
      source.element.style.visibility = "hidden";
      target.style.visibility = "hidden";
      const { dx, dy, scale } = morphTransform(source.box, to);
      const animation = ghost.animate(
        [
          { transform: "translate(0, 0) scale(1)", color: getComputedStyle(source.element).color },
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, color: getComputedStyle(target).color },
        ],
        { duration, easing, fill: "forwards" },
      );
      const land = () => {
        ghost.remove();
        source.element.style.visibility = "";
        target.style.visibility = "";
      };
      animation.addEventListener("finish", land);
      animation.addEventListener("cancel", land);
      return { animation, land };
    });

    // Closed (or unmounted) mid-flight: put everything back at once.
    return () => {
      for (const { animation, land } of flights) {
        if (animation.playState !== "finished") animation.cancel();
        land();
      }
    };
    // Mount only, on purpose: see the comment at the top of this file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
