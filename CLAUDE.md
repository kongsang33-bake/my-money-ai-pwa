# CLAUDE.md

Guidance for working on this codebase — a Thai personal-finance PWA
(Next.js App Router, single-file `app/page.tsx`, design system in
`app/globals.css`).

## Design system: Ink & Amber

- **Palette**: warm paper background, near-black ink (`--ink`) as the
  primary UI color (buttons, the FAB, the two-tone Home header all fill
  with `--primary`, which *is* ink in light mode and inverts to light ink
  in dark mode — always pair it with `--primary-text`, never assume white
  or black text on it). Amber (`--accent`) is reserved for the AI-assist
  affordance, the heatmap ramp, and small emphasis details — it is not the
  button-fill color. `--income`/`--expense`/`--danger` carry all
  positive/negative/destructive meaning; category chips use the 7-slot
  `--cat-*` CVD-safe palette (`categoryColorVars` in `app/page.tsx`), never
  a color chosen ad hoc.
- **Font**: IBM Plex Sans Thai, loaded via `next/font/google` in
  `app/layout.tsx` and exposed as `--font-sans`. Don't add a second font or
  fall back to a system stack without a real reason — the font was
  previously missing entirely and was one of the biggest "unfinished" tells.
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
  defines the full system in `:root` — spacing (`--s-1`…`--s-8`), radius
  (`--r-sm`…`--r-full`), shadow (`--sh-1`…`--sh-3`), z-index (`--z-nav`…
  `--z-toast`), motion (`--t-1`…`--t-3`, `--e-out`, `--e-spring`). A new
  component should compose from these, not invent a new radius or a
  one-off box-shadow. All colors are CSS custom properties defined once in
  `:root` (light) and `:root[data-theme="dark"]` (dark) — never a literal
  hex/rgb in a component rule. Every hardcoded color eventually needs a
  manually-written dark-mode override, which is easy to miss and is what
  broke dark mode repeatedly during earlier development.
- **Define each component once.** The previous stylesheet redefined the
  same selectors across more than a dozen appended "layers" (`.entry-list`
  alone had 13 separate rule blocks) — changing one card meant editing
  4–8 places, and whichever was last in the file silently won. The current
  file has no cascade layers: find the selector, edit it in place. If you
  need a new visual variant, add a modifier class rather than a second rule
  block for the same selector further down the file.
- **Icon SVGs need explicit fill/stroke.** Hand-drawn inline SVGs (bottom
  nav icons, `GoogleIcon`) don't inherit sensible defaults — an SVG `<path>`
  with no `fill`/`stroke` set renders as a solid black shape (closed paths)
  or nothing at all (open paths). Outline-style icons need
  `fill: none; stroke: currentColor` set explicitly in CSS; `lucide-react`
  icons already handle this internally via their `strokeWidth` prop, so
  they don't need it.

## Dev workflow

- The Next.js/Turbopack dev server can serve stale CSS after edits to
  `globals.css` even with the file watcher running. After any CSS change,
  do a full restart (kill the process, `rm -rf .next`, relaunch) before
  trusting a screenshot or visual check — don't rely on hot reload alone.
- For verifying UI changes: seed mock state behind a temporary
  `?preview=1`-gated `useEffect` (fake user/entries/wallets/debtors/
  recurring expenses), screenshot with Playwright across both themes and
  at least three widths (mobile ~390px, tablet ~700px, desktop ~1280px —
  there is a real breakpoint at 600–899px, don't only check mobile and
  desktop), then remove the temporary scaffolding before committing. Never
  leave preview scaffolding in a committed change.
- When a `<span>`/`<b>`/`<strong>` pair is meant to stack as a label above
  a value (most "total" cards and stat tiles follow this pattern), give the
  label element `display: block` explicitly, or make the parent
  `display: grid`/`flex-column` — plain sibling inline elements will run
  together on one line instead of stacking.
