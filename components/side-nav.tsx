"use client";

import NextImage from "next/image";
import { CalendarClock, Download, House, Lightbulb, LineChart, PiggyBank, Plus, Receipt, ScrollText, TrendingUp, Users, Wallet as WalletIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

// The desktop nav (from 900px): a column down the left edge, the way a
// program on a computer is laid out, in place of the phone's bottom bar
// (BottomNav) and topbar, which globals.css hides at that width. Everything
// "ของฉัน" lists on a phone sits in it directly -- a desk has the room, so
// the money tools are one click away rather than a screen in. The account
// sits at its foot and opens "ของฉัน". Below 1200px it folds to icons.

export type SideNavKey =
  | "home" | "history" | "upcoming" | "wallets" | "debtors" | "recurring"
  | "budgets" | "goals" | "portfolio" | "ask" | "report" | "more";

type Item = { key: SideNavKey; label: string; icon: LucideIcon };

const MAIN_ITEMS: Item[] = [
  { key: "home", label: "หน้าหลัก", icon: House },
  { key: "history", label: "รายการ", icon: ScrollText },
  { key: "upcoming", label: "กำลังจะมา", icon: CalendarClock },
];

// Same names and icons as the tiles on "ของฉัน" (MoreView), so the two are
// recognisably the same places.
const MONEY_ITEMS: Item[] = [
  { key: "wallets", label: "กระเป๋าเงิน", icon: WalletIcon },
  { key: "debtors", label: "จัดการหนี้", icon: Users },
  { key: "recurring", label: "รายจ่ายประจำ", icon: Receipt },
  { key: "budgets", label: "งบประมาณ", icon: TrendingUp },
  { key: "goals", label: "เป้าหมายการเงิน", icon: PiggyBank },
  { key: "portfolio", label: "พอร์ตลงทุน", icon: LineChart },
  { key: "ask", label: "ถาม AI เรื่องเงิน", icon: Lightbulb },
  { key: "report", label: "ส่งออกรีพอร์ท", icon: Download },
];

export function SideNav({
  active,
  inert,
  displayName,
  displayIcon,
  displayIconImage,
  upcomingCount,
  onSelect,
  onAdd,
}: {
  active: SideNavKey | null;
  inert: boolean;
  displayName: string;
  displayIcon: string;
  displayIconImage: string;
  /** Things in "กำลังจะมา" wanting attention; shown as a count, 0 hides it. */
  upcomingCount: number;
  onSelect: (key: SideNavKey) => void;
  onAdd: () => void;
}) {
  const renderItem = ({ key, label, icon: Icon }: Item) => (
    <button
      key={key}
      type="button"
      className={`side-nav-item${active === key ? " active" : ""}`}
      data-nav={key}
      aria-current={active === key ? "page" : undefined}
      title={label}
      onClick={() => onSelect(key)}
    >
      <Icon size={20} strokeWidth={2} aria-hidden="true" />
      <span className="side-nav-label">{label}</span>
      {key === "upcoming" && upcomingCount > 0 && <span className="side-nav-count">{upcomingCount}</span>}
    </button>
  );

  return (
    <nav className="side-nav" aria-label="เมนูหลัก" inert={inert}>
      <div className="side-nav-brand">
        <i className="brand-mark" aria-hidden="true" />
        <b className="brand-name side-nav-label">{APP_NAME}</b>
      </div>
      <button type="button" className="side-nav-add" data-nav="add" onClick={onAdd} title="จดรายการ (N)">
        <Plus size={20} strokeWidth={2.5} aria-hidden="true" />
        <span className="side-nav-label">จดรายการ</span>
        <kbd className="side-nav-label" aria-hidden="true">N</kbd>
      </button>
      <div className="side-nav-group">{MAIN_ITEMS.map(renderItem)}</div>
      <div className="side-nav-group">
        <span className="side-nav-heading side-nav-label">เงินของฉัน</span>
        {MONEY_ITEMS.map(renderItem)}
      </div>
      <button
        type="button"
        className={`side-nav-account${active === "more" ? " active" : ""}`}
        data-nav="more"
        aria-current={active === "more" ? "page" : undefined}
        title="ของฉัน"
        aria-label={`ของฉัน: ${displayName}`}
        onClick={() => onSelect("more")}
      >
        <span className={`home-profile-icon ${displayIconImage ? "has-image" : ""}`}>
          {displayIconImage && <NextImage className="profile-image" src={displayIconImage} alt="" width={34} height={34} unoptimized />}
          {!displayIconImage && displayIcon}
        </span>
        <span className="side-nav-label side-nav-account-text">
          <b>{displayName}</b>
          <small>บัญชี · PIN · ออกจากระบบ</small>
        </span>
      </button>
    </nav>
  );
}
