import { test, expect, navigate } from "./fixture.ts";

test.describe("recurring bills", () => {
  test.beforeEach(async ({ app }) => {
    await navigate(app, "more");
    await app.getByRole("button", { name: /รายจ่ายประจำ/ }).first().click();
    await expect(app.getByText("บิลและค่าสมาชิก")).toBeVisible();
  });

  test("spreads bills on different cycles over a month instead of adding them up", async ({ app, seed }) => {
    // The seed holds a monthly 419 and 599, a yearly 1,200 and a quarterly
    // 2,400, plus a paused 1,200. Adding the stored amounts gives 4,618 --
    // it is only the cycles that turn that into 1,918 a month.
    const yearly = seed.recurringExpenses
      .filter((item) => item.is_active)
      .reduce((sum, item) => sum + item.amount * (item.interval_unit === "week" ? 52 / item.interval_count : 12 / item.interval_count), 0);
    const card = app.locator(".debtor-detail-card");
    await expect(card).toContainText("เฉลี่ยต่อเดือน");
    await expect(card).toContainText(Math.round(yearly / 12).toLocaleString("th-TH"));
    await expect(card).toContainText(yearly.toLocaleString("th-TH"));
  });

  test("says how often each bill comes round, not just when", async ({ app }) => {
    const yearlyRow = app.locator(".debtor-page-list > .debtor-page-item").filter({ hasText: "โดเมนเว็บ" });
    await expect(yearlyRow).toContainText("ทุกปี");
    const quarterlyRow = app.locator(".debtor-page-list > .debtor-page-item").filter({ hasText: "ประกันรถ" });
    await expect(quarterlyRow).toContainText("ทุก 3 เดือน");
  });

  test("offers a cycle and a first billing date instead of a day of the month", async ({ app }) => {
    await app.locator(".debtor-page-list .debtor-main-button").first().click();
    const sheet = app.locator(".edit-sheet");
    await expect(sheet.locator(".date-shell input[type=date]")).toHaveCount(1);
    for (const cycle of ["ทุกสัปดาห์", "ทุกเดือน", "ทุก 3 เดือน", "ทุก 6 เดือน", "ทุกปี", "กำหนดเอง"]) {
      await expect(sheet.getByRole("radio", { name: cycle })).toBeVisible();
    }
  });

  test("opens the count and unit fields only for a cycle no preset names", async ({ app }) => {
    await app.locator(".debtor-page-list .debtor-main-button").first().click();
    const sheet = app.locator(".edit-sheet");
    await expect(sheet.locator(".cycle-custom")).toHaveCount(0);
    await sheet.getByRole("radio", { name: "กำหนดเอง" }).click();
    await expect(sheet.locator(".cycle-custom")).toBeVisible();
    await expect(sheet.getByLabel("หน่วยของรอบ")).toBeVisible();
  });
});
