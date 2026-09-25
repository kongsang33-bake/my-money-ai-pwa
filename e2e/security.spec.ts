import type { Page } from "@playwright/test";
import { test, expect, buildSeed, openApp, openMe } from "./fixture.ts";

// The security screen. Enabling, changing and disabling a PIN all write to
// Supabase, which the suite has no credentials for (see the note at the top of
// fixture.ts), so none of that is reachable here. The lock window is the one
// thing on this screen that isn't a write: it is a per-user, per-device
// localStorage preference that takes effect the moment it is picked, which
// puts it inside the boundary.

const lockDelayKey = "money-ai-lock-delay:preview-user";

async function openSecurity(page: Page) {
  const seed = buildSeed();
  await openApp(page, { ...seed, profile: { ...seed.profile, pin_hash: "x", pin_salt: "y" } });
  await openMe(page);
  await page.locator(".me-list .me-row", { hasText: "รหัส PIN" }).click();
}

test.describe("lock window", () => {
  test("is offered on the security screen and saved as it is picked", async ({ page }) => {
    await openSecurity(page);

    const select = page.locator(".lock-delay select");
    await expect(select).toBeVisible();
    // Fifteen minutes is the default, and an account that has never touched
    // the setting has to show that rather than the first option in the list.
    await expect(select).toHaveValue("15m");

    // No save button by design: the choice is the write.
    await select.selectOption("never");
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), lockDelayKey))
      .toBe("never");
  });

  test("survives a reload", async ({ page }) => {
    await openSecurity(page);
    await page.locator(".lock-delay select").selectOption("instant");
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), lockDelayKey))
      .toBe("instant");

    await openSecurity(page);
    await expect(page.locator(".lock-delay select")).toHaveValue("instant");
  });
});
