import { test, expect, buildEmptySeed, buildSeed, openApp, openSetup, waitForApp, navigate } from "./fixture.ts";

// What a brand-new account actually sees. Everything here is the boundary the
// suite can reach: rendering, navigation and local component state. Creating
// the wallet for real needs Supabase, which the suite has no credentials for
// (see the note at the top of fixture.ts), so these specs check that the
// buttons lead where they should -- never that a write happened.

test.describe("first run", () => {
  test("opens on the setup gate instead of a Home made of zeros", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await openSetup(page);
    await expect(page.getByRole("heading", { name: /สวัสดี/ })).toBeVisible();
    // The gate replaces the whole app, nav included -- there is nowhere else
    // to be until it is finished or waved off.
    await expect(page.locator(".bottom-nav")).toHaveCount(0);

    await page.getByRole("button", { name: "เริ่มตั้งค่า" }).click();
    await expect(page.getByRole("heading", { name: "ตอนนี้มีเงินอยู่เท่าไหร่" })).toBeVisible();
    await expect(page.locator(".setup-presets button")).toHaveCount(3);

    await page.getByRole("button", { name: "ยังไม่สร้างตอนนี้" }).click();
    await expect(page.getByRole("heading", { name: "ลองจดรายการแรก" })).toBeVisible();

    expect(errors, "uncaught page errors").toEqual([]);
  });

  test("hands the Add tab an example to start from", async ({ page }) => {
    await openSetup(page);
    await page.getByRole("button", { name: "เริ่มตั้งค่า" }).click();
    await page.getByRole("button", { name: "ยังไม่สร้างตอนนี้" }).click();
    await page.getByRole("button", { name: "ลองจดรายการแรก" }).click();

    await waitForApp(page);
    await expect(page.locator(".add-view textarea")).toHaveValue("กาแฟ 65 บาท");
    // The composer says what it can be told, once, while the account is empty.
    await expect(page.locator(".composer-primer").first()).toBeVisible();
  });

  test("skipping lands on a Home that says what to do next, with no empty analysis", async ({ page }) => {
    await openSetup(page);
    await page.getByRole("button", { name: "ข้ามไปก่อน" }).click();
    await waitForApp(page);

    await expect(page.locator(".start-checklist")).toBeVisible();
    await expect(page.locator(".start-checklist-steps li")).toHaveCount(4);
    // The point of the whole change: no savings rate, no debt load, no net
    // worth, no 7-day pace on an account with nothing in it.
    await expect(page.locator(".home-insight-card")).toHaveCount(0);
    await expect(page.locator(".cashflow-trend-card")).toHaveCount(0);
    await expect(page.locator(".spending-personality-card")).toHaveCount(0);

    // The gate is not offered again once it has been waved off.
    await page.reload();
    await waitForApp(page);
    await expect(page.locator(".setup-screen")).toHaveCount(0);
  });

  test("warns when entries have been jotted with no wallet to count them", async ({ page }) => {
    // The failure this notice exists for: wallet_id is null on every one of
    // these rows, so buildWalletLedger has nothing to put them on and the
    // balance stays at zero however much is recorded. An account in this
    // state is past the gate already -- it has entries -- so it boots into
    // Home, which is exactly where the warning has to be.
    await openApp(page, {
      ...buildEmptySeed(),
      entries: buildSeed().entries.slice(0, 5).map((entry) => ({ ...entry, wallet_id: null })),
    });

    await expect(page.locator(".missing-wallet-notice")).toBeVisible();
    await expect(page.locator(".setup-screen")).toHaveCount(0);
  });

  test("keeps every money feature in one place under อื่น ๆ", async ({ app }) => {
    // งบประมาณ / ถาม AI / ส่งออกรีพอร์ท used to be behind the hamburger,
    // next to sign-out, where nobody looking for a budget would find them.
    await navigate(app, "more");
    const tiles = app.locator(".more-grid button");
    await expect(tiles).toHaveCount(7);
    for (const label of ["จัดการหนี้", "งบประมาณ", "ถาม AI เรื่องเงิน", "ส่งออกรีพอร์ท"]) {
      await expect(tiles.filter({ hasText: label })).toHaveCount(1);
    }
  });
});
