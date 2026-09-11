import { test, expect, waitForApp } from "./fixture.ts";

// One tap in the topbar, no menu to open first: the switch button IS the
// current theme's opposite, so the label says where the tap goes.
async function setTheme(app: Parameters<typeof waitForApp>[0], to: "dark" | "light") {
  await app.locator(`.menu-button[aria-label="เปลี่ยนเป็น${to === "dark" ? "ธีมมืด" : "ธีมสว่าง"}"]`).click();
  await app.waitForTimeout(400);
}

test.describe("theme", () => {
  test("switching writes both the attribute and the stored preference", async ({ app }) => {
    await setTheme(app, "dark");
    expect(await app.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    expect(await app.evaluate(() => localStorage.getItem("money-ai-theme"))).toBe("dark");

    await setTheme(app, "light");
    expect(await app.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
    expect(await app.evaluate(() => localStorage.getItem("money-ai-theme"))).toBe("light");
  });

  test("never flashes light on the way into dark mode", async ({ app }) => {
    // This is the regression that made the whole suite worth writing. The
    // pre-paint script in app/layout.tsx sets data-theme from localStorage,
    // but React's state used to default to "light" and an effect stamped that
    // over the correct value on mount, with a timeout putting it back a tick
    // later. Sampling across the load is the only way to see it: both the
    // before and after states are "dark", and only the middle was wrong.
    await setTheme(app, "dark");

    await app.goto("/", { waitUntil: "commit" });
    const samples: string[] = [];
    for (let i = 0; i < 30; i += 1) {
      samples.push(await app.evaluate(() => document.documentElement.dataset.theme ?? "(none)").catch(() => "(detached)"));
      await app.waitForTimeout(50);
    }
    await waitForApp(app);

    expect(samples, `theme flickered: ${[...new Set(samples)].join(" -> ")}`).not.toContain("light");
    expect(samples.at(-1)).toBe("dark");
  });

  test("keeps the choice across a reload", async ({ app }) => {
    await setTheme(app, "dark");
    await app.reload();
    await waitForApp(app);
    expect(await app.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  });

  test("paints the dark background, not just the attribute", async ({ app }) => {
    // The attribute being right is not the same as the tokens being wired to
    // it -- a component rule with a hardcoded color would pass the check above
    // and still look wrong.
    await setTheme(app, "dark");
    const background = await app.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = background.match(/\d+/g)!.map(Number);
    expect(r + g + b, `body background ${background} is not dark`).toBeLessThan(150);
  });
});
