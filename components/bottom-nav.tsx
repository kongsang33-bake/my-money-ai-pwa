"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MoreHorizontal, Wallet as WalletIcon } from "lucide-react";

export type BottomNavKey = "home" | "history" | "wallets" | "more";

type Pill = { left: number; width: number; height: number };

/**
 * The five-slot bottom bar: four tabs around the AI add button. The button
 * order is load-bearing -- e2e/fixture.ts clicks `.bottom-nav > button` by
 * index -- so keep home / history / add / wallets / more in that order.
 *
 * The "you are here" highlight is one pill that slides between tabs rather
 * than a separate highlight fading in under each button; the movement is
 * what tells you where you came from. It is measured from the active
 * `.nav-item` with offsetLeft/offsetWidth (both relative to the nav, which
 * is the items' offsetParent in every breakpoint because it is always
 * positioned) instead of getBoundingClientRect, so the nav's own
 * transforms -- the -50% centering above 900px and the slide-away while a
 * sheet is open -- can't skew it.
 */
export function BottomNav({
  active,
  inert,
  onSelect,
  onAdd,
  onMore,
}: {
  active: BottomNavKey | null;
  inert: boolean;
  onSelect: (key: "home" | "history" | "wallets") => void;
  onAdd: () => void;
  onMore: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const navRef = useRef<HTMLElement | null>(null);
  // One ref per tab rather than a map keyed by index: the middle slot is the
  // add button, not a tab, so indices and tabs don't line up.
  const homeItem = useRef<HTMLSpanElement | null>(null);
  const historyItem = useRef<HTMLSpanElement | null>(null);
  const walletsItem = useRef<HTMLSpanElement | null>(null);
  const moreItem = useRef<HTMLSpanElement | null>(null);
  const [pill, setPill] = useState<Pill | null>(null);
  const [sliding, setSliding] = useState(false);

  const measure = useCallback(() => {
    // No tab is selected on the screens reached from the side menu. Leave the
    // pill where it was and let CSS fade it out -- moving it somewhere
    // arbitrary on the way out reads as a mis-navigation.
    if (!active) return;
    const item = active === "home" ? homeItem.current
      : active === "history" ? historyItem.current
      : active === "wallets" ? walletsItem.current
      : moreItem.current;
    // A zero-width read means the nav hasn't been laid out yet (or fonts are
    // still swapping); a stale pill beats a collapsed one.
    if (!item || item.offsetWidth === 0) return;
    const next = { left: item.offsetLeft, width: item.offsetWidth, height: item.offsetHeight };
    setPill((current) =>
      current && current.left === next.left && current.width === next.width && current.height === next.height
        ? current
        : next,
    );
  }, [active]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  // Width changes that don't go through React: the three breakpoints, an
  // orientation flip, and the web font landing after first paint (Thai labels
  // are what the pill is sized to).
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(nav);
    for (const item of [homeItem.current, historyItem.current, walletsItem.current, moreItem.current]) {
      if (item) observer.observe(item);
    }
    return () => observer.disconnect();
  }, [measure]);

  // The first placement is a jump, not a slide -- otherwise the pill flies in
  // from the left edge on every cold boot.
  useEffect(() => {
    if (!pill || sliding) return;
    const frame = requestAnimationFrame(() => setSliding(true));
    return () => cancelAnimationFrame(frame);
  }, [pill, sliding]);

  return (
    <nav className="bottom-nav" inert={inert} ref={navRef}>
      <span
        className={`nav-indicator${sliding ? " sliding" : ""}`}
        aria-hidden="true"
        data-visible={pill && active ? "true" : "false"}
        style={pill ? { width: pill.width, height: pill.height, transform: `translate3d(${pill.left}px, -50%, 0)` } : undefined}
      />
      <button className={active === "home" ? "active" : ""} onClick={() => onSelect("home")} aria-label="หน้าหลัก">
        <span className="nav-item" ref={homeItem}>
          <span className="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 10.8 12 4l8 6.8v8.7a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5v-8.7Z" />
            </svg>
          </span>
          <span className="nav-label">หน้าหลัก</span>
        </span>
      </button>
      <button className={active === "history" ? "active" : ""} onClick={() => onSelect("history")} aria-label="รายการ">
        <span className="nav-item" ref={historyItem}>
          <span className="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M6.5 5.5h11v13h-11z" />
              <path d="M9.5 9h5M9.5 12h5M9.5 15h3" />
            </svg>
          </span>
          <span className="nav-label">รายการ</span>
        </span>
      </button>
      <button className="add-button" onClick={onAdd} aria-label="เพิ่มรายการด้วย AI">
        <span className="nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
      </button>
      <button className={active === "wallets" ? "active" : ""} onClick={() => onSelect("wallets")} aria-label="กระเป๋าตังค์">
        <span className="nav-item" ref={walletsItem}>
          <span className="nav-icon" aria-hidden="true">
            <WalletIcon aria-hidden="true" />
          </span>
          <span className="nav-label">กระเป๋า</span>
        </span>
      </button>
      <button className={active === "more" ? "active" : ""} onClick={onMore} aria-label="เพิ่มเติม">
        <span className="nav-item" ref={moreItem}>
          <span className="nav-icon" aria-hidden="true">
            <MoreHorizontal aria-hidden="true" />
          </span>
          <span className="nav-label">อื่น ๆ</span>
        </span>
      </button>
    </nav>
  );
}
