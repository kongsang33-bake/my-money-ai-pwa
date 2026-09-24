import { test, expect, navigate, openApp, seedDraft, buildSeed } from "./fixture.ts";

// The review step reads before it edits: a draft is a summary card first,
// opened only to change something, and the drafts that want a look say so.
// Seeded through PreviewSeed.drafts for the same reason split.spec.ts is --
// the real way there is a Gemini call the suite has no key for -- and nothing
// here saves (see the note at the top of that file).
test.describe("AI review", () => {
  const plain = seedDraft({ id: "plain", title: "ข้าวมันไก่", amount: 60, transaction_type: "personal_expense", debtor_name: "" });
  const party = seedDraft({ id: "party", title: "ค่าเบียร์", amount: 1500, debtor_name: "อ้อน, แบงค์, วิน, พี่พัก" });
  const transfer = seedDraft({ id: "transfer", title: "โอนเข้าออม", amount: 2000, transaction_type: "transfer", debtor_name: "", transfer_to_wallet_id: null });

  test("folds a draft with nothing to check into a summary that says what it does", async ({ page }) => {
    await openApp(page, { ...buildSeed(), drafts: [plain] });
    await navigate(page, "add");

    const card = page.locator(".draft").first();
    await expect(card.locator(".draft-summary")).toHaveAttribute("aria-expanded", "false");
    await expect(card.locator(".draft-editor")).toHaveCount(0);
    // Every value the AI guessed is on the folded card...
    await expect(card.locator(".draft-facts")).toContainText("วันนี้");
    await expect(card.locator(".draft-facts")).toContainText("บัญชีหลัก");
    // ...and so is what the save will do, in words.
    await expect(card.locator(".draft-effects")).toContainText("จ่ายจาก บัญชีหลัก ฿ 60");

    await card.locator(".draft-summary").click();
    await expect(card.locator(".draft-editor")).toBeVisible();
    await card.locator(".draft-done").click();
    await expect(card.locator(".draft-editor")).toHaveCount(0);
  });

  test("opens the drafts that want a look, and counts them", async ({ page }) => {
    await openApp(page, { ...buildSeed(), drafts: [plain, party] });
    await navigate(page, "add");

    await expect(page.locator(".review-head p")).toContainText("ต้องเช็ก 1");
    await expect(page.locator(".draft").nth(0).locator(".draft-editor")).toHaveCount(0);
    const open = page.locator(".draft").nth(1);
    await expect(open.locator(".draft-editor")).toBeVisible();
    await expect(open.locator(".draft-attention")).toContainText("ชื่อใหม่");
    await expect(open.locator(".draft-effects")).toContainText("4 คนติดคุณคนละ ฿ 300");
  });

  test("keeps a draft that blocks the save open, and the save bar points at it", async ({ page }) => {
    await openApp(page, { ...buildSeed(), drafts: [plain, party, transfer] });
    await navigate(page, "add");

    const blocked = page.locator(".draft[data-draft-id='transfer']");
    await expect(blocked.locator(".draft-attention .is-blocking")).toContainText("ยังไม่ได้เลือกกระเป๋าปลายทาง");
    // Tapping the summary does not fold away something the save is waiting on.
    await blocked.locator(".draft-summary").click();
    await expect(blocked.locator(".draft-editor")).toBeVisible();

    const bar = page.locator(".review-savebar");
    await expect(bar.locator("button.save")).toBeDisabled();
    await expect(bar).toContainText("ต้องแก้อีก 1 รายการก่อนบันทึก");
    await bar.getByRole("button", { name: "ไปที่รายการ" }).click();
    await expect(blocked.locator(".draft-summary")).toBeFocused();

    await blocked.locator("select").filter({ hasText: "เลือกกระเป๋าปลายทาง" }).selectOption({ index: 2 });
    await expect(bar.locator("button.save")).toBeEnabled();
    await expect(bar).not.toContainText("ต้องแก้อีก");
  });

  test("shows each detail's value on its own chip, and opens only that field", async ({ page }) => {
    // No debtors, so there is no "จ่ายด้วย" picker and the wallet gets a chip
    // of its own -- where there is one, it already lists every wallet.
    await openApp(page, { ...buildSeed(), debtors: [], drafts: [plain] });
    await navigate(page, "add");
    await page.locator(".draft-summary").click();

    const chips = page.locator(".draft-meta-chip");
    await expect(chips.filter({ hasText: "วันที่" })).toContainText("วันนี้");
    await expect(chips.filter({ hasText: "กระเป๋า" })).toContainText("บัญชีหลัก");
    await expect(chips.filter({ hasText: "หมายเหตุ" })).toContainText("เพิ่ม");
    await expect(page.locator(".draft-grid-secondary")).toHaveCount(0);

    await chips.filter({ hasText: "หมายเหตุ" }).click();
    await page.locator(".draft-grid-secondary input").fill("กับที่บ้าน");
    await expect(chips.filter({ hasText: "หมายเหตุ" })).toContainText("กับที่บ้าน");
    // Only the field that was asked for opened.
    await expect(page.locator(".draft-grid-secondary select")).toHaveCount(0);
    await expect(page.locator(".draft-grid-secondary .date-shell")).toHaveCount(0);
  });
});
