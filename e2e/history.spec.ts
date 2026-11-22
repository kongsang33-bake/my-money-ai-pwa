import { test, expect, hasSideNav, navigate, scrollAppTo } from "./fixture.ts";

// A busy month on History used to mean a full screen of calendar before the
// first entry, and no way back up from the bottom but flicking. Below the desk
// the calendar opens folded to the selected day's week, and a long scroll
// offers a way back to the top.
test.describe("history length", () => {
  test("opens the calendar folded to one week, and unfolds to the whole month", async ({ app }) => {
    test.skip(await hasSideNav(app), "the desk gives the calendar its own column and never folds it");
    await navigate(app, "history");
    await app.getByRole("button", { name: "เดือนก่อนหน้า" }).click();
    const cells = app.locator(".history-view .heatmap-cell");
    expect(await cells.count()).toBeLessThanOrEqual(7);
    await app.getByRole("button", { name: "ดูทั้งเดือน" }).click();
    expect(await cells.count()).toBeGreaterThanOrEqual(28);
    await app.getByRole("button", { name: "ย่อเหลือสัปดาห์เดียว" }).click();
    expect(await cells.count()).toBeLessThanOrEqual(7);
  });

  // The days below the fold are content-visibility placeholders, so a jump
  // aimed at one far down used to chase a target that moved as the days in
  // between laid out. It lays the list out in full for the jump instead.
  test("a tap on a day far down the month lands on that day", async ({ app }) => {
    await navigate(app, "history");
    await app.getByRole("button", { name: "เดือนก่อนหน้า" }).click();
    const unfold = app.getByRole("button", { name: "ดูทั้งเดือน" });
    if (await unfold.count()) await unfold.click();
    // A day in the middle of the month: far enough down the list (it runs
    // newest first) that the days above it are placeholders on the way, with
    // enough below it to be scrolled to the top.
    const cells = app.locator(".history-view .heatmap-cell:not(.bucket-0)");
    await cells.nth(Math.floor((await cells.count()) / 2)).click();
    await expect.poll(() => app.evaluate(() => document.querySelector(".history-view .entry-list")?.classList.contains("is-jumping"))).toBe(false);
    const landed = await app.evaluate(() => {
      const group = document.querySelector<HTMLElement>(".history-view .entry-group.is-selected")!;
      const phone = document.querySelector<HTMLElement>(".phone")!;
      const box = phone.getBoundingClientRect();
      const top = group.getBoundingClientRect().top - box.top;
      // The last days of the list cannot be scrolled to the top: there is
      // nothing below them. Then the page is simply as far down as it goes.
      const atEnd = phone.scrollTop >= phone.scrollHeight - phone.clientHeight - 2;
      return { top, height: box.height, atEnd };
    });
    expect(landed.atEnd).toBe(false);
    expect(landed.top).toBeGreaterThanOrEqual(0);
    expect(landed.top).toBeLessThan(landed.height / 3);
  });

  test("offers a way back to the top once the month has been scrolled", async ({ app }) => {
    test.skip(await hasSideNav(app), "the desk scrolls the list in its own column");
    await navigate(app, "history");
    await app.getByRole("button", { name: "เดือนก่อนหน้า" }).click();
    const back = app.getByRole("button", { name: "ขึ้นบนสุด" });
    await expect(back).toHaveCount(0);
    await scrollAppTo(app, 2400);
    await expect(back).toBeVisible();
    await back.click();
    await expect.poll(() => app.evaluate(() => document.querySelector(".phone")!.scrollTop)).toBe(0);
    await expect(back).toHaveCount(0);
  });
});

// components/exiting-list.ts folds away a row that was deleted. A row that a
// filter or a search hides has not been deleted: it must just go, and come
// back whole -- in the rental app this port came from, a quickly cleared
// search once left rows stuck at height 0, there but invisible.
test.describe("filtering is not deleting", () => {
  test("a type chip and a search hide rows without folding them, and bring them back whole", async ({ app }) => {
    await navigate(app, "history");
    const view = app.locator(".view:not(.is-parked)");
    const rowsOf = () => view.locator(".entry-list .entry");
    const before = await rowsOf().count();
    expect(before).toBeGreaterThan(3);

    await view.locator(".history-search").getByRole("button", { name: "รายรับ", exact: true }).click();
    await expect.poll(() => rowsOf().count()).toBeLessThan(before);
    expect(await view.locator("[data-collapsing]").count()).toBe(0);
    await view.locator(".history-search").getByRole("button", { name: "รายรับ", exact: true }).click();
    await expect.poll(() => rowsOf().count()).toBe(before);

    const search = view.getByRole("searchbox", { name: "ค้นหารายการ" });
    await search.fill("ค่า");
    await search.fill("");
    await expect.poll(() => rowsOf().count()).toBe(before);
    expect(await view.locator("[data-collapsing]").count()).toBe(0);
    const heights = await rowsOf().evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
    expect(heights.every((height) => height > 0)).toBe(true);
  });
});
