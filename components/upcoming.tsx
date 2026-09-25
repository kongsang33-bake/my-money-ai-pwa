"use client";

import { memo, useMemo, useState } from "react";
import { CalendarClock, Check, CreditCard, Target } from "lucide-react";
import { formatMoney, formatPercent, moneySign } from "@/lib/format";
import { describeDaysUntil, type UnpaidOwnDebt, type UpcomingItem } from "@/lib/insights";
import { describeBillingCycle } from "@/lib/taxonomy";
import { categoryColor, nameColor } from "@/lib/category";
import type { RecurringExpense, Wallet } from "@/lib/types";
import { CategoryIcon, RecurringAvatarGlyph } from "@/components/shared";
import { EmptyNote, IconChip, IconPattern } from "@/components/primitives";
import { goalProgress } from "@/components/home";

type Filter = "all" | "bills" | "debts" | "goals";

type BudgetWatch = { category: string; budget: number; spent: number; percent: number };

/**
 * The "กำลังจะมา" tab -- the mock's "New & Hot": a timeline of what is coming,
 * soonest first, with the date down the left. Two groups:
 *
 *  - "ตอนนี้": things with no date that already want attention -- a card or
 *    instalment with nothing paid this cycle, a budget nearly or already used
 *    up.
 *  - dated: buildUpcoming's list -- bills, goal deadlines, the next cycle --
 *    across a window counted from today, not from the cycle (see
 *    UPCOMING_WINDOW_DAYS), so a bill due on the 1st is "พรุ่งนี้" on the 30th.
 *
 * Every action hands off to a screen or handler that already exists; logging
 * a bill here is the same logRecurringNow the Home poster uses.
 */
export const UpcomingView = memo(function UpcomingView({
  items,
  unpaid,
  budgets,
  wallets,
  windowDays,
  billCount,
  onLogNow,
  onManageBills,
  onOpenDebts,
  onOpenBudgets,
  onOpenGoals,
}: {
  items: UpcomingItem[];
  unpaid: UnpaidOwnDebt[];
  budgets: BudgetWatch[];
  wallets: Wallet[];
  windowDays: number;
  /** Every recurring bill the account has, due soon or not -- zero means nobody has set one up yet. */
  billCount: number;
  onLogNow: (item: RecurringExpense, billingDate: Date) => void;
  onManageBills: () => void;
  onOpenDebts: () => void;
  onOpenBudgets: () => void;
  onOpenGoals: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => ({
    bills: items.filter((item) => item.kind === "bill").length,
    debts: unpaid.length + budgets.length,
    goals: items.filter((item) => item.kind === "goal").length,
  }), [items, unpaid, budgets]);

  const showNow = filter === "all" || filter === "debts";
  const dated = items.filter((item) =>
    filter === "all" || (filter === "bills" && item.kind === "bill") || (filter === "goals" && item.kind === "goal"));
  const nowCount = showNow ? unpaid.length + budgets.length : 0;

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "bills", label: "บิล", count: counts.bills },
    { key: "debts", label: "หนี้และงบ", count: counts.debts },
    { key: "goals", label: "เป้าหมาย", count: counts.goals },
  ];

  return (
    <div className="view upcoming-view">
      <div className="upcoming-head">
        <h1>กำลังจะมา</h1>
        <p>{windowDays} วันข้างหน้า นับจากวันนี้</p>
      </div>

      {/* Only the kinds that have something in them get a chip: a filter that
          can only ever show an empty list is a dead end -- and "ทั้งหมด" on
          its own filters nothing, so with no other chip there is no row. */}
      {chips.some((chip) => chip.count > 0) && (
        <div className="upcoming-chips" role="group" aria-label="กรองรายการ">
          <button className={filter === "all" ? "active" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>ทั้งหมด</button>
          {chips.filter((chip) => chip.count > 0).map((chip) => (
            <button key={chip.key} className={filter === chip.key ? "active" : ""} aria-pressed={filter === chip.key} onClick={() => setFilter(chip.key)}>
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* A new account's timeline holds nothing but the next cycle, which
          says nothing about what this tab is for. The bills are what fill
          it, so it asks for them, the one thing it cannot find out itself. */}
      {billCount === 0 && (
        <section className="upcoming-starter">
          <div>
            <b>ให้แอปเตือนก่อนถึงวันจ่าย</b>
            <small>เพิ่มบิลที่จ่ายเป็นรอบ เช่น ค่าเน็ต ค่าโทรศัพท์ หรือ Netflix แล้วจะขึ้นที่นี่ก่อนถึงวันตัดเงิน</small>
          </div>
          <button type="button" onClick={onManageBills}>เพิ่มบิลประจำ</button>
        </section>
      )}

      {nowCount > 0 && (
        <section className="upcoming-group" aria-label="ต้องจัดการตอนนี้">
          {unpaid.map((debt) => (
            <UpcomingRow
              key={`debt:${debt.name}`}
              hue={nameColor(debt.name)}
              renderGlyph={(size) => <CreditCard size={size} strokeWidth={2.25} />}
              name={debt.name}
              kicker="ยังไม่จ่ายรอบนี้"
              tone="warn"
              figure={`${moneySign}${formatMoney(debt.balance)}`}
              detail={debt.minimum > 0 ? `ขั้นต่ำรอบนี้ ${moneySign}${formatMoney(debt.minimum)} · ยังไม่มีรายการจ่ายในรอบนี้` : "ยังไม่มีรายการจ่ายในรอบนี้"}
              actions={<button className="upcoming-action" onClick={onOpenDebts}>ดูหนี้</button>}
            />
          ))}
          {budgets.map((budget) => {
            const over = budget.spent > budget.budget;
            return (
              <UpcomingRow
                key={`budget:${budget.category}`}
                hue={categoryColor(budget.category)}
                renderGlyph={(size) => <CategoryIcon category={budget.category} size={size} />}
                name={`งบ${budget.category}`}
                kicker={over ? "เกินงบแล้ว" : "ใกล้เต็ม"}
                tone={over ? "warn" : "brand"}
                figure={formatPercent(budget.percent)}
                detail={over
                  ? `ใช้ไป ${moneySign}${formatMoney(budget.spent)} จากงบ ${moneySign}${formatMoney(budget.budget)} · เกิน ${moneySign}${formatMoney(budget.spent - budget.budget)}`
                  : `ใช้ไป ${moneySign}${formatMoney(budget.spent)} จากงบ ${moneySign}${formatMoney(budget.budget)} · เหลือ ${moneySign}${formatMoney(budget.budget - budget.spent)}`}
                actions={<button className="upcoming-action" onClick={onOpenBudgets}>ดูงบ</button>}
              />
            );
          })}
        </section>
      )}

      {dated.length > 0 && (
        <section className="upcoming-group" aria-label="ตามวันที่">
          {dated.map((item) => {
            if (item.kind === "bill") {
              const wallet = wallets.find((entry) => entry.id === item.bill.wallet_id);
              const source = item.bill.funding_card_name ? `ตัดบัตร ${item.bill.funding_card_name}` : wallet ? `ตัดจาก ${wallet.name}` : null;
              return (
                <UpcomingRow
                  key={item.key}
                  date={item.date}
                  hue={item.bill.icon_color ?? nameColor(item.bill.name)}
                  renderGlyph={(size) => <RecurringAvatarGlyph iconKey={item.bill.icon} fallbackName={item.bill.name} size={size} />}
                  name={item.bill.name}
                  kicker={describeDaysUntil(item.daysUntil)}
                  tone="brand"
                  figure={`${moneySign}${formatMoney(item.bill.amount)}`}
                  detail={[describeBillingCycle(item.bill.interval_unit, item.bill.interval_count), source].filter(Boolean).join(" · ")}
                  actions={(
                    <>
                      {item.isLogged
                        ? <span className="upcoming-done"><Check size={14} strokeWidth={2.5} aria-hidden="true" />บันทึกแล้ว</span>
                        : <button className="upcoming-action primary" onClick={() => onLogNow(item.bill, item.date)}>บันทึกเลย</button>}
                      <button className="upcoming-action" onClick={onManageBills}>จัดการ</button>
                    </>
                  )}
                />
              );
            }
            if (item.kind === "goal") {
              const progress = goalProgress(item.goal);
              return (
                <UpcomingRow
                  key={item.key}
                  date={item.date}
                  hue="var(--accent)"
                  renderGlyph={(size) => <Target size={size} strokeWidth={2.25} />}
                  name={item.goal.name}
                  kicker={`กำหนดเป้าหมาย · ${describeDaysUntil(item.daysUntil)}`}
                  tone="brand"
                  figure={`${moneySign}${formatMoney(item.goal.saved)} / ${formatMoney(item.goal.target)}`}
                  detail={`เก็บแล้ว ${formatPercent(progress)} · ยังขาด ${moneySign}${formatMoney(Math.max(0, item.goal.target - item.goal.saved))}`}
                  actions={<button className="upcoming-action" onClick={onOpenGoals}>ดูเป้าหมาย</button>}
                />
              );
            }
            return (
              <UpcomingRow
                key={item.key}
                date={item.date}
                hue="var(--cat-other)"
                renderGlyph={(size) => <CalendarClock size={size} strokeWidth={2.25} />}
                name="รอบเดือนใหม่"
                kicker={describeDaysUntil(item.daysUntil)}
                tone="brand"
                detail="รายรับ รายจ่าย และงบของรอบนี้จะเริ่มนับใหม่ตั้งแต่วันนั้น"
              />
            );
          })}
        </section>
      )}

      {nowCount === 0 && dated.length === 0 && (
        <EmptyNote glyph="↻">
          ไม่มีอะไรถึงกำหนดใน {windowDays} วันข้างหน้า · บิลที่ตัดหลังจากนั้นจะขึ้นมาที่นี่เองเมื่อเข้าใกล้
        </EmptyNote>
      )}
    </div>
  );
});

/**
 * One row of the timeline: the date down the left ("ตอนนี้" when there is
 * none), then a card in the item's colour carrying the words.
 */
function UpcomingRow({
  date,
  hue,
  renderGlyph,
  name,
  kicker,
  tone,
  figure,
  detail,
  actions,
}: {
  date?: Date;
  hue: string;
  renderGlyph: (size: number) => React.ReactNode;
  name: string;
  kicker: string;
  tone: "brand" | "warn";
  /** The amount or share, when the row has one -- the new cycle does not. */
  figure?: string;
  detail: string;
  actions?: React.ReactNode;
}) {
  return (
    <article className="upcoming-row" style={{ "--hue": hue } as React.CSSProperties}>
      <div className="upcoming-date">
        {date ? (
          <>
            <small>{date.toLocaleDateString("th-TH", { month: "short" })}</small>
            <b>{date.getDate()}</b>
          </>
        ) : (
          <small>ตอนนี้</small>
        )}
      </div>
      {/* One card in the item's colour, its icon printed across the right
          as a pattern and once at reading size beside the kicker. It used to
          be an empty banner of colour with one large faint icon on it, above
          the words -- a band of art that said nothing. */}
      <div className="upcoming-card">
        <IconPattern renderGlyph={renderGlyph} />
        <div className="upcoming-top">
          <IconChip>{renderGlyph(18)}</IconChip>
          <span className={`upcoming-kicker ${tone}`}>{kicker}</span>
        </div>
        <div className="upcoming-line">
          <div>
            <h3>{name}</h3>
            {figure && <strong>{figure}</strong>}
          </div>
          {actions && <div className="upcoming-actions">{actions}</div>}
        </div>
        <p>{detail}</p>
      </div>
    </article>
  );
}
