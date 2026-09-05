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

  test("splits the total into what is spendable and what is set aside", async ({ app }) => {
    const total = app.locator(".wallet-total-card");
    await expect(total).toContainText("ใช้ได้ตอนนี้");
    await expect(total).toContainText("กันไว้");
  });

  test("keeps a section heading and its button on one line", async ({ app }) => {
    // .section-title had no rule of its own, so the button under every one of
    // these headings sat on a second line -- here, on Home's heatmap, on the
    // debtor history.
    await app.locator(".debtor-page-list .debtor-main-button").first().click();
    const heading = app.locator(".wallet-statement-panel .section-title h2");
    const action = app.locator(".wallet-statement-panel .section-title button");
    const [headingBox, actionBox] = [await heading.boundingBox(), await action.boundingBox()];
    const centre = (box: NonNullable<typeof headingBox>) => box.y + box.height / 2;
    expect(Math.abs(centre(headingBox!) - centre(actionBox!))).toBeLessThan(6);
    expect(actionBox!.x).toBeGreaterThan(headingBox!.x + headingBox!.width);
  });

  test("reads a wallet's history as a statement: what, when, and the amount", async ({ app }) => {
    await app.locator(".debtor-page-list .debtor-main-button").first().click();
    const row = app.locator(".wallet-statement-row").first();
    const [title, date, amount] = [row.locator("span"), row.locator("small"), row.locator("b")];
    const [titleBox, dateBox, amountBox] = [await title.boundingBox(), await date.boundingBox(), await amount.boundingBox()];
    // Date under the title, not beside it -- the first row used to be laid out
    // by a rule meant for a header that no longer exists.
    expect(dateBox!.y).toBeGreaterThan(titleBox!.y + titleBox!.height - 2);
    expect(amountBox!.x).toBeGreaterThan(titleBox!.x + titleBox!.width);
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
