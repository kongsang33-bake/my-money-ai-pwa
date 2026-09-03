"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { formatDateTime, formatMoney, formatSignedMoney, moneySign, toFiniteNumber, toMoneyAmount, normalizeBillingDay } from "@/lib/format";
import { nextBillingInfo } from "@/lib/cycle";
import { walletTagHints, walletTagLabels, type WalletTag } from "@/lib/taxonomy";
import { nameColor, recurringIconOptions } from "@/lib/category";
import type { Entry, RecurringExpense, Wallet, WalletDisplay } from "@/lib/types";
import { IconColorPicker, RecurringAvatarGlyph, WalletAvatarGlyph } from "@/components/shared";
import { CountUpMoney, EmptyNote, SheetFrame, SkeletonList, StateCard, decimalInputPattern } from "@/components/primitives";

export function WalletsView({
  wallets,
  entries,
  loading,
  onBack,
  onAdd,
  onEdit,
  onDelete,
}: {
  wallets: WalletDisplay[];
  entries: Entry[];
  loading: boolean;
  onBack: () => void;
  onAdd: () => void;
  onEdit: (wallet: Wallet) => void;
  onDelete: (wallet: Wallet) => void;
}) {
  const total = wallets.reduce((sum, wallet) => sum + wallet.display_balance, 0);
  const [openWalletId, setOpenWalletId] = useState<string | null>(null);
  const entriesByWallet = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of entries) {
      if (!entry.wallet_id) continue;
      const list = map.get(entry.wallet_id) ?? [];
      list.push(entry);
      map.set(entry.wallet_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
    return map;
  }, [entries]);
  const selectedWallet = wallets.find((wallet) => wallet.id === openWalletId) ?? null;
  const selectedWalletEntries = selectedWallet ? (entriesByWallet.get(selectedWallet.id) ?? []).slice(0, 8) : [];

  return (
    <div className="view debtor-view">
      {loading && <SkeletonList rows={3} />}
      <div className="add-title">
        <button onClick={onBack} aria-label="ย้อนกลับ"><ChevronLeft aria-hidden="true" /></button>
        <div>
          <p className="eyebrow">จัดการกองเงิน</p>
          <h2>กระเป๋าตังค์</h2>
        </div>
        <button className="header-add-button" onClick={onAdd}>เพิ่ม</button>
      </div>
      <section className="debtor-detail-card">
        <span>ยอดรวมทุกกระเป๋า</span>
        <strong><CountUpMoney value={total} /></strong>
      </section>
      <div className="debtor-page-list">
        {wallets.map((wallet) => (
          <article className={`debtor-page-item ${openWalletId === wallet.id ? "active" : ""}`} key={wallet.id}>
            <i className="card-accent" style={{ background: wallet.icon_color ?? nameColor(wallet.name) }} />
            <button className="debtor-main-button" onClick={() => setOpenWalletId((current) => current === wallet.id ? null : wallet.id)}>
              <span className="debtor-avatar" style={{ background: wallet.icon_color ?? nameColor(wallet.name) }}>
                <WalletAvatarGlyph iconKey={wallet.icon} fallbackName={wallet.name} />
              </span>
              <div>
                <span>{wallet.name}</span>
                <small>
                  {walletTagLabels[wallet.tag]} · {moneySign}{formatMoney(wallet.display_balance)}
                  {wallet.is_default ? " · กระเป๋าหลัก" : ""}
                </small>
              </div>
            </button>
            <details className="kebab-menu" name="wallet-kebab">
              <summary>⋮</summary>
              <menu>
                <button onClick={() => onEdit(wallet)}>แก้ไข</button>
                <button onClick={() => onDelete(wallet)}>ลบ</button>
              </menu>
            </details>
          </article>
        ))}
        {!wallets.length && <EmptyNote glyph="▣" action={{ label: "เพิ่มกระเป๋า", onClick: onAdd }}>ยังไม่มีกระเป๋าตังค์ สร้างกองเงินแรกของคุณได้เลย</EmptyNote>}
      </div>
      {selectedWallet && (
        <section className="wallet-statement-panel">
          <div className="section-title">
            <h2>รายการใน {selectedWallet.name}</h2>
            <button onClick={() => onEdit(selectedWallet)}>แก้ไขกระเป๋า</button>
          </div>
          <div className="wallet-statement">
            {selectedWalletEntries.length ? (
              selectedWalletEntries.map((entry) => (
                <div className="wallet-statement-row" key={entry.id}>
                  <span>{entry.title}</span>
                  <small>{formatDateTime(entry.occurred_at)}</small>
                  <b className={entry.wallet_impact >= 0 ? "income" : "expense"}>{formatSignedMoney(entry.wallet_impact)}</b>
                </div>
              ))
            ) : (
              <p>ยังไม่มีรายการในกระเป๋านี้</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export type WalletInput = {
  name: string;
  tag: WalletTag;
  balance: number;
  icon: string | null;
  icon_color: string | null;
  is_default: boolean;
};

export function WalletEditSheet({
  wallet,
  busy,
  error,
  onClose,
  onCreate,
  onUpdate,
  existingWallets,
  closing,
}: {
  wallet: Wallet | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onCreate: (input: WalletInput) => Promise<boolean>;
  onUpdate: (wallet: Wallet, patch: WalletInput) => Promise<boolean>;
  existingWallets: Wallet[];
  closing?: boolean;
}) {
  const [name, setName] = useState(wallet?.name ?? "");
  const [tag, setTag] = useState<WalletTag>(wallet?.tag ?? "cash");
  const [balanceText, setBalanceText] = useState(wallet?.balance ? String(wallet.balance) : "");
  const [icon, setIcon] = useState<string | null>(wallet?.icon ?? null);
  const [iconColor, setIconColor] = useState<string | null>(wallet?.icon_color ?? null);
  const [isDefault, setIsDefault] = useState(wallet?.is_default ?? !existingWallets.length);

  const submit = async () => {
    if (!name.trim()) return;
    const payload: WalletInput = { name, tag, balance: toFiniteNumber(balanceText), icon, icon_color: iconColor, is_default: isDefault };
    const saved = wallet ? await onUpdate(wallet, payload) : await onCreate(payload);
    if (saved) onClose();
  };

  return (
    <SheetFrame onClose={onClose} closing={closing}>
      <div className="sheet-head">
        <div>
          <p className="eyebrow">{wallet ? "แก้ไขกระเป๋าตังค์" : "เพิ่มกระเป๋าตังค์"}</p>
          <h2>{wallet ? wallet.name : "กระเป๋าใหม่"}</h2>
        </div>
        <button onClick={onClose}>x</button>
      </div>
      <IconColorPicker value={{ icon, color: iconColor }} onChange={({ icon: nextIcon, color: nextColor }) => { setIcon(nextIcon); setIconColor(nextColor); }} fallbackName={name || "?"} />
      <label>
        ชื่อกระเป๋า
        <input autoFocus={!wallet} value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น กระเป๋าหลัก, ออมทรัพย์ SCB" />
      </label>
      <label>
        ประเภท
        <div className="select-shell">
          <select value={tag} onChange={(event) => setTag(event.target.value as WalletTag)}>
          {(Object.keys(walletTagLabels) as WalletTag[]).map((key) => (
            <option key={key} value={key}>{walletTagLabels[key]}</option>
          ))}
        </select>
          <ChevronDown className="select-shell-chevron" aria-hidden="true" />
        </div>
        <small className="cycle-note">{walletTagHints[tag]}</small>
      </label>
      <label>
        ยอดเงิน
        <input inputMode="decimal" value={balanceText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setBalanceText(event.target.value); }} />
      </label>
      <label className="sheet-check-row">
        <input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
        ใช้เป็นกระเป๋าหลัก
      </label>
      {error && <StateCard tone="error" title="บันทึกไม่สำเร็จ" detail={error} />}
      <button className="save" onClick={submit} disabled={busy || !name.trim()}>
        {busy ? "กำลังบันทึก..." : "บันทึก"}
      </button>
    </SheetFrame>
  );
}
export function RecurringExpensesView({
  items,
  loading,
  onBack,
  onAdd,
  onEdit,
  onDelete,
}: {
  items: RecurringExpense[];
  loading: boolean;
  onBack: () => void;
  onAdd: () => void;
  onEdit: (item: RecurringExpense) => void;
  onDelete: (item: RecurringExpense) => void;
}) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const today = new Date();
  const upcoming = items
    .map((item) => {
      const { billingDate, daysUntil } = nextBillingInfo(item, today);
      return { item, date: billingDate, days: daysUntil };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 4);

  return (
    <div className="view debtor-view">
      {loading && <SkeletonList rows={3} />}
      <div className="add-title">
        <button onClick={onBack} aria-label="ย้อนกลับ"><ChevronLeft aria-hidden="true" /></button>
        <div>
          <p className="eyebrow">รายจ่ายประจำ</p>
          <h2>ค่าใช้จ่ายรายเดือน</h2>
        </div>
        <button className="header-add-button" onClick={onAdd}>เพิ่ม</button>
      </div>
      <section className="debtor-detail-card">
        <span>ยอดรวมต่อเดือน</span>
        <strong><CountUpMoney value={total} /></strong>
      </section>
      {!!upcoming.length && (
        <section className="recurring-timeline" aria-label="กำหนดตัดเงินถัดไป">
          <div className="section-title-row"><h3>กำหนดตัดเงินถัดไป</h3><small>{upcoming.length} รายการ</small></div>
          <div className="recurring-timeline-list">
            {upcoming.map(({ item, date, days }) => (
              <button key={item.id} className="recurring-timeline-row" onClick={() => onEdit(item)}>
                <span className="recurring-date"><b>{date.getDate()}</b><small>{date.toLocaleDateString("th-TH", { month: "short" })}</small></span>
                <span className="recurring-service"><i style={{ background: item.icon_color ?? nameColor(item.name) }}><RecurringAvatarGlyph iconKey={item.icon} fallbackName={item.name} size={15} /></i><span><b>{item.name}</b><small>{days === 0 ? "วันนี้" : `อีก ${days} วัน`}</small></span></span>
                <strong>{moneySign}{formatMoney(item.amount)}</strong>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="debtor-page-list">
        {items.map((item) => (
          <article className="debtor-page-item" key={item.id}>
            <i className="card-accent" style={{ background: item.icon_color ?? nameColor(item.name) }} />
            <button className="debtor-main-button" onClick={() => onEdit(item)}>
              <span className="debtor-avatar" style={{ background: item.icon_color ?? nameColor(item.name) }}>
                <RecurringAvatarGlyph iconKey={item.icon} fallbackName={item.name} />
              </span>
              <div>
                <span>{item.name}</span>
                <small>ตัดเงินทุกวันที่ {item.billing_day} · {moneySign}{formatMoney(item.amount)}</small>
              </div>
            </button>
            <details className="kebab-menu" name="recurring-kebab">
              <summary>⋮</summary>
              <menu>
                <button onClick={() => onEdit(item)}>แก้ไข</button>
                <button onClick={() => onDelete(item)}>ลบ</button>
              </menu>
            </details>
          </article>
        ))}
        {!items.length && <EmptyNote glyph="↻" action={{ label: "เพิ่มรายจ่ายประจำ", onClick: onAdd }}>ยังไม่มีรายจ่ายประจำ ลองเพิ่มค่าสมัครสมาชิกที่จ่ายทุกเดือน เช่น Netflix, Claude Pro</EmptyNote>}
      </div>
    </div>
  );
}

export type RecurringExpenseInput = {
  name: string;
  amount: number;
  billing_day: number;
  icon: string | null;
  icon_color: string | null;
};

export function RecurringExpenseEditSheet({
  item,
  busy,
  error,
  onClose,
  onCreate,
  onUpdate,
  closing,
}: {
  item: RecurringExpense | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onCreate: (input: RecurringExpenseInput) => Promise<boolean>;
  onUpdate: (item: RecurringExpense, patch: RecurringExpenseInput) => Promise<boolean>;
  closing?: boolean;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [amountText, setAmountText] = useState(item?.amount ? String(item.amount) : "");
  const [billingDay, setBillingDay] = useState(item?.billing_day ?? 1);
  const [icon, setIcon] = useState<string | null>(item?.icon ?? null);
  const [iconColor, setIconColor] = useState<string | null>(item?.icon_color ?? null);

  const submit = async () => {
    if (!name.trim()) return;
    const payload: RecurringExpenseInput = { name, amount: toMoneyAmount(amountText), billing_day: billingDay, icon, icon_color: iconColor };
    const saved = item ? await onUpdate(item, payload) : await onCreate(payload);
    if (saved) onClose();
  };

  return (
    <SheetFrame onClose={onClose} closing={closing}>
      <div className="sheet-head">
        <div>
          <p className="eyebrow">{item ? "แก้ไขรายจ่ายประจำ" : "เพิ่มรายจ่ายประจำ"}</p>
          <h2>{item ? item.name : "รายการใหม่"}</h2>
        </div>
        <button onClick={onClose}>x</button>
      </div>
      <IconColorPicker value={{ icon, color: iconColor }} onChange={({ icon: nextIcon, color: nextColor }) => { setIcon(nextIcon); setIconColor(nextColor); }} fallbackName={name || "?"} iconOptions={recurringIconOptions} renderGlyph={RecurringAvatarGlyph} />
      <label>
        ชื่อรายการ
        <input autoFocus={!item} value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น Netflix, Claude Pro, YouTube Premium" />
      </label>
      <label>
        ยอดต่อเดือน
        <input inputMode="decimal" value={amountText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setAmountText(event.target.value); }} />
      </label>
      <label>
        ตัดเงินทุกวันที่
        <div className="select-shell">
          <select value={billingDay} onChange={(event) => setBillingDay(normalizeBillingDay(event.target.value))}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
            <option key={day} value={day}>{day}</option>
          ))}
        </select>
          <ChevronDown className="select-shell-chevron" aria-hidden="true" />
        </div>
      </label>
      {error && <StateCard tone="error" title="บันทึกไม่สำเร็จ" detail={error} />}
      <button className="save" onClick={submit} disabled={busy || !name.trim()}>
        {busy ? "กำลังบันทึก..." : "บันทึก"}
      </button>
    </SheetFrame>
  );
}
