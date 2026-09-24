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
    await app.locator(".recent-tile, .entry-tappable").first().click();
    await expect(app.locator(".sheet-backdrop > .entry-detail-sheet")).toBeVisible();
    expect(await app.evaluate(() => (document.querySelector(".phone") as HTMLElement).style.overflowY)).toBe("hidden");

    await app.keyboard.press("Escape");
    await expect(app.locator(".sheet-backdrop > .entry-detail-sheet")).toHaveCount(0);
    expect(await app.evaluate(() => (document.querySelector(".phone") as HTMLElement).style.overflowY)).toBe("");
  });

  test("opens the account from ของฉัน, and goes back there rather than Home", async ({ app }) => {
    // "ของฉัน" starts with you: the profile row is the one way into the
    // account screen, and back returns to the list it came from.
    await navigate(app, "more");
    await expect(app.locator(".me-head")).toContainText("พรีวิว");
    await app.locator(".me-head").click();
    await expect(app.locator(".add-title h2")).toHaveText("บัญชีของฉัน");
    await app.locator(".view:not(.is-parked) .add-title > button:first-child").click();
    await expect(app.locator(".more-view .add-title h2")).toHaveText("ของฉัน");
  });

  test("flags the nearest bill at the top of ของฉัน and opens กำลังจะมา from it", async ({ app }) => {
    await navigate(app, "more");
    // Netflix is the fixture's nearest live bill, two days out.
    await expect(app.locator(".me-alert")).toContainText("Netflix");
    await expect(app.locator(".me-alert")).toContainText("ครบกำหนดอีก 2 วัน");
    await app.locator(".me-alert").click();
    await expect(app.locator(".upcoming-view")).toBeVisible();
  });

  test("opens ของฉัน from the topbar identity", async ({ app }) => {
    // There is no drawer any more: your own name and face in the topbar lead
    // to "ของฉัน", the one hub the account hangs off -- a screen, not an
    // overlay -- rather than straight into the profile form.
    await app.locator(".home-identity").click();
    await expect(app.locator(".more-view .add-title h2")).toHaveText("ของฉัน");
    await expect(app.locator(".sheet-backdrop")).toHaveCount(0);
    await expect(app.locator(".me-head")).toBeVisible();
    await expect(app.getByRole("button", { name: "ออกจากระบบ" })).toBeVisible();
  });


  // Every menu entry is a screen you navigate to, not a sheet that opens over
  // the tab you were on: it gets a back button, keeps the bottom nav live,
  // and does not scroll-lock the page behind it.
  //
  // Where it is reached from is the second thing checked here: every money
  // feature is under the nav's "ของฉัน", and the account's rows sit at its
  // foot (the topbar identity opens it too). They used to be split down no
  // line at all, across an
  // "อื่น ๆ" sheet and a hamburger drawer.
  const MENU_SCREENS = [
    { label: "งบประมาณ", heading: "งบประมาณต่อเดือน", from: "more" },
    { label: "ถาม AI เรื่องเงิน", heading: "ถาม AI เรื่องเงิน", from: "more" },
    { label: "ส่งออกรีพอร์ท", heading: "รีพอร์ท Excel / Sheets", from: "more" },
    { label: "รหัส PIN", heading: "เปิดใช้ PIN", from: "account" },
  ] as const;

  async function openMenuScreen(app: Parameters<typeof navigate>[0], label: string, from: "more" | "account") {
    if (from === "account") {
      await app.locator(".home-identity").click();
      await app.locator(".me-list .me-row", { hasText: label }).click();
      return;
    }
    await navigate(app, "more");
    const tile = app.locator(".more-grid button", { hasText: label });
    // Now that this is a page rather than a sheet, the last tile can sit at
    // the very end of .phone's scroll range. Playwright's click scrolls the
    // target again on every attempt, and against .phone's
    // scroll-behavior: smooth that re-starts a scroll each time, so the tile
    // never reads as "stable" even though it is sitting still (measured: the
    // same box for eight frames). Bring it into view and check it is there,
    // then fire the tap itself.
    await tile.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }));
    await expect(tile).toBeInViewport();
    await tile.dispatchEvent("click");
  }

  for (const { label, heading, from } of MENU_SCREENS) {
    test(`opens ${label} as its own screen`, async ({ app }) => {
      await openMenuScreen(app, label, from);

      await expect(app.locator(".add-title h2")).toHaveText(heading);
      // Whatever it was opened from has closed, and nothing modal took its
      // place -- these are screens, not sheets stacked over the last tab.
      await expect(app.locator(".sheet-backdrop")).toHaveCount(0);
      // A page, so the app scroller is still live and the nav still reachable.
      expect(await app.evaluate(() => (document.querySelector(".phone") as HTMLElement).style.overflowY)).toBe("");
      await expect(app.locator(".bottom-nav")).not.toHaveAttribute("inert", /.*/);

      // Back goes where the screen was opened from.
      await app.locator(".view:not(.is-parked) .add-title > button:first-child").click();
      // Both kinds are reached through "ของฉัน" now, so back lands there.
      await expect(app.locator(".more-grid")).toBeVisible();
    });
  }

  // "อื่น ๆ" used to open a sheet over whatever tab was showing, so a wrong
  // tap had to be undone with its close button up in the corner. It is a
  // screen now, and leaving it is tapping another tab, like every other tab.
  test("opens ของฉัน as a screen that another tab replaces", async ({ app }) => {
    await navigate(app, "more");
    await expect(app.locator(".more-view .add-title h2")).toHaveText("ของฉัน");
    await expect(app.locator(".sheet-backdrop")).toHaveCount(0);
    await expect(app.locator(".bottom-nav")).not.toHaveAttribute("inert", /.*/);
    await expect(app.locator(".bottom-nav > button").nth(4)).toHaveClass(/\bactive\b/);

    await navigate(app, "history");
    await expect(app.locator(".more-view")).toHaveCount(0);
    await expect(app.locator(".bottom-nav > button").nth(1)).toHaveClass(/\bactive\b/);
  });

  test("keeps อื่น ๆ selected inside the screens it lists", async ({ app }) => {
    await navigate(app, "more");
    await app.locator(".more-grid button", { hasText: "รายจ่ายประจำ" }).click();
    await expect(app.locator(".bottom-nav > button").nth(4)).toHaveClass(/\bactive\b/);
  });

  test("goes back to Home from a feature opened off a Home card", async ({ app }) => {
    // The same screen opened from Home's own card belongs to Home's trail,
    // not to a list the user never saw.
    await app.locator(".home-view .due-soon-rail .rail-head button", { hasText: /^จัดการ$/ }).click();
    await expect(app.locator(".add-title h2").first()).toBeVisible();
    await app.locator(".view:not(.is-parked) .add-title > button:first-child").click();
    await expect(app.locator(".phone > .view.home-view")).not.toHaveClass(/\bis-parked\b/);
  });

  test("opens History filtered to a category from Home's top-categories rail", async ({ app }) => {
    // The rail ranks this cycle's categories; a poster is a shortcut to that
    // category's entries, landing on the same filter the History bar sets --
    // shown as a removable chip, so it is undone the usual way.
    const poster = app.locator(".home-view .top-categories-rail .rank .poster").first();
    const category = (await poster.locator(".poster-title").textContent())!.trim();
    await poster.click();
    await expect(app.locator(".bottom-nav > button").nth(1)).toHaveClass(/\bactive\b/);
    await expect(app.locator(".history-filter-chips .filter-chip", { hasText: `หมวด ${category}` })).toBeVisible();
  });

  // The Ask-AI screen is a chat: composer pinned at the bottom, thread
  // scrolling above it, and the page itself not scrolling at all. Sending is
  // out of reach here (no Supabase, and /api/ask needs a key), so this covers
  // everything up to the send.
  test("lays Ask AI out as a chat screen", async ({ app }) => {
    await openMenuScreen(app, "ถาม AI เรื่องเงิน", "more");
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
    // ...and sits on it, not floating a hand's width above it (which is what
    // a height computed from 100dvh did on an iPhone).
    expect(box.navTop - box.composerBottom, "composer should sit just above the nav").toBeLessThanOrEqual(32);

    // Send stays disabled until there is something to send.
    const send = app.locator(".ask-ai-send");
    await expect(send).toBeDisabled();
    await app.locator(".ask-ai-input").fill("เดือนนี้ใช้เงินเท่าไร");
    await expect(send).toBeEnabled();
  });

  test("fills the composer from an example chip", async ({ app }) => {
    await openMenuScreen(app, "ถาม AI เรื่องเงิน", "more");
    await app.locator(".ask-ai-examples button").first().click();
    await expect(app.locator(".ask-ai-input")).not.toHaveValue("");
    await expect(app.locator(".ask-ai-send")).toBeEnabled();
  });

  test("grows the composer with a multi-line question", async ({ app }) => {
    await openMenuScreen(app, "ถาม AI เรื่องเงิน", "more");
    const input = app.locator(".ask-ai-input");
    const before = (await input.boundingBox())!.height;
    await input.fill("บรรทัดหนึ่ง\nบรรทัดสอง\nบรรทัดสาม");
    await expect.poll(async () => (await input.boundingBox())!.height).toBeGreaterThan(before);
  });

  test("keeps a menu screen reachable from the bottom nav", async ({ app }) => {
    await openMenuScreen(app, "งบประมาณ", "more");
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
    await expect(app.locator(".heatmap-month-controls .date-shell-text")).toHaveText(/2569$/);
  });

  test("moves between months in History", async ({ app }) => {
    await navigate(app, "history");
    const label = app.locator(".heatmap-panel").getByRole("combobox").or(app.locator(".heatmap-panel select")).first();
    const month = app.locator(".heatmap-month-controls .date-shell-text");
    const before = await month.innerText();
    await app.locator(".heatmap-panel button").first().click();
    await app.waitForTimeout(500);
    await expect(month).not.toHaveText(before);
    await expect(label.or(app.locator(".heatmap-panel"))).toBeVisible();
  });

  test("keeps the bottom nav reachable on every tab", async ({ app }) => {
    for (const tab of ["home", "history", "add", "upcoming", "wallets"] as const) {
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
  // the nav is laid out differently in each (a full-width bar on a phone, a
  // bar -50%-centred over the 560px column from 600px, a floating bar from
  // 900px).
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

    for (const tab of ["home", "history", "upcoming"] as const) {
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

    // A menu screen selects no tab: the pill fades out where it stands
    // rather than sliding off to somewhere arbitrary.
    await navigate(app, "more");
    await app.locator(".me-head").click();
    await app.waitForTimeout(400);
    expect((await geometry()).opacity).toBe(0);
  });
});
