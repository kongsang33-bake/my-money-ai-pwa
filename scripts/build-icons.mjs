// Draws the app icon at every size the manifest and the browsers ask for.
//
// The icon is a mark, not a photo: a citrus coin resting on two ruled lines of
// a page, on the coral that is the app's one full colour block. Kept as code
// rather than as seven opaque PNGs so that changing the palette cannot leave
// the icon behind -- the three colours are READ OUT of app/globals.css's token
// block (CLAUDE.md: a hex belongs in one place and that place is the
// stylesheet), so this file names tokens, never values.
//
// Run: npm run build:icons   (writes straight into public/icons/)
import { readFileSync, writeFileSync } from "node:fs";

const CSS = "app/globals.css";
const OUT = "public/icons";

/**
 * A token's value from the light `:root` block. Throws rather than falling
 * back to a literal: an icon quietly built in the wrong colour because a token
 * was renamed is exactly the failure this file exists to prevent.
 */
function token(name) {
  const root = readFileSync(CSS, "utf8").split(/:root\s*\[/)[0];
  const match = root.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  if (!match) throw new Error(`${CSS} has no --${name} in its :root block`);
  return match[1].trim();
}

const GROUND = token("hero-bg");   // coral — the one full colour block
const COIN = token("accent");      // citrus
const RULE = token("surface");     // the page the lines are drawn on

// The mark on a 512 grid. `scale` shrinks it around the centre for the
// maskable cut, which crops to a circle 80% of the canvas wide.
const mark = (scale = 1) => `
    <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
      <circle cx="256" cy="206" r="88" fill="${COIN}"/>
      <g stroke="${RULE}" stroke-width="28" stroke-linecap="round">
        <line x1="122" y1="338" x2="390" y2="338"/>
        <line x1="122" y1="410" x2="298" y2="410"/>
      </g>
    </g>`;

// Below ~64px the second rule line closes up against the first and the coin
// loses its weight, so the favicons get a redrawn mark rather than a shrunken
// one: one line, a bigger coin, thicker strokes. Same idea, drawn for the size
// it is actually seen at.
const smallMark = `
    <circle cx="256" cy="214" r="118" fill="${COIN}"/>
    <line x1="108" y1="380" x2="404" y2="380" stroke="${RULE}" stroke-width="52" stroke-linecap="round"/>`;

// Rounded for the icons a platform shows as-is; full-bleed for the maskable
// pair (Android applies its own mask) and for apple-touch (iOS does too, and
// gives a transparent corner a black one).
const svg = (size, { rounded, body }) =>
  `<svg viewBox="0 0 512 512" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="512" height="512" ${rounded ? 'rx="115"' : ""} fill="${GROUND}"/>${body}
  </svg>`;

const FILES = [
  { name: "icon-512.png", size: 512, rounded: true, body: mark() },
  { name: "icon-192.png", size: 192, rounded: true, body: mark() },
  { name: "apple-touch-icon.png", size: 180, rounded: false, body: mark() },
  { name: "icon-maskable-512.png", size: 512, rounded: false, body: mark(0.72) },
  { name: "icon-maskable-192.png", size: 192, rounded: false, body: mark(0.72) },
  { name: "favicon-48.png", size: 48, rounded: true, body: smallMark },
  { name: "favicon-32.png", size: 32, rounded: true, body: smallMark },
];

// Chromium is already here for the e2e suite, and E2E_CHROMIUM_PATH is the
// same escape hatch playwright.config.ts uses for images that ship their own.
const { chromium } = await import("@playwright/test");
const browser = await chromium.launch(
  process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {},
);

for (const file of FILES) {
  const page = await browser.newPage({ viewport: { width: file.size, height: file.size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><html><body style="margin:0"><div id="icon" style="width:${file.size}px;height:${file.size}px">`
    + svg(file.size, file) + `</div></body></html>`,
  );
  // omitBackground keeps the corner outside a rounded icon transparent rather
  // than white, which is what a browser tab and a home screen both want.
  const png = await page.locator("#icon").screenshot({ omitBackground: true });
  writeFileSync(`${OUT}/${file.name}`, png);
  await page.close();
  console.log(`${OUT}/${file.name}  ${file.size}x${file.size}  ${(png.length / 1024).toFixed(1)}KB`);
}

await browser.close();
