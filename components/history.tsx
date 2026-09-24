"use client";

import { memo, useEffect, useRef, useState } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { CATEGORY_DOT_TINT_ALPHA } from "@/lib/constants";
import { formatMoney, moneySign } from "@/lib/format";
import { transactionTypeLabels, type TransactionType } from "@/lib/taxonomy";
import { categories, categoryColor, categoryTint } from "@/lib/category";
import type { HistoryFilters } from "@/lib/types";
import { CategoryIcon } from "@/components/shared";

const QUICK_TYPES: { type: TransactionType; label: string }[] = [
  { type: "personal_expense", label: "จ่ายเอง" },
  { type: "income", label: "รายรับ" },
  { type: "split_half", label: "หารร่วม" },
  { type: "lend", label: "ออกให้ก่อน" },
  { type: "transfer", label: "โอน" },
];

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
  // A type with its own chip in the row under the field is shown there, not
  // repeated as a removable chip; any other type (picked in the panel) is.
  const quickType = QUICK_TYPES.some((item) => item.type === filters.type);
  const activeFilters = [
    filters.category && { key: "category" as const, label: `หมวด ${filters.category}` },
    filters.type !== "all" && !quickType && { key: "type" as const, label: transactionTypeLabels[filters.type as TransactionType] },
    filters.minAmount && { key: "minAmount" as const, label: `ตั้งแต่ ${moneySign}${filters.minAmount}` },
    filters.maxAmount && { key: "maxAmount" as const, label: `ไม่เกิน ${moneySign}${filters.maxAmount}` },
  ].filter(Boolean) as { key: keyof HistoryFilters; label: string }[];
  const removeFilter = (key: keyof HistoryFilters) => update({ [key]: key === "type" ? "all" : "" } as Partial<HistoryFilters>);

  return (
    <section className="history-search" aria-label="ค้นหารายการ">
      <div className="history-search-row">
        <span className="history-search-icon" aria-hidden="true"><Search size={16} strokeWidth={2.25} /></span>
        <input
          value={queryDraft}
          onChange={(event) => handleQueryChange(event.target.value)}
          type="search"
          enterKeyHint="search"
          aria-label="ค้นหารายการ"
          placeholder="ค้นหาชื่อ หมวด คน หรือหมายเหตุ"
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

      {/* The kinds people actually filter by, one tap each -- the same
          filters.type the panel's select sets, so the two never disagree. */}
      <div className="history-type-chips" role="group" aria-label="ชนิดรายการ">
        <button className={filters.type === "all" ? "active" : ""} aria-pressed={filters.type === "all"} onClick={() => update({ type: "all" })}>ทั้งหมด</button>
        {QUICK_TYPES.map((item) => (
          <button
            key={item.type}
            className={filters.type === item.type ? "active" : ""}
            aria-pressed={filters.type === item.type}
            onClick={() => update({ type: filters.type === item.type ? "all" : item.type })}
          >
            {item.label}
          </button>
        ))}
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

export const MonthlyTrendChart = memo(function MonthlyTrendChart({ trend }: { trend: { key: string; label: string; income: number; outflow: number; netWorth: number }[] }) {
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
});

export const IncomeBreakdown = memo(function IncomeBreakdown({ items }: { items: { category: string; amount: number }[] }) {
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
});
