import { test, expect, navigate, openApp, openDraft, seedDraft, buildSeed } from "./fixture.ts";

// Two halves of the same evening: an expense someone else fronted, and
// clearing what is left between you afterwards.
//
// Nothing saves here (no Supabase), so these cover what the screens offer and
// what they say they will write; planDebtSettlement's arithmetic and the rows
// a fronted expense expands into are unit-tested.
test.describe("settling up", () => {
  test("lets a plain expense be funded by the person who got the round in", async ({ page }) => {
    await openApp(page, {
      ...buildSeed(),
      drafts: [seedDraft({ title: "ค่าเบียร์", amount: 389, transaction_type: "personal_expense", debtor_name: "", funding_card_name: "อ้อน" })],
    });
    await navigate(page, "add");
    await openDraft(page);

    // A funder the user has never owed before is still offered, and is marked
    // as the new debt it is about to become.
    const funding = page.locator(".draft-funding select");
    await expect(funding).toContainText("อ้อน · ใหม่");
    await expect(funding).toHaveValue("card:อ้อน");

    // No wallet is paying, so the wallet picker steps aside.
    await expect(page.locator(".draft-meta-chip[data-field='wallet']")).toHaveCount(0);
  });

  test("does not count a funded expense as money leaving a wallet", async ({ page }) => {
    await openApp(page, {
      ...buildSeed(),
      drafts: [seedDraft({ title: "ค่าเบียร์", amount: 389, transaction_type: "personal_expense", debtor_name: "", funding_card_name: "อ้อน" })],
    });
    await navigate(page, "add");

    // The row's own preview and the total underneath it have to agree: อ้อน
    // is owed 389 and no wallet paid anything.
    await expect(page.locator(".draft-effects")).toContainText("อ้อน");
    const summary = page.locator("section .draft-impact").last();
    await expect(summary).toContainText("รวมทุกกระเป๋า +฿ 0");
    // The user's own tab, not someone else's: two books, never one number.
    await expect(summary).toContainText("หนี้ของเรา +฿ 389");
    await expect(summary).not.toContainText("ลูกหนี้");
  });

  test("keeps the wallet picker for an expense the user paid themselves", async ({ app }) => {
    await navigate(app, "add");
    // (No draft seeded here: the composer is what shows, and the point is
    // that the funding picker is not forced on every expense.)
    await expect(app.locator(".draft-funding")).toHaveCount(0);
  });

  test("offers to clear both sides with one person", async ({ app }) => {
    await app.evaluate(() => document.querySelectorAll<HTMLButtonElement>(".bottom-nav > button")[4].click());
    await app.locator(".more-grid button", { hasText: "จัดการหนี้" }).click();
    await app.locator(".debtor-page-list .debtor-main-button").first().click();

    const settle = app.locator(".debtor-settle-button");
    await expect(settle).toBeVisible();
    await expect(settle).toContainText("เคลียร์ยอดกับ");
  });
});
