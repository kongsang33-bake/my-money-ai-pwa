"use client";

import { memo, useMemo, useState } from "react";
import { ArrowDown, ArrowLeftRight, ChevronDown, Lightbulb, Minus, Plus, X } from "lucide-react";
import { CATEGORY_DOT_TINT_ALPHA, MAX_SPLIT_PEOPLE, MIN_SPLIT_PEOPLE } from "@/lib/constants";
import { compressSlipImage } from "@/lib/image";
import { formatDateTime, formatMoney, formatSignedMoney, moneySign, toDateInput } from "@/lib/format";
import { todayDateInput, withDateKeepingTime, groupEntriesByDay } from "@/lib/cycle";
import { SHARED_EXPENSE_TYPES, defaultWalletId, draftSplitPins, entryDisplayImpact, isCardFundedLeg, isMultiPersonSplit, normalizeEntry, partnerShareForPeople, peopleFromPartnerShare, retargetPartnerShare, splitDebtorNames, splitSharesBetween, unnamedDebtor } from "@/lib/money";
import { DEBT_TYPES, TYPES_USER_OWES, transactionKind, transactionTypeLabels, type TransactionType } from "@/lib/taxonomy";
import { categories, categoryColor, categoryTint } from "@/lib/category";
import type { AiSuggestion, Debtor, DebtorKind, Draft, EmptyAction, Entry, QuickShortcut, SlipImage, Wallet } from "@/lib/types";
import { CategoryIcon, CategoryPicker } from "@/components/shared";
import { AmountInput, DateField, EmptyNote, SheetFrame, StateCard } from "@/components/primitives";

// The whole "let AI write it for me" half of the Add tab: the example chips,
// the date picker, the textarea, slip attachments and the analyse button.
//
// It owns `text` and `slipImages` itself, and that ownership is the entire
// point of the component existing. Both used to be useState in app/page.tsx's
// root component, which meant every keystroke in this textarea re-rendered
// the whole Add tab -- the draft review list, the impact summary, the chips,
// all of it -- to update one <textarea value>. The composed text only leaves
// here when the user actually presses analyse, so typing now re-renders this
// subtree and nothing else.
//
// The corollary: the parent cannot clear this by setting a prop. It clears it
// by bumping `resetKey`, which remounts the component (see the call site in
// app/page.tsx after a successful save, and clearPrivateState on logout).
export function AiComposer({
  suggestions,
  entryDate,
  maxDate,
  onChangeEntryDate,
  maxSlipImages,
  busy,
  disabled,
  error,
  elapsedLabel,
  onAnalyze,
  onAddShortcut,
  onError,
  onAttached,
}: {
  suggestions: AiSuggestion[];
  entryDate: string;
  maxDate: string;
  onChangeEntryDate: (value: string) => void;
  maxSlipImages: number;
  busy: boolean;
  disabled: boolean;
  error: string;
  elapsedLabel: React.ReactNode;
  onAnalyze: (text: string, images: SlipImage[]) => void;
  onAddShortcut: (shortcut: QuickShortcut) => void;
  onError: (message: string) => void;
  onAttached: (count: number) => void;
}) {
  const [text, setText] = useState("");
  const [slipImages, setSlipImages] = useState<SlipImage[]>([]);

  const applySuggestion = (suggestion: AiSuggestion) => {
    if (suggestion.shortcut) {
      onAddShortcut(suggestion.shortcut);
      return;
    }
    setText((current) => (current.trim() ? `${current.trim()}\n${suggestion.text}` : suggestion.text));
  };

  const addSlipFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    onError("");

    const nextFiles = [...files].slice(0, maxSlipImages - slipImages.length);
    if (nextFiles.some((file) => !file.type.startsWith("image/"))) {
      onError("รองรับเฉพาะไฟล์รูปภาพเท่านั้น");
      return;
    }

    try {
      const images = await Promise.all(nextFiles.map(compressSlipImage));
      setSlipImages((current) => [...current, ...images].slice(0, maxSlipImages));
      onAttached(images.length);
    } catch (e) {
      onError(e instanceof Error ? e.message : "แนบรูปไม่สำเร็จ");
    }
  };

  return (
    <>
      <label className="entry-date-picker compact">
        <span>บันทึกของวันที่</span>
        <DateField value={entryDate} max={maxDate} onChange={onChangeEntryDate} />
      </label>

      <div className="ai-suggestions">
        <span>แตะตัวอย่างเพื่อเริ่มเร็ว</span>
        <div className="quick-shortcuts">
          {suggestions.map((suggestion) => (
            <button
              key={`${suggestion.label}|${suggestion.detail}`}
              className="quick-chip"
              onClick={() => applySuggestion(suggestion)}
            >
              <i className="card-accent" style={{ background: suggestion.shortcut ? categoryColor(suggestion.shortcut.category) : undefined }} />
              <span className="cat-dot" style={{ background: suggestion.shortcut ? categoryTint(suggestion.shortcut.category, CATEGORY_DOT_TINT_ALPHA) : undefined, color: suggestion.shortcut ? categoryColor(suggestion.shortcut.category) : undefined }}>
                {suggestion.shortcut ? <CategoryIcon category={suggestion.shortcut.category} /> : <Lightbulb size={14} strokeWidth={2.25} aria-hidden="true" />}
              </span>
              <span>
                <b>{suggestion.label}</b>
                <small>{suggestion.detail}</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="ai-input-wrap">
        <div className="assistant-rail" aria-hidden="true">
          <span>AI</span>
          <i />
        </div>
        <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="เช่น กินข้าว 120 บาท, ออกให้เพื่อนเอก่อน 500, เพื่อนเอโอนคืน 200" />

        {!!slipImages.length && (
          <div className="slip-preview-list">
            {slipImages.map((image) => (
              <div className="slip-preview" key={image.id}>
                <span className="slip-thumb" style={{ backgroundImage: `url(${image.preview})` }} aria-label={image.name} />
                <span>{image.name}</span>
                <button onClick={() => setSlipImages((items) => items.filter((item) => item.id !== image.id))}>×</button>
              </div>
            ))}
          </div>
        )}

        <div className="input-tools">
          <label className="attach-button">
            แนบสลิป
            <input type="file" accept="image/*" multiple onChange={(event) => { void addSlipFiles(event.target.files); event.currentTarget.value = ""; }} />
          </label>
          <span>{slipImages.length ? `${slipImages.length}/${maxSlipImages} รูป` : "Gemini ช่วยอ่านรูปและข้อความ"}</span>
        </div>
      </div>

      <button className="primary" onClick={() => onAnalyze(text, slipImages)} disabled={busy || disabled || (!text.trim() && !slipImages.length)}>
        {busy ? <span className="button-loading-row"><span className="loading-spinner mini on-ink" />{elapsedLabel}</span> : "ให้ AI แยกรายการ"}
      </button>
      {error && <StateCard tone="error" title="AI ยังทำรายการนี้ไม่ได้" detail={error} />}
    </>
  );
}

export function DraftRow({ draft, knownDebtors, wallets, onChange, onRemove }: { draft: Draft; knownDebtors: Debtor[]; wallets: Wallet[]; onChange: (draft: Draft) => void; onRemove: () => void }) {
  const update = (patch: Partial<Draft>) => onChange(normalizeEntry({ ...draft, ...patch }, false));
  const isDebtType = DEBT_TYPES.includes(draft.transaction_type);
  const isOwnDebtType = TYPES_USER_OWES.includes(draft.transaction_type);
  const relevantKind: DebtorKind = isOwnDebtType ? "own" : "lend";
  const knownNames = knownDebtors.filter((debtor) => debtor.kind === relevantKind).map((debtor) => debtor.name);
  const newDebtorNames = isDebtType
    ? (SHARED_EXPENSE_TYPES.includes(draft.transaction_type) ? splitDebtorNames(draft.debtor_name) : [draft.debtor_name.trim()])
      .filter((name) => name && name !== unnamedDebtor && !knownNames.some((known) => known.trim().toLowerCase() === name.toLowerCase()))
    : [];
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
  // A split or a lend can come off a credit card instead of a wallet. Cards
  // live in the debtors table (kind "own"), not in wallets, which is why the
  // wallet dropdown alone could not express "dinner split with จูน, paid on
  // SPay" -- the one thing this row could not say before.
  const cards = knownDebtors.filter((debtor) => debtor.kind === "own");
  const canPayWithCard = SHARED_EXPENSE_TYPES.includes(draft.transaction_type) && cards.length > 0;
  const fundingCard = canPayWithCard ? draft.funding_card_name?.trim() || "" : "";
  const isSplit = draft.transaction_type === "split_half";
  // Several names in the one debtor field means one debt each, worked out at
  // save (expandDraftForSave). The headcount and the share are then the list's
  // to decide, not the user's -- so they are shown, not asked for.
  const splitNames = SHARED_EXPENSE_TYPES.includes(draft.transaction_type) ? splitDebtorNames(draft.debtor_name) : [];
  const perPerson = isMultiPersonSplit(draft);
  const perPersonSplit = splitSharesBetween(draft.amount, splitNames, draft.transaction_type, draftSplitPins(draft));
  const hasPins = !!draft.split_shares?.some((share) => share != null) || draft.split_self_share != null;
  // Pinning is per slot: type a number into one line and the lines nobody
  // pinned re-divide what is left. "ผมออก 500 ที่เหลือหาร 3 คน" is one pin.
  const pinShare = (index: number, share: number) => update({
    split_shares: splitNames.map((_, slot) => (slot === index ? share : draft.split_shares?.[slot] ?? null)),
  });
  // Amount and share move together while the split is still even, so the
  // common case needs no second edit; a share the user set is left alone.
  const setAmount = (amount: number) => update({
    amount,
    partner_share: retargetPartnerShare(draft.amount, draft.partner_share, amount),
    // Pinned amounts were chosen against the old bill; keeping them would
    // silently re-divide everyone else around a number nobody meant.
    ...(draft.amount === amount ? {} : { split_shares: null, split_self_share: null }),
  });

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
          ชื่อรายการ
          <input value={draft.title} onChange={(event) => update({ title: event.target.value })} />
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
          <AmountInput value={draft.amount} onChange={setAmount} />
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
            {debtorFieldLabel}
            <input placeholder={debtorFieldPlaceholder} value={draft.debtor_name} onChange={(event) => update({ debtor_name: event.target.value })} />
          </label>
          {SHARED_EXPENSE_TYPES.includes(draft.transaction_type) && (
            <small className="draft-debtor-hint">ใส่หลายชื่อได้ คั่นด้วย , แล้วจะแยกเป็นหนี้รายคนให้</small>
          )}
          {!!newDebtorNames.length && (
            <small>{relevantKind === "own" ? "หนี้ใหม่" : "ลูกหนี้ใหม่"} · {newDebtorNames.join(", ")} · จะสร้างให้อัตโนมัติเมื่อบันทึก</small>
          )}
        </div>
      )}
      {perPerson && (
        <div className="draft-split-people-list">
          <div className="draft-split-people-head">
            <p className="draft-split-people-title">
              {isSplit ? `หารกัน ${perPersonSplit.heads} คน` : `ออกให้ ${splitNames.length} คน`}
            </p>
            {hasPins && (
              <button type="button" className="text-button" onClick={() => update({ split_shares: null, split_self_share: null })}>
                หารเท่ากัน
              </button>
            )}
          </div>
          <ul>
            {splitNames.map((name, index) => (
              <li key={name}>
                <span>{name}</span>
                <AmountInput value={perPersonSplit.shares[index]} onChange={(share) => pinShare(index, share)} />
              </li>
            ))}
            {isSplit && (
              <li className="is-self">
                <span>ส่วนของคุณ</span>
                <AmountInput value={perPersonSplit.userShare} onChange={(split_self_share) => update({ split_self_share })} />
              </li>
            )}
          </ul>
          <small>
            แก้ยอดของใครก็ได้ ที่เหลือจะหารกันเอง · บันทึกแล้วจะแยกเป็น{" "}
            {splitNames.length + (perPersonSplit.userShare > 0 ? 1 : 0)} รายการ เพื่อให้ยอดหนี้แยกรายคน
          </small>
        </div>
      )}
      {isSplit && !perPerson && (
        <SplitShareField
          amount={draft.amount}
          partnerShare={draft.partner_share}
          userShare={draft.user_share}
          debtorName={draft.debtor_name}
          onChange={(partner_share) => update({ partner_share })}
        />
      )}
      {canPayWithCard && (
        <label className="draft-funding">
          จ่ายด้วย
          <div className="select-shell">
            <select
              value={fundingCard ? `card:${fundingCard}` : `wallet:${draft.wallet_id || defaultWalletId(wallets) || ""}`}
              onChange={(event) => {
                const [source, value] = splitFundingValue(event.target.value);
                update(source === "card"
                  ? { funding_card_name: value, wallet_id: null }
                  : { funding_card_name: null, wallet_id: value || null });
              }}
            >
              <optgroup label="กระเป๋า">
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={`wallet:${wallet.id}`}>{wallet.name}</option>
                ))}
              </optgroup>
              <optgroup label="บัตรเครดิต / หนี้ของฉัน">
                {cards.map((card) => (
                  <option key={card.id} value={`card:${card.name}`}>{card.name}</option>
                ))}
              </optgroup>
            </select>
            <ChevronDown className="select-shell-chevron" aria-hidden="true" />
          </div>
        </label>
      )}
      <button
        type="button"
        className={`text-button draft-details-toggle${showDetails ? " is-open" : ""}`}
        aria-expanded={showDetails}
        onClick={() => setDetailsOpen((current) => !current)}
      >
        {`${showDetails ? "ซ่อน" : "แก้ไข"}วันที่ / ${isTransfer || fundingCard ? "" : "กระเป๋า / "}หมายเหตุ`}
        <ChevronDown size={14} strokeWidth={2.5} aria-hidden="true" />
      </button>
      {showDetails && (
        <div className="draft-grid draft-grid-secondary">
          <label>
            วันที่
            <DateField value={toDateInput(draft.occurred_at)} onChange={(next) => update({ occurred_at: withDateKeepingTime(next, draft.occurred_at) })} />
          </label>
          {!isTransfer && !fundingCard && !!wallets.length && draft.transaction_type !== "card_charge" && (
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
            หมายเหตุ
            <input value={draft.note ?? ""} onChange={(event) => update({ note: event.target.value })} />
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
        ) : perPerson ? (
          <div className="impact-row">
            <span>{fundingCard || "กระเป๋า"} {formatSignedMoney(fundingCard ? draft.amount : -draft.amount)}</span>
            <span>ลูกหนี้ {splitNames.length} คน {formatSignedMoney(perPersonSplit.shares.reduce((sum, share) => sum + share, 0))}</span>
          </div>
        ) : fundingCard ? (
          // Two rows get written here, so the preview shows both: the charge
          // that lands on the card, and the share that lands on the person.
          <div className="impact-row">
            <span>{fundingCard} {formatSignedMoney(draft.amount)}</span>
            <span>{draft.debtor_name || "ลูกหนี้"} {formatSignedMoney(draft.debt_impact)}</span>
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

/** "wallet:<id>" / "card:<name>" -- one dropdown, two kinds of funding. */
function splitFundingValue(value: string): [source: string, value: string] {
  const separator = value.indexOf(":");
  return [value.slice(0, separator), value.slice(separator + 1)];
}

/**
 * How much of a shared bill the other person owes back, from either end: the
 * headcount, for the usual even split (a table of six is a number you count,
 * not a fraction you look up -- which is why this is a headcount rather than
 * the ÷2 ÷3 ÷4 chips it replaced), or the amount itself, for "you get 100 of
 * this one".
 *
 * Both are always visible and always agree: typing a share that isn't an even
 * split just empties the headcount, and every number the split produces --
 * each person's share, the user's own -- is spelled out rather than left to
 * be inferred from one figure.
 */
export function SplitShareField({
  amount,
  partnerShare,
  userShare,
  debtorName,
  onChange,
}: {
  amount: number;
  partnerShare: number;
  userShare: number;
  debtorName: string;
  onChange: (share: number) => void;
}) {
  const people = peopleFromPartnerShare(amount, partnerShare);
  const name = debtorName && debtorName !== unnamedDebtor ? debtorName : "อีกฝ่าย";
  const setPeople = (next: number) => onChange(partnerShareForPeople(amount, next));

  return (
    <div className="draft-split-share">
      <div className="draft-split-people">
        <span className="draft-split-people-label">หารกันกี่คน<small>รวมคุณด้วย</small></span>
        <span className="draft-split-stepper">
          <button
            type="button"
            onClick={() => setPeople((people ?? MIN_SPLIT_PEOPLE) - 1)}
            disabled={!!people && people <= MIN_SPLIT_PEOPLE}
            aria-label="ลดจำนวนคนที่หาร"
          >
            <Minus size={16} strokeWidth={2.5} aria-hidden="true" />
          </button>
          <input
            className="draft-split-people-count"
            inputMode="numeric"
            value={people ?? ""}
            placeholder="—"
            aria-label="จำนวนคนที่หารบิลนี้"
            onChange={(event) => {
              const next = Number(event.target.value.replace(/\D/g, ""));
              if (next >= MIN_SPLIT_PEOPLE) setPeople(Math.min(next, MAX_SPLIT_PEOPLE));
            }}
          />
          <button
            type="button"
            onClick={() => setPeople((people ?? MIN_SPLIT_PEOPLE - 1) + 1)}
            disabled={!!people && people >= MAX_SPLIT_PEOPLE}
            aria-label="เพิ่มจำนวนคนที่หาร"
          >
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </span>
      </div>
      <label>
        {name}คืนเท่าไร
        <AmountInput value={partnerShare} onChange={onChange} />
      </label>
      <small className="draft-split-summary">
        {people ? `คนละ ${formatMoney(amount / people)} · ` : ""}ส่วนของคุณ {formatMoney(userShare)}
      </small>
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
        ชื่อรายการ{isTransfer && <small> (เว้นว่างได้ จะตั้งชื่อให้อัตโนมัติ)</small>}
        <input
          value={draft.title}
          onChange={(event) => update({ title: event.target.value })}
          onBlur={() => {
            const remembered = categoryMemory.get(draft.title.trim().toLowerCase());
            if (remembered) update({ category: remembered });
          }}
        />
      </label>
      {!isTransfer && (
        <label>
          หมวดหมู่
          <CategoryPicker value={draft.category} onChange={(category) => update({ category })} />
        </label>
      )}
      {DEBT_TYPES.includes(draft.transaction_type) && (
        <label>
          {draft.transaction_type === "card_charge" ? "ชื่อบัตร" : "ชื่อผู้เกี่ยวข้อง"}
          <input type="text" placeholder={draft.transaction_type === "card_charge" ? "เช่น กรุงศรีเฟิร์สช้อย" : "เช่น เพื่อนเอ"} value={draft.debtor_name} onChange={(event) => update({ debtor_name: event.target.value })} />
        </label>
      )}
      <label>
        วันที่
        <DateField value={toDateInput(draft.occurred_at)} max={todayDateInput()} onChange={(next) => update({ occurred_at: withDateKeepingTime(next, draft.occurred_at) })} />
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
        หมายเหตุ
        <textarea value={draft.note ?? ""} onChange={(event) => update({ note: event.target.value })} placeholder="รายละเอียดเพิ่มเติมของรายการนี้" />
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
  // One leg of a card-funded bill (see expandDraftForSave). Amount, type
  // and funding are the halves of it that only make sense together, so they
  // are locked the way a transfer's are -- but the split itself is this row's
  // alone, so who owes what stays editable.
  const [cardFundedLeg] = useState(() => isCardFundedLeg(entry));
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
      {cardFundedLeg && <p className="pin-hint">รายการนี้จ่ายด้วยบัตร จึงถูกบันทึกเป็นสองแถวคู่กัน (ยอดบนบัตร + ส่วนที่หารกัน) — ยอดเงินและชนิดรายการแก้ที่นี่ไม่ได้ ต้องลบแล้วบันทึกใหม่ ส่วนที่อีกฝ่ายคืนแก้ได้ตามปกติ</p>}
      {wasInvestmentBuy && <p className="pin-hint">รายการลงทุนแก้ไขได้เฉพาะชื่อ วันที่ และหมายเหตุ — ลบรายการนี้จะไม่ปรับหน่วย/ทุนในพอร์ตให้อัตโนมัติ ต้องไปแก้ในหน้าพอร์ตลงทุนเอง</p>}
      {convertingToTransfer && <p className="pin-hint">เลือกกระเป๋าปลายทางก่อนบันทึกเป็นรายการโอน</p>}

      <label>
        ชื่อรายการ
        <input value={entry.title} onChange={(event) => update({ title: event.target.value })} />
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
          <select value={entry.transaction_type} disabled={wasTransfer || wasInvestmentBuy || cardFundedLeg} onChange={(event) => update({ transaction_type: event.target.value as TransactionType })}>
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
        <AmountInput
          value={entry.amount}
          onChange={(amount) => update({ amount, partner_share: retargetPartnerShare(entry.amount, entry.partner_share, amount) })}
          disabled={wasTransfer || cardFundedLeg}
        />
      </label>
      {entry.transaction_type === "split_half" && (
        <SplitShareField
          amount={entry.amount}
          partnerShare={entry.partner_share}
          userShare={entry.user_share}
          debtorName={entry.debtor_name}
          onChange={(partner_share) => update({ partner_share })}
        />
      )}
      {DEBT_TYPES.includes(entry.transaction_type) && (
        <label>
          {entry.transaction_type === "card_charge" ? "ชื่อบัตร" : "ชื่อผู้เกี่ยวข้อง"}
          <input type="text" placeholder={entry.transaction_type === "card_charge" ? "เช่น กรุงศรีเฟิร์สช้อย" : "เช่น เพื่อนเอ"} value={entry.debtor_name} onChange={(event) => update({ debtor_name: event.target.value })} />
        </label>
      )}
      <label>
        วันที่
        <DateField value={toDateInput(entry.occurred_at)} onChange={(next) => update({ occurred_at: withDateKeepingTime(next, entry.occurred_at) })} />
      </label>
      {!!wallets.length && entry.transaction_type !== "card_charge" && !wasTransfer && !cardFundedLeg && (
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
        หมายเหตุ
        <textarea value={entry.note ?? ""} onChange={(event) => update({ note: event.target.value })} placeholder="รายละเอียดเพิ่มเติมของรายการนี้" />
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
