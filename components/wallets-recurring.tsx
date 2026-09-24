"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { formatDateTime, formatMoney, formatShortDate, formatSignedMoney, localDateInput, moneySign, toFiniteNumber, toMoneyAmount, normalizeIntervalCount } from "@/lib/format";
import { nextBillingInfo } from "@/lib/cycle";
import { recurringTotals } from "@/lib/money";
import { BILLING_CYCLE_PRESETS, billingIntervalUnitLabels, describeBillingCycle, walletTagHints, walletTagLabels, type BillingIntervalUnit, type WalletTag } from "@/lib/taxonomy";
import { nameColor, recurringIconOptions } from "@/lib/category";
import type { Debtor, Entry, RecurringExpense, Wallet, WalletDisplay } from "@/lib/types";
import { FundingSelect, IconColorPicker, RecurringAvatarGlyph, WalletAvatarGlyph } from "@/components/shared";
import { AmountInput, CountUpMoney, DateField, EmptyNote, InfoHint, SheetFrame, SkeletonList, StateCard, decimalInputPattern } from "@/components/primitives";

export function WalletsView({
  wallets,
  entries,
  loading,
  onAdd,
  onEdit,
  onDelete,
  onReconcile,
  onBack,
  parked = false,
}: {
  wallets: WalletDisplay[];
  entries: Entry[];
  loading: boolean;
  /** Kept mounted behind another tab (see .is-parked in globals.css). */
  parked?: boolean;
  onAdd: () => void;
  onEdit: (wallet: Wallet) => void;
  onDelete: (wallet: Wallet) => void;
  onReconcile: (wallet: WalletDisplay) => void;
  onBack: () => void;
}) {
  const total = wallets.reduce((sum, wallet) => sum + wallet.display_balance, 0);
  // The one split worth making on a total: money that spends itself today
  // (the cash tag, which is what Home's balance shows) against money that is
  // deliberately somewhere else -- savings, the coin float, the rest.
  const spendable = wallets.filter((wallet) => wallet.tag === "cash").reduce((sum, wallet) => sum + wallet.display_balance, 0);
  const setAside = total - spendable;
  const [openWalletId, setOpenWalletId] = useState<string | null>(null);
  // Leaving the tab used to unmount this and so close whatever statement was
  // open; parked, it would still be open on the way back. Closed here instead,
  // during render, so the list is what the user comes back to.
  if (parked && openWalletId) setOpenWalletId(null);
  const statementRef = useRef<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Same for a wallet's kebab menu: a <details> keeps its own open state in
  // the DOM, which a parked screen no longer throws away.
  useEffect(() => {
    if (!parked) return;
    rootRef.current?.querySelectorAll("details[open]").forEach((menu) => menu.removeAttribute("open"));
  }, [parked]);
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
    <div ref={rootRef} className={`view wallets-view${parked ? " is-parked" : ""}`} inert={parked}>
      {loading && <SkeletonList rows={3} />}
      {/* A back chevron again: Wallets left the bottom nav when "กำลังจะมา"
          took its slot, and is a screen under "อื่น ๆ" now (or opened from
          Home's billboard and wallet rail), so back goes to wherever it was
          opened from -- backFromMoreSection. */}
      <div className="add-title">
        <button onClick={onBack} aria-label="ย้อนกลับ"><ChevronLeft aria-hidden="true" /></button>
        <div>
          <p className="eyebrow">จัดการกองเงิน</p>
          <h2>กระเป๋าเงิน</h2>
        </div>
        <button className="header-add-button" onClick={onAdd}>เพิ่ม</button>
      </div>
      {/* Bare, like the billboard's words without the box: the one figure
          this screen is about, and the split under it drawn as a bar so the
          proportion reads before the numbers do. */}
      <section className="wallet-total-card">
        <div className="billboard-kicker">
          <i className="brand-mark" aria-hidden="true" />
          <span>ยอดรวมทุกกระเป๋า</span>
        </div>
        <strong><CountUpMoney value={total} /></strong>
        {setAside > 0 && (
          <>
            <span className="wallet-total-bar" aria-hidden="true">
              <i style={{ width: `${total > 0 ? Math.max(0, Math.min(100, (spendable / total) * 100)) : 0}%` }} />
            </span>
            <p className="wallet-total-split">
              <span className="spendable">ใช้ได้ตอนนี้ <b>{moneySign}{formatMoney(spendable)}</b></span>
              <span className="set-aside">กันไว้ <b>{moneySign}{formatMoney(setAside)}</b></span>
            </p>
          </>
        )}
      </section>
      {/* Tiles, not rows: each wallet is a thing with its own colour, the way
          the rails' posters are -- its --hue mixed into the ground, its icon
          large and faint. The bar along the bottom is its share of the total. */}
      <div className="wallet-grid">
        {wallets.map((wallet) => {
          const share = total > 0 ? Math.max(0, Math.min(100, (wallet.display_balance / total) * 100)) : 0;
          const open = openWalletId === wallet.id;
          return (
            <article
              className={`wallet-tile ${open ? "active" : ""}`}
              key={wallet.id}
              style={{ "--hue": wallet.icon_color ?? nameColor(wallet.name) } as React.CSSProperties}
            >
              {wallet.is_default && <span className="poster-ribbon">กระเป๋าหลัก</span>}
              <button
                className="wallet-tile-main"
                aria-expanded={open}
                onClick={() => {
                  setOpenWalletId((current) => (current === wallet.id ? null : wallet.id));
                  requestAnimationFrame(() => statementRef.current?.scrollIntoView({ block: "nearest" }));
                }}
              >
                <span className="wallet-tile-glyph" aria-hidden="true">
                  <WalletAvatarGlyph iconKey={wallet.icon} fallbackName={wallet.name} size={64} />
                </span>
                <small>{walletTagLabels[wallet.tag]}</small>
                <span className="wallet-tile-name">{wallet.name}</span>
                <strong>{moneySign}{formatMoney(wallet.display_balance)}</strong>
                <span className="stat-meter wallet-tile-share" aria-hidden="true"><i style={{ width: `${share}%` }} /></span>
              </button>
              <details className="kebab-menu" name="wallet-kebab">
                <summary aria-label={`ตัวเลือกของ ${wallet.name}`}>⋮</summary>
                <menu>
                  <button onClick={() => onReconcile(wallet)}>ปรับยอดให้ตรง</button>
                  <button onClick={() => onEdit(wallet)}>แก้ไข</button>
                  <button onClick={() => onDelete(wallet)}>ลบ</button>
                </menu>
              </details>
            </article>
          );
        })}
      </div>
      {!wallets.length && <EmptyNote glyph="▣" action={{ label: "เพิ่มกระเป๋า", onClick: onAdd }}>กระเป๋าคือที่ที่เงินอยู่จริง — เงินสด บัญชีธนาคาร เงินออม · ต้องมีอย่างน้อยหนึ่งใบ ไม่งั้นรายการที่จดจะไม่ถูกนับเข้ายอดเงิน</EmptyNote>}
      {selectedWallet && (
        <section className="wallet-statement-panel" ref={statementRef}>
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

/**
 * "Count your money, then tell the app." The difference between the two is
 * written as one balance_adjustment entry (balanceAdjustmentEntry), so the
 * wallet stops being wrong without anyone having to invent the missing
 * receipts -- and so the correction is a line in the history with a date on
 * it, rather than a quietly edited opening balance.
 */
export function ReconcileSheet({
  wallet,
  busy,
  error,
  onClose,
  onSave,
  closing,
}: {
  wallet: WalletDisplay;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (realBalance: number) => Promise<boolean>;
  closing?: boolean;
}) {
  const [realBalance, setRealBalance] = useState(wallet.display_balance);
  const difference = Math.round((realBalance - wallet.display_balance) * 100) / 100;

  const submit = async () => {
    const saved = await onSave(realBalance);
    if (saved) onClose();
  };

  return (
    <SheetFrame onClose={onClose} closing={closing}>
      <div className="sheet-head">
        <div>
          <p className="eyebrow">
            {"ปรับยอดให้ตรงบัญชีจริง"}<InfoHint label="ปรับยอดให้ตรง">
              ใช้เมื่อยอดในแอพไม่ตรงกับเงินจริง · ส่วนต่างจะถูกบันทึกเป็นรายการแยกหนึ่งรายการ ไม่นับเป็นรายรับหรือรายจ่าย เพราะไม่มีเงินเข้าออกจริง
            </InfoHint>
          </p>
          <h2>{wallet.name}</h2>
        </div>
        <button onClick={onClose}>x</button>
      </div>
      <p className="pin-hint">เปิดแอปธนาคาร (หรือนับเงินสด) แล้วใส่ยอดที่มีอยู่จริงตอนนี้ · ส่วนต่างจะถูกบันทึกเป็นรายการปรับยอด 1 รายการ ไม่นับเป็นรายรับหรือรายจ่ายของเดือน</p>
      <div className="reconcile-compare">
        <span>ยอดในแอปตอนนี้</span>
        <b>{moneySign}{formatMoney(wallet.display_balance)}</b>
      </div>
      <label>
        ยอดจริงตอนนี้
        <AmountInput value={realBalance} onChange={setRealBalance} autoFocus />
      </label>
      <div className="draft-impact">
        <span>ส่วนต่าง {formatSignedMoney(difference)}</span>
        <span>{difference === 0 ? "ตรงกันอยู่แล้ว" : difference > 0 ? "แอปจดขาดไป" : "แอปจดเกินไป"}</span>
      </div>
      {error && <StateCard tone="error" title="ปรับยอดไม่สำเร็จ" detail={error} />}
      <button className="save" onClick={submit} disabled={busy || difference === 0}>
        {busy ? "กำลังบันทึก..." : "บันทึกรายการปรับยอด"}
      </button>
    </SheetFrame>
  );
}

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
  wallets,
  loading,
  onBack,
  onAdd,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  items: RecurringExpense[];
  wallets: Wallet[];
  loading: boolean;
  onBack: () => void;
  onAdd: () => void;
  onEdit: (item: RecurringExpense) => void;
  onDelete: (item: RecurringExpense) => void;
  onToggleActive: (item: RecurringExpense) => void;
}) {
  // A paused bill is still on the list -- that is the point of pausing rather
  // than deleting -- but it is not money going out, so it stays out of the
  // totals and out of the schedule.
  const pausedCount = items.filter((item) => !item.is_active).length;
  const totals = recurringTotals(items);
  const today = new Date();
  // Bills run on different cycles now, so the stored order (by anchor date)
  // says nothing about what is coming next. Sorted here, where the dates are
  // already worked out, rather than in the state the rows are loaded into:
  // "next due" is a question with a different answer every day.
  const scheduled = items
    .map((item) => ({ item, ...nextBillingInfo(item, today) }))
    .sort((a, b) => Number(b.item.is_active) - Number(a.item.is_active) || a.billingDate.getTime() - b.billingDate.getTime());
  const upcoming = scheduled.filter(({ item }) => item.is_active).slice(0, 4);

  return (
    <div className="view debtor-view">
      {loading && <SkeletonList rows={3} />}
      <div className="add-title">
        <button onClick={onBack} aria-label="ย้อนกลับ"><ChevronLeft aria-hidden="true" /></button>
        <div>
          <p className="eyebrow">รายจ่ายประจำ</p>
          <h2>บิลและค่าสมาชิก</h2>
        </div>
        <button className="header-add-button" onClick={onAdd}>เพิ่ม</button>
      </div>
      <section className="debtor-detail-card">
        <span>เฉลี่ยต่อเดือน</span>
        <strong><CountUpMoney value={totals.monthly} /></strong>
        {/* A yearly bill is not a monthly one divided by twelve in the bank --
            it lands all at once -- so the year total is shown next to the
            average rather than instead of it. */}
        <small>รวมทั้งปี {moneySign}{formatMoney(totals.yearly)}{pausedCount > 0 ? ` · ไม่นับรายการที่หยุดไว้ ${pausedCount} รายการ` : ""}</small>
      </section>
      {!!upcoming.length && (
        <section className="recurring-timeline" aria-label="กำหนดตัดเงินถัดไป">
          <div className="section-title-row"><h3>กำหนดตัดเงินถัดไป</h3><small>{upcoming.length} รายการ</small></div>
          <div className="recurring-timeline-list">
            {upcoming.map(({ item, billingDate, daysUntil }) => (
              <button key={item.id} className="recurring-timeline-row" onClick={() => onEdit(item)}>
                <span className="recurring-date"><b>{billingDate.getDate()}</b><small>{billingDate.toLocaleDateString("th-TH", { month: "short" })}</small></span>
                <span className="recurring-service"><i style={{ background: item.icon_color ?? nameColor(item.name) }}><RecurringAvatarGlyph iconKey={item.icon} fallbackName={item.name} size={15} /></i><span><b>{item.name}</b><small>{daysUntil === 0 ? "วันนี้" : `อีก ${daysUntil} วัน`} · {describeBillingCycle(item.interval_unit, item.interval_count)}</small></span></span>
                <strong>{moneySign}{formatMoney(item.amount)}</strong>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="debtor-page-list">
        {scheduled.map(({ item, billingDate }) => (
          <article className={`debtor-page-item${item.is_active ? "" : " is-paused"}`} key={item.id}>
            <i className="card-accent" style={{ background: item.icon_color ?? nameColor(item.name) }} />
            <button className="debtor-main-button" onClick={() => onEdit(item)}>
              <span className="debtor-avatar" style={{ background: item.icon_color ?? nameColor(item.name) }}>
                <RecurringAvatarGlyph iconKey={item.icon} fallbackName={item.name} />
              </span>
              <div>
                <span>{item.name}{!item.is_active && <em className="recurring-paused-tag">หยุดไว้</em>}</span>
                <small className="recurring-meta">{describeBillingCycle(item.interval_unit, item.interval_count)}{item.is_active ? ` · ครั้งถัดไป ${formatShortDate(billingDate)}` : ""} · {moneySign}{formatMoney(item.amount)} · {fundingLabel(item, wallets)}</small>
              </div>
            </button>
            <details className="kebab-menu" name="recurring-kebab">
              <summary>⋮</summary>
              <menu>
                <button onClick={() => onEdit(item)}>แก้ไข</button>
                <button onClick={() => onToggleActive(item)}>{item.is_active ? "หยุดชั่วคราว" : "ใช้งานต่อ"}</button>
                <button onClick={() => onDelete(item)}>ลบ</button>
              </menu>
            </details>
          </article>
        ))}
        {!items.length && <EmptyNote glyph="↻" action={{ label: "เพิ่มรายจ่ายประจำ", onClick: onAdd }}>บิลที่ตัดเงินเป็นรอบ — ค่าเน็ตรายเดือน ค่าสมาชิกรายปี ค่าบริการราย 3 เดือน · เพิ่มไว้แล้วหน้าแรกจะเตือนก่อนถึงกำหนด และกดบันทึกได้ในปุ่มเดียว</EmptyNote>}
      </div>
    </div>
  );
}

export type RecurringExpenseInput = {
  name: string;
  amount: number;
  anchor_date: string;
  interval_unit: BillingIntervalUnit;
  interval_count: number;
  icon: string | null;
  icon_color: string | null;
  wallet_id: string | null;
  funding_card_name: string | null;
  is_active: boolean;
};

/**
 * When the bill next comes due, said under the date field. A first billing
 * date in the future reads back as itself, which is the confirmation that
 * "ครั้งแรก" was taken literally and nothing has been charged yet.
 */
function nextBillingLabel(schedule: { anchor_date: string; interval_unit: BillingIntervalUnit; interval_count: number }) {
  const { billingDate, daysUntil } = nextBillingInfo(schedule, new Date());
  const when = daysUntil === 0 ? "วันนี้" : `อีก ${daysUntil} วัน`;
  return `${describeBillingCycle(schedule.interval_unit, schedule.interval_count)} · ตัดครั้งถัดไป ${formatShortDate(billingDate, { year: true })} (${when})`;
}

/**
 * What pays this bill, in words: the card or person that fronts it, or the
 * wallet it comes out of. A wallet that has since been deleted (the column is
 * `on delete set null`) reads the same as one that was never picked, because
 * that is what will happen on the next tap -- logging falls back to the
 * default wallet.
 */
function fundingLabel(item: RecurringExpense, wallets: Wallet[]) {
  const card = item.funding_card_name?.trim();
  if (card) return card;
  return wallets.find((wallet) => wallet.id === item.wallet_id)?.name ?? "กระเป๋าหลัก";
}

export function RecurringExpenseEditSheet({
  item,
  wallets,
  debtors,
  receivable,
  busy,
  error,
  onClose,
  onCreate,
  onUpdate,
  closing,
}: {
  item: RecurringExpense | null;
  wallets: Wallet[];
  debtors: Debtor[];
  receivable: { name: string; amount: number }[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onCreate: (input: RecurringExpenseInput) => Promise<boolean>;
  onUpdate: (item: RecurringExpense, patch: RecurringExpenseInput) => Promise<boolean>;
  closing?: boolean;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [amountText, setAmountText] = useState(item?.amount ? String(item.amount) : "");
  const [anchorDate, setAnchorDate] = useState(item?.anchor_date || localDateInput(new Date()));
  const [intervalUnit, setIntervalUnit] = useState<BillingIntervalUnit>(item?.interval_unit ?? "month");
  // Held as text, the way the amount field above it is: normalising on every
  // keystroke means the field can never be empty, so clearing it to retype
  // snaps straight back to 1 and a two-digit count has to be typed around the
  // digit already sitting there. The number is settled on blur and on save.
  const [intervalCountText, setIntervalCountText] = useState(String(item?.interval_count ?? 1));
  const intervalCount = normalizeIntervalCount(intervalCountText);
  // "กำหนดเอง" is not a sixth kind of cycle -- it is the count and unit
  // showing, for a schedule none of the presets happens to name. Opening the
  // fields is therefore a question about the current value, not its own state.
  const [customOpen, setCustomOpen] = useState(
    !BILLING_CYCLE_PRESETS.some((preset) => preset.unit === (item?.interval_unit ?? "month") && preset.count === (item?.interval_count ?? 1)),
  );
  const [icon, setIcon] = useState<string | null>(item?.icon ?? null);
  const [iconColor, setIconColor] = useState<string | null>(item?.icon_color ?? null);
  const [walletId, setWalletId] = useState<string | null>(item?.wallet_id ?? null);
  const [fundingCard, setFundingCard] = useState<string | null>(item?.funding_card_name ?? null);
  const [isActive, setIsActive] = useState(item?.is_active ?? true);

  const submit = async () => {
    if (!name.trim()) return;
    const payload: RecurringExpenseInput = {
      name,
      amount: toMoneyAmount(amountText),
      anchor_date: anchorDate,
      interval_unit: intervalUnit,
      interval_count: intervalCount,
      icon,
      icon_color: iconColor,
      wallet_id: fundingCard ? null : walletId,
      funding_card_name: fundingCard,
      is_active: isActive,
    };
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
        ยอดที่ตัดแต่ละครั้ง
        <input inputMode="decimal" value={amountText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setAmountText(event.target.value); }} />
      </label>
      <label>
        {item ? "วันตัดเงิน" : "วันตัดเงินครั้งแรก"}
        <DateField value={anchorDate} onChange={setAnchorDate} />
        <small className="cycle-note">
          {nextBillingLabel({ anchor_date: anchorDate, interval_unit: intervalUnit, interval_count: intervalCount })}
        </small>
      </label>
      {/* A <div>, not a <label>: a label wrapping a group of controls attaches
          itself to the first one, so the first cycle chip would announce as
          "รอบการจ่าย" instead of "ทุกสัปดาห์". The group carries its own
          aria-label instead. */}
      <div className="sheet-field">
        <span className="sheet-field-label">รอบการจ่าย</span>
        <div className="cycle-picker" role="radiogroup" aria-label="รอบการจ่าย">
          {BILLING_CYCLE_PRESETS.map((preset) => {
            const active = !customOpen && intervalUnit === preset.unit && intervalCount === preset.count;
            return (
              <button
                type="button"
                key={preset.label}
                role="radio"
                aria-checked={active}
                className={`cycle-picker-chip${active ? " active" : ""}`}
                onClick={() => { setCustomOpen(false); setIntervalUnit(preset.unit); setIntervalCountText(String(preset.count)); }}
              >
                {preset.label}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={customOpen}
            className={`cycle-picker-chip${customOpen ? " active" : ""}`}
            onClick={() => setCustomOpen(true)}
          >
            กำหนดเอง
          </button>
        </div>
      </div>
      {customOpen && (
        <label>
          ทุก ๆ
          <div className="cycle-custom">
            <input
              inputMode="numeric"
              value={intervalCountText}
              onChange={(event) => { if (/^\d{0,2}$/.test(event.target.value)) setIntervalCountText(event.target.value); }}
              onBlur={() => setIntervalCountText(String(intervalCount))}
              aria-label="จำนวนรอบ"
            />
            <div className="select-shell">
              <select value={intervalUnit} onChange={(event) => setIntervalUnit(event.target.value as BillingIntervalUnit)} aria-label="หน่วยของรอบ">
                {(Object.keys(billingIntervalUnitLabels) as BillingIntervalUnit[]).map((unit) => (
                  <option key={unit} value={unit}>{billingIntervalUnitLabels[unit]}</option>
                ))}
              </select>
              <ChevronDown className="select-shell-chevron" aria-hidden="true" />
            </div>
          </div>
        </label>
      )}
      <FundingSelect
        label={(
          <>
            ตัดจาก
            <InfoHint label="ช่องทางที่บิลนี้ตัดเงิน">
              เลือกบัตรไว้ แล้วกด &quot;บันทึกเลย&quot; จากหน้าแรก ยอดจะไปขึ้นเป็นหนี้บัตรใบนั้นแทนที่จะหักออกจากกระเป๋า — เหมือนตอนรูดบัตรจ่ายค่าข้าว เงินยังไม่ออกจากบัญชีจนกว่าจะจ่ายบิลบัตร · ถ้าเลือกเป็นคนที่ติดเราอยู่ บิลนี้จะไปหักจากยอดที่เขาติดเราแทน เงินไม่ออกจากกระเป๋าและไม่มีหนี้ก้อนใหม่
            </InfoHint>
          </>
        )}
        walletId={walletId}
        cardName={fundingCard}
        wallets={wallets}
        debtors={debtors}
        receivable={receivable}
        onChange={({ wallet_id, funding_card_name }) => { setWalletId(wallet_id); setFundingCard(funding_card_name); }}
      />
      <div className="report-period-toggle">
        <button type="button" className={isActive ? "active" : ""} onClick={() => setIsActive(true)}>ใช้งานอยู่</button>
        <button type="button" className={isActive ? "" : "active"} onClick={() => setIsActive(false)}>หยุดชั่วคราว</button>
      </div>
      {!isActive && <small className="cycle-note">ยังเก็บไว้ในรายการและในประวัติ แต่ไม่นับในยอดรวมและไม่เตือนก่อนถึงกำหนด</small>}
      {error && <StateCard tone="error" title="บันทึกไม่สำเร็จ" detail={error} />}
      <button className="save" onClick={submit} disabled={busy || !name.trim()}>
        {busy ? "กำลังบันทึก..." : "บันทึก"}
      </button>
    </SheetFrame>
  );
}
