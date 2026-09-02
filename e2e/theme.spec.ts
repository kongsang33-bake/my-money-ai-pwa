import { test, expect, waitForApp } from "./fixture.ts";

async function setTheme(app: Parameters<typeof waitForApp>[0], label: "ธีมมืด" | "ธีมสว่าง") {
  await app.locator(".menu-button").click();
  await app.locator(`.theme-toggle button[aria-label="${label}"]`).click();
  await app.locator(".side-menu-backdrop").click({ position: { x: 8, y: 400 } });
  await app.waitForTimeout(400);
}

test.describe("theme", () => {
  test("switching writes both the attribute and the stored preference", async ({ app }) => {
    await setTheme(app, "ธีมมืด");
    expect(await app.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    expect(await app.evaluate(() => localStorage.getItem("money-ai-theme"))).toBe("dark");

    await setTheme(app, "ธีมสว่าง");
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
    await setTheme(app, "ธีมมืด");

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
    await setTheme(app, "ธีมมืด");
    await app.reload();
    await waitForApp(app);
    expect(await app.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  });

  test("paints the dark background, not just the attribute", async ({ app }) => {
    // The attribute being right is not the same as the tokens being wired to
    // it -- a component rule with a hardcoded color would pass the check above
    // and still look wrong.
    await setTheme(app, "ธีมมืด");
    const background = await app.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = background.match(/\d+/g)!.map(Number);
    expect(r + g + b, `body background ${background} is not dark`).toBeLessThan(150);
  });
});
