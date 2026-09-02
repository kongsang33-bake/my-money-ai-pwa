import { test, expect, navigate, scrollAppTo } from "./fixture.ts";

const scrollTop = (page: Parameters<typeof navigate>[0]) =>
  page.evaluate(() => document.querySelector(".phone")!.scrollTop);

test.describe("navigation", () => {
  test("starts each tab at the top", async ({ app }) => {
    // .phone is one scroll container shared by every tab, so without an
    // explicit reset, scrolling to the bottom of History and tapping Home
    // landed halfway down Home.
    await navigate(app, "history");
    await scrollAppTo(app, 900);
    expect(await scrollTop(app), "History should be tall enough to scroll").toBeGreaterThan(100);

    await navigate(app, "home");
    await app.waitForTimeout(300);
    expect(await scrollTop(app)).toBeLessThan(20);
  });

  test("locks the page behind an open sheet", async ({ app }) => {
    // The lock has to target .phone: the document itself never scrolls here,
    // so the old <body> position:fixed lock was a no-op and the page went on
    // scrolling under the sheet.
    await app.locator(".activity-timeline-list button, .entry-tappable").first().click();
    await expect(app.locator(".edit-sheet")).toBeVisible();
    expect(await app.evaluate(() => (document.querySelector(".phone") as HTMLElement).style.overflowY)).toBe("hidden");

    await app.keyboard.press("Escape");
    await expect(app.locator(".edit-sheet")).toHaveCount(0);
    expect(await app.evaluate(() => (document.querySelector(".phone") as HTMLElement).style.overflowY)).toBe("");
  });

  test("opens and closes the side menu", async ({ app }) => {
    await app.locator(".menu-button").click();
    await expect(app.locator(".side-menu")).toBeVisible();
    await app.locator(".side-menu-backdrop").click({ position: { x: 8, y: 400 } });
    await expect(app.locator(".side-menu")).toHaveCount(0);
  });

  test("moves between months in History", async ({ app }) => {
    await navigate(app, "history");
    const label = app.locator(".heatmap-panel").getByRole("combobox").or(app.locator(".heatmap-panel select")).first();
    const before = await app.locator(".summary-panel").innerText();
    await app.locator(".heatmap-panel button").first().click();
    await app.waitForTimeout(500);
    await expect(app.locator(".summary-panel")).not.toHaveText(before);
    await expect(label.or(app.locator(".heatmap-panel"))).toBeVisible();
  });

  test("keeps the bottom nav reachable on every tab", async ({ app }) => {
    for (const tab of ["home", "history", "add", "wallets"] as const) {
      await navigate(app, tab);
      await expect(app.locator(".bottom-nav")).toBeVisible();
    }
  });
});
