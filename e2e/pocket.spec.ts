import { expect, test } from "./fixture";

// The billboard's back (components/pocket.tsx). Everything here is local
// state -- the pocket has no table yet -- so opening, turning and swiping are
// all real in the suite.

test("Home opens on the balance, and the pocket is one button away", async ({ app }) => {
  const front = app.locator(".billboard-face.is-front");
  const back = app.locator(".billboard-face.is-back");
  await expect(front).not.toHaveAttribute("inert", "");
  await expect(back).toHaveAttribute("inert", "");

  await app.getByRole("button", { name: "เปิดกระเป๋าการ์ด" }).click();
  await expect(front).toHaveAttribute("inert", "");
  await expect(back.locator(".pocket-slide").first()).toContainText("พร้อมเพย์ส่วนตัว");
  await expect(back.locator(".pocket-qr").first()).toBeVisible();
  // Focus follows the turn, so a keyboard is not left on the inert face.
  await expect(app.getByRole("button", { name: "กลับไปที่ยอดเงิน" })).toBeFocused();

  await app.getByRole("button", { name: "กลับไปที่ยอดเงิน" }).click();
  await expect(front).not.toHaveAttribute("inert", "");
  await expect(app.getByRole("button", { name: "เปิดกระเป๋าการ์ด" })).toBeFocused();
});

test("the pocket moves one card at a time and says which one it is on", async ({ app }) => {
  await app.getByRole("button", { name: "เปิดกระเป๋าการ์ด" }).click();
  const track = app.locator(".pocket-track");
  await track.focus();
  await app.keyboard.press("ArrowRight");
  await expect(app.locator(".pocket-count")).toHaveText("2/4");
  await expect(app.locator(".pocket-dots i.is-on")).toHaveCount(1);
});

test("รายละเอียด opens the current card large, with what it is in words", async ({ app }) => {
  await app.getByRole("button", { name: "เปิดกระเป๋าการ์ด" }).click();
  await app.locator(".billboard-face.is-back").getByRole("button", { name: "รายละเอียด" }).click();
  const sheet = app.locator(".pocket-detail-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".pocket-qr")).toBeVisible();
  await expect(sheet).toContainText("081-234-5678");
});
