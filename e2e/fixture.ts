import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { normalizeEntry } from "../lib/money.ts";
import { localDateInput } from "../lib/format.ts";
import type { Draft, Entry, PreviewSeed } from "../lib/types.ts";

// The seeded state every spec runs against, and the helpers for getting into
// the app with it.
//
// This is test-only on purpose: application code never imports this file, so
// there is no module a bundler could carry into a production build. The app's
// side of the arrangement is ~15 lines in app/page.tsx that read
// window.__NUBTANG_PREVIEW__ and are compiled away unless the build sets
// NEXT_PUBLIC_ENABLE_PREVIEW=1 (see next.config.ts, and
// `npm run verify:preview-stripped`).
//
// The numbers mirror the real account's shape -- ~350 entries over eight
// months, three wallets, two debtors -- so that a render timing measured here
// means something, and they are derived from a fixed clock so two runs get
// byte-identical data and a spec can assert on a total.
//
// WHAT THIS SUITE CANNOT REACH. The seed is local state only; there is no
// Supabase client, because the suite runs without credentials. Every mutation
// in app/page.tsx opens with `if (!supabase) return`, so saving, editing,
// deleting, PIN changes and anything else that writes are all no-ops here --
// the tap lands and nothing happens, including the confirm dialogs some of
// them raise first. A spec written against one of those will pass or fail for
// reasons unrelated to what it claims to check.
//
// So the boundary is: everything up to a write. Rendering, navigation,
// theming, scroll behaviour, local component state, code-split chunks and the
// error boundary are real here; the mutations are covered by unit tests on
// the pure functions they delegate to (planEntryUpdate,
// describeWalletDeletion, recordFailedPinAttempt, ...). Moving the boundary
// means giving the fixture a stub Supabase client, which is a bigger piece of
// work than it looks and should be a deliberate decision, not something
// smuggled in with a new spec.

const USER_ID = "preview-user";
const CATEGORIES = ["อาหาร", "บิลประจำ", "เดินทาง", "บันเทิง", "ของใช้", "สุขภาพ"];
const TITLES = ["กาแฟ", "ข้าวเที่ยง", "ค่าไฟ", "แท็กซี่", "ดูหนัง", "ซื้อของเข้าบ้าน", "หาหมอ"];
const ENTRY_COUNT = 348;
const SPREAD_DAYS = 240;
const INCOME_EVERY = 58;
const SALARY = 45000;

function seedEntry(index: number, now: number): Entry {
  const isIncome = index % INCOME_EVERY === 0;
  const daysAgo = Math.floor((index * SPREAD_DAYS) / ENTRY_COUNT);
  return normalizeEntry({
    id: `preview-e${index}`,
    title: isIncome ? "เงินเดือน" : TITLES[index % TITLES.length],
    category: isIncome ? "รายได้" : CATEGORIES[index % CATEGORIES.length],
    amount: isIncome ? SALARY : 80 + (index % 17) * 55,
    transaction_type: isIncome ? "income" : "personal_expense",
    occurred_at: new Date(now - daysAgo * 86400000).toISOString(),
    wallet_id: "preview-w1",
  }, false);
}

export function buildSeed(now = Date.now()): PreviewSeed {
  const today = new Date(now);
  // A recurring bill's schedule is an anchor date now, so these are real dates
  // rather than days of the month -- which also lets the seed hold a bill that
  // has not started yet and one that runs yearly.
  const billsOn = (days: number) =>
    localDateInput(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days));

  return {
    user: { id: USER_ID, email: "preview@example.com", user_metadata: { full_name: "พรีวิว" } },
    profile: {
      user_id: USER_ID, nickname: "พรีวิว", app_icon: "P", app_icon_image: "",
      month_start_day: 1, pin_hash: null, pin_salt: null,
      net_worth_formula: "full", net_worth_hide_card: false, ai_context: "",
    },
    entries: Array.from({ length: ENTRY_COUNT }, (_, index) => seedEntry(index, now)),
    wallets: [
      { id: "preview-w1", user_id: USER_ID, name: "บัญชีหลัก", tag: "cash", balance: 42500, icon: null, icon_color: null, is_default: true },
      { id: "preview-w2", user_id: USER_ID, name: "เงินออม", tag: "savings", balance: 128000, icon: null, icon_color: null, is_default: false },
      { id: "preview-w3", user_id: USER_ID, name: "กระเป๋าย่อย", tag: "petty", balance: 3200, icon: null, icon_color: null, is_default: false },
    ],
    debtors: [
      { id: "preview-d1", user_id: USER_ID, name: "เอก", note: null, opening_balance: 1500, kind: "lend", monthly_installment: null, total_installments: null, credit_limit: null, credit_card_min_payment_percent: null, icon: null, icon_color: null },
      { id: "preview-d2", user_id: USER_ID, name: "บัตรเครดิต", note: null, opening_balance: 8200, kind: "own", monthly_installment: 2000, total_installments: null, credit_limit: 50000, credit_card_min_payment_percent: 10, icon: null, icon_color: null },
    ],
    recurringExpenses: [
      // Netflix is charged to the card and ค่าเน็ต comes out of a wallet, so
      // both funding shapes -- and the two-row save the card one expands to --
      // are on screen whenever the due-soon tile renders.
      { id: "preview-r1", user_id: USER_ID, name: "Netflix", amount: 419, anchor_date: billsOn(2), interval_unit: "month", interval_count: 1, icon: null, icon_color: null, wallet_id: null, funding_card_name: "บัตรเครดิต", is_active: true },
      { id: "preview-r2", user_id: USER_ID, name: "ค่าเน็ต", amount: 599, anchor_date: billsOn(4), interval_unit: "month", interval_count: 1, icon: null, icon_color: null, wallet_id: "preview-w1", funding_card_name: null, is_active: true },
      // Paused, and deliberately due sooner than either live bill: if the
      // filters that keep a cancelled subscription out of the due-soon card
      // and the totals ever come off, this is the row that shows it.
      { id: "preview-r3", user_id: USER_ID, name: "ฟิตเนส", amount: 1200, anchor_date: billsOn(1), interval_unit: "month", interval_count: 1, icon: null, icon_color: null, wallet_id: "preview-w1", funding_card_name: null, is_active: false },
      // A yearly and a quarterly bill, so every screen that adds subscriptions
      // up has to divide them down to a month rather than counting 2,400 as a
      // monthly cost -- and so the cycle label has something to say beyond
      // "ทุกเดือน".
      { id: "preview-r4", user_id: USER_ID, name: "โดเมนเว็บ", amount: 1200, anchor_date: billsOn(40), interval_unit: "month", interval_count: 12, icon: null, icon_color: null, wallet_id: null, funding_card_name: "บัตรเครดิต", is_active: true },
      { id: "preview-r5", user_id: USER_ID, name: "ประกันรถ", amount: 2400, anchor_date: billsOn(21), interval_unit: "month", interval_count: 3, icon: null, icon_color: null, wallet_id: "preview-w1", funding_card_name: null, is_active: true },
    ],
    goals: [
      { id: "preview-g1", name: "เที่ยวญี่ปุ่น", target: 80000, saved: 32000, deadline: new Date(now + 120 * 86400000).toISOString().slice(0, 10) },
    ],
    budgets: { "อาหาร": 6000, "บันเทิง": 2000, "เดินทาง": 3000 },
  };
}

/**
 * An account with nothing in it: the state a real user is in the first time
 * they sign in, and the only one that reaches the setup gate. Same user and
 * profile as buildSeed so the two differ in exactly one thing -- whether
 * there is any money data -- which is what app/page.tsx decides on.
 */
export function buildEmptySeed(): PreviewSeed {
  const full = buildSeed();
  return { ...full, entries: [], wallets: [], debtors: [], recurringExpenses: [], goals: [], budgets: {} };
}

/**
 * A row sitting in "ตรวจสอบก่อนบันทึก", as the AI-parse step would have left
 * it. Seeded through PreviewSeed.drafts because the real route there needs a
 * Gemini key the suite does not have -- see the note on that field.
 */
export function seedDraft(overrides: Partial<Draft> = {}): Draft {
  return normalizeEntry({
    id: "preview-draft-1",
    title: "ข้าวมื้อเย็น",
    category: "อาหาร",
    amount: 163,
    transaction_type: "split_half",
    debtor_name: "จูน",
    occurred_at: new Date().toISOString(),
    wallet_id: "preview-w1",
    ...overrides,
  }, false) as Draft;
}

/**
 * Opens a draft card in "ตรวจสอบก่อนบันทึก" for editing. A draft starts folded
 * to its summary unless it has something to check (draftAttention), so a spec
 * that edits one cannot assume which -- this opens it either way.
 */
export async function openDraft(page: Page, index = 0) {
  const summary = page.locator(".draft-summary").nth(index);
  if (await summary.getAttribute("aria-expanded") !== "true") await summary.click();
  await page.locator(".draft").nth(index).locator(".draft-editor").waitFor();
}

export const NAV = { home: 0, history: 1, add: 2, upcoming: 3, more: 4 } as const;

/** The wallets screen's tile under "อื่น ๆ" -- how Wallets is reached since it left the nav. */
export const WALLETS_TILE = { selector: ".more-grid button", text: "กระเป๋าเงิน" } as const;

/**
 * Clicks a bottom-nav item from inside the page. Playwright's own click does
 * an actionability check that scrolls and hit-tests first, which is fine for
 * asserting behaviour but muddies anything timing-related -- and the nav is
 * fixed, so the check buys nothing here.
 *
 * "wallets" is not a nav slot any more ("กำลังจะมา" took it): it goes through
 * "อื่น ๆ" and its tile, the way a user now gets there.
 */
export async function navigate(page: Page, tab: keyof typeof NAV | "wallets") {
  if (tab === "wallets") {
    await navigate(page, "more");
    // MoreView is code-split, so its grid can arrive a moment after the tab.
    await page.waitForFunction(({ selector, text }) =>
      [...document.querySelectorAll(selector)].some((node) => node.textContent?.includes(text)), WALLETS_TILE);
    await page.evaluate(({ selector, text }) => {
      const tile = [...document.querySelectorAll<HTMLButtonElement>(selector)].find((node) => node.textContent?.includes(text));
      tile!.click();
    }, WALLETS_TILE);
    await page.waitForTimeout(400);
    return;
  }
  await page.evaluate((index) => {
    const button = document.querySelectorAll<HTMLButtonElement>(".bottom-nav > button")[index];
    if (!button) throw new Error(`no bottom-nav button at index ${index}`);
    button.click();
  }, NAV[tab]);
  await page.waitForTimeout(400);
}

/** Waits for the boot splash to finish and get out of the way. */
export async function waitForApp(page: Page) {
  await expect(page.locator(".bottom-nav")).toBeVisible({ timeout: 15000 });
  await waitForSplash(page);
}

/**
 * The same wait for a screen that has no bottom nav -- the first-run setup
 * gate, which replaces the whole app until it is finished or skipped.
 */
export async function waitForSetup(page: Page) {
  await expect(page.locator(".setup-screen")).toBeVisible({ timeout: 15000 });
  await waitForSplash(page);
}

async function waitForSplash(page: Page) {
  await page.waitForFunction(() => {
    const splash = document.getElementById("app-splash");
    return !splash || getComputedStyle(splash).display === "none" || getComputedStyle(splash).opacity === "0";
  }, undefined, { timeout: 15000 });
  // The specs that assert on geometry (a heading and its button on one line, a
  // date under its title rather than beside it) measure text laid out in IBM
  // Plex Sans Thai. Measuring before the webfont swaps in reads fallback
  // metrics, which is a flake, not a layout bug.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/**
 * Injects a seed and boots the app with it. `addInitScript` runs before any
 * page script, so the state is in place by the time app/page.tsx's effect
 * looks for it -- no flash of signed-out UI and no race for a spec to trip on.
 */
export async function openApp(page: Page, seed: PreviewSeed) {
  await injectSeed(page, seed);
  await waitForApp(page);
}

/** openApp's counterpart for an empty account, which boots into the gate. */
export async function openSetup(page: Page, seed: PreviewSeed = buildEmptySeed()) {
  await injectSeed(page, seed);
  await waitForSetup(page);
}

/** Opens on the PIN gate (seed.pinMode), which has no bottom nav to wait for. */
export async function openPinGate(page: Page, mode: "locked" | "setup" = "locked") {
  await injectSeed(page, { ...buildSeed(), pinMode: mode });
  await expect(page.locator(".pin-screen")).toBeVisible({ timeout: 15000 });
  await waitForSplash(page);
}

async function injectSeed(page: Page, seed: PreviewSeed) {
  await page.addInitScript((injected) => {
    (window as unknown as { __NUBTANG_PREVIEW__: unknown }).__NUBTANG_PREVIEW__ = injected;
  }, seed as unknown as Record<string, unknown>);
  await page.goto("/");
}

/**
 * Waits out every entrance animation on the page.
 *
 * Not waiting was the first thing the design audit got wrong: the card ladder and
 * the view transition both start at opacity 0 with animation-fill-mode:
 * backwards, so measuring too early reported perfectly good text as 1.00:1
 * against its own background. Infinite animations (the loading shimmer) are
 * left out because they never finish, and the whole wait is bounded in case
 * something else is running forever.
 */
export async function waitForAnimations(page: Page) {
  await page.evaluate(async () => {
    const running = document
      .getAnimations()
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => undefined));
    await Promise.race([
      Promise.all(running),
      new Promise((resolve) => window.setTimeout(resolve, 2000)),
    ]);
  });
  await page.waitForTimeout(120);
}

/**
 * Waits until an element has stopped moving, before geometry is read off it.
 *
 * boundingBox() is one round-trip per element, so measuring a title in one
 * call and the date under it in the next compares two different layouts while
 * a panel is still sliding in -- which is why the statement spec failed only
 * when all three viewports ran at once and the machine was slow enough for the
 * animation to still be running.
 */
export async function waitForStableBox(locator: Locator) {
  let previous = await locator.boundingBox();
  await expect
    .poll(async () => {
      const current = await locator.boundingBox();
      const settled = !!current && !!previous && current.x === previous.x && current.y === previous.y;
      previous = current;
      return settled;
    })
    .toBe(true);
}

/**
 * Scrolls the app's scroll container and waits for it to settle. .phone sets
 * scroll-behavior: smooth, so assigning scrollTop starts an animation and
 * reading it back on the next line still returns the old value -- which is
 * exactly the trap the first version of these specs fell into.
 */
export async function scrollAppTo(page: Page, top: number) {
  await page.evaluate((y) => {
    document.querySelector(".phone")!.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
  }, top);
  await page.waitForTimeout(200);
}

type Fixtures = {
  /** A page that boots straight into Home with the seeded account. */
  app: Page;
  seed: PreviewSeed;
};

export const test = base.extend<Fixtures>({
  seed: async ({}, use) => {
    await use(buildSeed());
  },
  app: async ({ page, seed }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await openApp(page, seed);
    await use(page);

    // Any uncaught exception during a spec fails it, even if what the spec
    // asserted still passed. The app now has an error boundary, so a crash no
    // longer white-screens -- which means without this check a spec could go
    // green while the user would have seen "แอพสะดุดไปชั่วขณะ".
    expect(errors, "uncaught page errors").toEqual([]);
  },
});

export { expect };
