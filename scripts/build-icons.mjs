// Cuts every icon the manifest and the browsers ask for out of one piece of
// artwork: the green N (scripts/icon-source/n-mark-512.png), set on pure black.
//
// The only thing that differs from file to file is how much of the canvas the
// mark fills, so that is the one number each entry names. The artwork's own
// ground is opaque black, so shrinking it onto a black canvas leaves no seam.
//
// The first cut of these icons had the N filling about three quarters of the
// canvas edge to edge. On an iPhone home screen that read as too big and too
// heavy next to other apps, whose glyphs sit nearer 60%, so the home-screen
// icons now leave that much room. The favicons stay nearly full-bleed: at 32px
// every pixel of margin is a pixel less of the letter.
//
// (This file used to draw a coin-and-ruled-lines mark from the stylesheet's
// tokens. That design was replaced by the N, and running the old script would
// have quietly put it back.)
//
// Run: npm run build:icons   (writes straight into public/icons/)
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "scripts/icon-source/n-mark-512.png";
const OUT = "public/icons";

// How wide the mark is in the source, as a share of its canvas -- measured,
// not chosen. Every `share` below is a target in the same units.
const SOURCE_SHARE = 0.76;

// Home-screen icons: iOS's apple-touch and the manifest's plain pair.
const HOME_SHARE = 0.6;
// Android crops a maskable icon to a circle 80% of the canvas wide and may
// crop tighter, so the mark keeps well inside it.
const MASKABLE_SHARE = 0.48;
const FAVICON_SHARE = 0.88;

const FILES = [
  { name: "icon-512.png", size: 512, share: HOME_SHARE },
  { name: "icon-192.png", size: 192, share: HOME_SHARE },
  { name: "apple-touch-icon.png", size: 180, share: HOME_SHARE },
  { name: "icon-maskable-512.png", size: 512, share: MASKABLE_SHARE },
  { name: "icon-maskable-192.png", size: 192, share: MASKABLE_SHARE },
  { name: "favicon-48.png", size: 48, share: FAVICON_SHARE },
  { name: "favicon-32.png", size: 32, share: FAVICON_SHARE },
];

// Chromium is already here for the e2e suite, and E2E_CHROMIUM_PATH is the
// same escape hatch playwright.config.ts uses for images that ship their own.
const { chromium } = await import("@playwright/test");
const browser = await chromium.launch(
  process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {},
);
const page = await browser.newPage();
const source = `data:image/png;base64,${readFileSync(SOURCE).toString("base64")}`;

for (const file of FILES) {
  // Drawn on a canvas rather than screenshotted, so the PNG is exactly
  // `size` pixels with no device scaling in between.
  const dataUrl = await page.evaluate(async ({ src, size, scale }) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    context.fillStyle = "black";
    context.fillRect(0, 0, size, size);
    context.imageSmoothingQuality = "high";
    const drawn = size * scale;
    context.drawImage(image, (size - drawn) / 2, (size - drawn) / 2, drawn, drawn);
    return canvas.toDataURL("image/png");
  }, { src: source, size: file.size, scale: file.share / SOURCE_SHARE });
  const png = Buffer.from(dataUrl.split(",")[1], "base64");
  writeFileSync(`${OUT}/${file.name}`, png);
  console.log(`${OUT}/${file.name}  ${file.size}x${file.size}  mark ${Math.round(file.share * 100)}%  ${(png.length / 1024).toFixed(1)}KB`);
}

await browser.close();
