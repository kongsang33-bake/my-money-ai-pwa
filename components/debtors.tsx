"use client";

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { CATEGORY_DOT_TINT_ALPHA } from "@/lib/constants";
import { formatMoney, formatPercent, formatSignedMoney, moneySign, toMoneyAmount } from "@/lib/format";
import { installmentStatusText, monthlyDebtObligation, payableForDisplay } from "@/lib/money";
import { categories, categoryColor, categoryTint, nameColor } from "@/lib/category";
import type { Debtor, DebtorKind, Entry } from "@/lib/types";
import { CategoryIcon, IconColorPicker, WalletAvatarGlyph } from "@/components/shared";
import { CountUpMoney, EmptyNote, SheetFrame, SkeletonList, StateCard, decimalInputPattern } from "@/components/primitives";
import { EntryList } from "@/components/add";

export function DebtorsView({
  debtors,
  entries,
  receivableSummary,
  payableSummary,
  selectedDebtor,
  activeKind,
  loading,
  onChangeActiveKind,
  onBack,
  onAdd,
  onSelect,
  onEdit,
  onDelete,
}: {
  debtors: Debtor[];
  entries: Entry[];
  receivableSummary: { name: string; amount: number }[];
  payableSummary: { name: string; amount: number }[];
  selectedDebtor: Debtor | null;
  activeKind: DebtorKind;
  loading: boolean;
  onChangeActiveKind: (kind: DebtorKind) => void;
  onBack: () => void;
  onAdd: () => void;
  onSelect: (debtor: Debtor) => void;
  onEdit: (debtor: Debtor) => void;
  onDelete: (debtor: Debtor) => void;
}) {
  const debtorEntries = selectedDebtor
    ? entries.filter((entry) => entry.debtor_name.trim().toLowerCase() === selectedDebtor.name.trim().toLowerCase() && entry.debt_impact !== 0)
    : [];
  const summary = activeKind === "own" ? payableSummary : receivableSummary;
  const selectedAmount = selectedDebtor ? summary.find((item) => item.name.trim().toLowerCase() === selectedDebtor.name.trim().toLowerCase())?.amount ?? 0 : 0;

  if (selectedDebtor) {
    return (
      <div className="view debtor-view">
        <div className="add-title">
          <button onClick={onBack} aria-label="ย้อนกลับ"><ChevronLeft aria-hidden="true" /></button>
          <span className="debtor-avatar" style={{ background: selectedDebtor.icon_color ?? nameColor(selectedDebtor.name) }}>
            <WalletAvatarGlyph iconKey={selectedDebtor.icon} fallbackName={selectedDebtor.name} size={20} />
          </span>
          <div>
            <p className="eyebrow">{selectedDebtor.kind === "own" ? "หนี้ที่ฉันผ่อน" : "ประวัติลูกหนี้"}</p>
            <h2>{selectedDebtor.name}</h2>
          </div>
        </div>
        <section className="debtor-detail-card">
          <span>{selectedDebtor.kind === "own" ? "ยอดหนี้คงเหลือ" : "ยอดค้างปัจจุบัน"}</span>
          <strong><CountUpMoney value={selectedAmount} /></strong>
          {selectedDebtor.kind === "own" && selectedDebtor.credit_card_min_payment_percent ? (
            <small>ขั้นต่ำเดือนนี้ประมาณ {moneySign}{formatMoney(monthlyDebtObligation(selectedDebtor, selectedAmount))} ({selectedDebtor.credit_card_min_payment_percent}% ของยอดคงเหลือ)</small>
          ) : selectedDebtor.kind === "own" && selectedDebtor.monthly_installment ? (
            <small>
              ผ่อนเดือนละ {moneySign}{formatMoney(selectedDebtor.monthly_installment)}
              {installmentStatusText(selectedDebtor, selectedAmount)}
            </small>
          ) : (
            selectedDebtor.note && <small>{selectedDebtor.note}</small>
          )}
          {selectedDebtor.kind === "own" && !!selectedDebtor.credit_limit && (
            <CreditLimitMeter outstanding={selectedAmount} creditLimit={selectedDebtor.credit_limit} />
          )}
        </section>
        <DebtorStatementSummary entries={debtorEntries} kind={selectedDebtor.kind} />
        <div className="section-title">
          <h2>ประวัติยืม/จ่าย</h2>
          <button onClick={() => onEdit(selectedDebtor)}>แก้ไข</button>
        </div>
        <EntryList entries={debtorEntries} amountField="debt" />
      </div>
    );
  }

  const visibleDebtors = debtors.filter((debtor) => debtor.kind === activeKind);
  const summaryTotal = summary.reduce((sum, item) => sum + item.amount, 0);
  // The headline for "หนี้ของฉัน" is what's actually due this cycle (fixed
  // installment, credit card minimum, or the full balance for debts with
  // neither set) rather than the full remaining balance — the total owed
  // is still shown, just as supporting context underneath, since a debt
  // dashboard that leads with the whole principal reads as far more urgent
  // than what you actually need to have ready this month.
  const monthlyObligationTotal = activeKind === "own"
    ? payableForDisplay(debtors, payableSummary, "obligation")
    : summaryTotal;

  return (
    <div className="view debtor-view">
      {loading && <SkeletonList rows={3} />}
      <div className="add-title">
        <button onClick={onBack} aria-label="ย้อนกลับ"><ChevronLeft aria-hidden="true" /></button>
        <div>
          <p className="eyebrow">จัดการหนี้</p>
          <h2>{activeKind === "own" ? "หนี้ของฉัน" : "ยืมเรา"}</h2>
        </div>
        <button className="header-add-button" onClick={onAdd}>เพิ่ม</button>
      </div>
      <div className="report-period-toggle">
        <button className={activeKind === "lend" ? "active" : ""} onClick={() => onChangeActiveKind("lend")}>ยืมเรา</button>
        <button className={activeKind === "own" ? "active" : ""} onClick={() => onChangeActiveKind("own")}>หนี้ของฉัน</button>
      </div>
      <section className="debtor-detail-card">
        <span>{activeKind === "own" ? "ต้องจ่ายเดือนนี้รวม" : "ยอดรวมที่ค้างรับ"}</span>
        <strong><CountUpMoney value={monthlyObligationTotal} /></strong>
        {activeKind === "own" && <small>ยอดหนี้คงเหลือรวม {moneySign}{formatMoney(summaryTotal)}</small>}
      </section>
      <div className="debtor-page-list">
        {visibleDebtors.map((debtor) => {
          const amount = summary.find((item) => item.name.trim().toLowerCase() === debtor.name.trim().toLowerCase())?.amount ?? 0;
          return (
            <article className="debtor-page-item" key={debtor.id}>
              <i className="card-accent" style={{ background: debtor.icon_color ?? nameColor(debtor.name) }} />
              <button className="debtor-main-button" onClick={() => onSelect(debtor)}>
                <span className="debtor-avatar" style={{ background: debtor.icon_color ?? nameColor(debtor.name) }}>
                  <WalletAvatarGlyph iconKey={debtor.icon} fallbackName={debtor.name} />
                </span>
                <div>
                  <span>{debtor.name}</span>
                  {debtor.kind === "own" && debtor.credit_card_min_payment_percent ? (
                    <small>ขั้นต่ำเดือนนี้ประมาณ {moneySign}{formatMoney(monthlyDebtObligation(debtor, amount))} ({debtor.credit_card_min_payment_percent}%)</small>
                  ) : debtor.kind === "own" && debtor.monthly_installment ? (
                    <small>
                      ผ่อนเดือนละ {moneySign}{formatMoney(debtor.monthly_installment)}
                      {installmentStatusText(debtor, amount)}
                    </small>
                  ) : (
                    <small>{debtor.note || "ไม่มีหมายเหตุ"} · ค้าง {moneySign}{formatMoney(amount)}</small>
                  )}
                  {debtor.kind === "own" && !!debtor.credit_limit && (
                    <CreditLimitMeter outstanding={amount} creditLimit={debtor.credit_limit} />
                  )}
                </div>
              </button>
              <details className="kebab-menu" name="debtor-kebab">
                <summary>⋮</summary>
                <menu>
                  <button onClick={() => onEdit(debtor)}>แก้ไข</button>
                  <button onClick={() => onDelete(debtor)}>ลบ</button>
                </menu>
              </details>
            </article>
          );
        })}
        {!visibleDebtors.length && (
          <EmptyNote glyph="◆" action={{ label: "เพิ่ม", onClick: onAdd }}>
            {activeKind === "own" ? "ยังไม่มีหนี้ของฉัน" : "ยังไม่มีรายชื่อลูกหนี้"}
          </EmptyNote>
        )}
      </div>
    </div>
  );
}

export function CreditLimitMeter({ outstanding, creditLimit }: { outstanding: number; creditLimit: number }) {
  const pct = creditLimit > 0 ? Math.min(100, Math.max(0, (outstanding / creditLimit) * 100)) : 0;
  const tone = pct >= 90 ? "danger" : pct >= 70 ? "warn" : "safe";
  const remaining = Math.max(0, creditLimit - outstanding);

  return (
    <div className={`credit-limit-meter credit-limit-meter-${tone}`}>
      <div className="credit-limit-meter-track">
        <div className="credit-limit-meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <small>ใช้ไป {moneySign}{formatMoney(outstanding)} จากวงเงิน {moneySign}{formatMoney(creditLimit)} ({formatPercent(pct)})</small>
      <small className="credit-limit-remaining">เหลือวงเงินใช้ได้ {moneySign}{formatMoney(remaining)}</small>
    </div>
  );
}

export function DebtorStatementSummary({ entries, kind }: { entries: Entry[]; kind: DebtorKind }) {
  const lent = entries.filter((entry) => entry.debt_impact > 0).reduce((sum, entry) => sum + entry.debt_impact, 0);
  const paid = entries.filter((entry) => entry.debt_impact < 0).reduce((sum, entry) => sum + Math.abs(entry.debt_impact), 0);
  const latest = [...entries].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())[0];

  return (
    <section className="debtor-statement">
      <div>
        <span>{kind === "own" ? "เพิ่มยอดหนี้" : "ยืม/หารสะสม"}</span>
        <b><CountUpMoney value={lent} /></b>
      </div>
      <div>
        <span>{kind === "own" ? "ผ่อนชำระสะสม" : "คืนแล้ว"}</span>
        <b><CountUpMoney value={paid} /></b>
      </div>
      <div>
        <span>รายการ</span>
        <b>{entries.length}</b>
      </div>
      <small>{latest ? `ล่าสุด: ${latest.title}` : "ยังไม่มีประวัติการเคลื่อนไหว"}</small>
    </section>
  );
}


export type DebtorInput = {
  name: string;
  note: string;
  opening_balance: number;
  kind: DebtorKind;
  monthly_installment: number | null;
  total_installments: number | null;
  credit_limit: number | null;
  credit_card_min_payment_percent: number | null;
  icon: string | null;
  icon_color: string | null;
};

export function DebtorEditSheet({
  debtor,
  busy,
  error,
  defaultKind,
  onClose,
  onCreate,
  onUpdate,
  closing,
}: {
  debtor: Debtor | null;
  busy: boolean;
  error: string;
  defaultKind: DebtorKind;
  onClose: () => void;
  onCreate: (input: DebtorInput) => Promise<boolean>;
  onUpdate: (debtor: Debtor, patch: DebtorInput) => Promise<boolean>;
  closing?: boolean;
}) {
  const [name, setName] = useState(debtor?.name ?? "");
  const [note, setNote] = useState(debtor?.note ?? "");
  const [openingBalanceText, setOpeningBalanceText] = useState(debtor?.opening_balance ? String(debtor.opening_balance) : "");
  const [kind, setKind] = useState<DebtorKind>(debtor?.kind ?? defaultKind);
  const [monthlyInstallmentText, setMonthlyInstallmentText] = useState(debtor?.monthly_installment ? String(debtor.monthly_installment) : "");
  const [totalInstallmentsText, setTotalInstallmentsText] = useState(debtor?.total_installments != null ? String(debtor.total_installments) : "");
  const [creditLimitText, setCreditLimitText] = useState(debtor?.credit_limit != null ? String(debtor.credit_limit) : "");
  const [minPaymentPercentText, setMinPaymentPercentText] = useState(debtor?.credit_card_min_payment_percent != null ? String(debtor.credit_card_min_payment_percent) : "");
  const [icon, setIcon] = useState<string | null>(debtor?.icon ?? null);
  const [iconColor, setIconColor] = useState<string | null>(debtor?.icon_color ?? null);

  // A credit limit is what marks this as a credit card rather than a fixed
  // loan — cards get a minimum-payment percentage (since the bank-allowed
  // minimum moves with the statement balance every month) instead of a
  // fixed installment amount and a total-installment count, which only
  // make sense for a loan with a known end date.
  const isCreditCard = kind === "own" && creditLimitText !== "";
  const hasInstallment = kind === "own" && !isCreditCard && monthlyInstallmentText !== "";

  const submit = async () => {
    if (!name.trim()) return;
    const totalInstallments = hasInstallment && totalInstallmentsText !== "" ? Math.max(0, Math.round(Number(totalInstallmentsText))) : null;
    const payload: DebtorInput = {
      name,
      note,
      opening_balance: toMoneyAmount(openingBalanceText),
      kind,
      monthly_installment: hasInstallment ? toMoneyAmount(monthlyInstallmentText) : null,
      total_installments: totalInstallments,
      credit_limit: kind === "own" && creditLimitText !== "" ? toMoneyAmount(creditLimitText) : null,
      credit_card_min_payment_percent: isCreditCard && minPaymentPercentText !== "" ? Math.max(0, Math.min(100, Number(minPaymentPercentText))) : null,
      icon,
      icon_color: iconColor,
    };
    const saved = debtor ? await onUpdate(debtor, payload) : await onCreate(payload);
    if (saved) onClose();
  };

  return (
    <SheetFrame onClose={onClose} closing={closing}>
      <div className="sheet-head">
        <div>
          <p className="eyebrow">{debtor ? "แก้ไขรายการหนี้" : "เพิ่มรายการหนี้"}</p>
          <h2>{debtor ? debtor.name : "รายการใหม่"}</h2>
        </div>
        <button onClick={onClose}>x</button>
      </div>
      <div className="report-period-toggle">
        <button type="button" className={kind === "lend" ? "active" : ""} onClick={() => setKind("lend")}>ยืมเรา</button>
        <button type="button" className={kind === "own" ? "active" : ""} onClick={() => setKind("own")}>หนี้ของฉัน</button>
      </div>
      <IconColorPicker value={{ icon, color: iconColor }} onChange={({ icon: nextIcon, color: nextColor }) => { setIcon(nextIcon); setIconColor(nextColor); }} fallbackName={name || "?"} />
      <label>
        <input autoFocus={!debtor} value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "own" ? "เช่น ผ่อนบ้าน ผ่อนรถ" : "เช่น เพื่อนเอ"} />
        <span>ชื่อ</span>
      </label>
      <label>
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={kind === "own" ? "เช่น ธนาคาร หรือรายละเอียดหนี้" : "เช่น เพื่อนร่วมงาน"} />
        <span>หมายเหตุ</span>
      </label>
      <label>
        <input placeholder=" " inputMode="decimal" value={openingBalanceText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setOpeningBalanceText(event.target.value); }} />
        <span>{kind === "own" ? "ยอดหนี้คงเหลือ" : "ยอดเริ่มต้น"}</span>
      </label>
      {kind === "own" && (
        <>
          <label>
        <input inputMode="decimal" value={creditLimitText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setCreditLimitText(event.target.value); }} placeholder="เช่น 50000" />
        <span>วงเงิน (กรอกถ้าเป็นบัตรเครดิต)</span>
      </label>
          {isCreditCard ? (
            <label>
        <input inputMode="decimal" value={minPaymentPercentText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setMinPaymentPercentText(event.target.value); }} placeholder="เช่น 10" />
        <span>ยอดขั้นต่ำที่ต้องจ่าย (%)</span>
        <small className="cycle-note">ยอดขั้นต่ำบัตรเครดิตแปรผันตามยอดคงเหลือทุกเดือน ใส่เป็น % ที่ธนาคารกำหนดแทนยอดคงที่</small>
      </label>
          ) : (
            <>
              <label>
        <input inputMode="decimal" value={monthlyInstallmentText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setMonthlyInstallmentText(event.target.value); }} placeholder="เช่น 15000" />
        <span>ผ่อนต่อเดือน</span>
      </label>
              {hasInstallment && (
                <label>
        <input inputMode="numeric" value={totalInstallmentsText} onChange={(event) => { if (event.target.value === "" || /^\d*$/.test(event.target.value)) setTotalInstallmentsText(event.target.value); }} placeholder="เช่น 24" />
        <span>ทั้งหมด (งวด)</span>
      </label>
              )}
            </>
          )}
        </>
      )}
      {error && <StateCard tone="error" title="บันทึกไม่สำเร็จ" detail={error} />}
      <button className="save" onClick={submit} disabled={busy || !name.trim()}>
        {busy ? "กำลังบันทึก..." : "บันทึก"}
      </button>
    </SheetFrame>
  );
}
export function RecapSheet({
  selectedMonth,
  income,
  outflow,
  balance,
  topCategory,
  streak,
  onClose,
  closing,
}: {
  selectedMonth: string;
  income: number;
  outflow: number;
  balance: number;
  topCategory: { category: string; amount: number } | null;
  streak: number;
  onClose: () => void;
  closing?: boolean;
}) {
  const monthLabel = new Date(`${selectedMonth}-01T00:00:00`).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
  const closingLine = balance >= 0 ? "เดือนนี้ยังมีเงินเหลือเก็บ" : "เดือนหน้าลองคุมงบดูอีกนิด";
  const [shareMessage, setShareMessage] = useState("");

  async function share() {
    const text = [
      `สรุปเดือน ${monthLabel}`,
      `รายรับ ${moneySign}${formatMoney(income)}`,
      `รายจ่าย ${moneySign}${formatMoney(outflow)}`,
      `คงเหลือสุทธิ ${moneySign}${formatMoney(balance)}`,
      topCategory ? `ใช้จ่ายเยอะสุด: ${topCategory.category} (${moneySign}${formatMoney(topCategory.amount)})` : "",
      streak >= 2 ? `จดต่อเนื่อง ${streak} วัน` : "",
    ]
      .filter(Boolean)
      .join("\n");

    if (navigator.share) {
      try {
        await navigator.share({ title: `สรุปเดือน ${monthLabel}`, text });
      } catch {
        // user cancelled the share sheet
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareMessage("คัดลอกสรุปเดือนนี้แล้ว");
    } catch {
      setShareMessage(text);
    }
  }

  return (
    <SheetFrame onClose={onClose} className="recap-card" closing={closing}>
        <button className="recap-close" onClick={onClose}>×</button>
        <p className="recap-month">{monthLabel}</p>
        <strong className={`recap-balance ${balance >= 0 ? "income" : "expense"}`}>{formatSignedMoney(balance)}</strong>
        <div className="recap-grid">
          <div>
            <span>รายรับ</span>
            <b>{moneySign}{formatMoney(income)}</b>
          </div>
          <div>
            <span>รายจ่าย</span>
            <b>{moneySign}{formatMoney(outflow)}</b>
          </div>
        </div>
        {topCategory && (
          <div className="recap-top-category">
            <span className="cat-dot" style={{ background: categoryTint(topCategory.category, 20), color: categoryColor(topCategory.category) }}><CategoryIcon category={topCategory.category} /></span>
            <div>
              <small>ใช้จ่ายเยอะสุด</small>
              <b>{topCategory.category} · {moneySign}{formatMoney(topCategory.amount)}</b>
            </div>
          </div>
        )}
        {streak >= 2 && <p className="recap-streak">จดต่อเนื่อง {streak} วัน</p>}
        <p className="recap-line">{closingLine}</p>
        {shareMessage && <p className="recap-line">{shareMessage}</p>}
        <button className="recap-share" onClick={share}>แชร์สรุปเดือนนี้</button>
    </SheetFrame>
  );
}

export function BudgetSheet({
  budgets,
  onClose,
  onSave,
  closing,
}: {
  budgets: Record<string, number>;
  onClose: () => void;
  onSave: (next: Record<string, number>) => void;
  closing?: boolean;
}) {
  const expenseCategories = categories.filter((category) => category !== "รายได้");
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(expenseCategories.map((category) => [category, budgets[category] ? String(budgets[category]) : ""])),
  );

  const submit = () => {
    const next: Record<string, number> = {};
    for (const category of expenseCategories) {
      const value = toMoneyAmount(draft[category]);
      if (draft[category]?.trim() && value > 0) next[category] = value;
    }
    onSave(next);
    onClose();
  };

  return (
    <SheetFrame onClose={onClose} className="edit-sheet budget-sheet" closing={closing}>
        <div className="sheet-head">
          <div>
            <p className="eyebrow">ตั้งค่า</p>
            <h2>งบประมาณต่อเดือน</h2>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        <p className="budget-hint">ตั้งวงเงินต่อหมวดหมู่ เว้นว่างไว้ถ้าไม่ต้องการจำกัด</p>
        {expenseCategories.map((category) => (
          <label key={category} className="budget-row">
            <span className="cat-dot" style={{ background: categoryTint(category, CATEGORY_DOT_TINT_ALPHA), color: categoryColor(category) }}><CategoryIcon category={category} /></span>
            {category}
            <input
              inputMode="decimal"
              placeholder="ไม่จำกัด"
              value={draft[category] ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, [category]: event.target.value }))}
            />
          </label>
        ))}
        <button className="save" onClick={submit}>
          บันทึกงบประมาณ
        </button>
    </SheetFrame>
  );
}

