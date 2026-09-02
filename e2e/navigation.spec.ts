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
    await expect(app.locator(".sheet-backdrop > .edit-sheet")).toBeVisible();
    expect(await app.evaluate(() => (document.querySelector(".phone") as HTMLElement).style.overflowY)).toBe("hidden");

    await app.keyboard.press("Escape");
    await expect(app.locator(".sheet-backdrop > .edit-sheet")).toHaveCount(0);
    expect(await app.evaluate(() => (document.querySelector(".phone") as HTMLElement).style.overflowY)).toBe("");
  });

  test("opens and closes the side menu", async ({ app }) => {
    await app.locator(".menu-button").click();
    await expect(app.locator(".side-menu")).toBeVisible();
    await app.locator(".side-menu-backdrop").click({ position: { x: 8, y: 400 } });
    await expect(app.locator(".side-menu")).toHaveCount(0);
  });


  // Every side-menu entry is a screen you navigate to, not a sheet that opens
  // over the tab you were on: it gets a back button, keeps the bottom nav
  // live, and does not scroll-lock the page behind it.
  const MENU_SCREENS = [
    { label: "งบประมาณ", heading: "งบประมาณต่อเดือน" },
    { label: "ถาม AI เรื่องเงิน", heading: "ถาม AI เรื่องเงิน" },
    { label: "ส่งออกรีพอร์ท", heading: "รีพอร์ท Excel / Sheets" },
    { label: "จัดการโปรไฟล์", heading: "จัดการโปรไฟล์" },
    { label: "รหัส PIN", heading: "เปิดใช้ PIN" },
  ];

  for (const { label, heading } of MENU_SCREENS) {
    test(`opens ${label} as its own screen`, async ({ app }) => {
      await app.locator(".menu-button").click();
      await app.locator(".side-menu-list button", { hasText: label }).click();

      await expect(app.locator(".add-title h2")).toHaveText(heading);
      // The drawer is gone and nothing modal took its place.
      await expect(app.locator(".side-menu")).toHaveCount(0);
      await expect(app.locator(".sheet-backdrop")).toHaveCount(0);
      // A page, so the app scroller is still live and the nav still reachable.
      expect(await app.evaluate(() => (document.querySelector(".phone") as HTMLElement).style.overflowY)).toBe("");
      await expect(app.locator(".bottom-nav")).not.toHaveAttribute("inert", /.*/);

      await app.locator(".add-title > button:first-child").click();
      await expect(app.locator(".hero-wallet-card, .wallet-grid")).toBeVisible();
    });
  }

  test("keeps a menu screen reachable from the bottom nav", async ({ app }) => {
    await app.locator(".menu-button").click();
    await app.locator(".side-menu-list button", { hasText: "งบประมาณ" }).click();
    await expect(app.locator(".add-title h2")).toHaveText("งบประมาณต่อเดือน");

    // Tapping a nav tab from a menu screen leaves it, the way it would from
    // any other tab -- a sheet would have swallowed the tap instead.
    await navigate(app, "history");
    await expect(app.locator(".add-title h2")).not.toHaveText("งบประมาณต่อเดือน");
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
