// Fails if a colour was written as a literal anywhere it should have been a
// token.
//
// CLAUDE.md states the rule ("All colors are CSS custom properties defined
// once in :root (light) and :root[data-theme='dark'] (dark) — never a literal
// hex/rgb in a component rule"), and gives the reason: every hardcoded colour
// eventually needs a hand-written dark-mode override, which is easy to miss,
// and missing one is what broke dark mode repeatedly during earlier
// development. Until now the rule was written down and enforced by nobody.
// This checks it, the same way verify-preview-stripped.sh checks the preview
// hook's guarantee instead of trusting it.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CSS = "app/globals.css";

// The four places a literal is correct, each for a reason that cannot be
// solved by a token. Anything not on this list is a finding.
const ALLOWED = new Map([
  ["app/global-error.tsx", "runs when the root layout itself threw, so globals.css is not loaded — it has no tokens to reference (see the file's own comment)"],
  ["app/layout.tsx", "the themeColor <meta>, which the browser reads before any stylesheet"],
  ["components/auth.tsx", "the Google mark, whose brand colours must not follow our theme"],
  ["lib/category.ts", "iconColorSwatches — the palette the user picks a wallet/debtor colour FROM"],
]);

const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

/** Strips CSS comments, so a hex quoted in prose is not a finding. */
function stripComments(source) {
  // Replaced with the same number of newlines, so reported line numbers still
  // point at the real file.
  return source.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "));
}

/**
 * The line ranges of the top-level `:root…{ }` blocks — the only place in the
 * stylesheet where a literal colour belongs. Found by brace depth rather than
 * by a regex over the whole file, so a nested `:root` inside a media query
 * (there is one, for layout tokens) is deliberately NOT treated as a place to
 * declare colours.
 */
function tokenBlockRanges(lines) {
  const ranges = [];
  let depth = 0;
  let start = null;
  for (const [index, line] of lines.entries()) {
    if (depth === 0 && /^\s*:root[^{]*\{/.test(line)) start = index;
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (start !== null && depth === 0) {
      ranges.push([start, index]);
      start = null;
    }
  }
  return ranges;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

const findings = [];

const cssLines = stripComments(readFileSync(CSS, "utf8")).split("\n");
const ranges = tokenBlockRanges(cssLines);
for (const [index, line] of cssLines.entries()) {
  if (ranges.some(([from, to]) => index >= from && index <= to)) continue;
  if (COLOUR.test(line)) findings.push([`${CSS}:${index + 1}`, line.trim()]);
}

for (const file of ["app", "components", "lib"].flatMap((dir) => walk(dir))) {
  if (ALLOWED.has(file)) continue;
  for (const [index, line] of readFileSync(file, "utf8").split("\n").entries()) {
    if (COLOUR.test(line)) findings.push([`${file}:${index + 1}`, line.trim()]);
  }
}

if (findings.length) {
  console.error("FAIL: colours written as literals instead of tokens\n");
  for (const [where, text] of findings) console.error(`  ${where}\n    ${text.slice(0, 120)}`);
  console.error(`\nDefine the colour once in :root and :root[data-theme="dark"] in ${CSS}`);
  console.error("and point the rule at the token, so dark mode follows without a second edit.");
  console.error("\nThe only literals allowed, and why:");
  for (const [file, reason] of ALLOWED) console.error(`  ${file} — ${reason}`);
  process.exit(1);
}

console.log("OK: every colour outside the token blocks is a custom property");
