import { test, expect, navigate } from "./fixture.ts";

// Counting your real money and telling the app, and the nudge that stops the
// most common reason the two drift apart (a card bill the bank took and the
// ledger never heard about).
//
// The write itself is out of reach here (no Supabase), so what these check is
// everything up to it: the arithmetic on screen, and that the button is only
// live when there is something to correct. balanceAdjustmentEntry's numbers
// are unit-tested.
test.describe("reconcile", () => {
  test("shows the gap between the app and the real balance", async ({ app }) => {
    await navigate(app, "wallets");
    const firstWallet = app.locator(".debtor-page-item").first();
    await firstWallet.locator("summary").click();
    await firstWallet.locator(".kebab-menu button", { hasText: "ปรับยอดให้ตรง" }).click();

    const sheet = app.locator(".sheet-backdrop");
    // The sheet opens on the app's own figure, so there is nothing to correct
    // and nothing to save yet.
    const appBalance = Number((await sheet.locator(".reconcile-compare b").innerText()).replace(/[^\d.]/g, ""));
    expect(appBalance).toBeGreaterThan(0);
    await expect(sheet.locator(".amount-input")).toHaveValue(String(appBalance));
    await expect(sheet.locator("button.save")).toBeDisabled();

    await sheet.locator(".amount-input").fill(String(appBalance - 2500));
    await expect(sheet.locator(".draft-impact")).toContainText("2,500");
    await expect(sheet.locator(".draft-impact")).toContainText("แอปจดเกินไป");
    await expect(sheet.locator("button.save")).toBeEnabled();

    await sheet.locator(".amount-input").fill(String(appBalance + 100));
    await expect(sheet.locator(".draft-impact")).toContainText("แอปจดขาดไป");
  });

  test("nudges about a card with nothing paid against it this cycle", async ({ app }) => {
    // The seed's own-kind debtor has a balance and no debt_payment in it.
    // One poster per unpaid debt; the poster itself is the way into them.
    const card = app.locator(".unpaid-poster");
    await expect(card).toContainText("ยังไม่จ่ายรอบนี้");
    await expect(card).toContainText("บัตรเครดิต");

    // Bring it clear of the pinned nav first, as a thumb would. On the 700px
    // layout this rail ends the first screen, and Playwright's own "scroll if
    // needed" does nothing for a poster that is partly on screen -- so it
    // tapped the nav lying over the poster's centre instead.
    await card.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
    await card.click();
    // Home is still mounted behind this screen, parked, so ".view" alone
    // would match both.
    await expect(app.locator(".view:not(.is-parked)")).toContainText("จัดการหนี้");
    await app.locator(".view:not(.is-parked) button", { hasText: "หนี้ของฉัน" }).click();
    await expect(app.locator(".debtor-page-list")).toContainText("บัตรเครดิต");
  });
});
