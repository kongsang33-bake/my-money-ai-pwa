"use client";

import { memo, useMemo, useState } from "react";
import { ChevronLeft, TrendingDown, TrendingUp, Users, Wallet as WalletIcon } from "lucide-react";
import { CATEGORY_DOT_TINT_ALPHA } from "@/lib/constants";
import { formatMoney, formatPercent, formatShortDate, formatSignedMoney, moneySign, toMoneyAmount } from "@/lib/format";
import { shiftMonthKey } from "@/lib/cycle";
import { spendingByDay, type CashFlowSummary, type SetupStep, type UnpaidOwnDebt } from "@/lib/insights";
import { categoryColor, categoryTint, nameColor } from "@/lib/category";
import type { Entry, MoneyGoal, NetWorthDebtFormula, RecurringExpense } from "@/lib/types";
import { CategoryIcon, WalletAvatarGlyph } from "@/components/shared";
import { CountUpMoney, DateField, EmptyNote, InfoHint, MonthField, SheetFrame, SkeletonList, decimalInputPattern } from "@/components/primitives";

export const CalendarHeatmap = memo(function CalendarHeatmap({
  start,
  end,
  entries,
  selectedMonth,
  onChangeMonth,
  selectedDay,
  defaultDay,
  onSelectDay,
}: {
  start: Date;
  end: Date;
  entries: Entry[];
  selectedMonth: string;
  onChangeMonth: (month: string) => void;
  selectedDay: string;
  defaultDay: string;
  onSelectDay: (day: string) => void;
}) {
  const dayTotals = useMemo(() => spendingByDay(entries), [entries]);

  const days = useMemo(() => {
    const list: { key: string; date: Date; amount: number }[] = [];
    const cursor = new Date(start);
    while (cursor < end) {
      const key = cursor.toDateString();
      list.push({ key, date: new Date(cursor), amount: dayTotals.get(key) ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    return list;
  }, [start, end, dayTotals]);

  const max = Math.max(1, ...days.map((day) => day.amount));
  const bucket = (amount: number) => {
    if (amount <= 0) return 0;
    const ratio = amount / max;
    if (ratio > 0.75) return 4;
    if (ratio > 0.5) return 3;
    if (ratio > 0.25) return 2;
    return 1;
  };
  const weekdayLabels = useMemo(() => {
    const sunday = new Date();
    sunday.setDate(sunday.getDate() - sunday.getDay());
    return Array.from({ length: 7 }, (_, index) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + index);
      return d.toLocaleDateString("th-TH", { weekday: "short" });
    });
  }, []);
  const leadingBlanks = days.length ? days[0].date.getDay() : 0;

  return (
    <section className="heatmap-panel">
      <div className="section-title">
        <h2>ปฏิทินการใช้จ่าย</h2>
        <div className="heatmap-month-controls" aria-label="เลือกรอบเดือนของปฏิทิน">
          <button type="button" onClick={() => onChangeMonth(shiftMonthKey(selectedMonth, -1))} aria-label="เดือนก่อนหน้า">‹</button>
          <MonthField value={selectedMonth} onChange={onChangeMonth} />
          <button type="button" onClick={() => onChangeMonth(shiftMonthKey(selectedMonth, 1))} aria-label="เดือนถัดไป">›</button>
        </div>
      </div>
      <div className="heatmap-weekdays">
        {weekdayLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="heatmap-grid">
        {Array.from({ length: leadingBlanks }, (_, index) => (
          <span key={`blank-${index}`} className="heatmap-cell-blank" />
        ))}
        {days.map((day) => (
          <button
            key={day.key}
            className={`heatmap-cell bucket-${bucket(day.amount)}${selectedDay === day.key ? " selected" : ""}`}
            onClick={() => onSelectDay(selectedDay === day.key ? defaultDay : day.key)}
            title={`${day.date.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" })} · ${moneySign}${formatMoney(day.amount)}`}
          >
            {day.date.getDate()}
          </button>
        ))}
      </div>
      <HeatmapLegend total={days.reduce((sum, day) => sum + day.amount, 0)} activeDays={days.filter((day) => day.amount > 0).length} />
    </section>
  );
});

export function HeatmapLegend({ total, activeDays }: { total: number; activeDays: number }) {
  return (
    <div className="heatmap-legend">
      <span>เบา</span>
      <i className="bucket-1" />
      <i className="bucket-2" />
      <i className="bucket-3" />
      <i className="bucket-4" />
      <span>หนัก</span>
      <b>{activeDays} วัน · {moneySign}{formatMoney(total)}</b>
    </div>
  );
}

export function HeroWalletCard({
  balance,
  insight,
  streak,
}: {
  balance: number;
  insight: { tone: string; label: string; text: string; perDay: number };
  streak: number;
}) {
  return (
    <div className={`wallet-card primary-wallet hero-wallet hero-${insight.tone}`}>
      <div className="hero-wallet-top">
        {/* The hint is a sibling of the label, not a child: the label carries
            an opacity, and opacity makes a group whose alpha every descendant
            inherits and none can undo -- which washed the popover out. Same
            reason for the insight tiles below. */}
        <div className="insight-label">
          <span>เงินพร้อมใช้สุทธิ</span>
          <InfoHint label="เงินพร้อมใช้สุทธิ">
            ยอดรวมของกระเป๋าประเภท &ldquo;เงินใช้จ่าย&rdquo; ตามที่จดไว้ ไม่รวมเงินที่กันไว้ในกระเป๋าออม และไม่รวมหนี้
          </InfoHint>
        </div>
        <em>{insight.label}</em>
      </div>
      {streak >= 2 && (
        <small className={`streak-badge ${streak >= 7 ? "strong" : ""}`}>● {streak} วันติดต่อกัน</small>
      )}
      <strong className="hero-amount">
        {balance < 0 ? "−" : ""}
        <CountUpMoney value={Math.abs(balance)} />
      </strong>
      <div className="hero-wallet-foot">
        <small>{insight.text}</small>
      </div>
    </div>
  );
}

export function HomeInsightGrid({
  netWorth,
  netWorthDelta,
  netWorthFormula,
  hideNetWorthCard,
  savingsRate,
  monthlyIncome,
  monthlyObligationTotal,
  payableTotal,
}: {
  netWorth: number;
  netWorthDelta: number;
  netWorthFormula: NetWorthDebtFormula;
  hideNetWorthCard: boolean;
  savingsRate: number;
  monthlyIncome: number;
  monthlyObligationTotal: number;
  payableTotal: number;
}) {
  const savingsPositive = savingsRate >= 0;
  const dsrPercent = monthlyIncome > 0 ? Math.round((monthlyObligationTotal / monthlyIncome) * 100) : null;
  const netWorthTone = netWorthDelta > 0 ? "income" : netWorthDelta < 0 ? "expense" : "";

  return (
    <section className={`home-insight-wrap ${hideNetWorthCard ? "two-up" : ""}`} aria-label="ภาพรวมทรัพย์สิน">
      <div className={`home-insight-card savings-rate ${savingsPositive ? "income" : "expense"}`}>
        <div className="insight-label">
          <span>
            <i className={`home-insight-icon ${savingsPositive ? "income" : "expense"}`}>
              {savingsPositive ? <TrendingUp size={13} strokeWidth={2.25} aria-hidden="true" /> : <TrendingDown size={13} strokeWidth={2.25} aria-hidden="true" />}
            </i>
            อัตราเงินเหลือ
          </span>
          <InfoHint label="อัตราเงินเหลือ">
            รายรับลบรายจ่ายในรอบนี้ คิดเป็นกี่เปอร์เซ็นต์ของรายรับ · ยิ่งสูงยิ่งเหลือเก็บมาก ติดลบคือใช้เกินที่หาได้
          </InfoHint>
        </div>
        <strong>{Number.isFinite(savingsRate) ? formatPercent(savingsRate) : "0%"}</strong>
        <small>เทียบกับรายรับในรอบนี้</small>
      </div>
      <div className="home-insight-card obligation">
        <div className="insight-label">
          <span><i className="home-insight-icon neutral"><Users size={13} strokeWidth={2.25} aria-hidden="true" /></i>ภาระหนี้เดือนนี้</span>
          <InfoHint label="ภาระหนี้เดือนนี้">
            เงินที่ต้องจ่ายคืนในรอบนี้จากหนี้ของคุณเอง เช่น ค่างวด หรือขั้นต่ำของบัตร ไม่ใช่ยอดหนี้ทั้งก้อน
          </InfoHint>
        </div>
        <strong>{moneySign}{formatMoney(monthlyObligationTotal)}</strong>
        <small>
          จากหนี้คงเหลือรวม {moneySign}{formatMoney(payableTotal)}
          {dsrPercent != null ? ` · ${dsrPercent}% ของรายรับ` : ""}
        </small>
      </div>
      {!hideNetWorthCard && (
        <div className={`home-insight-card net-worth ${netWorthTone}`}>
          <div className="insight-label">
            <span><i className="home-insight-icon neutral"><WalletIcon size={13} strokeWidth={2.25} aria-hidden="true" /></i>มูลค่าสุทธิ</span>
            <InfoHint label="มูลค่าสุทธิ">
              เงินในกระเป๋าทั้งหมด บวกเงินที่คนอื่นติดคุณ บวกพอร์ตลงทุน ลบหนี้ที่คุณติดคนอื่น · ตัวเลขใหญ่คือเปลี่ยนไปเท่าไหร่จากเดือนก่อน
            </InfoHint>
          </div>
          <strong>{formatSignedMoney(netWorthDelta)}</strong>
          <small>
            ปัจจุบัน {formatSignedMoney(netWorth)} · {netWorthFormula === "obligation" ? "หักเฉพาะภาระเดือนนี้" : "หักหนี้เต็มจำนวน"}
          </small>
        </div>
      )}
    </section>
  );
}

/**
 * The cards and instalments with nothing paid against them this cycle. Its
 * own card rather than a line inside DueSoonCard: a recurring bill is money
 * about to leave, while this is money the bank may already have taken while
 * the app still shows it in the wallet.
 */
export function UnpaidCardsCard({ items, onManage }: { items: UnpaidOwnDebt[]; onManage: () => void }) {
  return (
    <section className="home-focus-card unpaid-cards-card">
      <div className="home-focus-head">
        <div>
          <span>ยังไม่ได้จ่ายรอบนี้</span>
          <strong>{items.length} ก้อน</strong>
        </div>
        <button onClick={onManage}>ดูหนี้</button>
      </div>
      <div className="due-soon-list">
        {items.slice(0, 3).map((item) => (
          <div key={item.name}>
            <i className="cat-dot" style={{ background: nameColor(item.name) }} />
            <span>{item.name}</span>
            <small>{item.minimum > 0 ? `ขั้นต่ำ ${moneySign}${formatMoney(item.minimum)}` : "ยังไม่มีรายการจ่ายในรอบนี้"}</small>
            <div className="due-soon-action">
              <b>{moneySign}{formatMoney(item.balance)}</b>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DueSoonCard({
  items,
  onManage,
  onLogNow,
}: {
  items: { item: RecurringExpense; billingDate: Date; daysUntil: number; isLogged: boolean }[];
  onManage: () => void;
  onLogNow: (item: RecurringExpense, billingDate: Date) => void;
}) {
  const total = items.reduce((sum, { item }) => sum + item.amount, 0);
  return (
    <section className="home-focus-card due-soon-card">
      <div className="home-focus-head">
        <div>
          <span>ใกล้ถึงกำหนด</span>
          <strong>{items.length ? `${items.length} รายการ` : "ยังไม่มี"}</strong>
        </div>
        <button onClick={onManage}>จัดการ</button>
      </div>
      {items.length ? (
        <div className="due-soon-list">
          {items.slice(0, 3).map(({ item, billingDate, daysUntil, isLogged }) => (
            <div key={item.id}>
              <i className="cat-dot" style={{ background: item.icon_color ?? nameColor(item.name), color: "var(--text-on-color)" }}><WalletAvatarGlyph iconKey={item.icon} fallbackName={item.name} size={14} /></i>
              <span>{item.name}</span>
              <small>{daysUntil === 0 ? "วันนี้" : `อีก ${daysUntil} วัน`} · {billingDate.getDate()}/{billingDate.getMonth() + 1}</small>
              <div className="due-soon-action">
                <b>{moneySign}{formatMoney(item.amount)}</b>
                {isLogged ? (
                  <span className="due-soon-logged">บันทึกแล้ว</span>
                ) : (
                  <button className="due-soon-log-btn" onClick={() => onLogNow(item, billingDate)}>บันทึกเลย</button>
                )}
              </div>
            </div>
          ))}
          <p>รวม <CountUpMoney value={total} /></p>
        </div>
      ) : (
        <div className="home-compact-empty">
          <span aria-hidden="true">↻</span>
          <p>ยังไม่มีรายจ่ายประจำที่ใกล้ถึงกำหนด</p>
        </div>
      )}
    </section>
  );
}

export function BudgetGlanceCard({
  budgetGlance,
  onManage,
}: {
  budgetGlance: { items: { category: string; budget: number; spent: number; percent: number }[]; totalBudget: number; totalSpent: number };
  onManage: () => void;
}) {
  const percent = budgetGlance.totalBudget > 0 ? (budgetGlance.totalSpent / budgetGlance.totalBudget) * 100 : 0;
  return (
    <section className="home-focus-card budget-glance-card">
      <div className="home-focus-head">
        <div>
          <span>งบประมาณ</span>
          <strong>{budgetGlance.totalBudget ? `${Math.round(percent)}%` : "ยังไม่ตั้ง"}</strong>
        </div>
        <button onClick={onManage}>{budgetGlance.totalBudget ? "ปรับงบ" : "ตั้งงบ"}</button>
      </div>
      {budgetGlance.items.length ? (
        <div className="budget-glance-list">
          {budgetGlance.items.map((item) => (
            <div key={item.category}>
              <span>
                <i className="cat-dot" style={{ background: categoryTint(item.category, CATEGORY_DOT_TINT_ALPHA), color: categoryColor(item.category) }}><CategoryIcon category={item.category} /></i>
                {item.category}
              </span>
              <b>{moneySign}{formatMoney(item.spent)} / {moneySign}{formatMoney(item.budget)}</b>
              <em><small style={{ width: `${Math.max(4, Math.min(100, item.percent))}%`, background: item.percent > 100 ? "var(--danger)" : categoryColor(item.category) }} /></em>
            </div>
          ))}
        </div>
      ) : (
        <div className="home-compact-empty">
          <span aria-hidden="true">▣</span>
          <p>ตั้งงบต่อหมวดเพื่อดูภาพรวมในหน้าแรก</p>
        </div>
      )}
    </section>
  );
}

export function goalProgress(goal: MoneyGoal): number {
  return Math.min(100, Math.max(0, (goal.saved / goal.target) * 100));
}

export function GoalItem({ goal, onDelete }: { goal: MoneyGoal; onDelete: (goal: MoneyGoal) => void }) {
  const progress = goalProgress(goal);
  return (
    <div className="goal-item">
      <div className="goal-item-head"><b>{goal.name}</b><button className="icon-button" onClick={() => onDelete(goal)} aria-label={`ลบเป้าหมาย ${goal.name}`}>×</button></div>
      <div className="goal-card-values"><strong>{moneySign}{formatMoney(goal.saved)}</strong><span>จาก {moneySign}{formatMoney(goal.target)}</span></div>
      <div className="goal-progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress}%` }} /></div>
      <small>{Math.round(progress)}%{goal.deadline ? ` · เป้าหมาย ${formatShortDate(`${goal.deadline}T00:00:00`)}` : ""}</small>
    </div>
  );
}

export function GoalsView({
  goals,
  loading,
  onBack,
  onAdd,
  onDelete,
}: {
  goals: MoneyGoal[];
  loading: boolean;
  onBack: () => void;
  onAdd: () => void;
  onDelete: (goal: MoneyGoal) => void;
}) {
  return (
    <div className="view debtor-view">
      {loading && <SkeletonList rows={3} />}
      <div className="add-title">
        <button onClick={onBack} aria-label="ย้อนกลับ"><ChevronLeft aria-hidden="true" /></button>
        <div>
          <p className="eyebrow">เป้าหมายการเงิน</p>
          <h2>เป้าหมายทั้งหมด</h2>
        </div>
        <button className="header-add-button" onClick={onAdd}>เพิ่ม</button>
      </div>
      <div className="goal-list">
        {goals.map((goal) => (
          <GoalItem key={goal.id} goal={goal} onDelete={onDelete} />
        ))}
        {!goals.length && <EmptyNote glyph="●" action={{ label: "สร้างเป้าหมาย", onClick: onAdd }}>ตั้งก้อนเงินที่อยากเก็บให้ได้ เช่น เงินฉุกเฉิน หรือทริปที่วางไว้ · ใส่ยอดเป้าหมายแล้วแอพจะคิดความคืบหน้าให้</EmptyNote>}
      </div>
    </div>
  );
}

export function GoalCard({ goals, onAdd, onDelete }: { goals: MoneyGoal[]; onAdd: () => void; onDelete: (goal: MoneyGoal) => void }) {
  return (
    <section className="goal-card">
      <div className="goal-card-head"><div><p className="eyebrow">เป้าหมายการเงิน</p><h2>{goals.length} เป้าหมาย</h2></div><button className="text-button" onClick={onAdd}>เพิ่มเป้าหมาย</button></div>
      <div className="goal-list">
        {goals.slice(0, 3).map((goal) => (
          <GoalItem key={goal.id} goal={goal} onDelete={onDelete} />
        ))}
      </div>
    </section>
  );
}

export function GoalEditSheet({ onClose, onCreate, closing }: { onClose: () => void; onCreate: (input: Omit<MoneyGoal, "id">) => void; closing?: boolean }) {
  const [name, setName] = useState("");
  const [targetText, setTargetText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [deadline, setDeadline] = useState("");
  const submit = () => {
    const target = toMoneyAmount(targetText);
    if (!name.trim() || target <= 0) return;
    onCreate({ name: name.trim(), target, saved: toMoneyAmount(savedText), deadline });
  };
  return (
    <SheetFrame onClose={onClose} closing={closing}>
      <div className="sheet-head"><div><p className="eyebrow">เป้าหมายการเงิน</p><h2>สร้างเป้าหมายใหม่</h2></div><button onClick={onClose}>×</button></div>
      <label>
        ชื่อเป้าหมาย
        <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น เงินฉุกเฉิน" />
      </label>
      <label>
        ยอดเป้าหมาย
        <input inputMode="decimal" value={targetText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setTargetText(event.target.value); }} placeholder="50000" />
      </label>
      <label>
        มีเงินเก็บแล้ว
        <input inputMode="decimal" value={savedText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setSavedText(event.target.value); }} placeholder="0" />
      </label>
      <label>วันที่อยากบรรลุ (ถ้ามี)<DateField value={deadline} onChange={setDeadline} /></label>
      <button className="save" onClick={submit} disabled={!name.trim() || toMoneyAmount(targetText) <= 0}>สร้างเป้าหมาย</button>
    </SheetFrame>
  );
}

export function CashFlowTrendCard({ summary }: { summary: CashFlowSummary }) {
  const { days, spend, income, avgDaily, baselineDaily, deltaPercent, tone } = summary;
  const isEmpty = !spend && !income;
  // Both series scale to the largest DAY OF SPENDING, so the plot reads as one
  // chart: separate income/expense maxima used to make a ฿20 refund stand as
  // tall as a ฿5,000 rent payment. Payday dwarfs every expense in the window,
  // so an income bar clips at the ceiling instead of flattening the spending
  // detail this card is about -- the exact inflow is spelled out below it.
  const max = Math.max(...days.map((day) => day.expense), 1);
  // min-height on the bar keeps a real-but-tiny amount visible, so a zero has
  // to be left out of the DOM entirely or every quiet day sprouts a stub.
  const barHeight = (value: number) => `${Math.min(100, Math.max(3, (value / max) * 100))}%`;

  return (
    <section className="home-focus-card cashflow-trend-card">
      <div className="home-focus-head">
        <div>
          <span>ใช้จ่าย 7 วันล่าสุด</span>
          <strong><CountUpMoney value={spend} /></strong>
        </div>
      </div>
      {isEmpty ? (
        <div className="home-compact-empty">
          <span aria-hidden="true">●</span>
          <p>ยังไม่มีรายการใน 7 วันล่าสุด</p>
        </div>
      ) : (
        <>
          <p className="cashflow-pace">
            เฉลี่ยวันละ {moneySign}{formatMoney(avgDaily)}
            {" · "}
            <span className={`cashflow-verdict ${tone}`}>
              {tone === "unknown" ? "ยังเทียบกับปกติไม่ได้"
                : tone === "steady" ? "พอ ๆ กับปกติ"
                  : `${tone === "high" ? "มากกว่า" : "น้อยกว่า"}ปกติ ${Math.abs(deltaPercent)}%`}
            </span>
          </p>
          <div className="cashflow-plot">
            {tone !== "unknown" && (
              <i className="cashflow-baseline" style={{ bottom: barHeight(baselineDaily) }} aria-hidden="true" />
            )}
            {days.map((day) => (
              <span key={day.key}>
                {day.income > 0 && <i className="income" style={{ height: barHeight(day.income) }} />}
                {day.expense > 0 && <i className="expense" style={{ height: barHeight(day.expense) }} />}
              </span>
            ))}
          </div>
          <div className="cashflow-labels">
            {days.map((day) => <small key={day.key}>{day.label}</small>)}
          </div>
          {income > 0 && <p className="cashflow-inflow">รับเข้าช่วงนี้ {moneySign}{formatMoney(income)}</p>}
        </>
      )}
    </section>
  );
}

export function SpendingPersonalityCard({
  topCategory,
  trend,
  monthlyOutflow,
  hasBillsOnly,
}: {
  topCategory: { category: string; amount: number } | null;
  trend: { direction: "up" | "down" | "flat"; percent: number } | null;
  monthlyOutflow: number;
  hasBillsOnly: boolean;
}) {
  const hasSpend = !!topCategory && topCategory.amount > 0.005;
  const percent = hasSpend && monthlyOutflow > 0 ? Math.round((topCategory!.amount / monthlyOutflow) * 100) : 0;
  const trendNote = trend?.direction === "up"
    ? ` (เยอะกว่าค่าเฉลี่ย 3 เดือนก่อน ${trend.percent}%)`
    : trend?.direction === "down"
      ? ` (น้อยกว่าค่าเฉลี่ย 3 เดือนก่อน ${trend.percent}%)`
      : "";

  return (
    <section className="home-focus-card spending-personality-card">
      <div className="home-focus-head">
        <div>
          <span>นิสัยการใช้เงินเดือนนี้</span>
          <strong>{hasSpend ? topCategory!.category : "ยังไม่มีข้อมูล"}</strong>
        </div>
        {hasSpend && (
          <i className="cat-dot" style={{ background: categoryTint(topCategory!.category, CATEGORY_DOT_TINT_ALPHA), color: categoryColor(topCategory!.category) }}><CategoryIcon category={topCategory!.category} /></i>
        )}
      </div>
      {hasSpend ? (
        <p className="spending-personality-note">
          คุณใช้จ่ายด้าน{topCategory!.category}มากที่สุด (ไม่รวมบิลประจำ) — {moneySign}{formatMoney(topCategory!.amount)} หรือ {percent}% ของรายจ่ายทั้งหมดเดือนนี้{trendNote}
        </p>
      ) : (
        <div className="home-compact-empty">
          <span aria-hidden="true">●</span>
          <p>{hasBillsOnly ? "เดือนนี้มีแต่รายจ่ายประจำ ยังไม่มีรายจ่ายอื่นให้ดูเป็นนิสัย" : "เริ่มจดรายการเพื่อดูว่าคุณใช้จ่ายด้านไหนมากที่สุด"}</p>
        </div>
      )}
    </section>
  );
}

/**
 * What a new account sees where a seasoned one sees its numbers: the four
 * things that still need doing, in order, with the next one as the only
 * button that looks like a button.
 *
 * It replaced FirstRunHomeState, which offered the same three jobs as three
 * equal buttons at the very bottom of Home -- under every analysis card, so
 * you scrolled past five empty ฿0 tiles to reach the only thing on the screen
 * that could do anything. This sits directly under the hero, and the steps
 * tick themselves off (buildSetupChecklist) rather than being dismissed.
 */
export function HomeStartChecklist({
  steps,
  remaining,
  waitingForInsights,
  onStep,
  onHide,
}: {
  steps: SetupStep[];
  remaining: number;
  waitingForInsights: boolean;
  onStep: (key: SetupStep["key"]) => void;
  onHide: () => void;
}) {
  const next = steps.find((step) => !step.done) ?? null;
  const done = steps.length - remaining;

  return (
    <section className="start-checklist" aria-label="ขั้นตอนเริ่มต้นใช้งาน">
      <div className="start-checklist-head">
        <div>
          <p className="eyebrow">เริ่มต้นใช้งาน</p>
          <h2>ทำอีก {remaining} ขั้น</h2>
        </div>
        <button className="text-button" onClick={onHide}>ซ่อน</button>
      </div>
      <div className="start-checklist-progress" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={steps.length}>
        <i style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="start-checklist-steps">
        {steps.map((step) => (
          <li key={step.key} className={step.done ? "done" : ""}>
            <span className="start-checklist-mark" aria-hidden="true">{step.done ? "✓" : "○"}</span>
            <span>
              <b>{step.label}</b>
              <small>{step.detail}</small>
            </span>
            {!step.done && step.key !== next?.key && (
              <button className="text-button" onClick={() => onStep(step.key)}>{step.action}</button>
            )}
          </li>
        ))}
      </ol>
      {next && <button className="save" onClick={() => onStep(next.key)}>{next.action}</button>}
      {waitingForInsights && (
        <p className="start-checklist-note">จดสัก 3 รายการ แล้วการ์ดวิเคราะห์ (อัตราเงินเหลือ ภาระหนี้ กราฟใช้จ่าย) จะขึ้นให้เอง</p>
      )}
    </section>
  );
}

/**
 * The one thing that makes the app look broken rather than empty: entries
 * saved while no wallet exists get wallet_id null (buildTransactionCore ->
 * defaultWalletId), and buildWalletLedger has no wallet to put them on, so
 * the balance stays at zero however much has been jotted. Creating any wallet
 * fixes it retroactively -- the ledger already falls back to the default
 * wallet for a null wallet_id -- so this says exactly that.
 */
export function MissingWalletNotice({ entryCount, onCreateWallet }: { entryCount: number; onCreateWallet: () => void }) {
  return (
    <section className="missing-wallet-notice">
      <div>
        <b>ยอดเงินยังไม่ขยับ เพราะยังไม่มีกระเป๋า</b>
        <small>{entryCount} รายการที่จดไว้ยังไม่ถูกนับเข้ายอดเงิน · สร้างกระเป๋าแล้วใส่ยอดที่มีอยู่จริง รายการเก่าจะถูกนับให้ย้อนหลังทันที</small>
      </div>
      <button onClick={onCreateWallet}>สร้างกระเป๋า</button>
    </section>
  );
}

export function SuccessPulse({ count, onAddMore, closing }: { count: number; onAddMore: () => void; closing?: boolean }) {
  return (
    <section className={`success-pulse ${closing ? "closing" : ""}`} role="status">
      <span className="success-pulse-icon" aria-hidden="true">✓</span>
      <div>
        <b>บันทึกเรียบร้อย</b>
        <small>{count} รายการถูกซิงค์แล้ว พร้อมจดรายการถัดไปได้เลย</small>
      </div>
      <button onClick={onAddMore}>+ AI</button>
    </section>
  );
}

