import { test as base, expect } from "@playwright/test";
import { navigate, openApp, buildSeed, openLanding } from "./fixture.ts";

// Signed out, the app is the landing page, every time: one scrolling page of
// what it is, how its data is kept, how to install it and questions, then
// sign-in -- which stays shut until the privacy policy has been read and
// acknowledged in its own sheet.
const test = base.extend<{ errors: string[] }>({
  errors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await use(errors);
    expect(errors, "uncaught page errors").toEqual([]);
  }, { auto: true }],
});

test.describe("landing", () => {
  test("reads top to bottom, ending on the sign-in", async ({ page }) => {
    await openLanding(page);
    await expect(page.locator(".landing-hero h1")).toBeVisible();
    await expect(page.locator(".landing-features .rank")).toHaveCount(5);
    await expect(page.locator(".landing-reasons li")).toHaveCount(4);

    await page.locator("#landing-install").scrollIntoViewIfNeeded();
    await expect(page.locator(".landing-steps li")).toHaveCount(3);
    await page.getByRole("tab", { name: "Android" }).click();
    await expect(page.locator(".landing-steps")).toContainText("Chrome");

    // The hero's one button leads to the one sign-in, at the foot.
    await page.locator(".landing").evaluate((el) => el.scrollTo(0, 0));
    await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
    await expect(page.locator(".google-button")).toBeInViewport();
  });

  test("opens an answer in the questions", async ({ page }) => {
    await openLanding(page);
    const item = page.locator(".landing-faq details").filter({ hasText: "ลบบัญชีได้ไหม" });
    await item.locator("summary").click();
    await expect(item.locator("p")).toBeVisible();
    await expect(item.locator("p")).toContainText("ของฉัน");
  });

  test("keeps sign-in shut until the privacy policy is acknowledged", async ({ page}) => {
    await openLanding(page);
    await page.getByRole("button", { name: "เริ่มใช้งาน" }).click();
    const google = page.locator(".google-button");
    await expect(google).toBeDisabled();
    await page.locator(".email-fallback summary").click();
    await expect(page.locator(".auth-email-submit")).toBeDisabled();

    // Closing the policy without pressing its button is not an acknowledgement.
    await page.locator(".privacy-ack").click();
    await page.locator(".privacy-sheet .sheet-close").click();
    await expect(page.locator(".privacy-sheet")).toHaveCount(0);
    await expect(google).toBeDisabled();

    await page.locator(".privacy-ack").click();
    await page.getByRole("button", { name: "อ่านแล้ว รับทราบ" }).click();
    await expect(page.locator(".privacy-sheet")).toHaveCount(0);
    await expect(google).toBeEnabled();
    await expect(page.locator(".auth-email-submit")).toBeEnabled();

    // Remembered on this device for the same policy version -- but the landing
    // page itself still comes first.
    await page.reload();
    await expect(page.locator(".landing-shell")).toBeVisible();
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
    await expect(page.locator(".privacy-ack.done")).toBeVisible();
    await expect(google).toBeEnabled();
  });

  test("serves the policy on its own page, clear of the splash", async ({ page}) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "นโยบายความเป็นส่วนตัว" })).toBeVisible();
    await expect(page.locator("#app-splash")).toBeHidden();
  });

  test("links the policy from ของฉัน once signed in", async ({ page}) => {
    await openApp(page, buildSeed());
    await navigate(page, "more");
    await expect(page.locator('a.me-row[href="/privacy"]')).toBeVisible();
  });
});
