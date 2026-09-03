import { test, expect, buildSeed, navigate, openApp } from "./fixture.ts";

test.describe("AI composer", () => {
  // Specs taking `app` get the standard fixture already on the Add tab; the
  // one that needs a different seed takes `page` instead and opens its own.
  test.beforeEach(async ({ app }, testInfo) => {
    if (testInfo.title.includes("plain example chip")) return;
    await navigate(app, "add");
    await expect(app.locator(".ai-input-wrap textarea")).toBeVisible();
  });

  test("keeps what was typed when the parent re-renders", async ({ app }) => {
    // The composer owns its own text so a keystroke does not re-render the
    // whole Add tab. The flip side of that ownership is this: state living in
    // a child is easy to lose by remounting it, so changing something the
    // parent owns (the date) must not wipe the draft.
    const textarea = app.locator(".ai-input-wrap textarea");
    await textarea.fill("กินข้าว 120 บาท");
    await app.locator(".entry-date-picker input[type=date]").fill("2026-08-15");
    await app.waitForTimeout(300);
    await expect(textarea).toHaveValue("กินข้าว 120 บาท");
    await expect(app.locator(".entry-date-picker input[type=date]")).toHaveValue("2026-08-15");
  });

  test("appends a plain example chip to the draft", async ({ page }) => {
    // Needs its own seed. aiSuggestions fills the four chip slots from repeated
    // history first and only falls back to the built-in examples for whatever
    // is left over -- so with the standard fixture (seven titles, 348 entries)
    // every chip is history-derived and the plain-chip path is unreachable.
    // Giving each entry a unique title empties the history list.
    const seed = buildSeed();
    seed.entries = seed.entries.map((entry, index) => ({ ...entry, title: `รายการ ${index}` }));
    await openApp(page, seed);
    await navigate(page, "add");

    const textarea = page.locator(".ai-input-wrap textarea");
    await textarea.fill("กาแฟ 60");
    await page.locator(".ai-suggestions .quick-chip").first().click();
    const after = await textarea.inputValue();
    expect(after).toContain("กาแฟ 60");
    expect(after.split("\n").length, "the example should be appended on its own line").toBeGreaterThan(1);
    await expect(page.locator(".review .draft")).toHaveCount(0);
  });

  test("a history-derived chip adds a draft row and leaves the text alone", async ({ app }) => {
    // Chips come in two kinds and take different paths: a plain one seeds the
    // textarea, one derived from a repeated entry books the entry outright.
    const textarea = app.locator(".ai-input-wrap textarea");
    await textarea.fill("อย่าลบข้อความนี้");
    await app.locator(".ai-suggestions .quick-chip").first().click();
    await expect(app.locator(".review .draft")).toHaveCount(1);
    await expect(textarea).toHaveValue("อย่าลบข้อความนี้");
  });

  // DateField hides the native control's own text (which the OS renders in
  // the browser's locale, not the app's) and paints a Thai date over it. The
  // two are separate elements, so the risk is they drift: the input holds a
  // date the overlay is not showing.
  test("shows the draft's date in Thai and keeps it in step with the input", async ({ app }) => {
    await app.locator(".ai-suggestions .quick-chip").first().click();
    await app.locator(".draft-details-toggle").first().click();

    const shell = app.locator(".draft .date-shell").first();
    await expect(shell.locator(".date-shell-text")).toBeVisible();

    await shell.locator('input[type="date"]').fill("2026-01-15");
    await expect(shell.locator(".date-shell-text")).toHaveText("15 ม.ค. 2569");
    await expect(shell.locator('input[type="date"]')).toHaveValue("2026-01-15");
  });

  test("keeps the analyse button disabled until there is something to analyse", async ({ app }) => {
    const analyse = app.getByRole("button", { name: "ให้ AI แยกรายการ" });
    await expect(analyse).toBeDisabled();
    await app.locator(".ai-input-wrap textarea").fill("ค่ากาแฟ 60");
    await expect(analyse).toBeEnabled();
    await app.locator(".ai-input-wrap textarea").fill("   ");
    await expect(analyse, "whitespace is not input").toBeDisabled();
  });

  test("switches to the manual form and back", async ({ app }) => {
    await app.getByRole("button", { name: "เขียนเอง" }).click();
    await expect(app.locator(".ai-input-wrap")).toHaveCount(0);
    await app.getByRole("button", { name: "ให้ AI ช่วยจด" }).click();
    await expect(app.locator(".ai-input-wrap textarea")).toBeVisible();
  });
});
