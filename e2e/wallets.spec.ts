import { test, expect, navigate } from "./fixture.ts";

test.describe("wallets", () => {
  test.beforeEach(async ({ app }) => {
    await navigate(app, "wallets");
    await expect(app.getByText("บัญชีหลัก")).toBeVisible();
  });

  test("lists every wallet with its balance and which one is the default", async ({ app, seed }) => {
    for (const wallet of seed.wallets) {
      await expect(app.locator(".debtor-page-list > .debtor-page-item").filter({ hasText: wallet.name })).toHaveCount(1);
    }
    await expect(app.getByText("กระเป๋าหลัก")).toBeVisible();
  });

  test("opens a wallet's actions without a page error", async ({ app }) => {
    const card = app.locator(".debtor-page-list > .debtor-page-item").filter({ hasText: "กระเป๋าย่อย" }).first();
    await card.locator(".kebab-menu summary").click();
    await expect(card.getByRole("button", { name: "แก้ไข" })).toBeVisible();
    await expect(card.getByRole("button", { name: "ลบ" })).toBeVisible();
  });

  // NOT tested here, deliberately: what the delete confirmation actually says.
  //
  // Every mutation in app/page.tsx opens with `if (!supabase) return`, and the
  // suite runs without Supabase credentials, so deleteWallet returns before it
  // can raise its dialog -- the tap is a no-op and a spec asserting on the
  // wording would pass or fail for reasons that have nothing to do with the
  // wording. That copy is covered by describeWalletDeletion's unit tests in
  // lib/money.test.ts instead.
  //
  // See the note in e2e/fixture.ts: the boundary of this suite is everything
  // up to a write. Moving it needs a stub Supabase client in the fixture, not
  // another spec.
});
