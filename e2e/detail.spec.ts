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

  test("opens from a History row, while the row's own แก้ไข still goes straight to editing", async ({ app }) => {
    await navigate(app, "history");
    await app.locator(".view:not(.is-parked) .entry-tappable").first().click();
    await expect(app.locator(".sheet-backdrop > .entry-detail-sheet")).toBeVisible();
    await app.keyboard.press("Escape");
    await expect(app.locator(".sheet-backdrop > .entry-detail-sheet")).toHaveCount(0);

    // Reached the way a keyboard reaches it, which works on every pointer:
    // on touch it sits behind the row until focus (or a swipe) opens it, on
    // a mouse it is at the row's end.
    const edit = app.locator(".view:not(.is-parked) .swipe-edit").first();
    await edit.focus();
    await expect(app.locator(".view:not(.is-parked) .swipe-row").first()).toHaveClass(/\bis-open\b/);
    await edit.press("Enter");
    await expect(app.locator(".sheet-backdrop > .edit-sheet")).toBeVisible();
  });

  test("swipes a History row left to uncover แก้ไข and ลบ, and a tap closes it again", async ({ app }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "only a touch device swipes; a mouse gets the buttons at the row's end");
    await navigate(app, "history");
    const row = app.locator(".view:not(.is-parked) .swipe-row").first();
    const content = row.locator(".swipe-content");
    const box = (await content.boundingBox())!;
    const y = box.y + box.height / 2;
    await content.evaluate((element, { startX, endX, y }) => {
      const fire = (type: string, x: number) => element.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: "touch", clientX: x, clientY: y, isPrimary: true }));
      fire("pointerdown", startX);
      for (let x = startX; x >= endX; x -= 20) fire("pointermove", x);
      fire("pointerup", endX);
    }, { startX: box.x + box.width - 20, endX: box.x + box.width - 200, y });
    await expect(row).toHaveClass(/\bis-open\b/);
    await expect(row.locator(".swipe-edit")).toBeInViewport();
    await expect(row.locator(".swipe-delete")).toBeInViewport();

    // The click that ends a swipe is swallowed; the next tap closes the row
    // rather than opening the detail sheet.
    await row.locator(".entry-tappable").click();
    if (await row.evaluate((element) => element.classList.contains("is-open"))) await row.locator(".entry-tappable").click();
    await expect(row).not.toHaveClass(/\bis-open\b/);
    await expect(app.locator(".sheet-backdrop > .entry-detail-sheet")).toHaveCount(0);
  });
});
