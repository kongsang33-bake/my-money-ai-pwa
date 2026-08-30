"use client";

import { memo, useMemo, useState } from "react";
import { ChevronLeft, TrendingDown, TrendingUp, Users, Wallet as WalletIcon } from "lucide-react";
import { CATEGORY_DOT_TINT_ALPHA } from "@/lib/constants";
import { formatMoney, formatPercent, formatShortDate, formatSignedMoney, moneySign, toMoneyAmount } from "@/lib/format";
import { shiftMonthKey } from "@/lib/cycle";
import { categoryColor, categoryTint, nameColor } from "@/lib/category";
import type { Entry, MoneyGoal, NetWorthDebtFormula, RecurringExpense } from "@/lib/types";
import { CategoryIcon, WalletAvatarGlyph } from "@/components/shared";
import { CountUpMoney, EmptyNote, SheetFrame, SkeletonList, decimalInputPattern } from "@/components/primitives";

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
  const dayTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      if (entry.transaction_type === "transfer" || entry.wallet_impact >= 0) continue;
      const key = new Date(entry.occurred_at).toDateString();
      map.set(key, (map.get(key) ?? 0) + Math.abs(entry.wallet_impact));
    }
    return map;
  }, [entries]);

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
          <input type="month" value={selectedMonth} onChange={(event) => { if (event.target.value) onChangeMonth(event.target.value); }} aria-label="เลือกเดือนและปี" />
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
        <span>เงินพร้อมใช้สุทธิ</span>
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
        <span>
          <i className={`home-insight-icon ${savingsPositive ? "income" : "expense"}`}>
            {savingsPositive ? <TrendingUp size={13} strokeWidth={2.25} aria-hidden="true" /> : <TrendingDown size={13} strokeWidth={2.25} aria-hidden="true" />}
          </i>
          อัตราเงินเหลือ
        </span>
        <strong>{Number.isFinite(savingsRate) ? formatPercent(savingsRate) : "0%"}</strong>
        <small>เทียบกับรายรับในรอบนี้</small>
      </div>
      <div className="home-insight-card obligation">
        <span><i className="home-insight-icon neutral"><Users size={13} strokeWidth={2.25} aria-hidden="true" /></i>ภาระหนี้เดือนนี้</span>
        <strong>{moneySign}{formatMoney(monthlyObligationTotal)}</strong>
        <small>
          จากหนี้คงเหลือรวม {moneySign}{formatMoney(payableTotal)}
          {dsrPercent != null ? ` · ${dsrPercent}% ของรายรับ` : ""}
        </small>
      </div>
      {!hideNetWorthCard && (
        <div className={`home-insight-card net-worth ${netWorthTone}`}>
          <span><i className="home-insight-icon neutral"><WalletIcon size={13} strokeWidth={2.25} aria-hidden="true" /></i>มูลค่าสุทธิ</span>
          <strong>{formatSignedMoney(netWorthDelta)}</strong>
          <small>
            ปัจจุบัน {formatSignedMoney(netWorth)} · {netWorthFormula === "obligation" ? "หักเฉพาะภาระเดือนนี้" : "หักหนี้เต็มจำนวน"}
          </small>
        </div>
      )}
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
        {!goals.length && <EmptyNote glyph="●" action={{ label: "สร้างเป้าหมาย", onClick: onAdd }}>ตั้งเป้าหมายแรก แล้วติดตามความคืบหน้าได้จากที่นี่</EmptyNote>}
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
        <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น เงินฉุกเฉิน" />
        <span>ชื่อเป้าหมาย</span>
      </label>
      <label>
        <input inputMode="decimal" value={targetText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setTargetText(event.target.value); }} placeholder="50000" />
        <span>ยอดเป้าหมาย</span>
      </label>
      <label>
        <input inputMode="decimal" value={savedText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setSavedText(event.target.value); }} placeholder="0" />
        <span>มีเงินเก็บแล้ว</span>
      </label>
      <label>วันที่อยากบรรลุ (ถ้ามี)<input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
      <button className="save" onClick={submit} disabled={!name.trim() || toMoneyAmount(targetText) <= 0}>สร้างเป้าหมาย</button>
    </SheetFrame>
  );
}

export function CashFlowTrendCard({ trend }: { trend: { key: string; label: string; income: number; expense: number }[] }) {
  const totalIncome = trend.reduce((sum, day) => sum + day.income, 0);
  const totalExpense = trend.reduce((sum, day) => sum + day.expense, 0);
  const net = totalIncome - totalExpense;
  const maxIncome = Math.max(...trend.map((day) => day.income), 1);
  const maxExpense = Math.max(...trend.map((day) => day.expense), 1);
  const isEmpty = !totalIncome && !totalExpense;

  return (
    <section className="home-focus-card cashflow-trend-card">
      <div className="home-focus-head">
        <div>
          <span>กระแสเงินสด 7 วันล่าสุด</span>
          <strong className={net >= 0 ? "income" : "expense"}>
            {net < 0 ? "−" : "+"}
            <CountUpMoney value={Math.abs(net)} />
          </strong>
        </div>
      </div>
      {isEmpty ? (
        <div className="home-compact-empty">
          <span aria-hidden="true">●</span>
          <p>ยังไม่มีรายการใน 7 วันล่าสุด</p>
        </div>
      ) : (
        <div className="cashflow-bars">
          {trend.map((day) => (
            <div key={day.key}>
              <span>
                <i className="income" style={{ height: `${day.income ? Math.max(3, (day.income / maxIncome) * 100) : 0}%` }} />
                <i className="expense" style={{ height: `${day.expense ? Math.max(3, (day.expense / maxExpense) * 100) : 0}%` }} />
              </span>
              <small>{day.label}</small>
            </div>
          ))}
        </div>
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

export function FirstRunHomeState({
  onCreateWallet,
  onSetBudget,
  onAddEntry,
}: {
  onCreateWallet: () => void;
  onSetBudget: () => void;
  onAddEntry: () => void;
}) {
  return (
    <section className="first-run-card">
      <span className="empty-glyph" aria-hidden="true">฿</span>
      <div>
        <b>เริ่มจัดการเงินก้อนแรก</b>
        <small>สร้างกระเป๋า ใส่ยอดตั้งต้น แล้วลองจดรายการแรกเพื่อให้แดชบอร์ดมีข้อมูลจริง</small>
      </div>
      <div className="first-run-actions">
        <button onClick={onCreateWallet}>สร้างกระเป๋า</button>
        <button onClick={onSetBudget}>ตั้งงบ</button>
        <button onClick={onAddEntry}>จดรายการแรก</button>
      </div>
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

