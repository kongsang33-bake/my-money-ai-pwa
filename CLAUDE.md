# CLAUDE.md

Guidance for working on this codebase — a Thai personal-finance PWA
(Next.js App Router, single-file `app/page.tsx`, design system in
`app/globals.css`).

## Design system: Cinema (dark only)

Nub-Mon (formerly NUBTHUNG, and before that นับตังค์) is a Netflix-shaped app now: one billboard per screen
(`HeroWalletCard`, class `.hero-wallet` -- its own tier, deliberately not
a `.wallet-card`) carrying its own two actions, then horizontal rails of fixed-width
cards underneath — a section becomes a rail by wrapping its items in the `Rail` component
(`components/primitives.tsx`), whose `size` decides how wide every item in
it is — a card never sizes itself for the rail it sits in. There is **one theme, dark only** — no
`[data-theme]`, no toggle, no `prefers-color-scheme` branching. Grounds
are near-black; the emerald `--accent` is ink, never a fill, spent on the
logo mark, the nav's FAB, ribbons and progress — never a button. The
button fill is `--primary`, and `--primary` is white (the Netflix "Play"
role), which is *why* `--accent` can't also be a button: the app's one
default action and its one "this is highlighted" mark would read as the
same thing. `--income`/`--expense` were moved off green/red entirely (sky
and coral) for the same reason — green means the brand now, and red on a
primary "จดรายการ" button would read as a warning.

This is the third direction. `docs/design-reference.html` is the first
(a saturated color-blocked bento against a near-black neon terminal) and
`docs/netflix-reference.html` is the phase-0 mock this one was built from
— both are records of how a direction got chosen, not a description of the
app today. **The live tokens at the top of `app/globals.css` are the
reference; read those before starting a design task.**

**What has actually landed vs. what is still mocked-only.** Live: the token
layer with light mode removed entirely; the flat topbar (brand mark left,
your name and face right) that floats clear over Home's glow until content
scrolls under it; the billboard as the mock draws it (art filling the box,
kicker, amount, tags and two actions over a fade at the bottom, landscape
with the words on the left from 900px up), whose art is the spending
balance's real last 30 days (`buildBalanceHistory`, which walks back from
the ledger's own figure so it cannot end on a different number); and every
Home section below it as a rail. The rails' items are built for a rail now
(components/home.tsx): **posters** (2:3, `Poster`) for bills due and unpaid
cards (`DueSoonRail`) and for the ranked categories with the mock's outlined
numerals (`TopCategoriesRail`, ranked by `spendByCategory`, tapping one
opens History filtered to it); **progress tiles** (16:9 with a bar,
`ProgressTile`) for goals and budgets (`GoalsBudgetsRail`); and small
landscape cards for "เพิ่งจด" (`RecentRail`). A rail item's "art" is its own
colour handed in as `--hue` — a `--cat-*` slot, or a colour the user picked
— mixed into the ground; there are no pictures, so never reach for an image
or an emoji to fill that slot. A poster's art is the figure it is about, set
large (`hero`: days until a bill, a card's minimum, a category's share of the
cycle's spending), over its own icon printed small as a repeating pattern
(`IconPattern`) that fades out before the words, with the icon itself in
the same tinted square จดเร็ว uses (`IconChip`). Every card without a picture
draws its art that way -- posters, goal/budget and "เพิ่งจด" tiles, the
upcoming timeline's rows, the wallet tiles, the entry sheet's header -- and
a lucide icon is never drawn larger than it is meant to be read: blown up to
most of a card and cropped, it read as clip-art. How wide
items are is the rail's `size` prop (`.rail.is-*`), never the card's. The
"สุขภาพการเงิน" stat tiles (`HomeInsightGrid`) are one quiet shape — colour
lives in the figure and a thin `StatMeter` along the bottom, the same 3px bar
the progress tiles carry, never in a full fill — and the "ภาพรวมเดือนนี้"
cards share the rails' flat surface: the 7-day pace, and `CyclePaceCard`
(`buildCyclePace`) — this cycle so far against the last one over the *same
number of days*, never against its whole total. It replaced a "top category"
card that only repeated rank #1 of the categories rail; don't bring that
back. The bottom nav is a full-width solid
bar with a square emerald + level with the tabs below 900px, and floats as a
bar on desktop. A tap on an entry (Home's "เพิ่งจด", a History row) opens
**`EntryDetailSheet`** — the mock's title page: category art, type, name,
amount, date/category/wallet, then "แก้ไข" and "ลบ", then "รายการคล้ายกัน"
(`similarEntries`: same title, then same category, never another leg of the
same event) and how often the title recurs (`sameTitleSummary`). It edits
and deletes nothing itself: "แก้ไข" hands the row to `EditSheet` and "ลบ" to
`deleteEntry`, so there is still one edit path and one delete path. History's
fast path is the row itself (`SwipeEntry`, components/add.tsx): on touch it
slides left to uncover "แก้ไข" and "ลบ" (`ENTRY_SWIPE_ACTIONS_WIDTH`), on a
mouse the same two sit at the row's end as icons, and a keyboard focusing
either opens the row -- so nothing is reachable only by gesture. The nav's fourth slot is
**"กำลังจะมา"** (`UpcomingView`, components/upcoming.tsx): a timeline, date
down the left, of what `buildUpcoming` finds in the next
`UPCOMING_WINDOW_DAYS` counted **from today, not from the cycle** — so on the
30th a bill due on the 1st is "พรุ่งนี้" rather than hidden behind a month
edge the user does not think in — under a "ตอนนี้" group for undated things
already wanting attention (unpaid cards, budgets at `BUDGET_NEAR_PERCENT`).
Wallets moved off the nav to make room: it is the first tile under "อื่น ๆ"
(`MORE_SECTION_TABS`, so it has a back button and the nav shows "อื่น ๆ"),
still parked like Home and History, still one tap from Home's billboard and
wallet rail. The e2e fixture's `navigate(page, "wallets")` goes through that
tile. The nav's fifth slot is **"ของฉัน"** (`MoreView`, still the `more` tab,
with no back chevron, since it is a tab like History and not a screen drilled
into):
you at the top as one compact row (`.me-head`, the only way into the
profile form -- it was a large centred portrait plus a second "บัญชีและโปรไฟล์"
row, three doors into one screen counting the topbar, and the portrait pushed
the tools off the first screenful; don't grow it back), one heads-up row
(the nearest unlogged bill, else an unpaid card, else a budget at its edge —
it opens "กำลังจะมา"), the money tools, then the account's own rows (PIN, the
privacy policy, ออกจากระบบ and ลบบัญชี in `--danger`). ลบบัญชี opens
`ConfirmDeleteAccount`, whose button stays disabled until
`DELETE_ACCOUNT_CONFIRM_TEXT` is typed; the delete is one `RPC.deleteMyAccount`
call (a security-definer function that deletes only `auth.uid()` from
`auth.users`, every table cascading from it), then a local sign-out. The profile form (`ProfileView`) edits and nothing
else: the lock and sign-out moved out of it onto those rows. The tools are a grid on purpose, not the rail the mock drew: it is a
menu of eight places to go, and a sideways row would hide most of them. The
account screens go back to wherever opened them (`accountBack`), the way
the money screens under "ของฉัน" do (`moreSectionBack`). The PIN gate
(`PinGate`, components/auth.tsx) is the mock's "who's watching": brand mark
top-left, "ยินดีต้อนรับกลับ", your face as a large ringed square, your name,
dots that fill in `--accent`, and a bare keypad. It is centred with auto
margins, not `align-items`, so a short window scrolls it instead of pushing
its top out of reach, and it tightens under 800px tall so a laptop sees the
whole thing. Signed out, the app is **`Landing`** (components/landing.tsx), every time:
three full-height screens that turn one at a time (native snap on touch; on a
mouse or trackpad the snap is off and one wheel gesture, or PageDown, turns
one page with the landing's own easing, since snap under a wheel felt stiff)
-- what the app is and how
its data is kept, how to install it as a PWA (iPhone/Android tabs, plus
Chrome's own install prompt when it offers one), then `SignInPanel`
(components/auth.tsx), the only sign-in there is. It is the PIN gate's shape:
the brand in the corner (`.pin-brand`), one bare column under Home's glow,
Google as the one white `.primary`, no card (`.auth-card` is the error
boundary's). Both ways in stay disabled until the privacy policy has been
acknowledged, and the only way to acknowledge it is the button at the end of
the policy's own sheet. Given there, it can only live on the device
(`PRIVACY_ACK_STORAGE_KEY`); after sign-in `ensurePrivacyAck` (page.tsx)
copies it to `privacy_acknowledgements`, the append-only record kept as
evidence (select/insert only, one row per user per version, time from the
database -- lib/privacy.ts). A signed-in user with neither is held at
`PrivacyGate` before the PIN gate; a failed *read* lets them through and
tries again next launch. Bump `PRIVACY_POLICY_VERSION` when the policy's
substance changes: everyone is asked again, and gets a new row.
The policy is written once (`PrivacyPolicyContent`, components/privacy.tsx)
and also served at `/privacy` -- every claim in it is something the code does,
so check it when the data handling changes. `/privacy` is the only route
besides `/`: the service worker leaves other navigations to the network, and
CSS hides the boot splash there. The e2e suite reaches it through the seed's `pinMode`
(`openPinGate` in e2e/fixture.ts) and the a11y audit measures both modes.
Wallets (`WalletsView`) is a bare total -- the billboard's kicker, a display
figure, the spendable/set-aside split as one bar -- over `.wallet-tiles`:
each wallet a tile in its own `--hue` with its share of the total as a meter
(not `.wallet-grid`, which is the older wrapper around Home's billboard). From
900px up the app is the whole window: Home's billboard runs edge to edge
under the topbar and fades into the page at the bottom, and every other
screen keeps a centred 1180px column with the topbar lined up to it.
History ("รายการ") is list-first: a bare search field (no card around it),
held under the topbar while the month scrolls, with one row of type chips
under it (`QUICK_TYPES` in components/history.tsx, the same `filters.type`
the filter panel sets); then the calendar, which carries the month switcher;
then the whole month as one statement, newest day first, each day's money
in/out beside its date. A tap on a calendar day scrolls the list to that
day (`selectHistoryDay`, which finds the group by `data-day`) rather than
hiding every other day. It used to open on a "ภาพรวมเดือนนี้" card of month
totals; those are Home's job, and that card is gone along with `MonthSummary`,
`Metric` and the one-day `HistoryInsight`. The six-month trend and the income
sources moved into "สรุปเดือนนี้" (`RecapSheet`), which is a dark sheet like
the rest now, not the white card with an emerald button it used to be.

**The brand is Nub-Mon (`APP_NAME`, lib/constants.ts; the manifest repeats it
by hand) and its mark is the green "N"** -- the billboard's top-left line is
one of `BRAND_SLOGANS`, drawn at random each time Home mounts (`BillboardSlogan`),
never the same one twice running --
`public/icons/logo-mark.png` (transparent, for the app's own ground) and the
home-screen/maskable/Apple/favicon PNGs, all cut from one artwork and set on
pure black. `.brand-mark` draws that image; it is not a letter in a tile any
more, so never put text inside it. Internal identifiers that still say
"nubtang" (`__NUBTANG_PREVIEW__`, the service-worker cache name) are code, not
the product name -- leave them.

- **Palette is one set now, not per-theme.** `--bg`/`--surface`/
  `--surface-2`/`--surface-3` are near-black grounds; `--ink`/`--ink-2`/
  `--ink-3`/`--ink-4` are light text at descending emphasis. `--accent` is
  the emerald brand mark (logo, progress, active tab text, ribbons, the
  nav's FAB); `--primary` is the white CTA fill every "จดรายการ"-style
  button uses. `--income`/`--expense`/`--danger` carry all positive/
  negative/destructive meaning and are picked to stay distinct from both
  `--primary` and `--accent` — don't reuse a semantic color as a decorative
  fill or vice versa. Category chips use the 8-slot `--cat-*` palette
  (`categoryColorVars` in `app/page.tsx`), never a color chosen ad hoc.
- **Radius and shadow are flat now.** The `--r-*` scale is small (3–20px,
  a tile/button corner, not a pill) and `--card-shadow` is `none` —
  hairline borders (`--card-border`) do all the separating work; the only
  real shadow left (`--sh-1`/`--sh-2`/`--sh-3`) is a plain black overlay
  lift, reserved for something that genuinely floats above content (a
  sheet, a dialog, the FAB's glow), never a card sitting in the page flow.
  Since there is one theme, a component points at the token and gets both
  the color and the shape — there is no `[data-theme="dark"]` branch to
  keep in sync any more.
- **Three surface tiers, chosen per component, not one card rule for
  everything.** `app/globals.css`'s "Surface tiers" section: **tint** (the
  shared mega-selector rule — a quiet, still-boxed card; most content),
  **bold** (`.surface-bold` utility, or a component's own bold variant like
  `.home-insight-card.savings-rate` / `.due-soon-card`), and **bare** (no
  box at all — `.activity-timeline`, `.quick-add-strip` — content separated
  by the page's own gutter and whitespace, not a border). A bold card
  points at `--income-fill`/`--expense-fill`/`--accent-fill` rather than a
  hand-picked saturated color, so a future re-tuning of what "bold" means
  only touches those three tokens. Rail posters and tiles are a fourth
  thing, not a tier: their ground is their own `--hue`. When adding a new section,
  decide its tier (or whether it's a rail item instead) deliberately;
  don't default to copying the nearest existing card.
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
  (`● ◆ ฿ ✚ ▣ ↻`; never `▪`, which iOS draws as an emoji square), matching that same family — not an emoji, not the old
  mascot.
- **Use the token scales, never hand-picked values.** `app/globals.css`
  defines the full system in `:root` — spacing (`--s-0`…`--s-9`), radius
  (`--r-xs`…`--r-full`), shadow (`--sh-1`…`--sh-3`), z-index (`--z-nav`…
  `--z-toast`), motion (`--t-1`…`--t-4`, `--t-press`, `--e-out`,
  `--e-in-out`, `--e-spring`), and type (see below). A new component should
  compose from these, not invent a new radius, a one-off box-shadow, or a
  hand-picked `font-size`. All colors are CSS custom properties defined
  once in `:root` — never a literal hex/rgb in a component rule.
  `npm run verify:design` checks this mechanically (see Dev workflow).
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
- **Inputs are Netflix's sign-in fields.** One shape for every field: a
  `--surface-2` well, hairline `--line` border, `--r-sm` corner, `--ink` text
  (set explicitly -- the `<label>` around it is `--ink-3`, and a value that
  inherited that read as disabled), and on focus the edge turns white
  (`--ink`), never emerald and never a second glow ring. Choices (category
  and cycle chips, colour swatches, icon tiles, the split stepper) are flat
  `--r-sm`/`--r-xs` tiles, not pills or discs. Money is always `AmountInput`,
  which draws the baht sign inside the field. A sheet closes with
  `SheetClose` (a lucide X), never a typed "x". A file input's own chrome is
  hidden behind a `.file-button` label, the way the composer's แนบสลิป is.
  The add tab's AI/manual switch is underlined tabs (`.add-mode-tabs`) so it
  never stacks two identical segmented controls, and the AI composer sends
  from inside its own box (`.composer-send`). The coloured left stripe on
  rows (`.card-accent`) is gone; a row's colour lives in its avatar.
- **The AI review reads first and opens second.** Each parsed draft
  (`DraftRow`) starts as a summary card: title, amount, every value the AI
  guessed as one line of facts, and what the save does in words ("จ่ายจาก
  บัญชีหลัก ฿15 · จูน ติดคุณเพิ่ม ฿7.5"). Opening it shows the editor. Those
  words come from `reviewDraft` (lib/draft-review.ts), which reads
  `expandDraftForSave`'s rows, so never compute a preview figure in the
  component. Only a draft that `draftAttention` flags starts open, and one
  that blocks the save can't be folded. The batch total and save button sit
  in `.review-savebar`, sticky above the nav. Date, wallet and note are
  `.draft-meta-chip`s that show their value. Don't bring back a toggle that
  hides values behind a label naming them, and don't bring back a form-first
  review.
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
- **The topbar holds the account, not a menu.** Your own avatar and
  greeting (`.home-identity`) is a button into "ของฉัน" (the `more` tab), the
  one hub the account hangs off -- not straight into `ProfileView` (profile,
  month start, AI context, net worth display), which only "ของฉัน"'s
  `.me-head` opens. It used to share the topbar with a theme-toggle button; that
  button is gone along with light mode; the bar is now the brand mark on the
  left and this button (name, then face) on the right, flat and edge to edge
  with its ground supplied by `.topbar-scrim`. The mock's search button is
  not there, because there is no search to open from it yet -- a button
  that does nothing is worse than no button. There was a hamburger drawer
  here before any of this; once
  every money feature moved into the nav's "อื่น ๆ" it held two links and a
  sign-out button, and paid for them with a permanent topbar button and an
  overlay layer. Don't reintroduce a drawer to hold a setting — a new one
  belongs on the account screen, or under "ของฉัน" (formerly "อื่น ๆ") if it
  is about money rather than about the account.
- **Pull down to refresh is the app's own** (`PullToRefresh`,
  components/primitives.tsx). The document never scrolls -- `.phone` does --
  so neither iOS nor Android offers theirs. It listens on `.phone` with
  passive touch listeners, counts only from the very top and only a mostly
  vertical drag, and reloads through `refreshUserData`, which is
  `loadUserData` without `dataLoading`: a pull updates the numbers in place
  instead of swapping the screen for skeletons. It is off while a sheet is
  open and on Ask AI, whose chat has its own scroller. The drag writes the
  disc's position straight to the DOM; as state in the root component it
  re-rendered the whole app per touchmove and juddered. `.phone` is
  `overscroll-behavior-y: contain` and the document `none`, so a drag past
  the top bounces `.phone` and never the document -- and the `--vvh` effect
  in page.tsx leaves the document alone while a finger is down. Snapping it
  back mid-drag is what made the top of every tab judder on an iPhone.
- **The bottom nav is pinned to the viewport below 900px, at every width.**
  It is rendered inside `.phone`, which is the scroll container, so with
  `position: absolute` it scrolls away with the content — which it did from
  481px to 899px until the Home rails put a poster where a test tried to tap
  it. Its ground (`--nav-bg`) is opaque on purpose: slightly translucent, a
  card scrolling underneath showed through as a stray box behind a tab. `.phone` also carries `scroll-padding-bottom: var(--nav-clearance)`,
  so focus and scroll-into-view stop above the nav rather than under it.
  Under its tabs it leaves `--nav-lift`: the home indicator's inset less
  `--s-2`, which iOS only reports because layout.tsx sets
  `viewportFit: "cover"` (drop that and the tabs sit flush on an iPhone's
  bottom edge again), never less than `--s-2`. The full inset plus a margin
  was tried and read as too high next to other apps on an iPhone 17.
  Ask AI is the one screen that must fill exactly what is left, and it does
  it with layout (`.phone.tab-ask` is a flex column, the page is `flex: 1`),
  not with a height worked out from `100dvh` minus the chrome -- that sum
  ignored the real safe-area insets and left the composer floating above
  the nav on an iPhone. `.phone` (and `.shell`) are sized to `--vvh`, the
  visual viewport's height, set from `window.visualViewport` in
  app/page.tsx: iOS does not shrink the page for the keyboard, it pans the
  document, and left panned after the keyboard closed. Anything that makes
  the document taller than `--vvh` (a `min-height` on `.phone`, say) gives
  iOS something to pan again.
- **`.phone` is the real, edge-to-edge app root at every width — not a
  device mockup.** There is no rounded-card-with-drop-shadow "phone frame"
  centered on a differently-colored backdrop any more; that read as a
  component showcase, not an app, on anything wider than a literal phone.
  The 600–899px layout clamps `.phone` to a centred 560px column; from
  900px `.phone` is the full window and the *views* clamp themselves (1180px,
  all but Home, whose billboard is deliberately full-bleed). Neither
  reintroduces a card chrome. Don't add `border-radius`/`box-shadow` back onto `.shell`/`.phone`
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
  `window.__NUBTANG_PREVIEW__`. `app/page.tsx` reads that global in one
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
  covers boot, tab navigation and scroll behaviour, sheet scroll-lock, the
  AI composer, and the error boundary. There is no `theme.spec.ts` any
  more -- Cinema is dark only, so the switching/persistence/no-flash
  behaviour that file tested no longer exists to test. Every spec fails on
  an uncaught page error, so a crash cannot pass silently now that the
  error boundary keeps the app on its feet. If Playwright cannot download
  its own browser, point `E2E_CHROMIUM_PATH` at an existing Chromium
  binary.
- **The design rules in this file are checked, not just written down.**
  `npm run verify:design` fails on a colour written as a literal anywhere
  outside the `:root` token block (the rule under "Use the token scales"),
  with four documented exceptions it names when it fails. `e2e/a11y.spec.ts`
  measures the *rendered* page on every screen, at all three widths (one run
  each now that there is one theme -- see git history before the Cinema
  pass for the two-theme version), for three things a screenshot only
  catches if you happen to look: WCAG 1.4.3 contrast, WCAG 2.5.8 target size
  (24×24), content wider than `.phone` — which is invisible by
  construction, since `.phone` sets `overflow-x: hidden` and simply clips
  it — and "crowded": two of a screen's (or a sheet's) direct children
  stacked with under 6px between them while at least one is a box, which is
  how a wallet statement shipped flush against the tiles above it. Target
  size, overflow and crowded are held at zero. Contrast is ratcheted
  against `e2e/contrast-baseline.json`: it was reset to `{}` and regenerated
  against the Cinema palette (6 pairs, down from 23 against the old paper/
  quiet-dark palette -- not yet zero, so still read the comment at the top
  of that spec before regenerating it further). The audit opens every
  `InfoHint` before measuring, because a `<details>` renders nothing until
  it does — a popover that inherited surrounding light text onto its own
  light panel shipped invisible while the gate reported green.
- **The e2e suite stops at the first write, and that is not a gap you can
  close with another spec.** It runs without Supabase credentials, and every
  mutation in `app/page.tsx` opens with `if (!supabase) return` — so save,
  edit, delete, PIN changes and the confirm dialogs some of them raise are
  all no-ops in the suite. Don't write a spec that taps one; it will pass or
  fail for reasons unrelated to what it claims. Those paths are covered by
  unit-testing the pure functions they delegate to instead
  (`planEntryUpdate`, `describeWalletDeletion`, `recordFailedPinAttempt`).
  Moving that boundary needs a stub Supabase client in `e2e/fixture.ts`.
- For a *visual* check, screenshot through the same fixture at all three
  widths. Judge a design change on the screenshots, not on the diff.
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
the funded shape links its rows with a `transfer_group_id` — that same id
is what tells a row it moved no wallet money (`isFundedLeg`), so grouping
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
money, the funding leg claims none of the spending), `expandDraftForSave`
is the only thing that creates one, and `isFundedLeg` is the only test for
whether a row is part of one. Reach for that pair rather than a new
`transaction_type` or a second debtor column the next time one event has to
touch two balances — and note `partner_share` is a real stored number now, not
always half, so nothing may re-derive a split from `amount / 2`.

**Who fronted a bill decides which way its funding leg points, and that is
`fundingLegType`'s call alone.** A card, or anyone the user owes, takes the
bill on and the user's debt grows (`card_charge`). Someone who already owes
the user has instead worked part of it off, so the leg is a `debt_repayment`
with the group id that makes it weightless: the dinner จูน bought is 70 she
no longer owes, no wallet opens, and nothing counts it as income — which is
the whole point, since the by-hand version of this (a repayment row plus a
matching expense) balanced the wallet while telling the month it had earned
70 baht that never existed. The debtor's own `kind` is the only input, so
the same picker, the same field and the same pair of rows serve both
directions; an offset that overshoots leaves the balance negative on purpose
(`buildDebtSummary` keeps it, `balanceReading` says it in words) rather than
splitting itself against a balance read at save time, which would depend on
the day the row was typed rather than the day it happened.

Don't duplicate: hex colors (must be a CSS custom property in
`app/globals.css`), Supabase table names and `.select(...)` column lists
(`lib/constants.ts`'s `TABLES` / the `*_COLUMNS` constants), any numeric
limit or threshold, or a calculation that already has a named function.
Before writing a new one, grep for it — if you find an existing version that
looks close but not identical, check whether the two genuinely need to
change together (if yes, consolidate; if the difference is intentional —
e.g. "current" vs "as of a past date" — say why in a comment and leave them
separate, don't force a merge just because they look similar).
