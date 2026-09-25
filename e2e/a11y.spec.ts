import { readFileSync, writeFileSync } from "node:fs";
import { test, expect, buildEmptySeed, buildSeed, navigate, openApp, openLanding, openPinGate, openPrivacyGate, openSetup, seedDraft, waitForApp } from "./fixture.ts";
import { auditScreen, type Finding, type ScreenAudit } from "./audit.ts";

// The objective half of a design review, run on every screen, at all three
// widths. There is only one theme now (Cinema, dark only), so this used to
// walk each screen twice -- see git history before the Cinema pass for the
// two-theme version. Two bugs shipped in the same week motivated the walk
// and both would have been caught here: an explanation popover that
// inherited dark text onto a dark panel, and a setup step whose grid track
// grew past the phone and was silently clipped. Both were found by looking
// at screenshots, which is not a method that scales past the screen you
// happened to look at.

const BASELINE = "e2e/contrast-baseline.json";

/**
 * The colour pairs in the palette that do not currently reach WCAG AA.
 *
 * Target size and overflow are held at zero -- they were fixable in an
 * afternoon. Contrast is not: the failures are the palette's own semantic
 * colours (--ink-3 on a tinted card, --income on cream, white on the coral
 * hero), so clearing them is a deliberate re-tuning of the design, not a
 * bug fix, and it is not something a test should force by the back door.
 *
 * So this file is a ledger, not an excuse. A pair already in it is tolerated;
 * a pair that is not fails the run, which is what stops the list growing one
 * convenient exception at a time.
 *
 * Regenerating MERGES -- the three runs (one per width) each see a different
 * slice of the palette, so a run that replaced the file would drop two
 * thirds of it. That also means a pair you have since fixed stays listed
 * until the ledger is cleared and rebuilt from nothing:
 *
 *   echo '{}' > e2e/contrast-baseline.json
 *   E2E_WRITE_CONTRAST_BASELINE=1 npx playwright test e2e/a11y.spec.ts --workers=1
 *
 * Do that deliberately, after a palette pass -- never to make a red run green.
 */
type Baseline = Record<string, string>;

function loadBaseline(): Baseline {
  try {
    return JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline;
  } catch {
    return {};
  }
}

function report(title: string, findings: Finding[]) {
  return `${title}:\n${findings.map((f) => `  [${f.screen}] ${f.what} — ${f.detail}`).join("\n")}`;
}

test("meets contrast, target size and overflow limits", async ({ page }) => {
  // One test walks every screen (~30 of them), which takes about as long as
  // Playwright's default 30s allows on its own -- under a parallel run it
  // timed out partway through and reported whatever it was measuring then.
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const audits: ScreenAudit[] = [];

  // Signed out: the landing page at its hero, part way down (with an answer
  // open), at the sign-in, and the privacy sheet that has to be read first.
  await openLanding(page);
  audits.push(await auditScreen(page, "landing-hero"));
  await page.locator(".landing-faq summary").first().click();
  for (const [selector, screen] of [["#landing-install", "landing-install"], [".landing-faq", "landing-faq"]] as const) {
    await page.locator(selector).evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(200);
    audits.push(await auditScreen(page, screen));
  }
  await page.locator(".landing").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(200);
  audits.push(await auditScreen(page, "landing-foot"));
  await page.goto("/login");
  await expect(page.locator(".google-button")).toBeVisible();
  audits.push(await auditScreen(page, "login"));
  await page.locator(".privacy-ack").click();
  await expect(page.locator(".privacy-sheet")).toBeVisible();
  audits.push(await auditScreen(page, "privacy-sheet"));

  // The PIN gate, both ways it opens: a returning user, and one choosing a
  // PIN for the first time.
  await openPinGate(page, "locked");
  audits.push(await auditScreen(page, "pin-locked"));
  await openPinGate(page, "setup");
  audits.push(await auditScreen(page, "pin-setup"));

  // Signed in but holding an acknowledgement of an older policy.
  await openPrivacyGate(page);
  audits.push(await auditScreen(page, "privacy-gate"));

  // A brand-new account first: its own screens, and the only ones a user who
  // has never signed in before can reach.
  await openSetup(page);
  audits.push(await auditScreen(page, "setup-welcome"));
  await page.getByRole("button", { name: "เริ่มตั้งค่า" }).click();
  await page.waitForTimeout(400);
  audits.push(await auditScreen(page, "setup-wallet"));
  await page.getByRole("button", { name: "ยังไม่สร้างตอนนี้" }).click();
  await page.waitForTimeout(400);
  audits.push(await auditScreen(page, "setup-first-entry"));
  await page.getByRole("button", { name: "ไปหน้าแรกก่อน" }).click();
  await waitForApp(page);
  audits.push(await auditScreen(page, "home-empty"));

  // The state where money has been jotted with no wallet to count it: one
  // bold-tier warning card that no other screen shows.
  await openApp(page, {
    ...buildEmptySeed(),
    entries: buildSeed().entries.slice(0, 5).map((entry) => ({ ...entry, wallet_id: null })),
  });
  audits.push(await auditScreen(page, "home-no-wallet"));

  // Then an account with real data in it, where every card is populated.
  await openApp(page, buildSeed());
  await page.waitForTimeout(500);
  audits.push(await auditScreen(page, "home"));

  // The billboard turned over to the card pocket, and each of its sheets.
  await page.getByRole("button", { name: "เปิดกระเป๋าการ์ด" }).click();
  await page.waitForTimeout(600);
  audits.push(await auditScreen(page, "home-pocket"));
  await page.locator(".billboard-face.is-back").getByRole("button", { name: "รายละเอียด" }).click();
  await page.waitForTimeout(500);
  audits.push(await auditScreen(page, "pocket-detail"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "จัดการการ์ด" }).click();
  await page.waitForTimeout(500);
  audits.push(await auditScreen(page, "pocket-manage"));
  await page.getByRole("button", { name: "เพิ่มการ์ด" }).click();
  await page.waitForTimeout(500);
  audits.push(await auditScreen(page, "pocket-form"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "กลับไปที่ยอดเงิน" }).click();
  await page.waitForTimeout(600);

  for (const tab of ["history", "add", "upcoming", "wallets"] as const) {
    await navigate(page, tab);
    audits.push(await auditScreen(page, tab));
  }
  // A wallet's statement opens under the tiles; it sat flush against them.
  await page.locator(".wallet-tile-main").first().click();
  await page.waitForTimeout(400);
  audits.push(await auditScreen(page, "wallets-statement"));

  await navigate(page, "more");
  await page.waitForTimeout(500);
  audits.push(await auditScreen(page, "more"));
  await page.getByRole("button", { name: /ลบบัญชี/ }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  audits.push(await auditScreen(page, "delete-account"));
  await page.keyboard.press("Escape");

  // The AI review: a folded draft, one open because it names people the
  // account has never seen, and one whose missing destination blocks the
  // save -- every state a card and the save bar under them can be in.
  await openApp(page, {
    ...buildSeed(),
    drafts: [
      seedDraft({ id: "a11y-plain", title: "ข้าวมันไก่", amount: 60, transaction_type: "personal_expense", debtor_name: "" }),
      seedDraft({ id: "a11y-party", title: "ค่าเบียร์", amount: 1500, debtor_name: "อ้อน, แบงค์, วิน" }),
      seedDraft({ id: "a11y-transfer", title: "โอนเข้าออม", amount: 2000, transaction_type: "transfer", debtor_name: "", transfer_to_wallet_id: null }),
    ],
  });
  await navigate(page, "add");
  await page.waitForTimeout(400);
  audits.push(await auditScreen(page, "add-review"));

  const all = <K extends "contrast" | "tapSize" | "overflow" | "crowded">(key: K) => audits.flatMap((audit) => audit[key]);
  const checked = audits.reduce((sum, audit) => sum + audit.checked, 0);

  // Proof the walk actually looked at something: a selector change that
  // stopped matching any text would otherwise turn this spec green.
  expect(checked, "text elements measured").toBeGreaterThan(100);

  expect.soft(all("overflow"), report("content clipped sideways", all("overflow"))).toEqual([]);
  expect.soft(all("tapSize"), report("tap targets under 24x24 (WCAG 2.5.8)", all("tapSize"))).toEqual([]);
  expect.soft(all("crowded"), report("sections touching with no room between", all("crowded"))).toEqual([]);

  const contrast = all("contrast");
  if (process.env.E2E_WRITE_CONTRAST_BASELINE === "1") {
    const pairs: Baseline = { ...loadBaseline() };
    for (const finding of contrast) if (finding.pair) pairs[finding.pair] = `${finding.what} — ${finding.detail}`;
    writeFileSync(BASELINE, `${JSON.stringify(Object.fromEntries(Object.entries(pairs).sort()), null, 2)}\n`);
    test.info().annotations.push({ type: "baseline", description: `wrote ${Object.keys(pairs).length} pairs` });
    return;
  }

  const baseline = loadBaseline();
  const fresh = contrast.filter((finding) => !finding.pair || !(finding.pair in baseline));
  expect.soft(fresh, report("NEW text below WCAG AA contrast (not in the baseline)", fresh)).toEqual([]);

  expect(errors, "uncaught page errors").toEqual([]);
});
