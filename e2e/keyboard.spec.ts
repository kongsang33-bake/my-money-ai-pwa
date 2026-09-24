import { test, expect, navigate } from "./fixture.ts";
import type { Page } from "@playwright/test";

// While the on-screen keyboard is up the bottom nav slides out of the way,
// and on Ask AI the chat grows into the room it leaves (see the
// .bottom-nav keyboard tuck and .ask-ai-page in globals.css). A touch screen
// is what has an on-screen keyboard, so that is when it happens: the mobile
// project emulates one, and the other two are a mouse and a keyboard, where
// the nav has to stay exactly where it is while you type.

const navState = (page: Page) =>
  page.locator(".bottom-nav").evaluate((nav) => ({
    opacity: parseFloat(getComputedStyle(nav).opacity),
    top: nav.getBoundingClientRect().top,
  }));

async function openAsk(page: Page) {
  await navigate(page, "more");
  const tile = page.locator(".more-grid button", { hasText: "ถาม AI เรื่องเงิน" });
  await tile.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
  await tile.dispatchEvent("click");
  await expect(page.locator(".ask-ai-input")).toBeVisible();
  await page.waitForTimeout(400);
}

// Longer than the --t-3 slide, so what is read is where it lands.
const settle = (page: Page) => page.waitForTimeout(450);

test.describe("keyboard", () => {
  test("slides the nav away while typing on a touch screen, and back after", async ({ app }, info) => {
    test.skip(info.project.name !== "mobile", "only a touch screen has an on-screen keyboard");
    await openAsk(app);
    const composer = app.locator(".ask-ai-composer");
    const before = { nav: await navState(app), composerBottom: (await composer.boundingBox())!.y + (await composer.boundingBox())!.height };

    await app.locator(".ask-ai-input").focus();
    await settle(app);
    const typing = await navState(app);
    expect(typing.opacity).toBe(0);
    expect(typing.top, "the nav should have slid down, not just faded").toBeGreaterThan(before.nav.top);
    await expect(app.locator(".bottom-nav")).toHaveCSS("pointer-events", "none");

    // The chat takes the nav's room, and the page still does not scroll.
    const composerBottom = (await composer.boundingBox())!.y + (await composer.boundingBox())!.height;
    expect(composerBottom).toBeGreaterThan(before.composerBottom + 40);
    expect(await app.evaluate(() => { const p = document.querySelector(".phone") as HTMLElement; return p.scrollHeight - p.clientHeight; })).toBeLessThanOrEqual(1);

    await app.locator(".ask-ai-input").blur();
    await settle(app);
    const after = await navState(app);
    expect(after.opacity).toBe(1);
    expect(Math.round(after.top)).toBe(Math.round(before.nav.top));
    expect((await composer.boundingBox())!.y + (await composer.boundingBox())!.height).toBeCloseTo(before.composerBottom, 0);
  });

  test("keeps Ask AI's composer on the keyboard's edge as the visible area shrinks", async ({ app }, info) => {
    test.skip(info.project.name !== "mobile", "only a touch screen has an on-screen keyboard");
    // iOS does not resize the page for the keyboard; it shrinks the visual
    // viewport, which the app follows through --vvh. A smaller window is the
    // same event from the page's point of view.
    await openAsk(app);
    const full = app.viewportSize()!;
    await app.locator(".ask-ai-input").focus();
    const visible = 480;
    await app.setViewportSize({ width: full.width, height: visible });
    await settle(app);
    const box = (await app.locator(".ask-ai-composer").boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(visible);
    expect(visible - (box.y + box.height), "the composer should sit on the keyboard, not float above it").toBeLessThanOrEqual(32);
    expect(await app.evaluate(() => window.scrollY)).toBe(0);
    await app.setViewportSize(full);
  });

  test("tucks the nav for any field that opens a keyboard, not for a date picker", async ({ app }, info) => {
    test.skip(info.project.name !== "mobile", "only a touch screen has an on-screen keyboard");
    await navigate(app, "add");
    await app.getByRole("button", { name: "เขียนเอง" }).click();

    await app.locator(".manual-entry-form input[type=date], .entry-date-picker input[type=date]").first().focus();
    await settle(app);
    expect((await navState(app)).opacity, "a date field opens a picker, not a keyboard").toBe(1);

    await app.locator(".manual-entry-form input:not([type=date]):not([type=month]):not([type=checkbox])").first().focus();
    await settle(app);
    expect((await navState(app)).opacity).toBe(0);
  });

  test("leaves the nav where it is when typing with a mouse and keyboard", async ({ app }, info) => {
    test.skip(info.project.name === "mobile", "the touch case is covered above");
    await openAsk(app);
    const before = await navState(app);
    await app.locator(".ask-ai-input").focus();
    await settle(app);
    const typing = await navState(app);
    expect(typing.opacity).toBe(1);
    expect(Math.round(typing.top)).toBe(Math.round(before.top));
  });
});
