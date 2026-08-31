"use client";

import { memo, useMemo, useState } from "react";
import { ArrowDown, ArrowLeftRight, ChevronDown, X } from "lucide-react";
import { CATEGORY_DOT_TINT_ALPHA } from "@/lib/constants";
import { formatDateTime, formatMoney, formatSignedMoney, moneySign, toDateInput } from "@/lib/format";
import { todayDateInput, withDateKeepingTime, groupEntriesByDay } from "@/lib/cycle";
import { defaultWalletId, entryDisplayImpact, normalizeEntry, unnamedDebtor } from "@/lib/money";
import { DEBT_TYPES, TYPES_USER_OWES, transactionKind, transactionTypeLabels, type TransactionType } from "@/lib/taxonomy";
import { categories, categoryColor, categoryTint } from "@/lib/category";
import type { Debtor, DebtorKind, Draft, EmptyAction, Entry, Wallet } from "@/lib/types";
import type { QuickShortcut } from "@/lib/insights";
import { CategoryIcon, CategoryPicker } from "@/components/shared";
import { AmountInput, EmptyNote, SheetFrame, StateCard } from "@/components/primitives";

export function DraftRow({ draft, knownDebtors, wallets, onChange, onRemove }: { draft: Draft; knownDebtors: Debtor[]; wallets: Wallet[]; onChange: (draft: Draft) => void; onRemove: () => void }) {
  const update = (patch: Partial<Draft>) => onChange(normalizeEntry({ ...draft, ...patch }, false));
  const isDebtType = DEBT_TYPES.includes(draft.transaction_type);
  const isOwnDebtType = TYPES_USER_OWES.includes(draft.transaction_type);
  const relevantKind: DebtorKind = isOwnDebtType ? "own" : "lend";
  const knownNames = knownDebtors.filter((debtor) => debtor.kind === relevantKind).map((debtor) => debtor.name);
  const isNewDebtor = isDebtType && !!draft.debtor_name.trim() && draft.debtor_name !== unnamedDebtor && !knownNames.some((name) => name.trim().toLowerCase() === draft.debtor_name.trim().toLowerCase());
  const isTransfer = draft.transaction_type === "transfer";
  const transferInvalid = isTransfer && (!draft.transfer_to_wallet_id || draft.transfer_to_wallet_id === draft.wallet_id);
  const debtorFieldLabel =
    draft.transaction_type === "card_charge" ? "ชื่อบัตร" :
    draft.transaction_type === "borrow" ? "ชื่อคนที่ให้เรายืม" :
    relevantKind === "own" ? "ชื่อหนี้" : "ชื่อผู้เกี่ยวข้อง";
  const debtorFieldPlaceholder =
    draft.transaction_type === "card_charge" ? "เช่น กรุงศรีเฟิร์สช้อย" :
    draft.transaction_type === "borrow" ? "เช่น พี่แอน" :
    relevantKind === "own" ? "เช่น ผ่อนบ้าน ผ่อนรถ" : "เช่น แฟน หรือ เพื่อนเอ";
  const [detailsOpen, setDetailsOpen] = useState(draft.ambiguous || transferInvalid);
  const showDetails = detailsOpen || draft.ambiguous || transferInvalid;

  return (
    <div className={`draft draft-${draft.transaction_type}${draft.ambiguous ? " draft-needs-review" : ""}`}>
      <button className="draft-remove" onClick={onRemove} aria-label="ลบรายการนี้ออกจากรายการที่ตรวจสอบ">
        <X size={14} strokeWidth={2.5} />
      </button>
      <div className="draft-header">
        {isTransfer ? (
          <span className="cat-icon draft-transfer-icon"><ArrowLeftRight size={18} strokeWidth={2.25} aria-hidden="true" /></span>
        ) : (
          <span className="cat-icon" style={{ background: categoryTint(draft.category, CATEGORY_DOT_TINT_ALPHA), color: categoryColor(draft.category) }}><CategoryIcon category={draft.category} size={18} /></span>
        )}
        <label className="draft-title-field">
          <input placeholder=" " value={draft.title} onChange={(event) => update({ title: event.target.value })} />
          <span>ชื่อรายการ</span>
        </label>
      </div>
      {draft.ambiguous && <p className="draft-ambiguous-hint">AI ไม่แน่ใจว่าให้เปล่าหรือให้ยืม โปรดเลือกประเภทที่ถูกต้องด้านบน</p>}
      <label>
        ชนิดรายการ
        <div className="select-shell">
          <select value={draft.transaction_type} onChange={(event) => update({ transaction_type: event.target.value as TransactionType, ambiguous: false })}>
          {Object.entries(transactionTypeLabels).filter(([value]) => value !== "investment_buy").map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
          <ChevronDown className="select-shell-chevron" aria-hidden="true" />
        </div>
      </label>
      <div className="draft-grid">
        {!isTransfer && (
          <label>
            หมวดหมู่
            <div className="select-shell">
              <select value={draft.category} onChange={(event) => update({ category: event.target.value })}>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
              <ChevronDown className="select-shell-chevron" aria-hidden="true" />
            </div>
          </label>
        )}
        <label className={isTransfer ? "draft-field-full" : undefined}>
          จำนวนเงิน
          <AmountInput value={draft.amount} onChange={(amount) => update({ amount })} />
        </label>
      </div>
      {isTransfer && !!wallets.length && (
        // Which two wallets the money moved between IS the transfer -- it
        // doesn't belong behind the "edit date/wallet/note" toggle with the
        // optional fields, and the two legs read as one route rather than as
        // two dropdowns that happen to sit near each other.
        <div className="draft-route">
          <label>
            จากกระเป๋า
            <div className="select-shell">
              <select value={draft.wallet_id || defaultWalletId(wallets) || ""} onChange={(event) => update({ wallet_id: event.target.value || null })}>
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
                ))}
              </select>
              <ChevronDown className="select-shell-chevron" aria-hidden="true" />
            </div>
          </label>
          <span className="draft-route-arrow" aria-hidden="true"><ArrowDown size={16} strokeWidth={2.5} /></span>
          <label>
            ไปกระเป๋า
            <div className="select-shell">
              <select aria-invalid={transferInvalid} value={draft.transfer_to_wallet_id ?? ""} onChange={(event) => update({ transfer_to_wallet_id: event.target.value || null })}>
                <option value="">เลือกกระเป๋าปลายทาง</option>
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id} disabled={wallet.id === draft.wallet_id}>{wallet.name}</option>
                ))}
              </select>
              <ChevronDown className="select-shell-chevron" aria-hidden="true" />
            </div>
          </label>
          {transferInvalid && <small className="draft-route-hint">เลือกกระเป๋าปลายทางก่อนบันทึก</small>}
        </div>
      )}
      {isDebtType && (
        <div className="draft-debtor-field">
          <label>
            <input placeholder={debtorFieldPlaceholder} value={draft.debtor_name} onChange={(event) => update({ debtor_name: event.target.value })} />
            <span>{debtorFieldLabel}</span>
          </label>
          {isNewDebtor && <small>{relevantKind === "own" ? "หนี้ใหม่" : "ลูกหนี้ใหม่"} · จะสร้างให้อัตโนมัติเมื่อบันทึก</small>}
        </div>
      )}
      <button
        type="button"
        className={`text-button draft-details-toggle${showDetails ? " is-open" : ""}`}
        aria-expanded={showDetails}
        onClick={() => setDetailsOpen((current) => !current)}
      >
        {`${showDetails ? "ซ่อน" : "แก้ไข"}วันที่ / ${isTransfer ? "" : "กระเป๋า / "}หมายเหตุ`}
        <ChevronDown size={14} strokeWidth={2.5} aria-hidden="true" />
      </button>
      {showDetails && (
        <div className="draft-grid draft-grid-secondary">
          <label>
            วันที่
            <input type="date" value={toDateInput(draft.occurred_at)} onChange={(event) => update({ occurred_at: withDateKeepingTime(event.target.value, draft.occurred_at) })} />
          </label>
          {!isTransfer && !!wallets.length && draft.transaction_type !== "card_charge" && (
            <label>
              กระเป๋า
              <div className="select-shell">
                <select value={draft.wallet_id || defaultWalletId(wallets) || ""} onChange={(event) => update({ wallet_id: event.target.value || null })}>
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
                ))}
              </select>
                <ChevronDown className="select-shell-chevron" aria-hidden="true" />
              </div>
            </label>
          )}
          <label className="draft-field-full">
            <input placeholder=" " value={draft.note ?? ""} onChange={(event) => update({ note: event.target.value })} />
            <span>หมายเหตุ</span>
          </label>
        </div>
      )}
      <div className="draft-result">
        <p className="draft-result-title">ผลหลังบันทึก</p>
        {isTransfer ? (
          <div className="impact-row">
            <span>{wallets.find((wallet) => wallet.id === draft.wallet_id)?.name ?? "กระเป๋าต้นทาง"} {formatSignedMoney(-draft.amount)}</span>
            <span>{wallets.find((wallet) => wallet.id === draft.transfer_to_wallet_id)?.name ?? "กระเป๋าปลายทาง"} {formatSignedMoney(draft.amount)}</span>
          </div>
        ) : (
          <div className="impact-row">
            <span>กระเป๋า {formatSignedMoney(draft.wallet_impact)}</span>
            <span>หนี้ {formatSignedMoney(draft.debt_impact)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function DraftImpact({ items }: { items: Draft[] }) {
  const wallet = items.filter((item) => item.transaction_type !== "transfer").reduce((sum, item) => sum + item.wallet_impact, 0);
  const debt = items.reduce((sum, item) => sum + item.debt_impact, 0);

  return (
    <div className="draft-impact">
      <span>รวมทุกกระเป๋า {formatSignedMoney(wallet)}</span>
      <span>ลูกหนี้ {formatSignedMoney(debt)}</span>
    </div>
  );
}

export const EntryList = memo(function EntryList({
  entries,
  onEdit,
  onDelete,
  emptyAction,
  amountField = "wallet",
}: {
  entries: Entry[];
  onEdit?: (entry: Entry) => void;
  onDelete?: (entry: Entry) => void;
  emptyAction?: EmptyAction;
  amountField?: "wallet" | "debt";
}) {
  const groups = useMemo(() => groupEntriesByDay(entries), [entries]);

  if (!entries.length) return <EmptyNote glyph="▪" action={emptyAction}>ยังไม่มีรายการในช่วงนี้</EmptyNote>;

  return (
    <div className="entry-list">
      {groups.map((group) => (
        <div className="entry-group" key={group.label}>
          <p className="entry-day">{group.label}</p>
          {group.items.map((entry) => {
            const impact = amountField === "debt" ? entry.debt_impact : entryDisplayImpact(entry);
            const entryContent = (
              <>
                <span className="entry-icon" style={{ background: categoryTint(entry.category, CATEGORY_DOT_TINT_ALPHA), color: categoryColor(entry.category) }}><CategoryIcon category={entry.category} size={18} /></span>
                <div>
                  <b>{entry.title}</b>
                  <small>
                    {transactionTypeLabels[entry.transaction_type]} · {entry.category} · {formatDateTime(entry.occurred_at)}
                    {entry.debt_impact !== 0 ? ` · ${entry.debtor_name}` : ""}
                  </small>
                  {entry.note && <small className="entry-note" title={entry.note}>{entry.note}</small>}
                </div>
                <strong className={impact >= 0 ? "income" : "expense"}>{formatSignedMoney(impact)}</strong>
              </>
            );
            return (
            <article className="entry" key={entry.id}>
              {onEdit ? (
                <button type="button" className="entry-main entry-tappable" onClick={() => onEdit(entry)}>
                  {entryContent}
                </button>
              ) : (
                <div className="entry-main">{entryContent}</div>
              )}
              {(onEdit || onDelete) && (
                <menu>
                  {onEdit && <button onClick={() => onEdit(entry)} title="แก้ไข">แก้</button>}
                  {onDelete && <button onClick={() => onDelete(entry)} title="ลบ">ลบ</button>}
                </menu>
              )}
            </article>
            );
          })}
        </div>
      ))}
    </div>
  );
});

export function RecentActivityTimeline({ entries, onEdit }: { entries: Entry[]; onEdit: (entry: Entry) => void }) {
  const recent = entries.slice(0, 4);
  if (!recent.length) return null;

  return (
    <section className="activity-timeline">
      <p className="activity-timeline-title">รายการล่าสุด</p>
      <div className="activity-timeline-list">
        {recent.map((entry) => (
          <button className="activity-timeline-row" key={entry.id} onClick={() => onEdit(entry)}>
            <i className="cat-dot" style={{ background: categoryTint(entry.category, CATEGORY_DOT_TINT_ALPHA), color: categoryColor(entry.category) }}><CategoryIcon category={entry.category} size={14} /></i>
            <span className="activity-timeline-info">
              <b>{entry.title}</b>
              <small>{entry.category} · {formatDateTime(entry.occurred_at)}</small>
            </span>
            <span className={`activity-timeline-amount ${entryDisplayImpact(entry) >= 0 ? "income" : "expense"}`}>
              {formatSignedMoney(entryDisplayImpact(entry))}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function QuickAddStrip({
  shortcuts,
  onSelect,
  onMore,
}: {
  shortcuts: QuickShortcut[];
  onSelect: (shortcut: QuickShortcut) => void;
  onMore: () => void;
}) {
  if (!shortcuts.length) return null;
  return (
    <section className="quick-add-strip" aria-label="เพิ่มรายการด่วน">
      <div className="quick-add-head">
        <div>
          <p className="eyebrow">บันทึกให้เร็วขึ้น</p>
          <h2>รายการที่ใช้บ่อย</h2>
        </div>
        <button className="text-button" onClick={onMore}>รายการอื่น</button>
      </div>
      <div className="quick-add-list">
        {shortcuts.map((shortcut) => (
          <button className="quick-add-chip" key={`${shortcut.title}|${shortcut.category}`} onClick={() => onSelect(shortcut)}>
            <span className="cat-dot" style={{ background: categoryTint(shortcut.category, CATEGORY_DOT_TINT_ALPHA), color: categoryColor(shortcut.category) }}>
              <CategoryIcon category={shortcut.category} size={15} />
            </span>
            <span>
              <b>{shortcut.title}</b>
              <small>{moneySign}{formatMoney(shortcut.amount)}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function ManualEntryForm({
  wallets,
  busy,
  error,
  initialDate,
  initialPreset,
  categoryMemory,
  onSave,
}: {
  wallets: Wallet[];
  busy: boolean;
  error: string;
  initialDate: string;
  initialPreset?: QuickShortcut | null;
  categoryMemory: Map<string, string>;
  onSave: (drafts: Draft[]) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    normalizeEntry(
      {
        id: `manual-${Date.now()}`,
        title: initialPreset?.title ?? "",
        category: initialPreset?.category ?? categories[0],
        amount: initialPreset?.amount ?? 0,
        transaction_type: initialPreset?.transaction_type ?? "personal_expense",
        debtor_name: "",
        occurred_at: withDateKeepingTime(initialDate, new Date().toISOString()),
        wallet_id: defaultWalletId(wallets),
        note: null,
      },
      false,
    ),
  );
  const [destWalletId, setDestWalletId] = useState<string | null>(null);
  const [advancedTypeOpen, setAdvancedTypeOpen] = useState(
    () => !["personal_expense", "income"].includes(initialPreset?.transaction_type ?? "personal_expense"),
  );
  const update = (patch: Partial<Draft>) => setDraft(normalizeEntry({ ...draft, ...patch }, false));
  const isTransfer = draft.transaction_type === "transfer";
  const isExpense = transactionKind[draft.transaction_type] === "expense";
  const sourceWallet = wallets.find((wallet) => wallet.id === draft.wallet_id);
  const destWallet = wallets.find((wallet) => wallet.id === destWalletId);
  const transferInvalid = isTransfer && (!destWalletId || destWalletId === draft.wallet_id);

  const submit = () => {
    if (isTransfer) {
      if (transferInvalid || draft.amount <= 0 || !destWalletId) return;
      onSave([{ ...draft, transfer_to_wallet_id: destWalletId }]);
      return;
    }
    onSave([draft]);
  };

  return (
    <div className="manual-entry-form">
      <div className="report-period-toggle entry-kind-toggle">
        <button type="button" className={isExpense ? "active" : ""} onClick={() => update({ transaction_type: "personal_expense" })}>รายจ่าย</button>
        <button type="button" className={!isExpense ? "active" : ""} onClick={() => update({ transaction_type: "income" })}>รายรับ</button>
      </div>
      <button type="button" className="text-button entry-advanced-toggle" onClick={() => setAdvancedTypeOpen((current) => !current)}>
        {advancedTypeOpen ? "ซ่อนตัวเลือกเพิ่มเติม" : "รายการพิเศษ (ออกให้ก่อน, หารร่วม, ผ่อนหนี้, โอนเงิน ฯลฯ)"}
      </button>
      {advancedTypeOpen && (
        <label>
          ชนิดรายการ
          <div className="select-shell">
            <select value={draft.transaction_type} onChange={(event) => update({ transaction_type: event.target.value as TransactionType })}>
            {Object.entries(transactionTypeLabels).filter(([value]) => value !== "investment_buy").map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
            <ChevronDown className="select-shell-chevron" aria-hidden="true" />
          </div>
        </label>
      )}
      <label>
        จำนวนเงิน
        <AmountInput value={draft.amount} onChange={(amount) => update({ amount })} autoFocus />
      </label>
      <label>
        <input placeholder=" "
          value={draft.title}
          onChange={(event) => update({ title: event.target.value })}
          onBlur={() => {
            const remembered = categoryMemory.get(draft.title.trim().toLowerCase());
            if (remembered) update({ category: remembered });
          }}
        />
        <span>ชื่อรายการ{isTransfer && <small> (เว้นว่างได้ จะตั้งชื่อให้อัตโนมัติ)</small>}</span>
      </label>
      {!isTransfer && (
        <label>
          หมวดหมู่
          <CategoryPicker value={draft.category} onChange={(category) => update({ category })} />
        </label>
      )}
      {DEBT_TYPES.includes(draft.transaction_type) && (
        <label>
        <input type="text" placeholder={draft.transaction_type === "card_charge" ? "เช่น กรุงศรีเฟิร์สช้อย" : "เช่น เพื่อนเอ"} value={draft.debtor_name} onChange={(event) => update({ debtor_name: event.target.value })} />
        <span>{draft.transaction_type === "card_charge" ? "ชื่อบัตร" : "ชื่อผู้เกี่ยวข้อง"}</span>
      </label>
      )}
      <label>
        วันที่
        <input type="date" value={toDateInput(draft.occurred_at)} max={todayDateInput()} onChange={(event) => update({ occurred_at: withDateKeepingTime(event.target.value, draft.occurred_at) })} />
      </label>
      {!!wallets.length && draft.transaction_type !== "card_charge" && (
        // Same route treatment as the AI review card (see DraftRow): on a
        // transfer the two wallets are one fact, so they read as from -> to
        // rather than as two dropdowns that happen to be adjacent.
        isTransfer ? (
          <div className="draft-route">
            <label>
              จากกระเป๋า
              <div className="select-shell">
                <select value={draft.wallet_id ?? defaultWalletId(wallets) ?? ""} onChange={(event) => update({ wallet_id: event.target.value || null })}>
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
                  ))}
                </select>
                <ChevronDown className="select-shell-chevron" aria-hidden="true" />
              </div>
            </label>
            <span className="draft-route-arrow" aria-hidden="true"><ArrowDown size={16} strokeWidth={2.5} /></span>
            <label>
              ไปกระเป๋า
              <div className="select-shell">
                <select aria-invalid={transferInvalid} value={destWalletId ?? ""} onChange={(event) => setDestWalletId(event.target.value || null)}>
                  <option value="">เลือกกระเป๋าปลายทาง</option>
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id} disabled={wallet.id === draft.wallet_id}>{wallet.name}</option>
                  ))}
                </select>
                <ChevronDown className="select-shell-chevron" aria-hidden="true" />
              </div>
            </label>
            {transferInvalid && <small className="draft-route-hint">เลือกกระเป๋าปลายทางก่อนบันทึก</small>}
          </div>
        ) : (
          <label>
            กระเป๋า
            <div className="select-shell">
              <select value={draft.wallet_id ?? defaultWalletId(wallets) ?? ""} onChange={(event) => update({ wallet_id: event.target.value || null })}>
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
              ))}
            </select>
              <ChevronDown className="select-shell-chevron" aria-hidden="true" />
            </div>
          </label>
        )
      )}
      <label>
        <textarea value={draft.note ?? ""} onChange={(event) => update({ note: event.target.value })} placeholder="รายละเอียดเพิ่มเติมของรายการนี้" />
        <span>หมายเหตุ</span>
      </label>

      {isTransfer ? (
        <div className="draft-impact">
          <span>{sourceWallet?.name ?? "จากกระเป๋า"} {formatSignedMoney(-draft.amount)}</span>
          <span>{destWallet?.name ?? "ไปกระเป๋า"} {formatSignedMoney(draft.amount)}</span>
        </div>
      ) : (
        <div className="draft-impact">
          <span>กระเป๋า {formatSignedMoney(draft.wallet_impact)}</span>
          <span>หนี้ {formatSignedMoney(draft.debt_impact)}</span>
        </div>
      )}

      {error && <StateCard tone="error" title="บันทึกไม่สำเร็จ" detail={error} />}
      <button className="save" onClick={submit} disabled={busy || (isTransfer ? (transferInvalid || draft.amount <= 0) : (!draft.title.trim() || draft.amount <= 0))}>
        {busy ? "กำลังบันทึก..." : "บันทึกรายการ"}
      </button>
    </div>
  );
}

export function EditSheet({
  entry,
  wallets,
  busy,
  error,
  onChange,
  onClose,
  onSave,
  closing,
}: {
  entry: Entry;
  wallets: Wallet[];
  busy: boolean;
  error: string;
  onChange: (entry: Entry) => void;
  onClose: () => void;
  onSave: (transferToWalletId?: string | null) => Promise<boolean>;
  closing?: boolean;
}) {
  const update = (patch: Partial<Entry>) => onChange(normalizeEntry({ ...entry, ...patch }, false));
  const [originalType] = useState(entry.transaction_type);
  const [destWalletId, setDestWalletId] = useState<string | null>(null);
  const wasTransfer = originalType === "transfer";
  const wasInvestmentBuy = originalType === "investment_buy";
  const isTransfer = entry.transaction_type === "transfer";
  const convertingToTransfer = isTransfer && !wasTransfer;
  const transferInvalid = convertingToTransfer && (!destWalletId || destWalletId === entry.wallet_id);
  const sourceWallet = wallets.find((wallet) => wallet.id === entry.wallet_id);
  const destWallet = wallets.find((wallet) => wallet.id === destWalletId);
  const submit = async () => {
    const saved = await onSave(convertingToTransfer ? destWalletId : undefined);
    if (saved) onClose();
  };

  return (
    <SheetFrame onClose={onClose} closing={closing}>
      <div className="sheet-head">
        <div>
          <p className="eyebrow">แก้ไขรายการ</p>
          <h2>{entry.title || "รายการ"}</h2>
        </div>
        <button onClick={onClose}>x</button>
      </div>

      {wasTransfer && <p className="pin-hint">รายการโอนเงินแก้ไขได้เฉพาะชื่อ วันที่ และหมายเหตุ — ลบได้ทั้งสองฝั่งพร้อมกัน</p>}
      {wasInvestmentBuy && <p className="pin-hint">รายการลงทุนแก้ไขได้เฉพาะชื่อ วันที่ และหมายเหตุ — ลบรายการนี้จะไม่ปรับหน่วย/ทุนในพอร์ตให้อัตโนมัติ ต้องไปแก้ในหน้าพอร์ตลงทุนเอง</p>}
      {convertingToTransfer && <p className="pin-hint">เลือกกระเป๋าปลายทางก่อนบันทึกเป็นรายการโอน</p>}

      <label>
        <input placeholder=" " value={entry.title} onChange={(event) => update({ title: event.target.value })} />
        <span>ชื่อรายการ</span>
      </label>
      {!isTransfer && (
        <label>
          หมวดหมู่
          <div className="select-shell">
            <select value={entry.category} onChange={(event) => update({ category: event.target.value })}>
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
            <ChevronDown className="select-shell-chevron" aria-hidden="true" />
          </div>
        </label>
      )}
      <label>
        ชนิดรายการ
        <div className="select-shell">
          <select value={entry.transaction_type} disabled={wasTransfer || wasInvestmentBuy} onChange={(event) => update({ transaction_type: event.target.value as TransactionType })}>
          {Object.entries(transactionTypeLabels).filter(([value]) => value !== "investment_buy" || wasInvestmentBuy).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
          <ChevronDown className="select-shell-chevron" aria-hidden="true" />
        </div>
      </label>
      <label>
        จำนวนเงิน
        <AmountInput value={entry.amount} onChange={(amount) => update({ amount })} disabled={wasTransfer} />
      </label>
      {DEBT_TYPES.includes(entry.transaction_type) && (
        <label>
        <input type="text" placeholder={entry.transaction_type === "card_charge" ? "เช่น กรุงศรีเฟิร์สช้อย" : "เช่น เพื่อนเอ"} value={entry.debtor_name} onChange={(event) => update({ debtor_name: event.target.value })} />
        <span>{entry.transaction_type === "card_charge" ? "ชื่อบัตร" : "ชื่อผู้เกี่ยวข้อง"}</span>
      </label>
      )}
      <label>
        วันที่
        <input type="date" value={toDateInput(entry.occurred_at)} onChange={(event) => update({ occurred_at: withDateKeepingTime(event.target.value, entry.occurred_at) })} />
      </label>
      {!!wallets.length && entry.transaction_type !== "card_charge" && !wasTransfer && (
        <label>
          {isTransfer ? "จากกระเป๋า" : "กระเป๋า"}
          <div className="select-shell">
            <select value={entry.wallet_id ?? defaultWalletId(wallets) ?? ""} onChange={(event) => update({ wallet_id: event.target.value || null })}>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
            ))}
          </select>
            <ChevronDown className="select-shell-chevron" aria-hidden="true" />
          </div>
        </label>
      )}
      {convertingToTransfer && !!wallets.length && (
        <label>
          ไปกระเป๋า
          <div className="select-shell">
            <select value={destWalletId ?? ""} onChange={(event) => setDestWalletId(event.target.value || null)}>
            <option value="">เลือกกระเป๋าปลายทาง</option>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id} disabled={wallet.id === entry.wallet_id}>{wallet.name}</option>
            ))}
          </select>
            <ChevronDown className="select-shell-chevron" aria-hidden="true" />
          </div>
        </label>
      )}
      <label>
        <textarea value={entry.note ?? ""} onChange={(event) => update({ note: event.target.value })} placeholder="รายละเอียดเพิ่มเติมของรายการนี้" />
        <span>หมายเหตุ</span>
      </label>

      {convertingToTransfer ? (
        <div className="draft-impact">
          <span>{sourceWallet?.name ?? "จากกระเป๋า"} {formatSignedMoney(-entry.amount)}</span>
          <span>{destWallet?.name ?? "ไปกระเป๋า"} {formatSignedMoney(entry.amount)}</span>
        </div>
      ) : (
        <div className="draft-impact">
          <span>กระเป๋า {formatSignedMoney(entry.wallet_impact)}</span>
          <span>หนี้ {formatSignedMoney(entry.debt_impact)}</span>
        </div>
      )}

      {error && <StateCard tone="error" title="บันทึกไม่สำเร็จ" detail={error} />}
      <button className="save" onClick={submit} disabled={busy || !entry.title.trim() || entry.amount < 0 || transferInvalid}>
        {busy ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
      </button>
    </SheetFrame>
  );
}
