import { test, expect, navigate, scrollAppTo } from "./fixture.ts";

const scrollTop = (page: Parameters<typeof navigate>[0]) =>
  page.evaluate(() => document.querySelector(".phone")!.scrollTop);

test.describe("navigation", () => {
  test("starts each tab at the top", async ({ app }) => {
    // .phone is one scroll container shared by every tab, so without an
    // explicit reset, scrolling to the bottom of History and tapping Home
    // landed halfway down Home.
    await navigate(app, "history");
    await scrollAppTo(app, 900);
    expect(await scrollTop(app), "History should be tall enough to scroll").toBeGreaterThan(100);

    await navigate(app, "home");
    await app.waitForTimeout(300);
    expect(await scrollTop(app)).toBeLessThan(20);
  });

  test("locks the page behind an open sheet", async ({ app }) => {
    // The lock has to target .phone: the document itself never scrolls here,
    // so the old <body> position:fixed lock was a no-op and the page went on
    // scrolling under the sheet.
    await app.locator(".activity-timeline-list button, .entry-tappable").first().click();
    await expect(app.locator(".sheet-backdrop > .edit-sheet")).toBeVisible();
    expect(await app.evaluate(() => (document.querySelector(".phone") as HTMLElement).style.overflowY)).toBe("hidden");

    await app.keyboard.press("Escape");
    await expect(app.locator(".sheet-backdrop > .edit-sheet")).toHaveCount(0);
    expect(await app.evaluate(() => (document.querySelector(".phone") as HTMLElement).style.overflowY)).toBe("");
  });

  test("opens and closes the side menu", async ({ app }) => {
    await app.locator(".menu-button").click();
    await expect(app.locator(".side-menu")).toBeVisible();
    await app.locator(".side-menu-backdrop").click({ position: { x: 8, y: 400 } });
    await expect(app.locator(".side-menu")).toHaveCount(0);
  });


  // Every side-menu entry is a screen you navigate to, not a sheet that opens
  // over the tab you were on: it gets a back button, keeps the bottom nav
  // live, and does not scroll-lock the page behind it.
  const MENU_SCREENS = [
    { label: "งบประมาณ", heading: "งบประมาณต่อเดือน" },
    { label: "ถาม AI เรื่องเงิน", heading: "ถาม AI เรื่องเงิน" },
    { label: "ส่งออกรีพอร์ท", heading: "รีพอร์ท Excel / Sheets" },
    { label: "จัดการโปรไฟล์", heading: "จัดการโปรไฟล์" },
    { label: "รหัส PIN", heading: "เปิดใช้ PIN" },
  ];

  for (const { label, heading } of MENU_SCREENS) {
    test(`opens ${label} as its own screen`, async ({ app }) => {
      await app.locator(".menu-button").click();
      await app.locator(".side-menu-list button", { hasText: label }).click();

      await expect(app.locator(".add-title h2")).toHaveText(heading);
      // The drawer is gone and nothing modal took its place.
      await expect(app.locator(".side-menu")).toHaveCount(0);
      await expect(app.locator(".sheet-backdrop")).toHaveCount(0);
      // A page, so the app scroller is still live and the nav still reachable.
      expect(await app.evaluate(() => (document.querySelector(".phone") as HTMLElement).style.overflowY)).toBe("");
      await expect(app.locator(".bottom-nav")).not.toHaveAttribute("inert", /.*/);

      await app.locator(".add-title > button:first-child").click();
      await expect(app.locator(".hero-wallet-card, .wallet-grid")).toBeVisible();
    });
  }

  // The Ask-AI screen is a chat: composer pinned at the bottom, thread
  // scrolling above it, and the page itself not scrolling at all. Sending is
  // out of reach here (no Supabase, and /api/ask needs a key), so this covers
  // everything up to the send.
  test("lays Ask AI out as a chat screen", async ({ app }) => {
    await app.locator(".menu-button").click();
    await app.locator(".side-menu-list button", { hasText: "ถาม AI เรื่องเงิน" }).click();
    await expect(app.locator(".ask-ai-composer")).toBeVisible();

    const box = await app.evaluate(() => {
      const phone = document.querySelector(".phone") as HTMLElement;
      const composer = document.querySelector(".ask-ai-composer") as HTMLElement;
      const nav = document.querySelector(".bottom-nav") as HTMLElement;
      return {
        overflow: phone.scrollHeight - phone.clientHeight,
        composerBottom: composer.getBoundingClientRect().bottom,
        navTop: nav.getBoundingClientRect().top,
      };
    });
    // The composer holds the bottom edge above the nav instead of being
    // pushed off it by a page that grows.
    expect(box.overflow, "chat screen should not scroll the page").toBeLessThanOrEqual(1);
    expect(box.composerBottom).toBeLessThanOrEqual(box.navTop);

    // Send stays disabled until there is something to send.
    const send = app.locator(".ask-ai-send");
    await expect(send).toBeDisabled();
    await app.locator(".ask-ai-input").fill("เดือนนี้ใช้เงินเท่าไร");
    await expect(send).toBeEnabled();
  });

  test("fills the composer from an example chip", async ({ app }) => {
    await app.locator(".menu-button").click();
    await app.locator(".side-menu-list button", { hasText: "ถาม AI เรื่องเงิน" }).click();
    await app.locator(".ask-ai-examples button").first().click();
    await expect(app.locator(".ask-ai-input")).not.toHaveValue("");
    await expect(app.locator(".ask-ai-send")).toBeEnabled();
  });

  test("grows the composer with a multi-line question", async ({ app }) => {
    await app.locator(".menu-button").click();
    await app.locator(".side-menu-list button", { hasText: "ถาม AI เรื่องเงิน" }).click();
    const input = app.locator(".ask-ai-input");
    const before = (await input.boundingBox())!.height;
    await input.fill("บรรทัดหนึ่ง\nบรรทัดสอง\nบรรทัดสาม");
    await expect.poll(async () => (await input.boundingBox())!.height).toBeGreaterThan(before);
  });

  test("keeps a menu screen reachable from the bottom nav", async ({ app }) => {
    await app.locator(".menu-button").click();
    await app.locator(".side-menu-list button", { hasText: "งบประมาณ" }).click();
    await expect(app.locator(".add-title h2")).toHaveText("งบประมาณต่อเดือน");

    // Tapping a nav tab from a menu screen leaves it, the way it would from
    // any other tab -- a sheet would have swallowed the tap instead.
    await navigate(app, "history");
    await expect(app.locator(".add-title h2")).not.toHaveText("งบประมาณต่อเดือน");
  });

  // MonthField covers <input type="month"> the way DateField covers dates:
  // the OS renders "September 2026", the app wants "กันยายน 2569".
  test("shows History's month pickers in Thai", async ({ app }) => {
    await navigate(app, "history");
    await expect(app.locator(".summary-head .date-shell-text")).toHaveText(/2569$/);
    await expect(app.locator(".heatmap-month-controls .date-shell-text")).toHaveText(/2569$/);
  });

  test("moves between months in History", async ({ app }) => {
    await navigate(app, "history");
    const label = app.locator(".heatmap-panel").getByRole("combobox").or(app.locator(".heatmap-panel select")).first();
    const before = await app.locator(".summary-panel").innerText();
    await app.locator(".heatmap-panel button").first().click();
    await app.waitForTimeout(500);
    await expect(app.locator(".summary-panel")).not.toHaveText(before);
    await expect(label.or(app.locator(".heatmap-panel"))).toBeVisible();
  });

  test("keeps the bottom nav reachable on every tab", async ({ app }) => {
    for (const tab of ["home", "history", "add", "wallets"] as const) {
      await navigate(app, tab);
      await expect(app.locator(".bottom-nav")).toBeVisible();
    }
  });

  // One pill slides between the tabs instead of a highlight per button. Where
  // it lands is arithmetic on the grid rather than a measurement of the active
  // item -- the version that measured stopped following the tab on iOS while
  // passing everywhere here -- so what is worth pinning is that the arithmetic
  // and the grid still agree: same centre, same width, on the tab that is
  // actually active. The three projects run this at their three widths, and
  // the nav is laid out differently in each (absolute on mobile, fixed and
  // -50%-centred above 900px).
  test("parks the sliding pill on the active tab", async ({ app }) => {
    const geometry = () => app.evaluate(() => {
      const pill = document.querySelector(".nav-indicator") as HTMLElement;
      const item = document.querySelector(".bottom-nav button.active .nav-item") as HTMLElement | null;
      const label = item?.querySelector(".nav-label") as HTMLElement | undefined;
      const box = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.x, right: rect.right, centreX: rect.x + rect.width / 2, centreY: rect.y + rect.height / 2 };
      };
      return {
        opacity: Number(getComputedStyle(pill).opacity),
        pill: box(pill),
        item: item && box(item),
        label: label && box(label),
      };
    });

    for (const tab of ["home", "history", "wallets"] as const) {
      await navigate(app, tab);
      await app.waitForTimeout(400);
      const { opacity, pill, item, label } = await geometry();
      expect(item, `${tab} should have an active tab`).not.toBeNull();
      expect(opacity).toBe(1);
      expect(Math.abs(pill.centreX - item!.centreX), `${tab} pill centred on the label`).toBeLessThan(1.5);
      expect(Math.abs(pill.centreY - item!.centreY), `${tab} pill centred vertically`).toBeLessThan(1.5);
      // ...and wide enough to actually be behind it, not a capsule the label
      // pokes out of.
      expect(label!.left, `${tab} label inside the pill`).toBeGreaterThanOrEqual(pill.left - 1);
      expect(label!.right, `${tab} label inside the pill`).toBeLessThanOrEqual(pill.right + 1);
    }

    // A side-menu screen selects no tab: the pill fades out where it stands
    // rather than sliding off to somewhere arbitrary.
    await app.locator(".menu-button").click();
    await app.locator(".side-menu-list button", { hasText: "งบประมาณ" }).click();
    await app.waitForTimeout(400);
    expect((await geometry()).opacity).toBe(0);
  });
});
