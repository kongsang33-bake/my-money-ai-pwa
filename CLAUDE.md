# CLAUDE.md

Guidance for working on this codebase — a Thai personal-finance PWA
(Next.js App Router, single-file `app/page.tsx`, design system in
`app/globals.css`).

## Design system: Paper (light) / Quiet Dark (dark)

Monii should feel like keeping a notebook, not like operating a dashboard.
Light mode is **paper**: warm off-white grounds with the chroma taken almost
to zero, a hairline edge and the faintest lift instead of coloured drop
shadows, corners eased back from pill to sheet, and colour used as ink —
small marks, deep enough to read — rather than as tile fills. Exactly one
full colour block survives, the coral hero, which reads as a band across the
top of the page. Dark mode is **quiet dark**: near-black panels with hairline
borders and no shadow, and its two loud hues are sage and warm sand, at the
same lightness as the acid lime and electric cyan they replaced but with the
chroma that made them glare taken out. The two are still different visual
worlds tied by the same token names; they are no longer a bright theme and a
neon one.

This is the second direction. The first — a saturated color-blocked bento
against a near-black neon terminal — is what `docs/design-reference.html`
renders, so read that file as the record of how a direction gets chosen
here, not as a description of the app today. **The live tokens at the top of
`app/globals.css` are the reference; read those before starting a design
task.**

- **Palette is per-theme, not just re-hued.** Light: warm paper `--bg`,
  deep plum-ink `--ink`/`--primary` for text and every button/nav fill, a
  deep coral `--hero-bg` reserved for the one full-bleed hero moment —
  deep because white sits on it, which the old bright coral could not carry.
  `--accent` (citrus) is a mark colour here, not a tile fill. Dark: carbon
  `--bg`, sage `--primary` (buttons, FAB, active nav, the hero numeral),
  warm sand `--accent` for secondary structure. `--income`/
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
  scale itself all have different *shapes* per theme (light: hairline
  border, the faintest warm-grey lift, sheet-of-paper radius; dark:
  hairline border, no shadow at all, slightly tighter radius) — not just
  different colors. The two are closer in shape than they used to be, which
  is the accepted cost of light mode reading as paper: a page with a
  coloured drop shadow reads as a tile. This is what makes a component rule
  never need its own `[data-theme="dark"]` override: point a component at
  the token, and both the color and the shape follow the theme.
- **Three surface tiers, chosen per component, not one card rule for
  everything.** `app/globals.css`'s "Surface tiers" section: **tint** (the
  shared mega-selector rule — a quiet, still-boxed card; most content),
  **bold** (`.surface-bold` utility, or a component's own bold variant like
  `.home-insight-card.savings-rate` / `.due-soon-card`), and **bare** (no box
  at all — `.activity-timeline`, `.quick-add-strip` — content separated by the
  page's own gutter and whitespace, not a border). When adding a new
  section, decide its tier deliberately; don't default to copying the
  nearest existing card.
  **What "bold" means is itself per-theme, and goes through a token, not a
  component rule.** `.home-insight-card.savings-rate` and `.due-soon-card`
  point at `--income-fill` / `--expense-fill` / `--accent-fill`; in dark
  those are saturated fills, in light they are pale washes on paper, because
  light spends its one colour block on the hero. Neither component knows.
  If a new card wants to be loud, give it a fill token and let the token
  decide per theme — don't write a saturated background into the rule.
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
- **The topbar holds the account and one setting, not a menu.** Your own
  avatar and greeting (`.home-identity`) is a button into the account screen
  (`ProfileView` — profile, month start, AI context, net worth display, PIN,
  sign out), and the button on the right flips the theme in one tap. There
  was a hamburger drawer here; once every money feature moved into the nav's
  "อื่น ๆ" it held two links and a sign-out button, and paid for them with a
  permanent topbar button and an overlay layer. Don't reintroduce a drawer to
  hold a setting — a new one belongs on the account screen, or in
  "อื่น ๆ" if it is about money rather than about the account.
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
reconsider, not a sign the work is efficient.

A change of *palette direction* is not a counter-example to this, and the
paper/quiet-dark pass is the one to point at: it is nearly all token values,
and it was still the right shape of change, because what it set out to alter
was the mood rather than the layout. The rule above is about the failure it
is named after — trying to make the app feel like a different app by
recolouring the same rounded rectangles. Deciding "light mode is paper now"
and moving the grounds, the shadows, the radius scale and the meaning of the
bold tier together is a direction; swapping hex codes inside an unchanged
one is not. If you cannot say in a sentence what the new direction IS, you
are doing the second thing.

A real structural change looks like: the Home hero merging with the topbar
into one full-bleed zone instead of a floating pill over a separate card, or the insight row
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
- **The design rules in this file are checked, not just written down.**
  `npm run verify:design` fails on a colour written as a literal anywhere
  outside the `:root` token blocks (the rule under "Use the token scales"),
  with four documented exceptions it names when it fails. `e2e/a11y.spec.ts`
  measures the *rendered* page on every screen, in both themes, at all three
  widths, for three things a screenshot only catches if you happen to look:
  WCAG 1.4.3 contrast, WCAG 2.5.8 target size (24×24), and content wider than
  `.phone` — which is invisible by construction, since `.phone` sets
  `overflow-x: hidden` and simply clips it. Target size and overflow are held
  at zero. Contrast is ratcheted against `e2e/contrast-baseline.json`: 23
  pairs in the palette still do not reach AA, clearing them is a deliberate
  re-tuning rather than a bug fix, and the ledger exists so the list cannot
  quietly grow in the meantime. Read the comment at the top of that spec
  before regenerating it. The money colours were the first group cleared —
  see the `--income`/`--expense` comment in `globals.css` for the
  text-weight vs fill-weight split that made it possible. What is left is
  mostly the coral hero's dimmed captions (they carry an `opacity` of their
  own on top of white), the `--cat-*` avatar initials, and the heatmap's two
  darkest buckets. The audit opens every `InfoHint` before measuring, because
  a `<details>` renders nothing until it does — a popover that inherited the
  hero's white text onto its own white panel shipped invisible while the gate
  reported green.
- **The e2e suite stops at the first write, and that is not a gap you can
  close with another spec.** It runs without Supabase credentials, and every
  mutation in `app/page.tsx` opens with `if (!supabase) return` — so save,
  edit, delete, PIN changes and the confirm dialogs some of them raise are
  all no-ops in the suite. Don't write a spec that taps one; it will pass or
  fail for reasons unrelated to what it claims. Those paths are covered by
  unit-testing the pure functions they delegate to instead
  (`planEntryUpdate`, `describeWalletDeletion`, `recordFailedPinAttempt`).
  Moving that boundary needs a stub Supabase client in `e2e/fixture.ts`.
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

**One reviewed draft is not one row.** `expandDraftForSave` is the only
thing that turns drafts into rows, and three shapes become several: a
transfer's two legs, a bill split between named people (one `lend` per name
plus the user's own `personal_expense`, since `debtor_name` holds one person),
and a bill paid by something other than a wallet — a credit card, or the
friend who got the round in (`CARD_FUNDABLE_TYPES`, which is why a plain
`personal_expense` has a funding picker at all: "อ้อนออกให้ก่อน" moves no
wallet money, owes อ้อน, and is still the user's own spending). Who
pays what inside a split is `splitSharesBetween`: any slot — a person, or the
user — can be pinned and the rest divide what is left, with the parts always
adding back up to the bill. Only
the card-funded shape links its rows with a `transfer_group_id` — that same id
is what tells a row it moved no wallet money (`isCardFundedLeg`), so grouping
the plain per-person rows would zero out money that really did leave. Add a
new multi-row shape there, not in a second flatMap at the call site.

**A wallet's balance is its opening figure plus every `wallet_impact` since**
(`buildWalletLedger`), so when it drifts from the real bank the honest fix is
finding the row that is missing, doubled or wrong. What must not happen is
quietly editing the opening balance to paper over it: `balance_adjustment` is
its own transaction type for that reason — one dated row carrying the
difference, kept out of every earned/spent figure because nothing was earned
or spent. Which types those are is `countsAsEarnedOrSpent` (`lib/taxonomy.ts`)
and nothing may re-test it by hand: a filter that only skipped `transfer` is
what let a reconciliation report itself as the day's biggest expense, on the
calendar, the day strip, the 7-day pace and the "lent out" total at once. It
is also the one type the AI parser may not emit
(`PARSEABLE_TRANSACTION_TYPES`), since it is something the user decides after
counting real money, never something to infer from a sentence.

**The same person can sit in both debt books at once** — they got one round
in, the user got the next — and settling up in real life is one transfer of
the difference. `planDebtSettlement` writes the two rows that take each side
to zero rather than one net payment, because `buildDebtSummary` groups by name
*within* a kind and a net row would leave both balances standing.

**One row moves one debt balance.** `buildDebtSummary` groups by
`debtor_name` and sums `debt_impact`, so a transaction that moves two of them
at once — a bill split with someone but paid on a credit card, which the card
owes in full and the other person owes a share of — is stored as *two* rows
sharing a `transfer_group_id`, the way a transfer already was. `calculateImpacts`
is what keeps the pair from double-counting (the expense leg moves no wallet
money, the `card_charge` leg claims none of the spending), `expandCardFundedDraft`
is the only thing that creates one, and `isCardFundedLeg` is the only test for
whether a row is part of one. Reach for that pair rather than a new
`transaction_type` or a second debtor column the next time one event has to
touch two balances — and note `partner_share` is a real stored number now, not
always half, so nothing may re-derive a split from `amount / 2`.

Don't duplicate: hex colors (must be a CSS custom property in
`app/globals.css`), Supabase table names and `.select(...)` column lists
(`lib/constants.ts`'s `TABLES` / the `*_COLUMNS` constants), any numeric
limit or threshold, or a calculation that already has a named function.
Before writing a new one, grep for it — if you find an existing version that
looks close but not identical, check whether the two genuinely need to
change together (if yes, consolidate; if the difference is intentional —
e.g. "current" vs "as of a past date" — say why in a comment and leave them
separate, don't force a merge just because they look similar).
