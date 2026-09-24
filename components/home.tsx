"use client";

import { memo, useEffect, useId, useMemo, useState } from "react";
import { Check, ChevronLeft, CreditCard, Info, Pencil, Plus, Target, Trash2, TrendingDown, TrendingUp, Users, Wallet as WalletIcon, X } from "lucide-react";
import { BRAND_SLOGANS, DETAIL_SIMILAR_LIMIT, RECENT_RAIL_LIMIT, TOP_CATEGORY_LIMIT } from "@/lib/constants";
import { formatChatTime, formatDateTime, formatMoney, formatPercent, formatShortDate, formatSignedMoney, moneySign, toMoneyAmount } from "@/lib/format";
import { entryDisplayImpact } from "@/lib/money";
import { shiftMonthKey } from "@/lib/cycle";
import { sameTitleSummary, similarEntries, spendingByDay, type CashFlowSummary, type CyclePace, type SetupStep, type UnpaidOwnDebt } from "@/lib/insights";
import { transactionTypeLabels } from "@/lib/taxonomy";
import { categoryColor, nameColor } from "@/lib/category";
import type { Entry, MoneyGoal, NetWorthDebtFormula, RecurringExpense, Wallet } from "@/lib/types";
import { CategoryIcon, RecurringAvatarGlyph } from "@/components/shared";
import { CountUpMoney, DateField, EmptyNote, InfoHint, MonthField, Rail, SheetFrame, SkeletonList, decimalInputPattern, SheetClose } from "@/components/primitives";

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

/**
 * The balance's own recent past, drawn as the billboard's "key art" -- the
 * slot a Netflix billboard fills with a still from the show. It is the real
 * figure (buildBalanceHistory ends on the same number printed over it), not a
 * decorative squiggle, and it is labelled as such in the corner. Stretched to
 * the billboard's box with preserveAspectRatio="none"; vector-effect keeps the
 * line one weight however the box is shaped.
 */
function BalanceArt({ points }: { points: number[] }) {
  const gradientId = useId();
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;
  // The line lives in the top half; the bottom half is where the kicker,
  // the amount and the buttons sit, over the fade, and a line running
  // through the numeral would fight it for legibility.
  const y = (value: number) => (span === 0 ? 30 : 46 - ((value - min) / span) * 36);
  const x = (index: number) => (index / (points.length - 1)) * 100;
  const line = points.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(2)} ${y(value).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--accent)", stopOpacity: 0.42 }} />
          <stop offset="1" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {[25, 45, 65].map((gridY) => (
        <line key={gridY} className="billboard-grid" x1="0" x2="100" y1={gridY} y2={gridY} />
      ))}
      <path d={`${line} L100 100 L0 100 Z`} fill={`url(#${gradientId})`} />
      <path className="billboard-line" d={line} />
    </svg>
  );
}

// Which slogan the billboard showed last, so the next visit to Home draws a
// different one rather than, one time in four, the same line again.
let lastSloganIndex = -1;

function pickSlogan() {
  let next = Math.floor(Math.random() * BRAND_SLOGANS.length);
  if (next === lastSloganIndex) next = (next + 1) % BRAND_SLOGANS.length;
  lastSloganIndex = next;
  return next;
}

/**
 * The billboard's top-left line: one of BRAND_SLOGANS, drawn afresh each time
 * Home mounts. Drawn in an effect, not during render, so the server's HTML and
 * the first client render agree; until then it holds its line's space empty.
 */
function BillboardSlogan() {
  const [index, setIndex] = useState<number | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- a random draw must wait for the client
  useEffect(() => setIndex(pickSlogan()), []);
  return <p className="billboard-slogan">{index === null ? "\u00a0" : BRAND_SLOGANS[index]}</p>;
}

/**
 * Home's billboard: the one full-bleed moment on the screen, the job the coral
 * hero used to do. Laid out the way docs/netflix-reference.html's .billboard
 * is -- art filling the box, then a kicker, the amount, a line of tags and the
 * two actions sitting over a fade at the bottom -- rather than as a card with
 * a label in one corner and a chip in the other.
 */
export const HeroWalletCard = memo(function HeroWalletCard({
  balance,
  history,
  insight,
  streak,
  onAddEntry,
  onViewDetails,
}: {
  balance: number;
  history: number[];
  insight: { tone: string; label: string; text: string; perDay: number };
  streak: number;
  onAddEntry: () => void;
  onViewDetails: () => void;
}) {
  return (
    <div className={`hero-wallet hero-${insight.tone}`}>
      <div className="billboard-art" aria-hidden="true">
        {history.length > 1 && (
          <>
            <BalanceArt points={history} />
            <span className="billboard-caption">{history.length} วันล่าสุด</span>
          </>
        )}
      </div>
      <BillboardSlogan />
      <div className="billboard-body">
        {/* The hint is a sibling of the label, not inside it, so nothing the
            label's own styling does (letter-spacing, the brand colour) leaks
            into the popover's text. */}
        <div className="billboard-kicker">
          <i className="brand-mark" aria-hidden="true" />
          <span>เงินพร้อมใช้สุทธิ</span>
          <InfoHint label="เงินพร้อมใช้สุทธิ">
            ยอดรวมของกระเป๋าประเภท &ldquo;เงินใช้จ่าย&rdquo; ตามที่จดไว้ ไม่รวมเงินที่กันไว้ในกระเป๋าออม และไม่รวมหนี้
          </InfoHint>
        </div>
        <strong className="hero-amount">
          {balance < 0 ? "−" : ""}
          <CountUpMoney value={Math.abs(balance)} />
        </strong>
        <ul className="billboard-tags">
          <li className="billboard-status">{insight.label}</li>
          <li>{insight.text}</li>
          {streak >= 2 && <li>จดติดกัน {streak} วัน</li>}
        </ul>
        {/* Play / More info: the white --primary CTA, and a quieter second
            button, instead of the whole billboard being one tap target. */}
        <div className="billboard-actions">
          <button className="billboard-cta" onClick={onAddEntry}>
            <Plus size={20} strokeWidth={2.5} aria-hidden="true" />จดรายการ
          </button>
          <button className="billboard-cta-2" onClick={onViewDetails}>
            <Info size={20} strokeWidth={2.25} aria-hidden="true" />รายละเอียด
          </button>
        </div>
      </div>
    </div>
  );
});

/**
 * The thin line along the bottom of a stat tile: the same 3px bar the
 * progress tiles carry, so the "สุขภาพการเงิน" row reads as one family with
 * "เป้าหมายและงบ" rather than as three boxed numbers. Decorative -- the
 * percentage it draws is already written in the tile.
 */
function StatMeter({ percent, tone }: { percent: number; tone: "income" | "expense" }) {
  return (
    <span className={`stat-meter ${tone}`} aria-hidden="true">
      <i style={{ width: `${Math.max(2, Math.min(100, percent))}%` }} />
    </span>
  );
}

export const HomeInsightGrid = memo(function HomeInsightGrid({
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

  // A fragment, not a wrapper: these three are items of the "สุขภาพการเงิน"
  // rail on Home, so the rail's own track has to be their direct parent.
  return (
    <>
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
        <StatMeter percent={Number.isFinite(savingsRate) ? Math.abs(savingsRate) : 0} tone={savingsPositive ? "income" : "expense"} />
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
        {dsrPercent != null && <StatMeter percent={dsrPercent} tone="expense" />}
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
    </>
  );
});

/**
 * A 2:3 poster, the rail item docs/netflix-reference.html builds most rails
 * from. There are no pictures in a money app, so the "key art" is the item's
 * own colour (a --cat-* slot, or the colour the user picked for a bill) as a
 * gradient, with its icon large and faint in the corner, and the words set
 * over a fade at the bottom the way a film title sits on its poster.
 *
 * A poster with `onClick` is one button. One without it is a plain box, which
 * is what lets `children` hold a button of its own (a bill's "บันทึกเลย")
 * without nesting one button inside another.
 */
function Poster({
  hue,
  glyph,
  title,
  sub,
  amount,
  ribbon,
  onClick,
  className = "",
  children,
}: {
  hue: string;
  glyph: React.ReactNode;
  title: string;
  sub?: string;
  amount?: string;
  ribbon?: { text: string; tone?: "warn" };
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const content = (
    <>
      {ribbon && <span className={`poster-ribbon${ribbon.tone === "warn" ? " warn" : ""}`}>{ribbon.text}</span>}
      <span className="poster-glyph" aria-hidden="true">{glyph}</span>
      <span className="poster-body">
        <span className="poster-title">{title}</span>
        {sub && <span className="poster-sub">{sub}</span>}
        {amount && <span className="poster-amount">{amount}</span>}
        {children}
      </span>
    </>
  );
  const style = { "--hue": hue } as React.CSSProperties;
  return onClick
    ? <button className={`poster ${className}`} style={style} onClick={onClick}>{content}</button>
    : <div className={`poster ${className}`} style={style}>{content}</div>;
}

/**
 * A 16:9 tile with a progress bar under its art -- the mock's "continue
 * watching" row, used for anything with a way still to go: a goal, a budget.
 * The percentage is in the words as well as the bar, since the bar alone is a
 * colour and a length.
 */
function ProgressTile({
  hue,
  glyph,
  title,
  percent,
  over = false,
  meta,
  value,
  onClick,
  className = "",
}: {
  hue: string;
  glyph: React.ReactNode;
  title: string;
  percent: number;
  over?: boolean;
  meta: string;
  value: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button className={`tile ${className}`} style={{ "--hue": hue } as React.CSSProperties} onClick={onClick}>
      <span className="tile-art">
        <span className="tile-glyph" aria-hidden="true">{glyph}</span>
        <span className="tile-title">{title}</span>
      </span>
      <span className={`tile-bar${over ? " over" : ""}`} aria-hidden="true">
        <i style={{ width: `${Math.max(2, Math.min(100, percent))}%` }} />
      </span>
      <span className="tile-meta">
        <span>{meta} · {Math.round(percent)}%</span>
        <b>{value}</b>
      </span>
    </button>
  );
}

/**
 * Bills due in the next few days, then the cards and instalments with nothing
 * paid against them this cycle -- one poster each, with a ribbon saying how
 * soon. The unpaid ones stay distinct (a coral ribbon) because they are not
 * money about to leave: a card charge never moved the wallet, so this is money
 * the bank may already have taken while the app still shows it as there.
 */
export const DueSoonRail = memo(function DueSoonRail({
  items,
  unpaid,
  onManage,
  onLogNow,
  onOpenDebts,
}: {
  items: { item: RecurringExpense; billingDate: Date; daysUntil: number; isLogged: boolean }[];
  unpaid: UnpaidOwnDebt[];
  onManage: () => void;
  onLogNow: (item: RecurringExpense, billingDate: Date) => void;
  onOpenDebts: () => void;
}) {
  return (
    <Rail title="ใกล้ถึงกำหนด" action="จัดการ" onAction={onManage} size="poster" className="due-soon-rail">
      {items.map(({ item, billingDate, daysUntil, isLogged }) => (
        <Poster
          key={item.id}
          className="due-soon-poster"
          hue={item.icon_color ?? nameColor(item.name)}
          glyph={<RecurringAvatarGlyph iconKey={item.icon} fallbackName={item.name} size={64} />}
          title={item.name}
          sub={`${billingDate.getDate()}/${billingDate.getMonth() + 1}`}
          amount={`${moneySign}${formatMoney(item.amount)}`}
          ribbon={{ text: daysUntil === 0 ? "วันนี้" : `อีก ${daysUntil} วัน` }}
        >
          {isLogged ? (
            <span className="poster-done"><Check size={14} strokeWidth={2.5} aria-hidden="true" />บันทึกแล้ว</span>
          ) : (
            <button className="poster-action" onClick={() => onLogNow(item, billingDate)}>บันทึกเลย</button>
          )}
        </Poster>
      ))}
      {unpaid.map((debt) => (
        <Poster
          key={debt.name}
          className="unpaid-poster"
          hue={nameColor(debt.name)}
          glyph={<CreditCard size={64} strokeWidth={2.25} />}
          title={debt.name}
          sub={debt.minimum > 0 ? `ขั้นต่ำ ${moneySign}${formatMoney(debt.minimum)}` : "ยังไม่มีรายการจ่าย"}
          amount={`${moneySign}${formatMoney(debt.balance)}`}
          ribbon={{ text: "ยังไม่จ่ายรอบนี้", tone: "warn" }}
          onClick={onOpenDebts}
        />
      ))}
    </Rail>
  );
});

/** Goals and this cycle's budgets, one progress tile each. */
export const GoalsBudgetsRail = memo(function GoalsBudgetsRail({
  goals,
  budgetGlance,
  onOpenGoals,
  onOpenBudgets,
  onAddGoal,
}: {
  goals: MoneyGoal[];
  budgetGlance: { items: { category: string; budget: number; spent: number; percent: number }[] };
  onOpenGoals: () => void;
  onOpenBudgets: () => void;
  onAddGoal: () => void;
}) {
  return (
    <Rail title="เป้าหมายและงบ" action="เพิ่มเป้าหมาย" onAction={onAddGoal} size="tile" className="goals-budgets-rail">
      {goals.map((goal) => (
        <ProgressTile
          key={goal.id}
          className="goal-tile"
          hue="var(--accent)"
          glyph={<Target size={40} strokeWidth={2} />}
          title={goal.name}
          percent={goalProgress(goal)}
          meta="เป้าหมาย"
          value={`${moneySign}${formatMoney(goal.saved)} / ${formatMoney(goal.target)}`}
          onClick={onOpenGoals}
        />
      ))}
      {budgetGlance.items.map((item) => {
        const left = item.budget - item.spent;
        return (
          <ProgressTile
            key={item.category}
            className="budget-tile"
            hue={categoryColor(item.category)}
            glyph={<CategoryIcon category={item.category} size={40} />}
            title={`งบ${item.category}`}
            percent={item.percent}
            over={item.percent > 100}
            meta="งบรอบนี้"
            value={left >= 0 ? `เหลือ ${moneySign}${formatMoney(left)}` : `เกิน ${moneySign}${formatMoney(-left)}`}
            onClick={onOpenBudgets}
          />
        );
      })}
    </Rail>
  );
});

/**
 * Where the money went this cycle, as the mock's "Top 10" row: a big outlined
 * rank numeral behind each category's poster. The ranking is spendByCategory's
 * (lib/money.ts), the same one History's breakdown uses. Tapping a category
 * opens History already filtered to it.
 */
export const TopCategoriesRail = memo(function TopCategoriesRail({
  items,
  onSelect,
}: {
  items: { category: string; amount: number }[];
  onSelect: (category: string) => void;
}) {
  if (!items.length) return null;
  return (
    <Rail title="หมวดที่จ่ายมากสุดรอบนี้" size="rank" className="top-categories-rail">
      {items.slice(0, TOP_CATEGORY_LIMIT).map((item, index) => (
        <div className="rank" key={item.category}>
          {/* The numeral is drawn, not read: its order in the row already
              says the rank, and the poster carries the name and amount. */}
          <span className="rank-number" aria-hidden="true">{index + 1}</span>
          <Poster
            hue={categoryColor(item.category)}
            glyph={<CategoryIcon category={item.category} size={64} />}
            title={item.category}
            amount={`${moneySign}${formatMoney(item.amount)}`}
            onClick={() => onSelect(item.category)}
          />
        </div>
      ))}
    </Rail>
  );
});

/**
 * The last few entries as small landscape cards -- the mock's "เพิ่งจด" row.
 * Home's preview only: History itself stays a vertical list, because a
 * statement is read top to bottom. The amount is entryDisplayImpact's, the
 * same figure History and the timeline print for a row.
 */
export const RecentRail = memo(function RecentRail({
  entries,
  onOpen,
  onSeeAll,
}: {
  entries: Entry[];
  onOpen: (entry: Entry) => void;
  onSeeAll: () => void;
}) {
  const recent = entries.slice(0, RECENT_RAIL_LIMIT);
  if (!recent.length) return null;
  return (
    <Rail title="เพิ่งจด" action="ดูทั้งหมด" onAction={onSeeAll} size="small" className="recent-rail">
      {recent.map((entry) => {
        const impact = entryDisplayImpact(entry);
        return (
          <button className="recent-tile" key={entry.id} style={{ "--hue": categoryColor(entry.category) } as React.CSSProperties} onClick={() => onOpen(entry)}>
            <span className="tile-art">
              <span className="tile-glyph" aria-hidden="true"><CategoryIcon category={entry.category} size={40} /></span>
            </span>
            <span className="recent-body">
              <b>{entry.title}</b>
              <small>
                <span>{formatChatTime(entry.occurred_at)}</span>
                <span className={impact >= 0 ? "income" : "expense"}>{formatSignedMoney(impact)}</span>
              </small>
            </span>
          </button>
        );
      })}
    </Rail>
  );
});

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
      <div className="sheet-head"><div><p className="eyebrow">เป้าหมายการเงิน</p><h2>สร้างเป้าหมายใหม่</h2></div><SheetClose onClick={onClose} /></div>
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

export const CashFlowTrendCard = memo(function CashFlowTrendCard({ summary }: { summary: CashFlowSummary }) {
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
});

/**
 * This cycle so far against the last one over the same days (buildCyclePace):
 * the month-sized version of the 7-day card beside it. It replaced a "top
 * category" card that only repeated rank #1 of the categories rail above.
 */
export const CyclePaceCard = memo(function CyclePaceCard({ pace }: { pace: CyclePace }) {
  const { daysIn, cycleDays, spentSoFar, lastSamePoint, lastTotal, deltaPercent, tone } = pace;
  const scale = Math.max(lastTotal, spentSoFar, 1);
  const width = (value: number) => `${Math.min(100, (value / scale) * 100)}%`;

  return (
    <section className="home-focus-card cycle-pace-card">
      <div className="home-focus-head">
        <div>
          <span>ใช้ไปแล้วรอบนี้ · วันที่ {daysIn} จาก {cycleDays}</span>
          <strong><CountUpMoney value={spentSoFar} /></strong>
        </div>
      </div>
      <p className="cashflow-pace">
        <span className={`cashflow-verdict ${tone}`}>
          {tone === "unknown" ? "ยังไม่มีรอบก่อนให้เทียบ"
            : tone === "steady" ? "พอ ๆ กับรอบก่อนช่วงเดียวกัน"
              : `${tone === "high" ? "มากกว่า" : "น้อยกว่า"}รอบก่อนช่วงเดียวกัน ${Math.abs(deltaPercent)}%`}
        </span>
      </p>
      {tone !== "unknown" && (
        <>
          {/* Both bars on one scale -- the whole of last cycle -- so the gap
              between them is the difference, and the track left over on the
              last-cycle bar is what that cycle still went on to spend. */}
          <div className="cycle-pace-bars">
            <div className="cycle-pace-row now">
              <small>รอบนี้</small>
              <span className="cycle-pace-track"><i style={{ width: width(spentSoFar) }} /></span>
              <b>{moneySign}{formatMoney(spentSoFar)}</b>
            </div>
            <div className="cycle-pace-row last">
              <small>รอบก่อน</small>
              <span className="cycle-pace-track"><i style={{ width: width(lastSamePoint) }} /></span>
              <b>{moneySign}{formatMoney(lastSamePoint)}</b>
            </div>
          </div>
          <p className="cashflow-inflow">รอบก่อนทั้งรอบใช้ไป {moneySign}{formatMoney(lastTotal)}</p>
        </>
      )}
    </section>
  );
});

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
export const HomeStartChecklist = memo(function HomeStartChecklist({
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
});

/**
 * The one thing that makes the app look broken rather than empty: entries
 * saved while no wallet exists get wallet_id null (buildTransactionCore ->
 * defaultWalletId), and buildWalletLedger has no wallet to put them on, so
 * the balance stays at zero however much has been jotted. Creating any wallet
 * fixes it retroactively -- the ledger already falls back to the default
 * wallet for a null wallet_id -- so this says exactly that.
 */
export const MissingWalletNotice = memo(function MissingWalletNotice({ entryCount, onCreateWallet }: { entryCount: number; onCreateWallet: () => void }) {
  return (
    <section className="missing-wallet-notice">
      <div>
        <b>ยอดเงินยังไม่ขยับ เพราะยังไม่มีกระเป๋า</b>
        <small>{entryCount} รายการที่จดไว้ยังไม่ถูกนับเข้ายอดเงิน · สร้างกระเป๋าแล้วใส่ยอดที่มีอยู่จริง รายการเก่าจะถูกนับให้ย้อนหลังทันที</small>
      </div>
      <button onClick={onCreateWallet}>สร้างกระเป๋า</button>
    </section>
  );
});

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


/**
 * One entry, opened the way docs/netflix-reference.html opens a title: its
 * category's art across the top, then what it was, what it cost, when and
 * from where, the two things you can do with it, and the entries like it.
 * It edits and deletes nothing itself -- "แก้ไข" hands the row to the existing
 * EditSheet and "ลบ" to deleteEntry, with its confirm and its undo, so there
 * is still exactly one edit path and one delete path.
 */
export function EntryDetailSheet({
  entry,
  entries,
  wallets,
  onClose,
  onEdit,
  onDelete,
  onOpen,
  closing,
}: {
  entry: Entry;
  entries: Entry[];
  wallets: Wallet[];
  onClose: () => void;
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
  onOpen: (entry: Entry) => void;
  closing?: boolean;
}) {
  const impact = entryDisplayImpact(entry);
  const wallet = wallets.find((item) => item.id === entry.wallet_id);
  const similar = useMemo(() => similarEntries(entry, entries, DETAIL_SIMILAR_LIMIT), [entry, entries]);
  const repeat = useMemo(() => sameTitleSummary(entry, entries), [entry, entries]);
  const hue = categoryColor(entry.category);

  return (
    <SheetFrame onClose={onClose} className="entry-detail-sheet" closing={closing}>
      <div className="detail-hero" style={{ "--hue": hue } as React.CSSProperties} aria-hidden="true">
        <span className="detail-glyph"><CategoryIcon category={entry.category} size={120} /></span>
      </div>
      <button className="detail-close" onClick={onClose} aria-label="ปิด">
        <X size={20} strokeWidth={2.25} aria-hidden="true" />
      </button>
      <div className="detail-body">
        <div className="billboard-kicker">
          <i className="brand-mark" aria-hidden="true" />
          <span>{transactionTypeLabels[entry.transaction_type]}</span>
        </div>
        <h2>{entry.title}</h2>
        <strong className={`detail-amount ${impact >= 0 ? "income" : "expense"}`}>{formatSignedMoney(impact)}</strong>
        <ul className="detail-meta">
          <li>{formatDateTime(entry.occurred_at)}</li>
          <li className="detail-pill">{entry.category}</li>
          {wallet && <li>{wallet.name}</li>}
          {entry.debt_impact !== 0 && <li>{entry.debtor_name}</li>}
          {entry.source_text && <li>จดด้วย AI</li>}
        </ul>
        {entry.note && <p className="detail-note">{entry.note}</p>}
        <div className="detail-actions">
          <button className="billboard-cta" onClick={() => onEdit(entry)}>
            <Pencil size={18} strokeWidth={2.25} aria-hidden="true" />แก้ไข
          </button>
          <button className="detail-delete" onClick={() => onDelete(entry)}>
            <Trash2 size={18} strokeWidth={2.25} aria-hidden="true" />ลบรายการนี้
          </button>
        </div>
        {repeat.count > 1 && (
          <p className="detail-repeat">
            จดชื่อนี้ไว้ <b>{repeat.count} ครั้ง</b> · รวม <b>{moneySign}{formatMoney(repeat.total)}</b>
          </p>
        )}
        {similar.length > 0 && (
          <section className="detail-similar" aria-label="รายการคล้ายกัน">
            <h3>รายการคล้ายกัน</h3>
            <div className="detail-similar-grid">
              {similar.map((item) => (
                <Poster
                  key={item.id}
                  hue={categoryColor(item.category)}
                  glyph={<CategoryIcon category={item.category} size={64} />}
                  title={item.title}
                  sub={formatShortDate(item.occurred_at)}
                  amount={formatSignedMoney(entryDisplayImpact(item))}
                  onClick={() => onOpen(item)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </SheetFrame>
  );
}
