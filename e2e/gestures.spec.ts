import { test, expect, buildSeed, openApp, navigate, hasSideNav, scrollAppTo, waitForAnimations } from "./fixture.ts";
import type { CDPSession, Page } from "@playwright/test";

// The iOS-shaped gestures: swipe a sheet down to close it, swipe in from the
// left edge to go back, a haptic as either crosses its line, and a tap on the
// tab already showing taking it back to the top. The touch ones are driven
// through CDP, so they run on the touch project only; "standalone" (the iOS
// home-screen app, the only place the edge swipe is on) is
// navigator.standalone set before the app loads, and the haptics are counted
// through navigator.vibrate -- the path Android takes, and the one a desktop
// Chromium can observe.

async function openStandalone(page: Page, standalone: boolean) {
  await page.addInitScript((on) => {
    if (on) Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    const calls: unknown[] = [];
    (window as unknown as { __vibrations: unknown[] }).__vibrations = calls;
    Object.defineProperty(navigator, "vibrate", { value: (pattern: unknown) => { calls.push(pattern); return true; }, configurable: true });
  }, standalone);
  await openApp(page, buildSeed());
}

const vibrations = (page: Page) => page.evaluate(() => (window as unknown as { __vibrations: unknown[] }).__vibrations.length);

async function touchDrag(cdp: CDPSession, page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps: number, stepMs: number, release = true) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }] });
    await page.waitForTimeout(stepMs);
  }
  if (release) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/**
 * Whether the app moved the shown view at any point -- watched from before a
 * drag, read before it is let go. A swipe the app does not take is the
 * browser's (Chromium, like Safari, navigates back on an edge swipe), so after
 * the release there may be no page left to look at.
 */
async function watchViewMoves(page: Page) {
  await page.evaluate(() => {
    const view = document.querySelector<HTMLElement>(".phone > .view:not(.is-parked)")!;
    const state = { moved: false };
    (window as unknown as { __viewMoves: typeof state }).__viewMoves = state;
    new MutationObserver(() => {
      if (view.style.transform || view.className.includes("is-edge")) state.moved = true;
    }).observe(view, { attributes: true, attributeFilter: ["style", "class"] });
  });
}
const viewMoved = (page: Page) => page.evaluate(() => (window as unknown as { __viewMoves: { moved: boolean } }).__viewMoves.moved);

const shownView = (page: Page) => page.evaluate(() => document.querySelector(".phone > .view:not(.is-parked)")?.className ?? "");

test.describe("touch gestures", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "mobile", "touch gestures need the touch project");
  });

  test("a swipe in from the left edge goes back, with a haptic as it crosses the line", async ({ page }) => {
    await openStandalone(page, true);
    await navigate(page, "wallets");
    await waitForAnimations(page);
    expect(await shownView(page)).toContain("wallets-view");
    const cdp = await page.context().newCDPSession(page);
    const width = page.viewportSize()!.width;
    await touchDrag(cdp, page, { x: 4, y: 400 }, { x: width * 0.7, y: 410 }, 12, 16);
    await expect.poll(() => shownView(page)).toContain("more-view");
    expect(await vibrations(page)).toBeGreaterThan(0);
    // Wallets is parked, not unmounted: nothing of the swipe may stay on it.
    await expect.poll(() => page.evaluate(() => document.querySelector<HTMLElement>(".wallets-view")?.style.transform ?? "")).toBe("");
  });

  test("a short edge swipe springs back and stays", async ({ page }) => {
    await openStandalone(page, true);
    await navigate(page, "wallets");
    await waitForAnimations(page);
    const cdp = await page.context().newCDPSession(page);
    await touchDrag(cdp, page, { x: 4, y: 400 }, { x: 60, y: 402 }, 8, 40);
    await page.waitForTimeout(600);
    expect(await shownView(page)).toContain("wallets-view");
    expect(await page.evaluate(() => document.querySelector<HTMLElement>(".wallets-view")!.style.transform)).toBe("");
  });

  test("the edge swipe is off in the browser, where the swipe is Safari's own back", async ({ page }) => {
    await openStandalone(page, false);
    await navigate(page, "wallets");
    await waitForAnimations(page);
    await watchViewMoves(page);
    const cdp = await page.context().newCDPSession(page);
    await touchDrag(cdp, page, { x: 4, y: 400 }, { x: 300, y: 410 }, 12, 16, false);
    expect(await viewMoved(page)).toBe(false);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  });

  test("a tab without a back button has no edge swipe", async ({ page }) => {
    await openStandalone(page, true);
    await navigate(page, "history");
    await waitForAnimations(page);
    await watchViewMoves(page);
    const cdp = await page.context().newCDPSession(page);
    await touchDrag(cdp, page, { x: 4, y: 400 }, { x: 300, y: 410 }, 12, 16, false);
    expect(await viewMoved(page)).toBe(false);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  });

  test("a sheet swiped down past the line closes, with a haptic; a short one springs back", async ({ page }) => {
    await openStandalone(page, false);
    await navigate(page, "history");
    const cdp = await page.context().newCDPSession(page);
    const sheet = page.locator(".sheet-backdrop > .entry-detail-sheet");

    await page.locator(".view:not(.is-parked) .entry.swipe-row").first().click();
    await expect(sheet).toBeVisible();
    await waitForAnimations(page);
    let box = (await sheet.boundingBox())!;
    await touchDrag(cdp, page, { x: box.x + 200, y: box.y + 120 }, { x: box.x + 200, y: box.y + 170 }, 5, 40);
    await page.waitForTimeout(500);
    await expect(sheet).toBeVisible();
    expect(await sheet.evaluate((node) => (node as HTMLElement).style.transform)).toBe("");

    const before = await vibrations(page);
    box = (await sheet.boundingBox())!;
    await touchDrag(cdp, page, { x: box.x + 200, y: box.y + 120 }, { x: box.x + 200, y: box.y + 120 + box.height * 0.5 }, 10, 16);
    await expect(page.locator(".sheet-backdrop")).toHaveCount(0);
    expect(await vibrations(page)).toBeGreaterThan(before);
  });
});

test("a tap on the tab already showing takes it back to the top", async ({ page }) => {
  await openApp(page, buildSeed());
  await navigate(page, "history");
  await scrollAppTo(page, 900);
  expect(await page.evaluate(() => document.querySelector(".phone")!.scrollTop)).toBeGreaterThan(500);
  if (await hasSideNav(page)) await page.locator('.side-nav [data-nav="history"]').click();
  else await page.evaluate(() => document.querySelectorAll<HTMLButtonElement>(".bottom-nav > button")[1].click());
  await expect.poll(() => page.evaluate(() => document.querySelector(".phone")!.scrollTop)).toBe(0);
  expect(await shownView(page)).toContain("history-view");
});
