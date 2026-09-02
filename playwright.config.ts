import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3210);

// Normally Playwright finds its own browser (`npx playwright install`). Some
// sandboxes and CI images ship a pinned Chromium at a fixed path instead, and
// refuse the download -- E2E_CHROMIUM_PATH points the suite at that binary
// without anyone having to edit this file.
const launchOptions = process.env.E2E_CHROMIUM_PATH
  ? { executablePath: process.env.E2E_CHROMIUM_PATH }
  : {};

// The suite runs against a production build, not the dev server. Half of what
// it guards -- the boot splash timing, dead-code elimination of the preview
// hook, the pre-paint theme script -- only behaves like production in a
// production build, and the dev server's own overlay and HMR sit on top of the
// DOM the specs assert against.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions } },
    // The 600-899px breakpoint has its own layout (see the media queries in
    // globals.css); desktop is where the frosted topbar and the two-column
    // dashboard live. Both are real code paths, so both get exercised.
    { name: "tablet", use: { viewport: { width: 700, height: 900 }, launchOptions } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions } },
  ],
  webServer: {
    // Build and serve with the fixture hook compiled in. Without the env var
    // the hook is stripped (that is the point) and every spec would land on
    // the sign-in screen.
    command: `NEXT_PUBLIC_ENABLE_PREVIEW=1 npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
});
