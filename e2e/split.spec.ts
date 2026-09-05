import { test, expect, navigate, openApp, seedDraft, buildSeed } from "./fixture.ts";

// The review step of the Add tab: what the AI parsed, before it is saved.
// Seeded straight into the drafts list (PreviewSeed.drafts), because the way
// there in the app is a Gemini call the suite has no key for.
//
// Nothing here saves. Every mutation in app/page.tsx opens with
// `if (!supabase) return`, so a tap on บันทึก would be a no-op that proves
// nothing -- the two-row expansion a card-funded split saves as is covered by
// unit tests on expandCardFundedDraft instead.
test.describe("split review", () => {
  const openWithDraft = async (page: Parameters<typeof openApp>[0], draft = seedDraft()) => {
    await openApp(page, { ...buildSeed(), drafts: [draft] });
    await navigate(page, "add");
  };

  test("splits the bill evenly until told otherwise", async ({ page }) => {
    await openWithDraft(page);

    const share = page.locator(".draft-split-share .amount-input");
    await expect(share).toHaveValue("81.5");
    await expect(page.locator(".draft-split-people-count")).toHaveValue("2");
    await expect(page.locator(".draft-result .impact-row")).toContainText("81.5");
  });

  test("moves the debt when the share changes, without changing the bill", async ({ page }) => {
    await openWithDraft(page);

    await page.locator(".draft-split-share .amount-input").fill("100");
    await page.locator(".draft-split-share .amount-input").blur();

    // The whole 163 still left the wallet; only who owes what moved.
    await expect(page.locator(".draft-result .impact-row")).toContainText("163");
    await expect(page.locator(".draft-result .impact-row")).toContainText("100");
    await expect(page.locator(".draft-split-summary")).toContainText("63");
  });

  test("counts the table up one head at a time", async ({ page }) => {
    await openWithDraft(page);

    await expect(page.locator(".draft-split-people-count")).toHaveValue("2");
    await page.locator("button[aria-label='เพิ่มจำนวนคนที่หาร']").click();
    // 163 three ways: 54.33 each, so 108.67 comes back.
    await expect(page.locator(".draft-split-share .amount-input")).toHaveValue("108.67");
    await expect(page.locator(".draft-split-summary")).toContainText("54.33");
  });

  test("takes a headcount a party actually needs, past the old ÷2 ÷3 ÷4", async ({ page }) => {
    await openWithDraft(page, seedDraft({ amount: 1200 }));

    await page.locator(".draft-split-people-count").fill("6");
    // 1200 six ways: 200 each, 1000 owed back.
    await expect(page.locator(".draft-split-share .amount-input")).toHaveValue("1000");
    await expect(page.locator(".draft-split-summary")).toContainText("200");
    await expect(page.locator(".draft-result .impact-row")).toContainText("1,000");
  });

  test("empties the headcount when the share is one the user typed", async ({ page }) => {
    await openWithDraft(page);

    await page.locator(".draft-split-share .amount-input").fill("100");
    await expect(page.locator(".draft-split-people-count")).toHaveValue("");
  });

  test("breaks a party into one debt per person before it is saved", async ({ page }) => {
    // The whole reason this exists: "ค่าเบียร์ 1500 หาร 5 คน มีอ้อน แบงค์ วิน
    // พี่พัก ผม" used to land as one lump owed by "เพื่อน".
    await openWithDraft(page, seedDraft({ title: "ค่าเบียร์", amount: 1500, debtor_name: "อ้อน, แบงค์, วิน, พี่พัก" }));

    const breakdown = page.locator(".draft-split-people-list");
    await expect(breakdown).toContainText("หารกัน 5 คน");
    await expect(breakdown.locator("li")).toHaveCount(5);
    for (const name of ["อ้อน", "แบงค์", "วิน", "พี่พัก"]) {
      await expect(breakdown.locator("li", { hasText: name }).locator(".amount-input")).toHaveValue("300");
    }
    await expect(breakdown.locator("li.is-self").locator(".amount-input")).toHaveValue("300");
    await expect(breakdown).toContainText("แยกเป็น 5 รายการ");

    // The single-person share controls step aside; the list decides now.
    await expect(page.locator(".draft-split-share")).toHaveCount(0);
    await expect(page.locator(".draft-result .impact-row")).toContainText("1,200");
  });

  test("divides what is left when the user pins their own share", async ({ page }) => {
    // "ค่าเบียร์ 1000 ผมออก 500 ส่วนที่เหลือหาร 3 คน มีอ้อน แบงค์ วิน"
    await openWithDraft(page, seedDraft({ title: "ค่าเบียร์", amount: 1000, debtor_name: "อ้อน, แบงค์, วิน" }));

    const rows = page.locator(".draft-split-people-list li");
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0).locator(".amount-input")).toHaveValue("250");

    await page.locator(".draft-split-people-list li.is-self .amount-input").fill("500");
    await expect(rows.nth(0).locator(".amount-input")).toHaveValue("166.67");
    await expect(rows.nth(1).locator(".amount-input")).toHaveValue("166.67");
    // The odd satang lands on the last open slot, so the parts still add up.
    await expect(rows.nth(2).locator(".amount-input")).toHaveValue("166.66");
    await expect(page.locator(".draft-result .impact-row")).toContainText("500");
  });

  test("re-divides around one person's pinned amount, and can undo it", async ({ page }) => {
    await openWithDraft(page, seedDraft({ title: "ค่าเบียร์", amount: 1000, debtor_name: "อ้อน, แบงค์, วิน" }));

    const rows = page.locator(".draft-split-people-list li");
    await rows.nth(0).locator(".amount-input").fill("400");
    await expect(rows.nth(1).locator(".amount-input")).toHaveValue("200");
    await expect(rows.nth(3).locator(".amount-input")).toHaveValue("200");

    await page.locator(".draft-split-people-head button", { hasText: "หารเท่ากัน" }).click();
    await expect(rows.nth(0).locator(".amount-input")).toHaveValue("250");
  });

  test("keeps the share controls for a bill split with one person", async ({ page }) => {
    await openWithDraft(page);

    await expect(page.locator(".draft-split-people-list")).toHaveCount(0);
    await expect(page.locator(".draft-split-share")).toHaveCount(1);
  });

  test("names the people it is about to create debts for", async ({ page }) => {
    await openWithDraft(page, seedDraft({ debtor_name: "อ้อน, แบงค์" }));

    await expect(page.locator(".draft-debtor-field")).toContainText("ลูกหนี้ใหม่ · อ้อน, แบงค์");
  });

  test("offers a credit card as the thing that paid, not just a wallet", async ({ page }) => {
    // The bug this whole feature came from: a split could only be funded by a
    // wallet, so a dinner split and paid on a credit card could not be
    // recorded at all.
    await openWithDraft(page);

    const funding = page.locator(".draft-funding select");
    await expect(funding).toContainText("บัตรเครดิต");
    await funding.selectOption("card:บัตรเครดิต");

    // The preview turns into the two rows the save will write: the charge on
    // the card, and the share on the person.
    const result = page.locator(".draft-result .impact-row");
    await expect(result).toContainText("บัตรเครดิต");
    await expect(result).toContainText("จูน");
    await expect(result).toContainText("163");
    await expect(result).toContainText("81.5");
    // ...and the wallet picker steps aside, since no wallet is paying.
    await page.locator(".draft-details-toggle").click();
    await expect(page.locator(".draft-grid-secondary select")).toHaveCount(0);
  });

  test("keeps the same headcount when the amount changes", async ({ page }) => {
    await openWithDraft(page);

    await page.locator(".draft-split-people-count").fill("4");
    await page.locator(".draft-grid .amount-input").first().fill("200");
    await expect(page.locator(".draft-split-people-count")).toHaveValue("4");
    await expect(page.locator(".draft-split-share .amount-input")).toHaveValue("150");
  });

  test("leaves a share the user set alone when the amount changes", async ({ page }) => {
    await openWithDraft(page);

    await page.locator(".draft-split-share .amount-input").fill("100");
    await page.locator(".draft-grid .amount-input").first().fill("200");
    await expect(page.locator(".draft-split-share .amount-input")).toHaveValue("100");
  });
});
