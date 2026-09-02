# CLAUDE.md

Guidance for working on this codebase — a Thai personal-finance PWA
(Next.js App Router, single-file `app/page.tsx`, design system in
`app/globals.css`).

## Design system: Bento (light) / Neon Terminal (dark)

Monii is for someone who wants tracking money to feel like using a slick,
confident consumer app, not filling out a ledger. Light mode is a genuinely
saturated, playful color-blocked bento — full-hue tile fills, very round
corners, soft colorful shadows, no hairline borders. Dark mode is a
near-black neon terminal — quiet dark panels, hairline borders, moderate
"squircle" radius, with boldness spent almost entirely on one glowing acid
accent (the hero balance, the FAB, the active nav state) rather than on
fills everywhere. The two are deliberately different visual worlds tied
together by the same token names, not one palette re-lit for dark mode.
**A rendered reference of this direction — including the two live variants
it was chosen from — is committed at `docs/design-reference.html`; open it
in a browser before starting a design task.**

- **Palette is per-theme, not just re-hued.** Light: bright cream `--bg`,
  deep plum-ink `--ink`/`--primary` for text and every button/nav fill, a
  coral `--hero-bg` reserved for the one full-bleed hero moment, citrus
  `--accent` for a second bold fill (e.g. the due-soon tile). Dark: carbon
  `--bg`, acid-lime `--primary` (buttons, FAB, active nav, the hero
  numeral), electric-cyan `--accent` for secondary structure. `--income`/
  `--expense`/`--danger` carry all positive/negative/destructive meaning
  and are picked to stay distinct from `--primary`/`--accent` in each
  theme — don't reuse a semantic color as a decorative fill or vice versa.
  Category chips use the 8-slot `--cat-*` palette (`categoryColorVars` in
  `app/page.tsx`), never a color chosen ad hoc. `--accent-contrast` exists
  because `--accent` is a bright/light hue in *both* themes — text on a
  full-strength `--accent` fill needs it instead of `--text-on-color`
  (always white — wrong on a light citrus fill) or `--ink-inverse` (flips
  the wrong direction for this specific case).
- **Radius, border and shadow are theme tokens too, not just color.**
  `--card-border`/`--card-shadow` (tint-tier surfaces), `--hero-border`/
  `--hero-shadow`/`--hero-amount-glow` (the hero card), and the `--r-*`
  scale itself all have different *shapes* per theme (light: no border,
  soft shadow, very round; dark: hairline border, no shadow, moderate
  radius) — not just different colors. This is what makes a component rule
  never need its own `[data-theme="dark"]` override: point a component at
  the token, and both the color and the shape follow the theme.
- **Three surface tiers, chosen per component, not one card rule for
  everything.** `app/globals.css`'s "Surface tiers" section: **tint** (the
  shared mega-selector rule — a quiet, still-boxed card; most content),
  **bold** (`.surface-bold` utility, or a component's own bold variant like
  `.home-insight-card.savings-rate` / `.due-soon-card` — a full saturated
  fill, used sparingly so it stays a highlight), and **bare** (no box at
  all — `.activity-timeline`, `.quick-add-strip` — content separated by the
  page's own gutter and whitespace, not a border). When adding a new
  section, decide its tier deliberately; don't default to copying the
  nearest existing card.
- **Font**: IBM Plex Sans Thai, loaded via `next/font/google` in
  `app/layout.tsx` and exposed as `--font-sans`. Don't add a second font or
  fall back to a system stack without a real reason.
- **No mascot.** The `MoneyMascot` character (idle/thinking/happy/sleepy/
  oops moods, coin-wiggle, sparkles) was removed deliberately. Do not
  reintroduce a cartoon character, decorative sparkle, or "AI is listening"
  glow/pulse effect — empty and loading states use plain `EmptyNote`/
  `StateCard` glyphs and text only.
- **No emoji anywhere in UI or system-facing text.** Category icons come
  from `lucide-react` (`categoryIconMap`, `walletIconOptions`), rendered
  with `currentColor` so they inherit the surrounding text/icon color.
  `EmptyNote`'s `glyph` prop takes a plain monochrome dingbat character
  (`● ◆ ฿ ✚ ▣ ↻`), matching that same family — not an emoji, not the old
  mascot.
- **Use the token scales, never hand-picked values.** `app/globals.css`
  defines the full system in `:root` — spacing (`--s-0`…`--s-9`), radius
  (`--r-xs`…`--r-full`), shadow (`--sh-1`…`--sh-3`), z-index (`--z-nav`…
  `--z-toast`), motion (`--t-1`…`--t-4`, `--t-press`, `--e-out`,
  `--e-in-out`, `--e-spring`), and type (see below). A new component should
  compose from these, not invent a new radius, a one-off box-shadow, or a
  hand-picked `font-size`. All colors are CSS custom properties defined
  once in `:root` (light) and `:root[data-theme="dark"]` (dark) — never a
  literal hex/rgb in a component rule. Every hardcoded color eventually
  needs a manually-written dark-mode override, which is easy to miss and
  is what broke dark mode repeatedly during earlier development.
- **Type scale — 9 steps, all tokenized, re-ratioed for real hierarchy.**
  `--fs-display` (hero balance, ~44–64px) → `--fs-value` (large money
  amounts, ~28–40px) → `--fs-h1` (28px) → `--fs-h2` (21px) → `--fs-h3`
  (17px) → `--fs-body` (15px, the default reading size) → `--fs-body-sm`
  (14px) → `--fs-caption` (13px, labels/meta) → `--fs-micro` (11px,
  uppercase micro-labels). The top of this scale used to sit only ~1.1x
  apart step to step (22/19/17px), which meant nothing could read as more
  important than anything else no matter what used which token — the fix
  was widening the ratios (~1.3–1.6x through display/value/h1/h2), not
  picking bigger arbitrary numbers. Don't flatten this scale back out by
  routing a heading through `--fs-body` "because it looked fine here."
  Weight tokens `--fw-regular/medium/semibold/bold`: bold is reserved for
  `<strong>`/`<b>` money-value text and `h1`-tier headings — everything
  else uses `--fw-semibold`.
- **Native `<select>` elements get a `.select-shell` wrapper.** Wrap
  `<select>` in `<div className="select-shell">…</select><ChevronDown
  className="select-shell-chevron" aria-hidden="true" /></div>` — the CSS
  sets `appearance: none` on the select and absolutely positions the
  chevron. Don't ship a bare `<select>` with default OS chrome.
- **Define each component once.** Find the selector, edit it in place. If
  you need a new visual variant, add a modifier class rather than a second
  rule block for the same selector further down the file — a stylesheet
  that redefines the same selector in multiple appended "layers" means
  changing one card requires editing 4–8 places, and whichever rule is
  last in the file silently wins.
- **Icon SVGs need explicit fill/stroke.** Hand-drawn inline SVGs (bottom
  nav icons, `GoogleIcon`) don't inherit sensible defaults — an SVG `<path>`
  with no `fill`/`stroke` set renders as a solid black shape (closed paths)
  or nothing at all (open paths). Outline-style icons need
  `fill: none; stroke: currentColor` set explicitly in CSS; `lucide-react`
  icons already handle this internally via their `strokeWidth` prop, so
  they don't need it.
- **`.phone` is the real, edge-to-edge app root at every width — not a
  device mockup.** There is no rounded-card-with-drop-shadow "phone frame"
  centered on a differently-colored backdrop any more; that read as a
  component showcase, not an app, on anything wider than a literal phone.
  Widths above mobile only clamp `.phone`'s max-width for readability
  (`min-width: 600px`/`900px` breakpoints) — they don't reintroduce a card
  chrome. Don't add `border-radius`/`box-shadow` back onto `.shell`/`.phone`
  as a "polish" pass.

### What actually counts as a redesign

Every redesign attempt before this one changed only `--token` *values*
inside the same single shared card rule — same white-rounded-rectangle
structure, new hex codes. The app came out of each pass looking like
itself, because the sameness was never in the colors; it was in the
structure. If a design change here touches only color/size values in
`globals.css` and zero `className`s or JSX structure in `app/page.tsx`, it
is very unlikely to be a real redesign — treat that as a signal to stop and
reconsider, not a sign the work is efficient. A real structural change
looks like: the Home hero merging with the topbar into one full-bleed
zone instead of a floating pill over a separate card, or the insight row
becoming an asymmetric bento grid instead of a swipeable carousel of
equal-sized cards (both in `app/page.tsx` + `app/globals.css` together).
When redesigning a screen, decide its layout and surface tiers first, the
same way `docs/design-reference.html` did for Home, before touching any
token value.

## Dev workflow

- The Next.js/Turbopack dev server can serve stale CSS after edits to
  `globals.css` even with the file watcher running. After any CSS change,
  do a full restart (kill the process, `rm -rf .next`, relaunch) before
  trusting a screenshot or visual check — don't rely on hot reload alone.
- **The mock state for driving the app in a browser is committed now — do
  not hand-roll it again.** `e2e/fixture.ts` builds a seeded account (~350
  entries over eight months, three wallets, two debtors, budgets and a
  goal, matching the real account's shape) and injects it as
  `window.__MONII_PREVIEW__`. `app/page.tsx` reads that global in one
  guarded effect. Both halves only exist when a build sets
  `NEXT_PUBLIC_ENABLE_PREVIEW=1`; `next.config.ts` pins it to `"0"`
  otherwise so the branch folds to dead code, and
  `npm run verify:preview-stripped` greps the built bundle to prove it.
  Never reach for that env var outside the test suite, and never import
  `e2e/` from application code — a static import defeats the whole
  arrangement (it did, the first time; that is why the verify script
  exists).
- `npm run test:e2e` runs the Playwright suite against a **production**
  build across three viewports (mobile / 700px / desktop — the 600–899px
  breakpoint is a real layout, don't only check mobile and desktop). It
  covers boot, theme switching and persistence, tab navigation and scroll
  behaviour, sheet scroll-lock, the AI composer, and the error boundary.
  Every spec fails on an uncaught page error, so a crash cannot pass
  silently now that the error boundary keeps the app on its feet. If
  Playwright cannot download its own browser, point `E2E_CHROMIUM_PATH` at
  an existing Chromium binary.
- For a *visual* check, screenshot through the same fixture in both themes
  and at all three widths. Judge a design change on the screenshots, not on
  the diff.
- When a `<span>`/`<b>`/`<strong>` pair is meant to stack as a label above
  a value (most "total" cards and stat tiles follow this pattern), give the
  label element `display: block` explicitly, or make the parent
  `display: grid`/`flex-column` — plain sibling inline elements will run
  together on one line instead of stacking.

## Single source of truth

Before adding a new constant or helper, search whether one already exists —
this app already centralizes money formatting (`formatMoney` family,
page.tsx), category color/icon lookup (`categoryColor`/`categoryIconMap`),
the transaction-type taxonomy (`lib/taxonomy.ts`), and cross-cutting limits/
config (`lib/constants.ts`). If something you need isn't there, say so
explicitly (don't just add a new local literal) and add it to the right
shared location instead of typing the value inline.

Don't duplicate: hex colors (must be a CSS custom property in
`app/globals.css`), Supabase table names and `.select(...)` column lists
(`lib/constants.ts`'s `TABLES` / the `*_COLUMNS` constants), any numeric
limit or threshold, or a calculation that already has a named function.
Before writing a new one, grep for it — if you find an existing version that
looks close but not identical, check whether the two genuinely need to
change together (if yes, consolidate; if the difference is intentional —
e.g. "current" vs "as of a past date" — say why in a comment and leave them
separate, don't force a merge just because they look similar).
