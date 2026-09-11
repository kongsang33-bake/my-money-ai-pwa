import { readFileSync, writeFileSync } from "node:fs";
import { test, expect, buildSeed, navigate, openApp, openSetup, waitForApp } from "./fixture.ts";
import { auditScreen, type Finding, type ScreenAudit } from "./audit.ts";

// The objective half of a design review, run on every screen, in both themes,
// at all three widths. Two bugs shipped in the same week motivated it and both
// would have been caught here: an explanation popover that inherited dark text
// onto a dark panel, and a setup step whose grid track grew past the phone and
// was silently clipped. Both were found by looking at screenshots, which is
// not a method that scales past the screen you happened to look at.

const THEME_KEY = "money-ai-theme";
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
 * Regenerating MERGES -- the six runs (three widths x two themes) each see a
 * different slice of the palette, so a run that replaced the file would drop
 * five sixths of it. That also means a pair you have since fixed stays listed
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

for (const theme of ["light", "dark"] as const) {
  test(`meets contrast, target size and overflow limits in ${theme} mode`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [THEME_KEY, theme]);

    const audits: ScreenAudit[] = [];

    // A brand-new account first: its own screens, and the only ones a user who
    // has never signed in before can reach.
    await openSetup(page);
    audits.push(await auditScreen(page, `${theme}/setup-welcome`));
    await page.getByRole("button", { name: "เริ่มตั้งค่า" }).click();
    await page.waitForTimeout(400);
    audits.push(await auditScreen(page, `${theme}/setup-wallet`));
    await page.getByRole("button", { name: "ยังไม่สร้างตอนนี้" }).click();
    await page.waitForTimeout(400);
    audits.push(await auditScreen(page, `${theme}/setup-first-entry`));
    await page.getByRole("button", { name: "ไปหน้าแรกก่อน" }).click();
    await waitForApp(page);
    audits.push(await auditScreen(page, `${theme}/home-empty`));

    // Then an account with real data in it, where every card is populated.
    await openApp(page, buildSeed());
    await page.waitForTimeout(500);
    audits.push(await auditScreen(page, `${theme}/home`));

    for (const tab of ["history", "add", "wallets"] as const) {
      await navigate(page, tab);
      audits.push(await auditScreen(page, `${theme}/${tab}`));
    }

    await navigate(page, "more");
    await page.waitForTimeout(500);
    audits.push(await auditScreen(page, `${theme}/more`));

    const all = <K extends "contrast" | "tapSize" | "overflow">(key: K) => audits.flatMap((audit) => audit[key]);
    const checked = audits.reduce((sum, audit) => sum + audit.checked, 0);

    // Proof the walk actually looked at something: a selector change that
    // stopped matching any text would otherwise turn this spec green.
    expect(checked, "text elements measured").toBeGreaterThan(100);

    expect.soft(all("overflow"), report("content clipped sideways", all("overflow"))).toEqual([]);
    expect.soft(all("tapSize"), report("tap targets under 24x24 (WCAG 2.5.8)", all("tapSize"))).toEqual([]);

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
}
