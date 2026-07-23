# CLAUDE.md

Guidance for working on this codebase — a Thai personal-finance PWA
(Next.js App Router, single-file `app/page.tsx`, tokens in `app/globals.css`).

## Design rules

- **No emoji anywhere in UI or system-facing text.** Use the existing
  monochrome dingbat icon set instead (`categoryIcon()` in `app/page.tsx`
  returns plain glyphs like `● ◆ ฿ ✚ ▣ ♪ ▪`, and `EmptyNote`'s `glyph` prop
  follows the same convention). These inherit `currentColor` and read as
  part of the app's own visual language — colorful pictographic emoji do
  not, and make the app look AI-generated.
- **Avoid generic "AI-generated app" tells** — no purple/violet gradients
  as a default accent, no decorative sparkle/glow effects without a
  specific reason. This app's palette is the green/mint brand family
  (`--green`, `--mint-*`, `--accent-bold` tokens) plus the two-tone
  navy/bold-teal treatment on the Home tab. Stay within that established
  palette rather than introducing new hues speculatively.
- **Use design tokens, never hardcoded colors.** All colors should be CSS
  custom properties defined in `app/globals.css`'s `:root` (light theme)
  and `:root[data-theme="dark"]` (dark theme) blocks — not literal hex/rgb
  values in component-specific rules. Hardcoded values are what broke dark
  mode repeatedly during development; every hardcoded color eventually
  needs a manually-written dark-mode override, which is easy to miss.

## Working in `globals.css`

- The file has multiple cascade "layers" (comment-labeled sections like
  `/* Paper background + pastel content cards */`) that were added over
  time and sometimes redefine the same selector later in the file to
  restyle it. Before assuming your new rule takes effect, check whether a
  later layer already targets the same selector — same-specificity rules
  are won by whichever comes last in the file, and `[data-theme="dark"]`
  attribute-qualified selectors beat plain class selectors regardless of
  order.
- When adding a dark-mode override, make sure a later, still-hardcoded
  rule for the same element isn't going to override it back to a light
  color.

## Dev workflow

- The Next.js/Turbopack dev server can serve stale CSS after edits to
  `globals.css` even with the file watcher running. After any CSS change,
  do a full restart (kill the process, `rm -rf .next`, relaunch) before
  trusting a screenshot or visual check — don't rely on hot reload alone.
- For verifying UI changes: seed mock state behind a temporary
  `?preview=1`-gated `useEffect` (fake user/entries/wallets), screenshot
  with Playwright, then remove the temporary scaffolding before committing.
  Never leave preview scaffolding in a committed change.
