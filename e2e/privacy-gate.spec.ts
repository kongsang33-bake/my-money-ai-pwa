import { expect, openPrivacyGate, test } from "./fixture";

// PrivacyGate is rendered by app/page.tsx, where the --vvh effect puts any
// scroll of the *document* back to the top whenever a finger lifts (it is
// there to undo iOS's keyboard pan). The gate used to scroll the document, so
// on a phone it juddered while scrolling and jumped back to the top on
// reaching the end, before รับทราบ could be tapped. It scrolls itself now.

test("the policy scrolls to its button and stays there when the finger lifts", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openPrivacyGate(page);

  const accept = page.getByRole("button", { name: "อ่านแล้ว รับทราบ" });
  const viewport = page.viewportSize()!;
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.wheel(0, 20000);
  await page.waitForTimeout(400);

  // What a finger leaving the glass does to the page: the effect's touchend.
  await page.evaluate(() => {
    const lift = new Event("touchend");
    Object.defineProperty(lift, "touches", { value: [] });
    window.dispatchEvent(lift);
  });
  await page.waitForTimeout(200);

  await expect(accept).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(errors).toEqual([]);
});
