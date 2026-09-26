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
  await expect(app.locator(".pocket-count")).toHaveText("2/6");
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

test("a ticket that has passed goes last, dimmed, with its delete where แชร์ was", async ({ app }) => {
  await app.getByRole("button", { name: "เปิดกระเป๋าการ์ด" }).click();
  const slides = app.locator(".pocket-slide");
  await expect(slides).toHaveCount(6);
  await expect(slides.last()).toHaveClass(/is-past/);
  await expect(slides.last()).toContainText("ผ่านไปแล้ว");
  // The ticket two days out is not past, and shows when and where to sit.
  await expect(app.locator(".pocket-slide.is-ticket:not(.is-past) .pocket-when")).toContainText("ที่นั่ง F12, F13");

  await app.locator(".pocket-track").focus();
  for (let i = 0; i < 5; i++) await app.keyboard.press("ArrowRight");
  await expect(app.locator(".pocket-count")).toHaveText("6/6");
  const back = app.locator(".billboard-face.is-back");
  await expect(back.getByRole("button", { name: "ลบตั๋วนี้" })).toBeVisible();
  await expect(back.getByRole("button", { name: "แชร์" })).toHaveCount(0);
});

test("the kind is picked from a grouped list, and a ticket asks for its when and seat", async ({ app }) => {
  await app.getByRole("button", { name: "เปิดกระเป๋าการ์ด" }).click();
  await app.getByRole("button", { name: "จัดการการ์ด" }).click();
  await app.getByRole("button", { name: "เพิ่มการ์ด" }).click();
  const kind = app.getByRole("combobox", { name: "ชนิดการ์ด" });
  await expect(kind.locator("optgroup")).toHaveCount(2);
  await kind.selectOption("ticket");
  await expect(app.getByRole("textbox", { name: "ที่นั่ง" })).toBeVisible();
  await expect(app.getByRole("radiogroup", { name: "โค้ดบนบัตร" })).toBeVisible();
  // AI can only be asked once there is a photo to read.
  await expect(app.getByRole("button", { name: "ให้ AI ช่วยกรอก" })).toBeDisabled();
  // A payment kind has neither.
  await kind.selectOption("promptpay");
  await expect(app.getByRole("button", { name: "ให้ AI ช่วยกรอก" })).toHaveCount(0);
});

test("the ticket reader refuses anyone not signed in", async ({ app }) => {
  const response = await app.request.post("/api/analyze-ticket", { data: { kind: "ticket", image: { data: "x", mimeType: "image/png" } } });
  expect(response.status()).toBe(401);
});
