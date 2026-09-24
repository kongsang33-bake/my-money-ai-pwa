import { test, expect, navigate, openApp, openDraft, seedDraft, buildSeed } from "./fixture.ts";
import type { Page } from "@playwright/test";

// iOS Safari zooms the whole page in when a field whose text is under 16px
// takes focus, and leaves it zoomed after the keyboard goes -- the Ask AI
// composer did exactly that, and nothing makes the app feel more like a web
// page and less like an app. Chromium does not do it, so no screenshot here
// would ever show it; what can be checked is the cause. Every field on every
// screen that has one is measured against the 16px floor (--fs-input in
// globals.css), so a component rule that sets a field smaller fails here
// rather than on someone's phone.

const MIN_INPUT_FONT_PX = 16;

async function undersizedFields(page: Page) {
  return page.evaluate((min) => {
    const fields = Array.from(document.querySelectorAll<HTMLElement>("input, textarea, select"));
    return fields
      // Parked screens are laid out but not shown; hidden inputs never focus.
      .filter((field) => !field.closest(".is-parked") && (field as HTMLInputElement).type !== "hidden" && field.getClientRects().length > 0)
      .map((field) => ({
        field: `${field.tagName.toLowerCase()}${field.className ? `.${String(field.className).trim().split(/\s+/).join(".")}` : ""}${(field as HTMLInputElement).type ? `[type=${(field as HTMLInputElement).type}]` : ""}`,
        size: parseFloat(getComputedStyle(field).fontSize),
      }))
      .filter(({ size }) => size < min);
  }, MIN_INPUT_FONT_PX);
}

async function openMoreScreen(page: Page, label: string) {
  await navigate(page, "more");
  const tile = page.locator(".more-grid button", { hasText: label });
  await tile.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
  await tile.dispatchEvent("click");
}

test.describe("no zoom on focus", () => {
  test("every field on the main screens is at least 16px", async ({ app }) => {
    const screens: [string, () => Promise<void>][] = [
      ["history", () => navigate(app, "history")],
      ["add (AI)", () => navigate(app, "add")],
      ["add (manual)", async () => {
        await navigate(app, "add");
        await app.getByRole("button", { name: "เขียนเอง" }).click();
      }],
      ["wallets", () => navigate(app, "wallets")],
      ["ask AI", () => openMoreScreen(app, "ถาม AI เรื่องเงิน")],
      ["budgets", () => openMoreScreen(app, "งบประมาณ")],
      ["report", () => openMoreScreen(app, "ส่งออกรีพอร์ท")],
      ["account", async () => {
        await navigate(app, "more");
        await app.locator(".me-head").click();
      }],
    ];
    for (const [name, open] of screens) {
      await open();
      await app.waitForTimeout(300);
      expect(await undersizedFields(app), `${name}: fields under ${MIN_INPUT_FONT_PX}px`).toEqual([]);
    }
  });

  test("the split review's per-person fields are at least 16px", async ({ page }) => {
    await openApp(page, { ...buildSeed(), drafts: [seedDraft({ title: "ค่าเบียร์", amount: 1500, debtor_name: "อ้อน, แบงค์, วิน, พี่พัก" })] });
    await navigate(page, "add");
    await openDraft(page);
    await expect(page.locator(".draft-split-people-list li")).toHaveCount(5);
    expect(await undersizedFields(page)).toEqual([]);
  });
});
