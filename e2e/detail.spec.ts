import { test, expect, navigate } from "./fixture.ts";

// A tap on an entry opens its detail sheet (EntryDetailSheet) -- the mock's
// title page -- and editing is one step on from there. Delete is not tapped
// here: it is a write, and every write is a no-op without Supabase (see the
// e2e note in CLAUDE.md).
test.describe("entry detail", () => {
  test("opens from Home's recent rail with the entry's own name and amount", async ({ app }) => {
    const tile = app.locator(".home-view .recent-tile").first();
    const title = (await tile.locator(".recent-body b").textContent())!.trim();
    const amount = (await tile.locator(".recent-body small span").last().textContent())!.trim();
    await tile.click();

    const sheet = app.locator(".sheet-backdrop > .entry-detail-sheet");
    await expect(sheet.locator("h2")).toHaveText(title);
    await expect(sheet.locator(".detail-amount")).toHaveText(amount);
  });

  test("hands off to the edit sheet rather than stacking on it", async ({ app }) => {
    await app.locator(".home-view .recent-tile").first().click();
    await app.locator(".entry-detail-sheet button", { hasText: "แก้ไข" }).click();
    await expect(app.locator(".sheet-backdrop > .edit-sheet")).toBeVisible();
    await expect(app.locator(".entry-detail-sheet")).toHaveCount(0);
  });

  test("opens a similar entry in place, starting again at the top", async ({ app }) => {
    await app.locator(".home-view .recent-tile").first().click();
    const sheet = app.locator(".sheet-backdrop > .entry-detail-sheet");
    const first = sheet.locator(".detail-similar .poster").first();
    const nextTitle = (await first.locator(".poster-title").textContent())!.trim();
    await first.click();
    await expect(sheet.locator("h2")).toHaveText(nextTitle);
    expect(await sheet.evaluate((element) => element.scrollTop)).toBe(0);
  });

  test("opens from a History row, while the row's own แก้ still goes straight to editing", async ({ app }) => {
    await navigate(app, "history");
    await app.locator(".view:not(.is-parked) .entry-tappable").first().click();
    await expect(app.locator(".sheet-backdrop > .entry-detail-sheet")).toBeVisible();
    await app.keyboard.press("Escape");
    await expect(app.locator(".sheet-backdrop > .entry-detail-sheet")).toHaveCount(0);

    await app.locator(".view:not(.is-parked) .entry menu button", { hasText: "แก้" }).first().click();
    await expect(app.locator(".sheet-backdrop > .edit-sheet")).toBeVisible();
  });
});
