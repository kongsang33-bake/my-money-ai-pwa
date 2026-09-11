import type { Page } from "@playwright/test";
import { waitForAnimations } from "./fixture.ts";

// The three objective checks the design system can be measured against, run
// against the real rendered page rather than against the tokens in the
// stylesheet. Tokens on their own cannot answer any of these: every failure
// this has caught so far came from the cascade (a card's label rule reaching
// into a popover and recolouring it) or from layout (a grid track sized to
// its widest child), not from a bad pair of hex values.
//
// All three run inside the page: one evaluate per screen, no round-trip per
// element.

export type Finding = {
  screen: string;
  what: string;
  detail: string;
  /** Contrast only: the colour pair itself, normalised, so a palette problem
   *  is one entry however many elements happen to wear it. */
  pair?: string;
};

export type ScreenAudit = {
  contrast: Finding[];
  tapSize: Finding[];
  overflow: Finding[];
  /** Text nodes whose background could not be resolved (a gradient or image
   *  behind them), so contrast was not judged. Reported as coverage, not as a
   *  failure -- a silently shrinking number here would hide regressions. */
  skipped: number;
  checked: number;
};

/**
 * WCAG 2.2 AA, the two criteria worth automating on a phone-first app:
 *   1.4.3 Contrast (Minimum) -- 4.5:1 for body text, 3:1 for large text
 *   2.5.8 Target Size (Minimum) -- 24x24 CSS px
 * plus "nothing is cut off", which is not a WCAG criterion but is invisible
 * by construction here: .phone sets overflow-x: hidden, so content wider than
 * the phone is clipped without a scrollbar to show for it.
 */
export async function auditScreen(page: Page, screen: string): Promise<ScreenAudit> {
  // Open every explanation popover first. They are <details>, so they render
  // nothing until opened -- which meant the audit never looked at them, and a
  // popover that inherited the hero's white text onto its own white panel
  // shipped invisible. An open popover can only cover other text, never sit
  // under it, so it cannot disturb the backgrounds measured for anything else.
  await page.evaluate(() => {
    for (const hint of document.querySelectorAll("details.info-hint")) hint.setAttribute("open", "");
  });
  await waitForAnimations(page);
  return page.evaluate(({ screen }) => {
    type Rgba = { r: number; g: number; b: number; a: number };

    const parse = (value: string): Rgba | null => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      if (parts.length < 3 || parts.some(Number.isNaN)) return null;
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    };

    const over = (top: Rgba, bottom: Rgba): Rgba => ({
      r: top.r * top.a + bottom.r * (1 - top.a),
      g: top.g * top.a + bottom.g * (1 - top.a),
      b: top.b * top.a + bottom.b * (1 - top.a),
      a: 1,
    });

    const luminance = ({ r, g, b }: Rgba) => {
      const channel = (value: number) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };

    const ratio = (a: Rgba, b: Rgba) => {
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (high + 0.05) / (low + 0.05);
    };

    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    /** opacity is inherited by the whole subtree and cannot be undone by a
     *  child, so the alpha a text node is actually painted with is the
     *  product of every opacity above it. This is exactly what made an
     *  explanation popover unreadable on the savings tile. */
    const effectiveAlpha = (element: Element) => {
      let alpha = 1;
      for (let node: Element | null = element; node; node = node.parentElement) {
        alpha *= Number(getComputedStyle(node).opacity);
      }
      return alpha;
    };

    /** Composites a stack of background layers, topmost first, down to one
     *  opaque colour. Null when something unpaintable (a gradient, an image)
     *  is in the way, because guessing there produces false findings. */
    const compose = (nodes: Element[]): Rgba | null => {
      const layers: Rgba[] = [];
      for (const node of nodes) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== "none") return null;
        const colour = parse(style.backgroundColor);
        if (!colour || colour.a === 0) continue;
        const alpha = colour.a * effectiveAlpha(node);
        layers.push({ ...colour, a: alpha });
        if (alpha === 1) break;
      }
      if (!layers.length || layers[layers.length - 1].a < 1) return null;
      let result = layers[layers.length - 1];
      for (let index = layers.length - 2; index >= 0; index -= 1) result = over(layers[index], result);
      return result;
    };

    /**
     * What is actually painted behind a piece of text.
     *
     * Walking ancestors alone is wrong wherever a positioned sibling paints
     * underneath -- the bottom nav's sliding pill sits at z-index: -1 behind
     * the active tab's label, so the ancestor walk found the bar's own
     * background and reported the label as white-on-white. elementsFromPoint
     * returns the real paint stack at a point, siblings included, so it is
     * used whenever the text is on screen; below the fold there is no stack to
     * ask for and the ancestor chain is the best available answer.
     */
    const backgroundBehind = (element: Element): Rgba | null => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const onScreen = x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight;
      if (onScreen) {
        const stack = document.elementsFromPoint(x, y);
        const index = stack.indexOf(element);
        // From the element itself, not from below it: a button's own fill is
        // the background its label sits on.
        if (index >= 0) return compose(stack.slice(index));
      }
      const ancestors: Element[] = [];
      for (let node: Element | null = element; node; node = node.parentElement) ancestors.push(node);
      return compose(ancestors);
    };

    const describe = (element: Element) => {
      const tag = element.tagName.toLowerCase();
      const className = typeof element.className === "string" && element.className
        ? `.${element.className.trim().split(/\s+/).slice(0, 3).join(".")}`
        : "";
      return `${tag}${className}`;
    };

    const root = document.querySelector(".phone") ?? document.body;
    type Found = { screen: string; what: string; detail: string; pair?: string };
    const contrast: Found[] = [];
    const tapSize: Found[] = [];
    const overflow: Found[] = [];
    let skipped = 0;
    let checked = 0;

    // --- 1.4.3 contrast, on elements that actually render text themselves ---
    for (const element of root.querySelectorAll("*")) {
      const ownText = [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join("")
        .trim();
      if (!ownText || !visible(element)) continue;

      // Text with something painted over it is not text anyone is reading,
      // and measuring it compares a colour against a panel that is not its
      // background. Opening the explanation popovers made this visible: they
      // cover the hero's amount, which then measured as white on white.
      const box = element.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      if (cx >= 0 && cy >= 0 && cx <= window.innerWidth && cy <= window.innerHeight) {
        const top = document.elementFromPoint(cx, cy);
        if (top && top !== element && !element.contains(top)) continue;
      }

      // 1.4.3 exempts inactive components outright -- a greyed-out save
      // button is meant to read as unavailable, and holding it to 4.5:1 would
      // mean removing the only signal that says so.
      if (element.closest(":disabled, [aria-disabled='true']")) continue;

      const style = getComputedStyle(element);
      const colour = parse(style.color);
      const background = backgroundBehind(element);
      if (!colour || !background) {
        skipped += 1;
        continue;
      }
      checked += 1;

      const alpha = colour.a * effectiveAlpha(element);
      // Text faded to nothing is not text anyone is reading -- a closed kebab
      // menu, a sheet that is off. Judging it produces findings about colours
      // nobody can see.
      if (alpha < 0.1) {
        skipped += 1;
        checked -= 1;
        continue;
      }

      const painted = over({ ...colour, a: alpha }, background);
      const size = parseFloat(style.fontSize);
      const weight = Number(style.fontWeight) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const required = large ? 3 : 4.5;
      const measured = ratio(painted, background);
      if (measured + 0.05 < required) {
        const show = (colour: Rgba) => `${colour.r.toFixed(0)},${colour.g.toFixed(0)},${colour.b.toFixed(0)}`;
        contrast.push({
          screen,
          what: describe(element),
          pair: `${show(painted)} on ${show(background)} @${required}`,
          detail: `${measured.toFixed(2)}:1, needs ${required}:1 — "${ownText.slice(0, 30)}"`,
        });
      }
    }

    // --- 2.5.8 target size ---
    const interactive = "button, summary, [role='button'], input:not([type='hidden']), select, textarea, a[href]";
    for (const element of root.querySelectorAll(interactive)) {
      if (!visible(element)) continue;
      const style = getComputedStyle(element);
      // Not reachable, so not a target: a faded-out menu, or the bottom nav
      // while a sheet holds it inert.
      if (style.pointerEvents === "none" || effectiveAlpha(element) < 0.1) continue;
      if (element.closest("[inert]")) continue;
      // The criterion exempts a control laid out inline inside a sentence,
      // where enlarging it would break the line it sits in.
      if (element.tagName === "A" && style.display.startsWith("inline")) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 24) {
        tapSize.push({
          screen,
          what: describe(element),
          detail: `${rect.width.toFixed(0)}x${rect.height.toFixed(0)}, needs 24x24`,
        });
      }
    }

    // --- nothing clipped sideways ---
    const phone = document.querySelector(".phone") as HTMLElement | null;
    if (phone && phone.scrollWidth > phone.clientWidth + 1) {
      overflow.push({
        screen,
        what: ".phone",
        detail: `content is ${phone.scrollWidth}px wide in a ${phone.clientWidth}px column — overflow-x: hidden means it is cut off with nothing to show for it`,
      });
    }

    return { contrast, tapSize, overflow, skipped, checked };
  }, { screen });
}
