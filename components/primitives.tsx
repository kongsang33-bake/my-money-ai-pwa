"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarDays, Check, ChevronLeft, Info } from "lucide-react";
import { formatDateInputValue, formatMoney, moneySign } from "@/lib/format";
import type { ConfirmDialogState, EmptyAction, Toast } from "@/lib/types";

// A generic animated-count-up money display -- lives here rather than in
// components/home.tsx (its main caller, HeroWalletCard) specifically to
// avoid a circular import: Metric below (also in this file) renders it too,
// and home.tsx already imports several primitives from this file.
export const CountUpMoney = memo(function CountUpMoney({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = window.requestAnimationFrame(() => {
        setShown(value);
        fromRef.current = value;
      });
      return () => window.cancelAnimationFrame(id);
    }
    const from = fromRef.current;
    const to = value;
    const duration = 420;
    let startTime: number | null = null;
    let frameId: number;
    const tick = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min(1, (timestamp - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(from + (to - from) * eased);
      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
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

export function EmptyNote({ glyph, children, action }: { glyph: string; children: React.ReactNode; action?: EmptyAction }) {
  return (
    <div className="empty-note">
      <span className="empty-glyph">{glyph}</span>
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

export function SheetFrame({ children, onClose, className = "edit-sheet", closing = false, originPoint }: { children: React.ReactNode; onClose: () => void; className?: string; closing?: boolean; originPoint?: SheetOrigin | null }) {
  useEscapeToClose(onClose);
  const dialogRef = useFocusTrap<HTMLElement>(!closing);
  useSheetOrigin(dialogRef, originPoint);

  return (
    <div className={`sheet-backdrop ${originPoint ? "from-origin" : ""} ${closing ? "closing" : ""}`} onMouseDown={onClose}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`${className} ${originPoint ? "sheet-from-origin" : ""} ${closing ? "closing" : ""}`}
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

/**
 * Viewport-space point a sheet should appear to grow out of — the centre of
 * the control that opened it. `captureSheetOrigin` reads it off the click.
 */
export type SheetOrigin = { x: number; y: number };

export function captureSheetOrigin(element: HTMLElement): SheetOrigin {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Translates a viewport-space origin into the sheet's own coordinate space
 * and writes it out as `--origin-x`/`--origin-y`/`--origin-r`, which the
 * `.sheet-from-origin` rules in globals.css use as the transform origin and
 * as the centre and end radius of the expanding clip circle. The radius is
 * the distance from the origin to the sheet's farthest corner, in px: a
 * percentage end radius would finish covering the sheet well before the
 * animation ends (and can't interpolate cleanly from a px start radius), so
 * the reveal would be over in the first few frames. Layout effect, so the
 * vars are in place before the entry animation paints its first frame.
 */
function useSheetOrigin(ref: React.RefObject<HTMLElement | null>, originPoint?: SheetOrigin | null) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !originPoint) return;
    const apply = () => {
      // Measured off offset*, not getBoundingClientRect: the entry animation
      // fills backwards, so by the time this runs the element already carries
      // its "from" frame and would report a box scaled to 0.72 around a
      // transform origin that depends on the very vars being computed here.
      // offset* is the untransformed layout box, and the sheet's offsetParent
      // is the fixed, full-viewport backdrop, so it is in viewport space.
      const parentRect = (node.offsetParent as HTMLElement | null)?.getBoundingClientRect();
      const left = node.offsetLeft + (parentRect?.left ?? 0);
      const top = node.offsetTop + (parentRect?.top ?? 0);
      const rect = { left, top, width: node.offsetWidth, height: node.offsetHeight };
      const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);
      const x = clamp(originPoint.x - rect.left, rect.width);
      const y = clamp(originPoint.y - rect.top, rect.height);
      const radius = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));
      node.style.setProperty("--origin-x", `${x}px`);
      node.style.setProperty("--origin-y", `${y}px`);
      node.style.setProperty("--origin-r", `${Math.ceil(radius)}px`);
    };
    apply();
    // The animation fills forwards, so its clip circle still applies once the
    // sheet has opened: recompute on resize, or a viewport that changed shape
    // underneath an open sheet (rotation, an on-screen keyboard) would leave
    // it cropped by a circle sized for the old box.
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [ref, originPoint]);
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

  return (
    <input
      className="amount-input"
      inputMode="decimal"
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

export function Metric({ label, value, tone, showPositiveSign = false }: { label: string; value: number; tone?: "income" | "expense"; showPositiveSign?: boolean }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <b>{value < 0 ? "−" : showPositiveSign && value > 0 ? "+" : ""}<CountUpMoney value={Math.abs(value)} /></b>
    </div>
  );
}

