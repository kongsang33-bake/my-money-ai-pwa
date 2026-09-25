"use client";

import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarDays, Check, ChevronLeft, Info, RefreshCw, X } from "lucide-react";
import { PULL_REFRESH_MAX, PULL_REFRESH_MIN_MS, PULL_REFRESH_THRESHOLD } from "@/lib/constants";
import { formatDateInputValue, formatMonthInputValue, formatMoney, moneySign } from "@/lib/format";
import type { ConfirmDialogState, EmptyAction, Toast } from "@/lib/types";

// A generic animated-count-up money display -- lives here rather than in
// components/home.tsx (its main caller, HeroWalletCard) because many
// screens render it, and home.tsx already imports several primitives from
// this file.
//
// It counts only when the figure changes while you are looking at it (a
// save, an undo, a price update). Arriving on a screen shows the number as
// it is: this used to count up from 0 on every mount, and since tabs unmount
// when you leave them, every return to Home replayed a 420ms count on the
// hero, each wallet card and the cash-flow card at once -- a React render
// and a text relayout per frame per figure, which was most of what made
// switching tabs feel slow on a phone.
export const CountUpMoney = memo(function CountUpMoney({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = window.requestAnimationFrame(() => {
        setShown(to);
        fromRef.current = to;
      });
      return () => window.cancelAnimationFrame(id);
    }
    const duration = 420;
    let startTime: number | null = null;
    let frameId: number;
    const tick = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min(1, (timestamp - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = progress < 1 ? from + (to - from) * eased : to;
      // Kept current every frame, so a value that moves again mid-count
      // carries on from where the number on screen actually is.
      fromRef.current = next;
      setShown(next);
      if (progress < 1) frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [value]);

  return <>{moneySign}{formatMoney(shown)}</>;
});

// A self-contained "N seconds elapsed" ticker. It owns its own interval and
// state so the once-a-second re-render stays inside this <span> instead of
// re-rendering the whole page tree the way a counter held in app/page.tsx's
// root component did -- the AI-analyse call it counts through runs for
// 10-30s, i.e. 10-30 full-tree renders for a number nothing else reads.
export const ElapsedSeconds = memo(function ElapsedSeconds() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <>{seconds}</>;
});

/**
 * The "what does this number even mean" affordance next to a piece of the
 * app's own vocabulary -- เงินพร้อมใช้สุทธิ, อัตราเงินเหลือ, มูลค่าสุทธิ.
 * Every one of those is obvious once someone tells you, and nothing in the
 * app ever did.
 *
 * Built on <details> rather than component state on purpose: it sits inside
 * cards that re-render on every data change (the hero counts up on each
 * save), and a <details> keeps its own open/closed state in the DOM, so an
 * explanation left open does not snap shut under it.
 */
export function InfoHint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="info-hint">
      <summary aria-label={`${label} คืออะไร`} title={`${label} คืออะไร`}>
        <Info aria-hidden="true" />
      </summary>
      {/* A <span>, not a <p>: these hints sit inside label <span>s (the hero
          caption, the insight-tile labels), where a block element would be
          invalid nesting. The CSS makes it a block. */}
      <span>{children}</span>
    </details>
  );
}

/**
 * A named, horizontally-scrolling row of cards -- Home's basic unit under
 * the billboard (see docs/netflix-reference.html). Deliberately generic: it
 * only lays out a heading, an optional "ดูทั้งหมด" action and a scroll-snap
 * track, and knows nothing about what is inside each item. A section that
 * used to be a CSS grid of full-width cards becomes a Rail by giving each
 * card a fixed rail width in CSS (see .rail-track > * in globals.css) and
 * wrapping the group here -- the cards' own components are untouched.
 */
export function Rail({
  title,
  action,
  onAction,
  size = "wide",
  className,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  /**
   * How wide each item is -- set once per rail in globals.css (.rail.is-*),
   * never per card: "wide" for data-dense cards, "compact" for short stat
   * tiles, "poster" for 2:3 posters, "tile" for 16:9 progress tiles, "small"
   * for a 16:9 card with a line or two under it, "rank" for a numeral plus a
   * poster.
   */
  size?: "wide" | "compact" | "poster" | "tile" | "small" | "rank";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rail is-${size}${className ? ` ${className}` : ""}`}>
      <div className="rail-head">
        <h2>{title}</h2>
        {action && onAction && <button onClick={onAction}>{action}</button>}
      </div>
      <div className="rail-track">{children}</div>
    </section>
  );
}

// The pattern's repeat, in px: two icons per tile on a diagonal, so the rows
// interlock like a printed wrapper instead of lining up as a grid.
const ICON_PATTERN_TILE = 56;
const ICON_PATTERN_ICON = 18;

/**
 * An item's icon, printed small and repeated across the ground of the card
 * it sits on -- the "art" of Home's posters and tiles, the upcoming timeline
 * and the wallet tiles, which have no pictures to show. An SVG <pattern>
 * rather than a grid of elements, so a rail of ten cards is ten small SVGs and
 * not two hundred. The icon is rendered at lucide's own 24px and scaled down
 * into each slot, which also thins its stroke to roughly 1.7px: a pattern is
 * texture, and the full-weight line read as clutter.
 *
 * It fills its positioned parent. How strongly it shows and where it fades
 * out, so the words on the card always read against plain ground, is the
 * card's own CSS (the mask on `.icon-pattern` under each card's selector).
 *
 * This replaced the other way these cards used to draw art: one glyph blown
 * up to most of the card and cropped. Lucide glyphs are drawn for 16-24px; at
 * a hundred they read as clip-art.
 */
export function IconPattern({ renderGlyph }: { renderGlyph: (size: number) => React.ReactNode }) {
  // useId's characters are not all valid in a url(#...) reference.
  const id = `icon-pattern-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const slot = (offset: number) => (
    <svg x={offset} y={offset} width={ICON_PATTERN_ICON} height={ICON_PATTERN_ICON} viewBox="0 0 24 24" overflow="visible">
      {renderGlyph(24)}
    </svg>
  );
  return (
    <svg className="icon-pattern" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={id} width={ICON_PATTERN_TILE} height={ICON_PATTERN_TILE} patternUnits="userSpaceOnUse">
          {slot(6)}
          {slot(6 + ICON_PATTERN_TILE / 2)}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/** The icon itself at reading size, in a square tinted with its card's --hue -- the one จดเร็ว uses. */
export function IconChip({ children }: { children: React.ReactNode }) {
  return <span className="icon-chip" aria-hidden="true">{children}</span>;
}

export function EmptyNote({ glyph, children, action }: { glyph: string; children: React.ReactNode; action?: EmptyAction }) {
  return (
    <div className="empty-note">
      {/* U+FE0E asks for the text form: iOS draws several geometric dingbats
          (▪ was one) as a colour emoji square without it. */}
      <span className="empty-glyph" aria-hidden="true">{`${glyph}\uFE0E`}</span>
      <p>{children}</p>
      {action && <button onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}

export function ToastHost({ toasts, closingIds, onDismiss }: { toasts: Toast[]; closingIds: number[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="toast-host" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          className={`toast ${toast.tone} ${closingIds.includes(toast.id) ? "closing" : ""}`}
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
        >
          <span aria-hidden="true">
            {toast.tone === "success" ? <Check /> : toast.tone === "error" ? <AlertTriangle /> : <Info />}
          </span>
          <span>
            <b>{toast.title}</b>
            {toast.detail && <small>{toast.detail}</small>}
            {toast.action && (
              <small className="toast-action">
                {toast.action.label}
              </small>
            )}
          </span>
        </button>
      ))}
    </div>,
    document.body,
  );
}

export function SheetFrame({ children, onClose, className = "edit-sheet", closing = false }: { children: React.ReactNode; onClose: () => void; className?: string; closing?: boolean }) {
  useEscapeToClose(onClose);
  const dialogRef = useFocusTrap<HTMLElement>(!closing);

  return (
    <div className={`sheet-backdrop ${closing ? "closing" : ""}`} onMouseDown={onClose}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`${className} ${closing ? "closing" : ""}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  );
}

/**
 * The full-page counterpart to SheetFrame. Same body markup and the same
 * `.edit-sheet` form styles (globals.css scopes the panel chrome to
 * `.sheet-backdrop >` so only the modal path picks it up) laid out as a screen
 * with the standard `.add-title` back header instead of a panel over a scrim.
 *
 * A destination reached from the side menu is a place in the app, not
 * something that pops up over the place you were: it deserves a back button,
 * the page's own scroll, and no focus trap. Screens built with this are
 * ordinary Tab values in app/page.tsx, which is also what gives them the
 * scroll-to-top and view-in animation every other tab gets for free.
 */
export function PageFrame({
  children,
  onBack,
  eyebrow,
  title,
  actions,
  className = "",
}: {
  children: React.ReactNode;
  onBack: () => void;
  eyebrow: string;
  title: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`view edit-sheet ${className}`}>
      <div className="add-title">
        <button onClick={onBack} aria-label="ย้อนกลับ"><ChevronLeft aria-hidden="true" /></button>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

/**
 * A native <input type="date"> wearing the app's own face.
 *
 * The bare control has exactly the problem .select-shell exists to fix for
 * <select>: the OS renders the value in the *browser's* locale, so a Thai app
 * shows "09/03/2026", and it paints its own calendar glyph, which stays black
 * on a dark panel because it is not an SVG that inherits currentColor.
 *
 * The real input stays -- it is what opens the OS picker and what keyboard
 * and screen-reader users operate -- but its own text is transparent and the
 * Thai date is drawn over it. CSS stretches the picker indicator across the
 * whole field so a tap anywhere still opens the calendar.
 */
export function DateField({
  value,
  onChange,
  max,
  placeholder = "เลือกวันที่",
}: {
  value: string;
  onChange: (value: string) => void;
  max?: string;
  placeholder?: string;
}) {
  return (
    <div className="date-shell">
      <input type="date" value={value} max={max} onChange={(event) => onChange(event.target.value)} />
      <span className="date-shell-text" aria-hidden="true">{value ? formatDateInputValue(value) : placeholder}</span>
      <CalendarDays className="date-shell-icon" aria-hidden="true" />
    </div>
  );
}

/** DateField's sibling for <input type="month">, same shell and same reason. */
export function MonthField({
  value,
  onChange,
  max,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  max?: string;
  className?: string;
}) {
  return (
    <div className={`date-shell ${className}`}>
      <input type="month" value={value} max={max} onChange={(event) => { if (event.target.value) onChange(event.target.value); }} aria-label="เลือกเดือนและปี" />
      <span className="date-shell-text" aria-hidden="true">{formatMonthInputValue(value) || "เลือกเดือน"}</span>
      <CalendarDays className="date-shell-icon" aria-hidden="true" />
    </div>
  );
}

/**
 * Keeps an overlay mounted for `duration` after `active` goes false so its
 * CSS exit animation (the `.closing` class) can finish instead of the
 * overlay just vanishing. `onExited` fires once the animation completes —
 * that's when the caller should actually clear its own state.
 */
export function useDismiss<A extends unknown[] = []>(active: boolean, onExited: (...args: A) => void, duration = 320) {
  const [mounted, setMounted] = useState(active);
  const [closing, setClosing] = useState(false);
  const [prevActive, setPrevActive] = useState(active);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reopening while still "closing" (or after having fully closed) needs to
  // reset synchronously so the sheet doesn't flash away mid re-open. This is
  // React's documented pattern for adjusting state when a prop changes.
  if (active !== prevActive) {
    setPrevActive(active);
    if (active) {
      setMounted(true);
      setClosing(false);
    }
  }

  useEffect(() => {
    if (active && timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [active]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const requestClose = useCallback((...args: A) => {
    setClosing(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setMounted(false);
      setClosing(false);
      onExited(...args);
    }, duration);
  }, [duration, onExited]);

  return { mounted, closing, requestClose };
}

/**
 * A function whose identity never changes but which always runs the latest
 * version of `fn`. For handing an ordinary function declared in the page
 * component (which is a new function every render, closing over that
 * render's state) to a memo()'d child without defeating the memo, and
 * without having to list every piece of state it reads as a useCallback
 * dependency -- a list that is easy to get wrong in a way no one notices
 * until a stale value writes the wrong money. Only for event handlers: the
 * function it returns must not be called during render.
 */
export function useStableHandler<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  return useCallback((...args: A) => latest.current(...args), []);
}

/**
 * Every sheet/dialog should close on Escape. SheetFrame calls this for
 * every sheet it wraps; the few overlays with their own backdrop
 * (side menu, confirm dialogs) call it directly instead of duplicating
 * the keydown listener.
 */
export function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
}

const focusableSelector = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab focus inside the returned ref's element while `active`, moves
 * focus into it on mount, and restores focus to whatever was focused
 * before on unmount/deactivate. Pairs with useEscapeToClose on every
 * sheet/dialog in the app so none of them leak keyboard focus to the page
 * underneath, or strand it once closed.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const containerRef = useRef<T | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
    (focusables()[0] ?? container).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [active]);

  return containerRef;
}

export function ConfirmDialog({ dialog, onClose, closing = false }: { dialog: ConfirmDialogState; onClose: (confirmed: boolean) => void; closing?: boolean }) {
  const close = useCallback(() => onClose(false), [onClose]);
  useEscapeToClose(close);
  const dialogRef = useFocusTrap<HTMLElement>(!closing);

  return (
    <div className={`dialog-backdrop ${closing ? "closing" : ""}`} onMouseDown={() => onClose(false)}>
      <section
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        tabIndex={-1}
        className={`confirm-dialog ${closing ? "closing" : ""}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2>{dialog.title}</h2>
        <p>{dialog.detail}</p>
        <div>
          <button onClick={() => onClose(false)}>ยกเลิก</button>
          <button className={dialog.tone === "danger" ? "danger" : undefined} onClick={() => onClose(true)}>
            {dialog.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export const decimalInputPattern = /^\d*\.?\d*$/;

export function AmountInput({ value, onChange, disabled, autoFocus }: { value: number; onChange: (value: number) => void; disabled?: boolean; autoFocus?: boolean }) {
  const [text, setText] = useState(() => (value ? String(value) : ""));

  if ((Number(text) || 0) !== value) {
    setText(value ? String(value) : "");
  }

  // The baht sign sits inside the field, drawn over its left padding, so every
  // amount in the app reads as money before a digit is typed.
  return (
    <span className="amount-field">
      <span className="amount-field-sign" aria-hidden="true">{moneySign}</span>
      <input
        className="amount-input"
        inputMode="decimal"
        placeholder="0"
        value={text}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(event) => {
          const next = event.target.value;
          if (next !== "" && !decimalInputPattern.test(next)) return;
          setText(next);
          onChange(Number(next) || 0);
        }}
      />
    </span>
  );
}

/** A sheet's close button: the same X icon every sheet uses, never a typed letter. */
export function SheetClose({ onClick, label = "ปิด" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="sheet-close" onClick={onClick} aria-label={label}>
      <X size={18} strokeWidth={2.25} aria-hidden="true" />
    </button>
  );
}

export function StateCard({
  tone,
  title,
  detail,
  action,
}: {
  tone: "loading" | "empty" | "error";
  title: string;
  detail: string;
  action?: EmptyAction;
}) {
  return (
    <div className={`state-card ${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span className="state-orb" aria-hidden="true">
        {tone === "loading" ? <span className="loading-spinner mini" /> : tone === "error" ? "!" : "•"}
      </span>
      <div>
        <b>{title}</b>
        <small>{detail}</small>
        {action && <button onClick={action.onClick}>{action.label}</button>}
      </div>
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="skeleton-stack" aria-hidden="true">
      <div className="skeleton-card hero" />
      <div className="skeleton-grid">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="skeleton-panel">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index}>
          <i />
          <b />
          <em />
        </span>
      ))}
    </div>
  );
}

export function ErrorActions({ onRetry, onDismiss }: { onRetry: () => void; onDismiss: () => void }) {
  return (
    <div className="error-actions">
      <button onClick={onRetry}>ลองซิงค์อีกครั้ง</button>
      <button onClick={onDismiss}>ปิดข้อความ</button>
    </div>
  );
}

/**
 * Pull down from the top of the page to reload it. The app scrolls inside
 * `.phone`, not the document, so neither iOS nor Android offers their own
 * pull-to-refresh here -- this listens on that one scroll container instead.
 *
 * The listeners are passive and never cancel the touch: the page scrolls and
 * bounces exactly as it would without this, and the gesture only counts
 * while the container is at its very top and the finger is moving down more
 * than sideways (so a horizontal rail swipe near the top is left alone).
 * `enabled` is false while a sheet is open or on a screen that fills the
 * viewport itself. `root` is the element itself rather than a ref, so the
 * listeners attach when `.phone` mounts -- behind the PIN or setup gate that
 * is later than this component's first render.
 *
 * Its own component, and the drag writes the indicator's position straight
 * to the DOM: it used to be state in the app's root component, so every
 * touchmove re-rendered the whole app, and the pull juddered on a phone.
 * React only hears about the two moments that change what is on screen --
 * the disc appearing, and the refresh starting and ending.
 */
export function PullToRefresh({
  root,
  onRefresh,
  enabled,
}: {
  root: HTMLElement | null;
  onRefresh: () => Promise<unknown>;
  enabled: boolean;
}) {
  const [shown, setShown] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const discRef = useRef<HTMLDivElement | null>(null);
  const pullRef = useRef(0);
  const refreshRef = useRef(onRefresh);
  useLayoutEffect(() => {
    refreshRef.current = onRefresh;
  });

  // Written to the disc directly, not through state (see above).
  const paint = useCallback((pull: number) => {
    pullRef.current = pull;
    const disc = discRef.current;
    if (!disc) return;
    disc.style.setProperty("--pull", `${pull}px`);
    disc.style.setProperty("--pull-turn", `${(pull / PULL_REFRESH_THRESHOLD) * 270}deg`);
    disc.classList.toggle("is-ready", pull >= PULL_REFRESH_THRESHOLD);
  }, []);

  // The disc mounts on the first frame of a pull; give it the pull so far.
  useLayoutEffect(() => {
    if (shown) paint(pullRef.current);
  }, [shown, paint]);

  useEffect(() => {
    if (!root || !enabled || refreshing) return;
    let start: { x: number; y: number } | null = null;
    const move = (pull: number) => {
      paint(pull);
      setShown(pull > 0);
    };
    const onStart = (event: TouchEvent) => {
      start = root.scrollTop <= 0 && event.touches.length === 1
        ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
        : null;
    };
    const onMove = (event: TouchEvent) => {
      if (!start) return;
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (root.scrollTop > 0 || dy <= 0 || Math.abs(dx) > dy) {
        if (pullRef.current) move(0);
        if (root.scrollTop > 0 || Math.abs(dx) > Math.abs(dy)) start = null;
        return;
      }
      // Half the finger's travel: a pull should feel heavier than a scroll.
      move(Math.min(PULL_REFRESH_MAX, dy / 2));
    };
    const onEnd = () => {
      if (!start) return;
      start = null;
      if (pullRef.current < PULL_REFRESH_THRESHOLD) {
        move(0);
        return;
      }
      paint(PULL_REFRESH_THRESHOLD);
      setRefreshing(true);
      const minimum = new Promise((resolve) => setTimeout(resolve, PULL_REFRESH_MIN_MS));
      Promise.allSettled([refreshRef.current(), minimum]).then(() => {
        pullRef.current = 0;
        setRefreshing(false);
        setShown(false);
      });
    };
    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: true });
    root.addEventListener("touchend", onEnd, { passive: true });
    root.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", onEnd);
    };
  }, [root, enabled, refreshing, paint]);

  if (!shown && !refreshing) return null;
  return (
    <div
      ref={discRef}
      className={`pull-refresh${refreshing ? " is-refreshing is-ready" : ""}`}
      role="status"
      aria-label={refreshing ? "กำลังโหลดข้อมูลใหม่" : "ดึงลงเพื่อโหลดใหม่"}
    >
      <RefreshCw size={18} strokeWidth={2.5} aria-hidden="true" />
    </div>
  );
}
