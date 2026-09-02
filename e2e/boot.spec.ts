import { test, expect, navigate } from "./fixture.ts";

test.describe("boot", () => {
  test("gets past the splash and renders the seeded account", async ({ app }) => {
    // The splash is removed by an effect in app/page.tsx, so anything that
    // stops that page rendering leaves a user staring at a frozen logo with no
    // way forward. waitForApp asserting it is gone is the whole point of this
    // spec; the rest is proof the app behind it actually has the data.
    await expect(app.locator(".hero-wallet")).toBeVisible();
    await expect(app.getByText("พรีวิว")).toBeVisible();
  });

  test("shows every Home section the fixture has data for", async ({ app }) => {
    for (const section of [".hero-wallet", ".home-insight-card", ".goal-card", ".due-soon-card", ".activity-timeline"]) {
      await expect(app.locator(section).first()).toBeVisible();
    }
  });

  test("reaches every tab without an uncaught error", async ({ app }) => {
    // Debtors, Wallets and Portfolio are dynamic imports; before this suite
    // existed, a broken chunk there was only ever found by tapping the tab by
    // hand. The fixture's afterEach fails on any page error.
    for (const tab of ["history", "add", "wallets", "home"] as const) {
      await navigate(app, tab);
      await expect(app.locator(".view, .debtor-page-list, .wallet-page")).not.toHaveCount(0);
    }
  });

  test("renders the error screen instead of hanging when the page throws", async ({ page }) => {
    // Injects a goal with no amounts. formatMoney calls value.toLocaleString()
    // on it, which throws during render -- the exact crash shape this app is
    // prone to, and one that used to leave the splash up forever because the
    // effect that hides it never ran.
    await page.addInitScript(() => {
      (window as unknown as { __MONII_PREVIEW__: unknown }).__MONII_PREVIEW__ = {
        user: { id: "preview-user", email: "preview@example.com", user_metadata: { full_name: "พรีวิว" } },
        profile: { user_id: "preview-user", month_start_day: 1, pin_hash: null, pin_salt: null, net_worth_formula: "full", net_worth_hide_card: false },
        entries: [], wallets: [], debtors: [], recurringExpenses: [], budgets: {},
        goals: [{ id: "boom", name: "crash", target: undefined, saved: undefined, deadline: "" }],
      };
    });
    await page.goto("/");

    await expect(page.getByText("แอพสะดุดไปชั่วขณะ")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "โหลดแอพใหม่" })).toBeVisible();
    // The splash must be out of the way too, or the error screen is behind it.
    const splashVisible = await page.evaluate(() => {
      const splash = document.getElementById("app-splash");
      return !!splash && getComputedStyle(splash).display !== "none";
    });
    expect(splashVisible, "splash still covering the error screen").toBe(false);
  });

  test("recovers once the crashing data is gone", async ({ app }) => {
    // The crash above is per-test state, so simply booting with the normal
    // fixture proves the error screen was not sticky.
    await expect(app.locator(".bottom-nav")).toBeVisible();
    await expect(app.getByText("แอพสะดุดไปชั่วขณะ")).toHaveCount(0);
  });
});
