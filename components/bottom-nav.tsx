"use client";

import { useState } from "react";
import { MoreHorizontal, Wallet as WalletIcon } from "lucide-react";

export type BottomNavKey = "home" | "history" | "wallets" | "more";

/**
 * The five-slot bottom bar: four tabs around the AI add button. The button
 * order is load-bearing -- e2e/fixture.ts clicks `.bottom-nav > button` by
 * index -- so keep home / history / add / wallets / more in that order.
 *
 * The "you are here" highlight is one pill that slides between tabs rather
 * than a separate highlight fading in under each button; the movement is what
 * tells you where you came from.
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
  // The screens reached from the side menu select no tab. The pill fades out
  // where it stands rather than sliding somewhere arbitrary, so the last
  // selected tab has to outlive `active` going null -- adjusted during render
  // (React re-runs the component before painting) rather than in an effect,
  // which would paint one frame with the pill in the old place first.
  const [selected, setSelected] = useState<BottomNavKey>(active ?? "home");
  if (active && active !== selected) setSelected(active);

  return (
    <nav className="bottom-nav" inert={inert}>
      {/* Naming the tab is the whole of this component's say in where the pill
          goes: .nav-indicator in globals.css spells out each tab's left edge
          from the grid's own columns, so nothing here measures the DOM. */}
      <span
        className="nav-indicator"
        data-tab={selected}
        data-visible={active ? "true" : "false"}
        aria-hidden="true"
      />
      <button className={active === "home" ? "active" : ""} onClick={() => onSelect("home")} aria-label="หน้าหลัก">
        <span className="nav-item">
          <span className="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 10.8 12 4l8 6.8v8.7a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5v-8.7Z" />
            </svg>
          </span>
          <span className="nav-label">หน้าหลัก</span>
        </span>
      </button>
      <button className={active === "history" ? "active" : ""} onClick={() => onSelect("history")} aria-label="รายการ">
        <span className="nav-item">
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
        <span className="nav-item">
          <span className="nav-icon" aria-hidden="true">
            <WalletIcon aria-hidden="true" />
          </span>
          <span className="nav-label">กระเป๋า</span>
        </span>
      </button>
      <button className={active === "more" ? "active" : ""} onClick={onMore} aria-label="เพิ่มเติม">
        <span className="nav-item">
          <span className="nav-icon" aria-hidden="true">
            <MoreHorizontal aria-hidden="true" />
          </span>
          <span className="nav-label">อื่น ๆ</span>
        </span>
      </button>
    </nav>
  );
}
