import { test as base, expect, type Page } from "@playwright/test";
import { normalizeEntry } from "../lib/money.ts";
import type { Entry, PreviewSeed } from "../lib/types.ts";

// The seeded state every spec runs against, and the helpers for getting into
// the app with it.
//
// This is test-only on purpose: application code never imports this file, so
// there is no module a bundler could carry into a production build. The app's
// side of the arrangement is ~15 lines in app/page.tsx that read
// window.__MONII_PREVIEW__ and are compiled away unless the build sets
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
  // Keep both recurring bills inside the "due soon" window so the Home tile
  // that renders them is always exercised, whatever day the suite runs.
  const soon = (days: number) => Math.min(28, ((today.getDate() + days - 1) % 28) + 1);

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
      { id: "preview-r1", user_id: USER_ID, name: "Netflix", amount: 419, billing_day: soon(2), icon: null, icon_color: null },
      { id: "preview-r2", user_id: USER_ID, name: "ค่าเน็ต", amount: 599, billing_day: soon(4), icon: null, icon_color: null },
    ],
    goals: [
      { id: "preview-g1", name: "เที่ยวญี่ปุ่น", target: 80000, saved: 32000, deadline: new Date(now + 120 * 86400000).toISOString().slice(0, 10) },
    ],
    budgets: { "อาหาร": 6000, "บันเทิง": 2000, "เดินทาง": 3000 },
  };
}

export const NAV = { home: 0, history: 1, add: 2, wallets: 3, more: 4 } as const;

/**
 * Clicks a bottom-nav item from inside the page. Playwright's own click does
 * an actionability check that scrolls and hit-tests first, which is fine for
 * asserting behaviour but muddies anything timing-related -- and the nav is
 * fixed, so the check buys nothing here.
 */
export async function navigate(page: Page, tab: keyof typeof NAV) {
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
  await page.waitForFunction(() => {
    const splash = document.getElementById("app-splash");
    return !splash || getComputedStyle(splash).display === "none" || getComputedStyle(splash).opacity === "0";
  }, undefined, { timeout: 15000 });
}

/**
 * Injects a seed and boots the app with it. `addInitScript` runs before any
 * page script, so the state is in place by the time app/page.tsx's effect
 * looks for it -- no flash of signed-out UI and no race for a spec to trip on.
 */
export async function openApp(page: Page, seed: PreviewSeed) {
  await page.addInitScript((injected) => {
    (window as unknown as { __MONII_PREVIEW__: unknown }).__MONII_PREVIEW__ = injected;
  }, seed as unknown as Record<string, unknown>);
  await page.goto("/");
  await waitForApp(page);
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
