import { test, expect, navigate, waitForAnimations } from "./fixture.ts";
import type { Page } from "@playwright/test";

// Home, History and Wallets are the screens a thumb goes back and forth
// between, and rebuilding them on every tap was the slowest thing the app
// did: ~150ms to Home, 170-280ms to History and ~60ms to Wallets on a
// mid-range phone, most of it laying out their Thai text again. They are now
// kept mounted and parked (content-visibility: hidden -- see .is-parked in
// globals.css), which keeps their layout: ~45ms, ~45ms and ~30ms.
//
// Two guards, because they fail differently. The first is structural and
// exact: the screen you come back to is the same DOM node you left, so a
// change that quietly goes back to unmounting it fails here on every machine.
// The second is a timing ceiling, loose on purpose -- roughly twice today's
// figure and well under the old one -- so it catches the regression that
// matters (a tap back to a slow rebuild) without flaking on a busy CI box.

const PARKED_SCREENS = [
  { tab: "home", selector: ".phone > .view.home-view" },
  { tab: "history", selector: ".phone > .view.history-view" },
  { tab: "wallets", selector: ".phone > .view.wallets-view" },
] as const;

// Chromium's CDP throttle, to stand in for a mid-range Android phone; the
// numbers in the comment above were measured under the same setting.
const CPU_THROTTLE = 4;
const TAP_TO_FRAME_CEILING_MS = 120;

async function tapToNextFrame(page: Page, navIndex: number) {
  return page.evaluate(async (index) => {
    const button = document.querySelectorAll<HTMLButtonElement>(".bottom-nav > button")[index];
    const start = performance.now();
    button.click();
    // The frame after the click has been painted: rAF runs before paint, and
    // the task queued from it runs after.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    return performance.now() - start;
  }, navIndex);
}

test.describe("performance", () => {
  test("keeps Home, History and Wallets mounted while another tab is showing", async ({ app }) => {
    await navigate(app, "history");
    await navigate(app, "wallets");
    for (const { selector } of PARKED_SCREENS) {
      await app.locator(selector).evaluate((node) => { (node as HTMLElement & { __marker?: true }).__marker = true; });
    }

    await navigate(app, "add");
    for (const { selector } of PARKED_SCREENS) {
      await expect(app.locator(selector)).toHaveClass(/\bis-parked\b/);
    }

    for (const { tab, selector } of PARKED_SCREENS) {
      await navigate(app, tab);
      await expect(app.locator(selector)).not.toHaveClass(/\bis-parked\b/);
      const sameNode = await app.locator(selector).evaluate((node) => (node as HTMLElement & { __marker?: true }).__marker === true);
      expect(sameNode, `${tab} should be the node that was parked, not a fresh mount`).toBe(true);
    }
  });

  test("adds nothing to the scroll height of the tab in front", async ({ app }) => {
    // A parked screen still in flow would make a short tab scroll through the
    // whole of Home below it.
    await navigate(app, "history");
    await navigate(app, "wallets");
    await navigate(app, "add");
    await waitForAnimations(app);
    const heights = await app.evaluate(() => {
      const phone = document.querySelector(".phone") as HTMLElement;
      const parked = Array.from(document.querySelectorAll<HTMLElement>(".phone > .view.is-parked"));
      const withParked = phone.scrollHeight;
      parked.forEach((node) => { node.style.display = "none"; });
      const withoutParked = phone.scrollHeight;
      parked.forEach((node) => { node.style.display = ""; });
      return { parkedCount: parked.length, withParked, withoutParked };
    });
    expect(heights.parkedCount).toBe(3);
    expect(heights.withParked).toBe(heights.withoutParked);
  });

  test("comes back to the wallet list, not a statement left open", async ({ app }) => {
    // Unmounting used to close an open statement for free; parked, WalletsView
    // has to close it itself.
    await navigate(app, "wallets");
    await app.locator(".debtor-page-list .debtor-main-button").first().click();
    await expect(app.locator(".wallet-statement-row").first()).toBeVisible();
    await navigate(app, "home");
    await navigate(app, "wallets");
    await expect(app.locator(".wallets-view .wallet-statement-row")).toHaveCount(0);
  });

  test("returns to Home, History and Wallets within a frame budget on a throttled CPU", async ({ app }, info) => {
    test.skip(info.project.name !== "mobile", "timed once, at the phone viewport it is about");
    const cdp = await app.context().newCDPSession(app);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });

    // A first visit is a real mount; only returns are held to the budget.
    await navigate(app, "history");
    await navigate(app, "wallets");
    const samples: Record<"home" | "history" | "wallets", number[]> = { home: [], history: [], wallets: [] };
    for (let round = 0; round < 3; round += 1) {
      for (const [tab, index] of [["home", 0], ["history", 1], ["wallets", 3]] as const) {
        await navigate(app, "add");
        samples[tab].push(await tapToNextFrame(app, index));
        await app.waitForTimeout(400);
      }
    }
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

    for (const [tab, times] of Object.entries(samples)) {
      const median = [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)];
      expect(median, `${tab}: tap to next frame (samples ${times.map(Math.round).join(", ")}ms)`).toBeLessThan(TAP_TO_FRAME_CEILING_MS);
    }
  });
});
