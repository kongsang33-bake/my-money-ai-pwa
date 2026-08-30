"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Info } from "lucide-react";
import { formatMoney, moneySign } from "@/lib/format";
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

