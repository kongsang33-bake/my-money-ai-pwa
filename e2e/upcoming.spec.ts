import { test, expect, navigate } from "./fixture.ts";

// The "กำลังจะมา" tab: a window counted from today, not from the cycle. The
// fixture's bills are dated relative to today (billsOn in fixture.ts):
// Netflix in 2 days, ค่าเน็ต in 4, ประกันรถ in 21, โดเมนเว็บ in 40, and ฟิตเนส
// paused. Its one own-kind debtor, บัตรเครดิต, has nothing paid this cycle.
test.describe("upcoming", () => {
  const rowNames = (app: Parameters<typeof navigate>[0]) =>
    app.locator(".upcoming-view .upcoming-row h3").allTextContents();

  test("lists what falls in the next 30 days, soonest first, and nothing past it", async ({ app }) => {
    await navigate(app, "upcoming");
    const names = await rowNames(app);
    const bills = names.filter((name) => ["Netflix", "ค่าเน็ต", "ประกันรถ"].includes(name));
    expect(bills).toEqual(["Netflix", "ค่าเน็ต", "ประกันรถ"]);
    expect(names).not.toContain("โดเมนเว็บ");
    expect(names).not.toContain("ฟิตเนส");
  });

  test("says how far away each one is, from today", async ({ app }) => {
    await navigate(app, "upcoming");
    const netflix = app.locator(".upcoming-row", { has: app.locator("h3", { hasText: /^Netflix$/ }) });
    await expect(netflix.locator(".upcoming-kicker")).toHaveText("อีก 2 วัน");
  });

  test("puts an unpaid card under ตอนนี้, and opens the debts from it", async ({ app }) => {
    await navigate(app, "upcoming");
    const card = app.locator(".upcoming-row", { has: app.locator("h3", { hasText: "บัตรเครดิต" }) });
    await expect(card.locator(".upcoming-date")).toHaveText("ตอนนี้");
    await card.locator("button", { hasText: "ดูหนี้" }).click();
    await expect(app.locator(".view:not(.is-parked)")).toContainText("จัดการหนี้");
  });

  test("filters down to bills", async ({ app }) => {
    await navigate(app, "upcoming");
    await app.locator(".upcoming-chips button", { hasText: /^บิล$/ }).click();
    const names = await rowNames(app);
    expect(names).toContain("Netflix");
    expect(names).not.toContain("บัตรเครดิต");
  });

  test("keeps Wallets one tap away under อื่น ๆ, with a way back", async ({ app }) => {
    await navigate(app, "wallets");
    await expect(app.locator(".phone > .view.wallets-view")).not.toHaveClass(/\bis-parked\b/);
    await expect(app.locator(".bottom-nav > button").nth(4)).toHaveClass(/\bactive\b/);
    await app.locator(".view:not(.is-parked) .add-title > button:first-child").click();
    await expect(app.locator(".more-grid")).toBeVisible();
  });
});
