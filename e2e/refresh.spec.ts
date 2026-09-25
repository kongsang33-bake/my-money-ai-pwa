import { test, expect, navigate } from "./fixture.ts";

// Pull-to-refresh listens on .phone, the app's own scroll container, so it is
// driven here with touch events on that element. The reload itself is a
// no-op without Supabase (see CLAUDE.md, "stops at the first write" -- reads
// are the same), so this covers the gesture: that a long enough pull shows
// the spinner and it clears, and that a short one or a scrolled page does not.
async function pull(page: Parameters<typeof navigate>[0], distance: number) {
  await page.evaluate((dy) => {
    const root = document.querySelector<HTMLElement>(".phone")!;
    const touch = (y: number) => new Touch({ identifier: 1, target: root, clientX: 200, clientY: y });
    root.dispatchEvent(new TouchEvent("touchstart", { touches: [touch(120)], bubbles: true }));
    for (let step = 1; step <= 6; step += 1) {
      root.dispatchEvent(new TouchEvent("touchmove", { touches: [touch(120 + (dy * step) / 6)], bubbles: true }));
    }
    root.dispatchEvent(new TouchEvent("touchend", { touches: [], bubbles: true }));
  }, distance);
}

test.describe("pull to refresh", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "mobile", "a pull is a touch gesture");
  });

  test("a long pull from the top shows the spinner, then clears it", async ({ app }) => {
    await pull(app, 200);
    await expect(app.locator(".pull-refresh.is-refreshing")).toBeVisible();
    await expect(app.locator(".pull-refresh")).toHaveCount(0, { timeout: 5000 });
  });

  test("a short pull does nothing", async ({ app }) => {
    await pull(app, 60);
    await expect(app.locator(".pull-refresh")).toHaveCount(0);
  });

  test("a pull only counts from the top of the page", async ({ app }) => {
    await app.evaluate(() => document.querySelector(".phone")!.scrollTo({ top: 400, behavior: "instant" }));
    await pull(app, 200);
    await expect(app.locator(".pull-refresh")).toHaveCount(0);
  });

  test("is off on Ask AI, whose chat scrolls on its own", async ({ app }) => {
    await navigate(app, "more");
    await app.locator(".more-grid button", { hasText: "ถาม AI" }).click();
    await pull(app, 200);
    await expect(app.locator(".pull-refresh")).toHaveCount(0);
  });
});
