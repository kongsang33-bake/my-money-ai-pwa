import { test, expect, buildSeed, openApp, navigate, hasSideNav, openMoneyTool, scrollAppTo, waitForAnimations } from "./fixture.ts";
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

// Press and hold an entry for its actions (useLongPress, EntryActionSheet).
// The sheet's ลบ is a write and is left alone (see e2e/fixture.ts); the rest
// stays on this side of one.
test.describe("press and hold", () => {
  const actions = ".sheet-backdrop > .entry-actions-sheet";

  async function hold(cdp: CDPSession, page: Page, at: { x: number; y: number }, ms: number, drift = 0) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
    if (drift) {
      await page.waitForTimeout(80);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: at.x, y: at.y + drift }] });
    }
    await page.waitForTimeout(ms);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }

  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "mobile", "a hold is a touch");
  });

  test("holding a History row opens its actions, and not its detail too", async ({ page }) => {
    await openStandalone(page, false);
    await navigate(page, "history");
    await waitForAnimations(page);
    const row = page.locator(".view:not(.is-parked) .entry.swipe-row .entry-main").first();
    const box = (await row.boundingBox())!;
    const before = await vibrations(page);
    const cdp = await page.context().newCDPSession(page);
    await hold(cdp, page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 700);
    // Past a whole close animation: a sheet closing is still visible for
    // its length, so checking at once would miss the release closing it
    // (the first row sits over the scrim, where the release lands).
    await page.waitForTimeout(500);
    await expect(page.locator(actions)).toBeVisible();
    await expect(page.locator(".sheet-backdrop > .entry-detail-sheet")).toHaveCount(0);
    expect(await vibrations(page)).toBeGreaterThan(before);
    for (const label of ["ดูรายละเอียด", "แก้ไข", "ลบ"]) {
      await expect(page.locator(`${actions} .me-row`, { hasText: label })).toHaveCount(1);
    }
  });

  test("a hold that drifts is a scroll, not a press", async ({ page }) => {
    await openStandalone(page, false);
    await navigate(page, "history");
    await waitForAnimations(page);
    const box = (await page.locator(".view:not(.is-parked) .entry.swipe-row .entry-main").first().boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await hold(cdp, page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 700, 30);
    await page.waitForTimeout(200);
    await expect(page.locator(actions)).toHaveCount(0);
  });

  test("holding a เพิ่งจด tile opens its actions; จดซ้ำ puts it in the review as a new draft", async ({ page }) => {
    await openStandalone(page, false);
    await waitForAnimations(page);
    const tile = page.locator(".recent-tile").nth(1);
    await tile.scrollIntoViewIfNeeded();
    const title = (await tile.locator(".recent-body b").textContent())!.trim();
    const box = (await tile.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await hold(cdp, page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 700);
    await expect(page.locator(actions)).toBeVisible();
    await page.locator(`${actions} .me-row`, { hasText: "จดซ้ำวันนี้" }).click();
    await expect(page.locator(".view:not(.is-parked).add-view")).toBeVisible();
    await expect(page.locator(".draft")).toHaveCount(1);
    await expect(page.locator(".draft").first()).toContainText(title);
  });

  test("a thumb drifting sideways after the sheet opens does not swipe the row open behind it", async ({ page }) => {
    await openStandalone(page, false);
    await navigate(page, "history");
    await waitForAnimations(page);
    const box = (await page.locator(".view:not(.is-parked) .entry.swipe-row .entry-main").first().boundingBox())!;
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
    await page.waitForTimeout(600);
    for (let i = 1; i <= 6; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: at.x - i * 20, y: at.y }] });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(page.locator(actions)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".sheet-backdrop")).toHaveCount(0);
    await expect(page.locator(".view:not(.is-parked) .entry.swipe-row.is-open")).toHaveCount(0);
  });

  test("a long hold still does not press whatever row of the sheet is under the thumb on release", async ({ page }) => {
    await openStandalone(page, false);
    await navigate(page, "history");
    await waitForAnimations(page);
    // A row low on the screen, where the sheet will open under the thumb.
    const point = await page.evaluate(() => {
      const nav = document.querySelector(".bottom-nav")!.getBoundingClientRect().top;
      const rows = [...document.querySelectorAll<HTMLElement>(".view:not(.is-parked) .entry.swipe-row .entry-main")];
      const box = rows.map((row) => row.getBoundingClientRect()).find((r) => r.top > window.innerHeight * 0.55 && r.bottom < nav)!;
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    const cdp = await page.context().newCDPSession(page);
    await hold(cdp, page, point, 4500);
    await page.waitForTimeout(400);
    await expect(page.locator(actions)).toBeVisible();
    await expect(page.locator(".sheet-backdrop > .entry-detail-sheet, .sheet-backdrop > .edit-sheet:not(.entry-actions-sheet), .dialog-backdrop")).toHaveCount(0);
  });

  test("แก้ไข from the actions opens the one edit sheet", async ({ page }) => {
    await openStandalone(page, false);
    await navigate(page, "history");
    await waitForAnimations(page);
    const box = (await page.locator(".view:not(.is-parked) .entry.swipe-row .entry-main").first().boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await hold(cdp, page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 700);
    await page.locator(`${actions} .me-row`, { hasText: "แก้ไข" }).click();
    await expect(page.locator(".sheet-backdrop > .edit-sheet:not(.entry-actions-sheet)")).toBeVisible();
    await expect(page.locator(actions)).toHaveCount(0);
  });
});

test("a right click on a History row opens its actions, and the next click on it still opens it", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "a mouse's way in");
  await openApp(page, buildSeed());
  await navigate(page, "history");
  await waitForAnimations(page);
  const row = page.locator(".view:not(.is-parked) .entry.swipe-row .entry-main").first();
  await row.click({ button: "right" });
  await expect(page.locator(".sheet-backdrop > .entry-actions-sheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".sheet-backdrop")).toHaveCount(0);
  // A right click sends no click after it, so nothing may be left waiting to
  // swallow this one (the review found the row going dead here).
  await row.click();
  await expect(page.locator(".sheet-backdrop > .entry-detail-sheet")).toBeVisible();
});

// iOS's large title folding into its bar: once a screen's heading has
// scrolled up under the topbar, the bar shows it in place of the wordmark.
// Phone and 700px only -- from 900px there is no topbar.
test.describe("large title", () => {
  test.beforeEach(async ({}, info) => {
    test.skip(info.project.name === "desktop", "the desk has no topbar");
  });

  const bar = (page: Page) => page.evaluate(() => {
    const topbar = document.querySelector(".topbar")!;
    return { collapsed: topbar.hasAttribute("data-title-collapsed"), title: topbar.querySelector<HTMLElement>(".topbar-title")!.dataset.title ?? "" };
  });

  test("History's title folds into the bar once scrolled, and back out at the top", async ({ page }) => {
    await openApp(page, buildSeed());
    await navigate(page, "history");
    expect((await bar(page)).collapsed).toBe(false);
    await scrollAppTo(page, 600);
    await expect.poll(() => bar(page)).toEqual({ collapsed: true, title: "รายการทั้งหมด" });
    await scrollAppTo(page, 0);
    await expect.poll(async () => (await bar(page)).collapsed).toBe(false);
  });

  test("Home has no title to fold, so the wordmark stays", async ({ page }) => {
    await openApp(page, buildSeed());
    await scrollAppTo(page, 900);
    await page.waitForTimeout(200);
    expect((await bar(page)).collapsed).toBe(false);
  });

  test("the bar follows a title that changes in place (the debt books)", async ({ page }) => {
    await openApp(page, buildSeed());
    await openMoneyTool(page, "จัดการหนี้");
    await expect.poll(async () => (await bar(page)).title).toBe("ยืมเรา");
    await page.locator(".view:not(.is-parked) .add-mode-tabs button", { hasText: "หนี้ของฉัน" }).click();
    await expect.poll(async () => (await bar(page)).title).toBe("หนี้ของฉัน");
  });
});

test("จดซ้ำ is a tap away too, on the entry's detail", async ({ page }) => {
  await openApp(page, buildSeed());
  await navigate(page, "history");
  await waitForAnimations(page);
  const row = page.locator(".view:not(.is-parked) .entry.swipe-row .entry-main").nth(1);
  const title = (await row.locator("b").first().textContent())!.trim();
  await row.click();
  const repeat = page.locator(".sheet-backdrop .detail-repeat-button");
  await expect(repeat).toBeVisible();
  await repeat.click();
  await expect(page.locator(".view:not(.is-parked).add-view")).toBeVisible();
  await expect(page.locator(".draft")).toHaveCount(1);
  await expect(page.locator(".draft").first()).toContainText(title);
});
