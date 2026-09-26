import { expect, test } from "./fixture";

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
