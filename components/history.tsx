"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, SlidersHorizontal, Users, X } from "lucide-react";
import { CATEGORY_DOT_TINT_ALPHA } from "@/lib/constants";
import { formatMoney, formatPercent, moneySign } from "@/lib/format";
import { transactionTypeLabels, type TransactionType } from "@/lib/taxonomy";
import { categories, categoryColor, categoryTint } from "@/lib/category";
import type { Entry, HistoryFilters } from "@/lib/types";
import { CategoryIcon } from "@/components/shared";
import { EmptyNote, Metric, MonthField } from "@/components/primitives";

export function HistoryInsight({ entries }: { entries: Entry[] }) {
  const nonTransferEntries = entries.filter((entry) => entry.transaction_type !== "transfer");
  const outflow = nonTransferEntries.filter((entry) => entry.wallet_impact < 0).reduce((sum, entry) => sum + Math.abs(entry.wallet_impact), 0);
  const income = nonTransferEntries.filter((entry) => entry.wallet_impact > 0).reduce((sum, entry) => sum + entry.wallet_impact, 0);
  const top = [...nonTransferEntries]
    .filter((entry) => entry.wallet_impact < 0)
    .sort((a, b) => Math.abs(b.wallet_impact) - Math.abs(a.wallet_impact))[0];

  return (
    <section className="history-insight">
      <div>
        <span>มุมมองวันที่เลือก</span>
        <b>{entries.length} รายการ</b>
      </div>
      <div>
        <span>เงินเข้า/ออก</span>
        <b>{moneySign}{formatMoney(income)} / {moneySign}{formatMoney(outflow)}</b>
      </div>
      <div>
        <span>รายการสูงสุด</span>
        <b>{top ? `${top.title} ${moneySign}${formatMoney(Math.abs(top.wallet_impact))}` : "ยังไม่มีรายจ่าย"}</b>
      </div>
    </section>
  );
}

export function HistoryFilterBar({
  filters,
  onChange,
  onClear,
}: {
  filters: HistoryFilters;
  onChange: (filters: HistoryFilters) => void;
  onClear: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const update = (patch: Partial<HistoryFilters>) => onChange({ ...filters, ...patch });
  // Local draft so typing feels instant while the parent (and the whole
  // Home tree it re-renders) only updates ~200ms after the user pauses.
  const [queryDraft, setQueryDraft] = useState(filters.query);
  const [prevFiltersQuery, setPrevFiltersQuery] = useState(filters.query);
  if (filters.query !== prevFiltersQuery) {
    setPrevFiltersQuery(filters.query);
    setQueryDraft(filters.query);
  }
  const queryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (queryTimeoutRef.current) clearTimeout(queryTimeoutRef.current);
  }, []);
  const handleQueryChange = (value: string) => {
    setQueryDraft(value);
    if (queryTimeoutRef.current) clearTimeout(queryTimeoutRef.current);
    queryTimeoutRef.current = setTimeout(() => update({ query: value }), 200);
  };
  const clearQuery = () => {
    if (queryTimeoutRef.current) clearTimeout(queryTimeoutRef.current);
    setQueryDraft("");
    update({ query: "" });
  };
  const activeFilters = [
    filters.category && { key: "category" as const, label: `หมวด ${filters.category}` },
    filters.type !== "all" && { key: "type" as const, label: transactionTypeLabels[filters.type as TransactionType] },
    filters.minAmount && { key: "minAmount" as const, label: `ตั้งแต่ ${moneySign}${filters.minAmount}` },
    filters.maxAmount && { key: "maxAmount" as const, label: `ไม่เกิน ${moneySign}${filters.maxAmount}` },
  ].filter(Boolean) as { key: keyof HistoryFilters; label: string }[];
  const removeFilter = (key: keyof HistoryFilters) => update({ [key]: key === "type" ? "all" : "" } as Partial<HistoryFilters>);

  return (
    <section className="history-search-panel">
      <div className="history-search-row">
        <span className="history-search-icon" aria-hidden="true"><Search size={16} strokeWidth={2.25} /></span>
        <input
          value={queryDraft}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="ค้นหาชื่อ หมวด ลูกหนี้ หรือหมายเหตุ"
        />
        {queryDraft && (
          <button className="history-search-clear" aria-label="ล้างคำค้นหา" onClick={clearQuery}>
            <X size={14} strokeWidth={2.5} />
          </button>
        )}
        <button
          className={`history-filter-toggle ${activeFilters.length ? "active" : ""}`}
          onClick={() => setFiltersOpen((value) => !value)}
          aria-expanded={filtersOpen}
          aria-label="ตัวกรองเพิ่มเติม"
        >
          <SlidersHorizontal size={16} strokeWidth={2.25} />
          {activeFilters.length > 0 && <span className="filter-count-badge">{activeFilters.length}</span>}
        </button>
      </div>

      {activeFilters.length > 0 && (
        <div className="history-filter-chips">
          {activeFilters.map((item) => (
            <button key={item.key} className="filter-chip" onClick={() => removeFilter(item.key)}>
              {item.label}
              <X size={12} strokeWidth={2.5} />
            </button>
          ))}
          <button className="filter-chip clear" onClick={onClear}>ล้างทั้งหมด</button>
        </div>
      )}

      {filtersOpen && (
        <div className="history-filter-grid">
          <label>
            หมวด
            <div className="select-shell">
              <select value={filters.category} onChange={(event) => update({ category: event.target.value })}>
              <option value="">ทุกหมวด</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
              <ChevronDown className="select-shell-chevron" aria-hidden="true" />
            </div>
          </label>
          <label>
            ประเภทรายการ
            <div className="select-shell">
              <select value={filters.type} onChange={(event) => update({ type: event.target.value as HistoryFilters["type"] })}>
              <option value="all">ทุกชนิด</option>
              {Object.entries(transactionTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
              <ChevronDown className="select-shell-chevron" aria-hidden="true" />
            </div>
          </label>
          <label>
            ยอดต่ำสุด
            <input inputMode="decimal" value={filters.minAmount} onChange={(event) => update({ minAmount: event.target.value })} placeholder="0" />
          </label>
          <label>
            ยอดสูงสุด
            <input inputMode="decimal" value={filters.maxAmount} onChange={(event) => update({ maxAmount: event.target.value })} placeholder="ไม่จำกัด" />
          </label>
        </div>
      )}
    </section>
  );
}

export function MonthlyTrendChart({ trend }: { trend: { key: string; label: string; income: number; outflow: number; netWorth: number }[] }) {
  const max = Math.max(...trend.flatMap((item) => [item.income, item.outflow]), 1);
  const netWorthValues = trend.map((item) => item.netWorth);
  const netWorthMin = Math.min(...netWorthValues, 0);
  const netWorthMax = Math.max(...netWorthValues, netWorthMin + 1);
  const netWorthRange = netWorthMax - netWorthMin;
  const currentKey = trend[trend.length - 1]?.key;
  return (
    <details className="monthly-trend-panel compact-disclosure">
      <summary>
        <span>
          <p className="eyebrow">แนวโน้ม</p>
          <h2>รายรับเทียบรายจ่าย 6 เดือน</h2>
        </span>
        <em>เปิดกราฟ</em>
      </summary>
      <div className="trend-legend">
        <span><i className="income" />รายรับ</span>
        <span><i className="expense" />รายจ่าย</span>
      </div>
      <div className="monthly-trend-bars">
        {trend.map((item) => (
          <div key={item.key} className={item.key === currentKey ? "current" : ""}>
            <span>
              <i className="income" style={{ height: `${Math.max(6, (item.income / max) * 100)}%` }} title={`รายรับ ${moneySign}${formatMoney(item.income)}`} />
              <i className="expense" style={{ height: `${Math.max(6, (item.outflow / max) * 100)}%` }} title={`รายจ่าย ${moneySign}${formatMoney(item.outflow)}`} />
            </span>
            <small>{item.label}</small>
          </div>
        ))}
      </div>
      <div className="trend-legend">
        <span><i className="networth" />สุทธิสะสม (มูลค่าทรัพย์สินสุทธิ ณ สิ้นเดือน)</span>
      </div>
      <div className="monthly-trend-bars monthly-trend-bars-networth">
        {trend.map((item) => (
          <div key={item.key} className={item.key === currentKey ? "current" : ""}>
            <span>
              <i className="networth" style={{ height: `${Math.max(6, ((item.netWorth - netWorthMin) / netWorthRange) * 100)}%` }} title={`สุทธิสะสม ${moneySign}${formatMoney(item.netWorth)}`} />
            </span>
            <small>{item.label}</small>
          </div>
        ))}
      </div>
    </details>
  );
}

export function IncomeBreakdown({ items }: { items: { category: string; amount: number }[] }) {
  if (!items.length) return null;
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  return (
    <details className="income-breakdown-panel compact-disclosure">
      <summary>
        <span>
          <p className="eyebrow">รายรับ</p>
          <h2>แหล่งเงินเข้า</h2>
        </span>
        <em>{moneySign}{formatMoney(total)}</em>
      </summary>
      <div className="income-breakdown-list">
        {items.map((item) => (
          <div key={item.category}>
            <span className="cat-dot" style={{ background: categoryTint(item.category, CATEGORY_DOT_TINT_ALPHA), color: categoryColor(item.category) }}><CategoryIcon category={item.category} /></span>
            <b>{item.category}</b>
            <strong>{moneySign}{formatMoney(item.amount)}</strong>
          </div>
        ))}
      </div>
    </details>
  );
}

export function MonthSummary({
  selectedMonth,
  setSelectedMonth,
  income,
  outflow,
  debtChange,
  balance,
  categories: categoryItems,
  lentOut,
  monthStartDay,
  budgets,
}: {
  selectedMonth: string;
  setSelectedMonth: (value: string) => void;
  income: number;
  outflow: number;
  debtChange: number;
  balance: number;
  categories: { category: string; amount: number }[];
  lentOut: number;
  monthStartDay: number;
  budgets: Record<string, number>;
}) {
  return (
    <section className="summary-panel">
      <div className="summary-head">
        <div>
          <h2>ภาพรวมเดือนนี้</h2>
          <small className="cycle-note">รอบเริ่มวันที่ {monthStartDay} ของเดือน</small>
        </div>
        <MonthField value={selectedMonth} onChange={setSelectedMonth} />
      </div>
      <div className="summary-grid">
        <Metric label="เงินเข้า" value={income} tone="income" />
        <Metric label="เงินออก" value={outflow} tone="expense" />
        <Metric label="สุทธิ" value={balance} tone={balance >= 0 ? "income" : "expense"} />
        <Metric
          label={debtChange > 0 ? "ยอดลูกหนี้เพิ่มขึ้น" : debtChange < 0 ? "ยอดลูกหนี้ลดลง" : "ยอดลูกหนี้คงเดิม"}
          value={debtChange}
          tone={debtChange > 0 ? "expense" : debtChange < 0 ? "income" : undefined}
          showPositiveSign
        />
      </div>
      <div className="category-bars">
        <div className="category-bars-head">
          <span>ค่าใช้จ่ายตามหมวด</span>
          <small>นับเฉพาะส่วนที่คุณจ่ายจริง</small>
        </div>
        {categoryItems.length ? (
          categoryItems.map((item) => {
            const budget = budgets[item.category];
            const hasBudget = !!budget && budget > 0;
            const overBudget = hasBudget && item.amount > budget;
            const color = overBudget ? "var(--danger)" : categoryColor(item.category);
            const percent = hasBudget ? (item.amount / budget) * 100 : outflow > 0 ? (item.amount / outflow) * 100 : 0;
            return (
              <div className="category-bar" key={item.category}>
                <div>
                  <span className="cat-dot" style={{ background: categoryTint(item.category, CATEGORY_DOT_TINT_ALPHA), color: categoryColor(item.category) }}><CategoryIcon category={item.category} /></span>
                  <b>{item.category}</b>
                  {overBudget && <span className="over-budget-chip">เกินงบ</span>}
                  <small>{hasBudget ? `${moneySign}${formatMoney(item.amount)} / ${moneySign}${formatMoney(budget)}` : formatPercent(percent)}</small>
                  {!hasBudget && <strong>{moneySign}{formatMoney(item.amount)}</strong>}
                </div>
                <i style={{ width: `${Math.max(4, Math.min(100, percent))}%`, background: color }} />
              </div>
            );
          })
        ) : (
          <EmptyNote glyph="▣">ยังไม่มีรายจ่ายในเดือนนี้</EmptyNote>
        )}
        {lentOut > 0 && (
          <div className="category-bar category-bar-lent">
            <div>
              <span className="cat-dot cat-dot-neutral"><Users size={14} strokeWidth={2.25} aria-hidden="true" /></span>
              <b>ให้คนอื่นยืม/หารก่อน</b>
              <small>{outflow > 0 ? formatPercent((lentOut / outflow) * 100) : "0%"}</small>
              <strong>{moneySign}{formatMoney(lentOut)}</strong>
            </div>
            <i style={{ width: `${Math.max(4, Math.min(100, outflow > 0 ? (lentOut / outflow) * 100 : 0))}%` }} />
          </div>
        )}
      </div>
    </section>
  );
}

