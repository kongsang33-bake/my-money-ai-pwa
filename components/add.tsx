"use client";

import { memo, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeftRight, ArrowUp, ChevronDown, ImagePlus, Lightbulb, Minus, Pencil, Plus, Trash2, X } from "lucide-react";
import { reviewDraft } from "@/lib/draft-review";
import { CATEGORY_DOT_TINT_ALPHA, ENTRY_SWIPE_ACTIONS_WIDTH, ENTRY_SWIPE_SLOP, MAX_SPLIT_PEOPLE, MIN_SPLIT_PEOPLE } from "@/lib/constants";
import { compressSlipImage } from "@/lib/image";
import { formatMoney, formatTime, formatSignedMoney, moneySign, toDateInput } from "@/lib/format";
import { dayLabel, todayDateInput, withDateKeepingTime, groupEntriesByDay } from "@/lib/cycle";
import { CARD_FUNDABLE_TYPES, SHARED_EXPENSE_TYPES, defaultWalletId, draftTotals, draftSplitPins, entryDisplayImpact, isFundedLeg, isMultiPersonSplit, normalizeEntry, partnerShareForPeople, peopleFromPartnerShare, retargetPartnerShare, retypedTo, splitDebtorNames, splitPinMismatch, splitSharesBetween, unnamedDebtor } from "@/lib/money";
import { DEBT_TYPES, TYPES_USER_OWES, isFormOnlyDerivedType, transactionKind, transactionTypeLabels, transactionTypeOptions, type TransactionType } from "@/lib/taxonomy";
import { summarizeDayEntries } from "@/lib/insights";
import { categories, categoryColor, categoryTint } from "@/lib/category";
import type { AiSuggestion, Debtor, DebtorKind, Draft, EmptyAction, Entry, QuickShortcut, SlipImage, Wallet } from "@/lib/types";
import { CategoryIcon, CategoryPicker, FundingSelect } from "@/components/shared";
import { AmountInput, DateField, EmptyNote, SheetFrame, StateCard, SheetClose } from "@/components/primitives";

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
  initialText = "",
  showPrimer = false,
  noWallet = false,
  onCreateWallet,
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
  // Seed for the textarea, used once at mount. The parent remounts this
  // component to change what is in it (see `composerResetKey` in
  // app/page.tsx), so this is a starting value, not a controlled prop --
  // which is what lets the setup flow hand over an example sentence.
  initialText?: string;
  // One line explaining what can be typed here at all. Shown only while the
  // account has no entries yet, so it teaches once instead of nagging.
  showPrimer?: boolean;
  noWallet?: boolean;
  onCreateWallet?: () => void;
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
  const [text, setText] = useState(initialText);
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

      {showPrimer && (
        <p className="composer-primer">
          พิมพ์เป็นประโยคธรรมดาได้เลย จดหลายรายการในครั้งเดียวก็ได้ หรือแนบรูปสลิปให้ AI อ่านแทนการพิมพ์
        </p>
      )}
      {noWallet && (
        <div className="composer-wallet-note">
          <span>จดได้เลย แต่ยอดเงินจะเริ่มนับเมื่อมีกระเป๋า</span>
          {onCreateWallet && <button type="button" onClick={onCreateWallet}>สร้างกระเป๋า</button>}
        </div>
      )}

      <div className="ai-suggestions">
        <span>แตะตัวอย่างเพื่อเริ่มเร็ว</span>
        <div className="quick-shortcuts">
          {suggestions.map((suggestion) => (
            <button
              key={`${suggestion.label}|${suggestion.detail}`}
              className="quick-chip"
              onClick={() => applySuggestion(suggestion)}
            >
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

        {/* A chat composer: attach on the left, send on the right, both
            inside the box they act on -- not a full-width button hanging
            under it that read as disabled grey until something was typed. */}
        <div className="input-tools">
          <label className="attach-button">
            <ImagePlus size={18} strokeWidth={2} aria-hidden="true" />
            {slipImages.length ? `${slipImages.length}/${maxSlipImages} รูป` : "แนบสลิป"}
            <input type="file" accept="image/*" multiple onChange={(event) => { void addSlipFiles(event.target.files); event.currentTarget.value = ""; }} />
          </label>
          <button className="composer-send" onClick={() => onAnalyze(text, slipImages)} disabled={busy || disabled || (!text.trim() && !slipImages.length)}>
            {busy ? <span className="button-loading-row"><span className="loading-spinner mini on-ink" />{elapsedLabel}</span> : <>ให้ AI แยกรายการ<ArrowUp size={16} strokeWidth={2.5} aria-hidden="true" /></>}
          </button>
        </div>
      </div>
      {error && <StateCard tone="error" title="AI ยังทำรายการนี้ไม่ได้" detail={error} />}
    </>
  );
}

type DraftDetailField = "date" | "wallet" | "note";

export function DraftRow({ draft, knownDebtors, receivable = [], wallets, onChange, onRemove }: { draft: Draft; knownDebtors: Debtor[]; receivable?: { name: string; amount: number }[]; wallets: Wallet[]; onChange: (draft: Draft) => void; onRemove: () => void }) {
  const update = (patch: Partial<Draft>) => onChange(normalizeEntry({ ...draft, ...patch }, false));
  const isDebtType = DEBT_TYPES.includes(draft.transaction_type);
  const isOwnDebtType = TYPES_USER_OWES.includes(draft.transaction_type);
  const relevantKind: DebtorKind = isOwnDebtType ? "own" : "lend";
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
  // The card reads first and opens second: every value the AI guessed and
  // what saving does are on the folded card (reviewDraft), so a draft that
  // needs nothing from the user is checked by reading it. Only one that does
  // -- a guess, a new name, a transfer with nowhere to go -- starts open, and
  // one that would block the save cannot be folded away at all.
  const review = useMemo(() => reviewDraft(draft, wallets, knownDebtors), [draft, wallets, knownDebtors]);
  const blocked = review.attention.some((reason) => reason.blocking);
  const [expanded, setExpanded] = useState(review.attention.length > 0);
  const open = expanded || blocked;
  // Date, wallet and note are chips that carry their current value, each
  // opening its own field -- they used to sit together behind one
  // "แก้ไขวันที่ / กระเป๋า / หมายเหตุ" toggle that hid what they held.
  const [openFields, setOpenFields] = useState<DraftDetailField[]>([]);
  const toggleField = (field: DraftDetailField) =>
    setOpenFields((current) => (current.includes(field) ? current.filter((item) => item !== field) : [...current, field]));
  // A split or a lend can come off a credit card instead of a wallet. Cards
  // live in the debtors table (kind "own"), not in wallets, which is why the
  // wallet dropdown alone could not express "dinner split with จูน, paid on
  // SPay" -- the one thing this row could not say before.
  const canPayWithCard = CARD_FUNDABLE_TYPES.includes(draft.transaction_type);
  const fundingCard = canPayWithCard ? draft.funding_card_name?.trim() || "" : "";
  const showFunding = canPayWithCard && (!!knownDebtors.length || !!fundingCard);
  // "จ่ายด้วย" already lists every wallet, so a second wallet picker is only
  // offered where that one is not.
  const showWallet = !isTransfer && !fundingCard && !showFunding && !!wallets.length && draft.transaction_type !== "card_charge";
  const walletName = wallets.find((wallet) => wallet.id === (draft.wallet_id || defaultWalletId(wallets)))?.name ?? "";
  const isSplit = draft.transaction_type === "split_half";
  // Several names in the one debtor field means one debt each, worked out at
  // save (expandDraftForSave). The headcount and the share are then the list's
  // to decide, not the user's -- so they are shown, not asked for.
  const splitNames = SHARED_EXPENSE_TYPES.includes(draft.transaction_type) ? splitDebtorNames(draft.debtor_name) : [];
  const perPerson = isMultiPersonSplit(draft);
  const perPersonSplit = splitSharesBetween(draft.amount, splitNames, draft.transaction_type, draftSplitPins(draft));
  const hasPins = !!draft.split_shares?.some((share) => share != null) || draft.split_self_share != null;
  const pinMismatch = splitPinMismatch(draft);
  // A pinned line shows what was typed, not what the arithmetic had to do with
  // it -- otherwise a number that doesn't fit the bill snaps to one that does
  // and the mismatch it caused becomes invisible.
  const shareShown = (index: number) => draft.split_shares?.[index] ?? perPersonSplit.shares[index];
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
    <div className={`draft${open ? " is-open" : ""}${review.attention.length ? " draft-needs-review" : ""}`} data-draft-id={draft.id}>
      <button className="draft-remove" onClick={onRemove} aria-label="ลบรายการนี้ออกจากรายการที่ตรวจสอบ">
        <X size={14} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        className="draft-summary"
        aria-expanded={open}
        onClick={() => { if (!blocked) setExpanded((current) => !current); }}
      >
        {isTransfer ? (
          <span className="cat-icon draft-transfer-icon"><ArrowLeftRight size={18} strokeWidth={2.25} aria-hidden="true" /></span>
        ) : (
          <span className="cat-icon" style={{ background: categoryTint(draft.category, CATEGORY_DOT_TINT_ALPHA), color: categoryColor(draft.category) }}><CategoryIcon category={draft.category} size={18} /></span>
        )}
        <span className="draft-summary-main">
          <span className="draft-summary-line">
            <b className="draft-summary-title">{draft.title.trim() || "ไม่มีชื่อรายการ"}</b>
            <strong className="draft-summary-amount">{moneySign}{formatMoney(draft.amount)}</strong>
          </span>
          <span className="draft-facts">
            {review.facts.map((fact) => <span key={fact.key} className={`draft-fact is-${fact.key}`}>{fact.text}</span>)}
          </span>
        </span>
        {!blocked && <ChevronDown className="draft-summary-chevron" size={16} strokeWidth={2.5} aria-hidden="true" />}
      </button>
      {!!review.attention.length && (
        <ul className="draft-attention">
          {review.attention.map((reason) => <li key={reason.text} className={reason.blocking ? "is-blocking" : undefined}>{reason.text}</li>)}
        </ul>
      )}
      {!!review.effects.length && (
        <ul className="draft-effects" aria-label="ผลหลังบันทึก">
          {review.effects.map((effect) => <li key={effect.text} className={`is-${effect.tone}`}>{effect.text}</li>)}
        </ul>
      )}
      {open && (
        <div className="draft-editor">
          <label className="draft-title-field">
            ชื่อรายการ
            <input value={draft.title} onChange={(event) => update({ title: event.target.value })} />
          </label>
          <label>
            ชนิดรายการ
            <div className="select-shell">
              <select value={draft.transaction_type} onChange={(event) => update({ ...retypedTo(event.target.value as TransactionType), ambiguous: false })}>
              {transactionTypeOptions().map(([value, label]) => (
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
                    <AmountInput value={shareShown(index)} onChange={(share) => pinShare(index, share)} />
                  </li>
                ))}
                {isSplit && (
                  <li className="is-self">
                    <span>ส่วนของคุณ</span>
                    <AmountInput value={draft.split_self_share ?? perPersonSplit.userShare} onChange={(split_self_share) => update({ split_self_share })} />
                  </li>
                )}
              </ul>
              {pinMismatch ? (
                <p className="draft-split-warning">{pinMismatch.detail}</p>
              ) : (
                <small>
                  แก้ยอดของใครก็ได้ ที่เหลือจะหารกันเอง · บันทึกแล้วจะแยกเป็น{" "}
                  {splitNames.length + (perPersonSplit.userShare > 0 ? 1 : 0)} รายการ เพื่อให้ยอดหนี้แยกรายคน
                </small>
              )}
            </div>
          )}
          {isSplit && !perPerson && (
            <SplitShareField
              foldEvenShare
              amount={draft.amount}
              partnerShare={draft.partner_share}
              userShare={draft.user_share}
              debtorName={draft.debtor_name}
              onChange={(partner_share) => update({ partner_share })}
            />
          )}
          {showFunding && (
            <FundingSelect
              className="draft-funding"
              walletId={draft.wallet_id ?? null}
              cardName={fundingCard}
              wallets={wallets}
              debtors={knownDebtors}
              receivable={receivable}
              onChange={update}
            />
          )}
          <div className="draft-meta" role="group" aria-label="รายละเอียดอื่น">
            <button type="button" className={`draft-meta-chip${openFields.includes("date") ? " is-open" : ""}`} data-field="date" aria-expanded={openFields.includes("date")} onClick={() => toggleField("date")}>
              วันที่<b>{dayLabel(draft.occurred_at)}</b>
            </button>
            {showWallet && (
              <button type="button" className={`draft-meta-chip${openFields.includes("wallet") ? " is-open" : ""}`} data-field="wallet" aria-expanded={openFields.includes("wallet")} onClick={() => toggleField("wallet")}>
                กระเป๋า<b>{walletName}</b>
              </button>
            )}
            <button type="button" className={`draft-meta-chip${openFields.includes("note") ? " is-open" : ""}`} data-field="note" aria-expanded={openFields.includes("note")} onClick={() => toggleField("note")}>
              หมายเหตุ<b>{draft.note?.trim() || "เพิ่ม"}</b>
            </button>
          </div>
          {!!openFields.length && (
            <div className="draft-grid draft-grid-secondary">
              {openFields.includes("date") && (
                <label>
                  วันที่
                  <DateField value={toDateInput(draft.occurred_at)} onChange={(next) => update({ occurred_at: withDateKeepingTime(next, draft.occurred_at) })} />
                </label>
              )}
              {showWallet && openFields.includes("wallet") && (
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
              {openFields.includes("note") && (
                <label className="draft-field-full">
                  หมายเหตุ
                  <input value={draft.note ?? ""} onChange={(event) => update({ note: event.target.value })} />
                </label>
              )}
            </div>
          )}
          {!blocked && (
            <button type="button" className="text-button draft-done" onClick={() => setExpanded(false)}>
              เสร็จ พับรายการนี้
            </button>
          )}
        </div>
      )}
    </div>
  );
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
  foldEvenShare = false,
  onChange,
}: {
  amount: number;
  partnerShare: number;
  userShare: number;
  debtorName: string;
  /**
   * Keep the amount field behind "ไม่ได้หารเท่ากัน?" while the split is even.
   * An even split is fully said by the headcount and the line under it, and
   * the review step (DraftRow) showed the same share four ways at once --
   * stepper, field, summary line and the effects -- so it asks for the
   * amount only when it differs. The edit sheet keeps both in view.
   */
  foldEvenShare?: boolean;
  onChange: (share: number) => void;
}) {
  const people = peopleFromPartnerShare(amount, partnerShare);
  const name = debtorName && debtorName !== unnamedDebtor ? debtorName : "อีกฝ่าย";
  const setPeople = (next: number) => onChange(partnerShareForPeople(amount, next));
  // The count on screen is derived from partner_share, so a keystroke that
  // isn't a headcount yet has nowhere to live -- and "1" on the way to "12"
  // is exactly that, which is why 10-19 could only be reached by holding the
  // stepper. This parks the half-typed digits until they become a count worth
  // committing; the steppers and blur hand the field back to the real value.
  const [typing, setTyping] = useState<string | null>(null);
  const [unevenOpen, setUnevenOpen] = useState(false);
  const showShareField = !foldEvenShare || unevenOpen || !people;

  return (
    <div className="draft-split-share">
      <div className="draft-split-people">
        <span className="draft-split-people-label">หารกันกี่คน<small>รวมคุณด้วย</small></span>
        <span className="draft-split-stepper">
          <button
            type="button"
            onClick={() => { setTyping(null); setPeople((people ?? MIN_SPLIT_PEOPLE) - 1); }}
            disabled={!!people && people <= MIN_SPLIT_PEOPLE}
            aria-label="ลดจำนวนคนที่หาร"
          >
            <Minus size={16} strokeWidth={2.5} aria-hidden="true" />
          </button>
          <input
            className="draft-split-people-count"
            inputMode="numeric"
            value={typing ?? people ?? ""}
            placeholder="—"
            aria-label="จำนวนคนที่หารบิลนี้"
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, "");
              const next = Number(digits);
              if (digits && next >= MIN_SPLIT_PEOPLE) {
                setTyping(null);
                setPeople(Math.min(next, MAX_SPLIT_PEOPLE));
              } else {
                setTyping(digits);
              }
            }}
            onBlur={() => setTyping(null)}
          />
          <button
            type="button"
            onClick={() => { setTyping(null); setPeople((people ?? MIN_SPLIT_PEOPLE - 1) + 1); }}
            disabled={!!people && people >= MAX_SPLIT_PEOPLE}
            aria-label="เพิ่มจำนวนคนที่หาร"
          >
            <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </span>
      </div>
      {showShareField && (
        <label>
          {name}คืนเท่าไร
          <AmountInput value={partnerShare} onChange={onChange} />
        </label>
      )}
      <p className="draft-split-summary">
        <small>
          {people ? `คนละ ${formatMoney(amount / people)} · ` : ""}{showShareField ? "" : `${name}คืน ${formatMoney(partnerShare)} · `}ส่วนของคุณ {formatMoney(userShare)}
        </small>
        {!showShareField && (
          <button type="button" className="text-button draft-split-uneven" onClick={() => setUnevenOpen(true)}>
            ไม่ได้หารเท่ากัน?
          </button>
        )}
      </p>
    </div>
  );
}

export function DraftImpact({ items, wallets, knownDebtors }: { items: Draft[]; wallets: Wallet[]; knownDebtors: Debtor[] }) {
  // Totalled from the rows these drafts become, not from the drafts -- see
  // draftTotals. Memoised because expanding mints ids for the linked legs.
  const { wallet, receivable, payable } = useMemo(() => draftTotals(items, wallets, knownDebtors), [items, wallets, knownDebtors]);

  return (
    <div className="draft-impact">
      <span>รวมทุกกระเป๋า {formatSignedMoney(wallet)}</span>
      {/* Two books, never one number: what people owe the user and what the
          user owes are opposite directions, and adding them together produced
          a figure that matched nothing on any screen. Each is shown only when
          this batch actually moved it. */}
      {receivable !== 0 && <span>ลูกหนี้ {formatSignedMoney(receivable)}</span>}
      {payable !== 0 && <span>หนี้ของเรา {formatSignedMoney(payable)}</span>}
      {receivable === 0 && payable === 0 && <span>ยอดหนี้ {formatSignedMoney(0)}</span>}
    </div>
  );
}

export const EntryList = memo(function EntryList({
  entries,
  onOpen,
  onEdit,
  onDelete,
  emptyAction,
  amountField = "wallet",
  selectedDay,
  dayTotals = false,
}: {
  entries: Entry[];
  /** What a tap on the row does -- the detail sheet, where one exists. Falls back to onEdit. */
  onOpen?: (entry: Entry) => void;
  onEdit?: (entry: Entry) => void;
  onDelete?: (entry: Entry) => void;
  emptyAction?: EmptyAction;
  amountField?: "wallet" | "debt";
  /** A Date.toDateString() whose group is marked, and scrolled to by the caller via data-day. */
  selectedDay?: string;
  /** Each day's money in and out beside its date -- the list reads as a statement. */
  dayTotals?: boolean;
}) {
  const groups = useMemo(() => groupEntriesByDay(entries), [entries]);
  // One row open at a time, the way iOS Mail does it: opening another, or
  // tapping the open one, closes it.
  const [openId, setOpenId] = useState<string | null>(null);

  if (!entries.length) return <EmptyNote glyph="▣" action={emptyAction}>ยังไม่มีรายการในช่วงนี้</EmptyNote>;

  return (
    <div className="entry-list">
      {groups.map((group) => {
        const totals = dayTotals ? summarizeDayEntries(group.items) : null;
        return (
          <div className={`entry-group${group.key === selectedDay ? " is-selected" : ""}`} key={group.key} data-day={group.key}>
            <p className="entry-day">
              <span>{group.label}</span>
              {totals && (totals.income > 0 || totals.outflow > 0) && (
                <span className="entry-day-totals">
                  {totals.income > 0 && <b className="income">+{moneySign}{formatMoney(totals.income)}</b>}
                  {totals.outflow > 0 && <b className="expense">−{moneySign}{formatMoney(totals.outflow)}</b>}
                </span>
              )}
            </p>
            {group.items.map((entry) => {
              const impact = amountField === "debt" ? entry.debt_impact : entryDisplayImpact(entry);
              const content = (
                <>
                  <span className="entry-icon" style={{ background: categoryTint(entry.category, CATEGORY_DOT_TINT_ALPHA), color: categoryColor(entry.category) }}><CategoryIcon category={entry.category} size={18} /></span>
                  <div>
                    <b>{entry.title}</b>
                    <small>
                      {/* Time only: every row sits under its day's heading
                          (groupEntriesByDay), and the full date repeated on
                          each one pushed the line past its width. */}
                      {transactionTypeLabels[entry.transaction_type]} · {entry.category} · {formatTime(entry.occurred_at)}
                      {entry.debt_impact !== 0 ? ` · ${entry.debtor_name}` : ""}
                    </small>
                    {entry.note && <small className="entry-note" title={entry.note}>{entry.note}</small>}
                  </div>
                  <strong className={impact >= 0 ? "income" : "expense"}>{formatSignedMoney(impact)}</strong>
                </>
              );
              const tap = onOpen ?? onEdit;
              if (!onEdit && !onDelete) {
                return (
                  <article className="entry" key={entry.id}>
                    {tap
                      ? <button type="button" className="entry-main entry-tappable" onClick={() => tap(entry)}>{content}</button>
                      : <div className="entry-main">{content}</div>}
                  </article>
                );
              }
              return (
                <SwipeEntry
                  key={entry.id}
                  open={openId === entry.id}
                  onOpenChange={(open) => setOpenId(open ? entry.id : null)}
                  onTap={tap ? () => tap(entry) : undefined}
                  onEdit={onEdit ? () => { setOpenId(null); onEdit(entry); } : undefined}
                  onDelete={onDelete ? () => { setOpenId(null); onDelete(entry); } : undefined}
                >
                  {content}
                </SwipeEntry>
              );
            })}
          </div>
        );
      })}
    </div>
  );
});

/**
 * A row that a finger slides left to uncover แก้ไข and ลบ behind it. Only a
 * touch drives the slide: a mouse (fine pointer) gets the same two buttons
 * sitting at the row's end instead (see .swipe-row in globals.css), and a
 * keyboard reaching either button opens the row so the focused button is
 * never hidden under it. The slide itself is written straight to a CSS
 * variable during the drag, so a move does not re-render the list.
 */
function SwipeEntry({
  open,
  onOpenChange,
  onTap,
  onEdit,
  onDelete,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTap?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
}) {
  const rowRef = useRef<HTMLElement | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; base: number; mode: "pending" | "swipe" | "scroll"; offset: number } | null>(null);
  const swallowClick = useRef(false);
  const width = ENTRY_SWIPE_ACTIONS_WIDTH;

  const setOffset = (px: number | null) => {
    const row = rowRef.current;
    if (!row) return;
    if (px == null) row.style.removeProperty("--swipe-x");
    else row.style.setProperty("--swipe-x", `${px}px`);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse") return;
    // A browser may send no click at all after a swipe; a fresh touch means
    // any click still owed to the last one is not coming.
    swallowClick.current = false;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, base: open ? -width : 0, mode: "pending", offset: open ? -width : 0 };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (state.mode === "pending") {
      if (Math.abs(dy) > ENTRY_SWIPE_SLOP && Math.abs(dy) > Math.abs(dx)) { state.mode = "scroll"; return; }
      if (Math.abs(dx) <= ENTRY_SWIPE_SLOP) return;
      state.mode = "swipe";
      rowRef.current?.classList.add("is-dragging");
      try { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
    }
    if (state.mode !== "swipe") return;
    state.offset = Math.min(0, Math.max(-width, state.base + dx));
    setOffset(state.offset);
  };
  const onPointerEnd = (event: React.PointerEvent) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    drag.current = null;
    if (state.mode !== "swipe") return;
    rowRef.current?.classList.remove("is-dragging");
    setOffset(null);
    swallowClick.current = true;
    onOpenChange(state.offset < -width / 2);
  };

  return (
    <article
      ref={rowRef}
      className={`entry swipe-row${open ? " is-open" : ""}`}
      style={{ "--swipe-actions-w": `${width}px` } as React.CSSProperties}
    >
      <div className="swipe-actions" onFocus={() => onOpenChange(true)}>
        {onEdit && (
          <button type="button" className="swipe-edit" onClick={onEdit} aria-label="แก้ไขรายการ">
            <Pencil size={18} strokeWidth={2.25} aria-hidden="true" />
            <span>แก้ไข</span>
          </button>
        )}
        {onDelete && (
          <button type="button" className="swipe-delete" onClick={onDelete} aria-label="ลบรายการ">
            <Trash2 size={18} strokeWidth={2.25} aria-hidden="true" />
            <span>ลบ</span>
          </button>
        )}
      </div>
      <div
        className="swipe-content"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <button
          type="button"
          className="entry-main entry-tappable"
          onClick={() => {
            if (swallowClick.current) { swallowClick.current = false; return; }
            if (open) { onOpenChange(false); return; }
            onTap?.();
          }}
        >
          {children}
        </button>
      </div>
    </article>
  );
}

export const QuickAddStrip = memo(function QuickAddStrip({
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
    // A rail on Home, so it takes the rail's heading (.rail/.rail-head) rather
    // than a two-line eyebrow + title of its own -- one row, one name.
    <section className="rail quick-add-strip" aria-label="เพิ่มรายการด่วน">
      <div className="rail-head">
        <h2>จดเร็ว</h2>
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
});

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
        <button type="button" className={isExpense ? "active" : ""} onClick={() => update(retypedTo("personal_expense"))}>รายจ่าย</button>
        <button type="button" className={!isExpense ? "active" : ""} onClick={() => update(retypedTo("income"))}>รายรับ</button>
      </div>
      <button type="button" className="entry-advanced-toggle" aria-expanded={advancedTypeOpen} onClick={() => setAdvancedTypeOpen((current) => !current)}>
        {advancedTypeOpen ? <Minus size={16} strokeWidth={2.25} aria-hidden="true" /> : <Plus size={16} strokeWidth={2.25} aria-hidden="true" />}
        {advancedTypeOpen ? "ซ่อนรายการพิเศษ" : "รายการพิเศษ: ออกให้ก่อน, หารร่วม, ผ่อนหนี้, โอนเงิน"}
      </button>
      {advancedTypeOpen && (
        <label>
          ชนิดรายการ
          <div className="select-shell">
            <select value={draft.transaction_type} onChange={(event) => update(retypedTo(event.target.value as TransactionType))}>
            {transactionTypeOptions().map(([value, label]) => (
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
        <AmountInput value={draft.amount} onChange={(amount) => update({ amount })} />
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
  // One leg of a funded bill (see expandDraftForSave). Amount, type
  // and funding are the halves of it that only make sense together, so they
  // are locked the way a transfer's are -- but the split itself is this row's
  // alone, so who owes what stays editable.
  const [fundedLeg] = useState(() => isFundedLeg(entry));
  const [destWalletId, setDestWalletId] = useState<string | null>(null);
  const wasTransfer = originalType === "transfer";
  const wasInvestmentBuy = originalType === "investment_buy";
  // A reconciliation carries the difference it was written for in its
  // wallet_impact, and normalizeEntry keeps that impact as given rather than
  // re-deriving it from the amount (see balanceAdjustmentEntry). Editing the
  // amount here would leave the row claiming one figure and moving another --
  // the exact drift this type exists to correct -- so amount and type are
  // locked together the way a transfer's are. Getting it wrong is fixed by
  // deleting the row and reconciling the wallet again.
  const wasBalanceAdjustment = originalType === "balance_adjustment";
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
        <SheetClose onClick={onClose} />
      </div>

      {wasTransfer && <p className="pin-hint">รายการโอนเงินแก้ไขได้เฉพาะชื่อ วันที่ และหมายเหตุ — ลบได้ทั้งสองฝั่งพร้อมกัน</p>}
      {fundedLeg && <p className="pin-hint">รายการนี้มีคนอื่นออกเงินให้ (บัตรเครดิต หรือคนที่ออกให้ก่อน) จึงถูกบันทึกเป็นสองแถวคู่กัน — ยอดเงินและชนิดรายการแก้ที่นี่ไม่ได้ ต้องลบแล้วบันทึกใหม่ ส่วนที่อีกฝ่ายคืนแก้ได้ตามปกติ</p>}
      {wasBalanceAdjustment && <p className="pin-hint">รายการปรับยอดถือยอดส่วนต่างที่ทำให้กระเป๋าตรงกับเงินจริง จึงแก้จำนวนเงินและชนิดรายการที่นี่ไม่ได้ — ถ้ายอดยังไม่ตรง ให้ลบรายการนี้แล้วปรับยอดใหม่จากหน้ากระเป๋าเงิน</p>}
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
          <select value={entry.transaction_type} disabled={isFormOnlyDerivedType(originalType) || wasTransfer || fundedLeg} onChange={(event) => update(retypedTo(event.target.value as TransactionType))}>
          {transactionTypeOptions(originalType).map(([value, label]) => (
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
          disabled={wasTransfer || fundedLeg || wasBalanceAdjustment}
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
      {!!wallets.length && entry.transaction_type !== "card_charge" && !wasTransfer && !fundedLeg && (
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
