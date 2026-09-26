import { buildSeed, expect, openApp, test } from "./fixture";

// Home's balance is hidden until asked for, every time Home opens, with an
// eye after the figure to show and hide it (HeroWalletCard).

test("the balance opens hidden and the eye shows and hides it", async ({ app }) => {
  const amount = app.locator(".hero-amount");
  const tags = app.locator(".billboard-tags");
  await expect(amount).toHaveText("฿ ••••••");
  // The line under it gives the balance away too, so it is hidden with it.
  await expect(tags).not.toContainText(/฿\s?\d/);

  await app.getByRole("button", { name: "แสดงยอดเงิน" }).click();
  await expect(amount).toHaveText(/฿\s?[\d,]+/);
  await expect(app.getByRole("button", { name: "ซ่อนยอดเงิน" })).toHaveAttribute("aria-pressed", "true");

  await app.getByRole("button", { name: "ซ่อนยอดเงิน" }).click();
  await expect(amount).toHaveText("฿ ••••••");
});

test("it is hidden again the next time the app opens", async ({ app }) => {
  await app.getByRole("button", { name: "แสดงยอดเงิน" }).click();
  await app.reload();
  await expect(app.locator(".hero-amount")).toHaveText("฿ ••••••", { timeout: 15000 });
});

test("a long balance stays on one line and inside the card", async ({ page }) => {
  // Left to wrap, "฿" broke onto a line of its own above a five-digit figure.
  const seed = buildSeed();
  await openApp(page, { ...seed, wallets: seed.wallets.map((wallet, index) => (index === 0 ? { ...wallet, balance: 98_765_432.1 } : wallet)) });
  await page.getByRole("button", { name: "แสดงยอดเงิน" }).click();
  const amount = page.locator(".hero-amount");
  await expect(amount).toHaveText(/฿\s?98,/);
  const fit = await amount.evaluate((node) => {
    const row = node.parentElement!.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    const lineHeight = parseFloat(getComputedStyle(node).fontSize) * 1.05;
    return { oneLine: box.height < lineHeight * 1.5, inside: node.scrollWidth <= node.clientWidth + 1 && box.right <= row.right + 1 };
  });
  expect(fit).toEqual({ oneLine: true, inside: true });
  await expect(page.getByRole("button", { name: "ซ่อนยอดเงิน" })).toBeInViewport();
});
