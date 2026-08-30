// Pure display-formatting and number/date-string coercion helpers, used
// throughout app/page.tsx and by lib/cycle.ts. No domain knowledge here —
// see lib/money.ts and lib/cycle.ts for that.

export const moneySign = "฿ ";

export const localDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
export const monthKey = (date: Date) => localDateInput(date).slice(0, 7);
export const formatMoney = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
export const formatSignedMoney = (value: number) => `${value >= 0 ? "+" : "−"}${moneySign}${formatMoney(Math.abs(value))}`;
export const formatDateTime = (value: string) => new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
export const formatUnits = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 4 });
export const formatPercent = (value: number, digits = 0) => `${digits === 0 ? Math.round(value) : value.toFixed(digits)}%`;
export const formatSignedPercent = (value: number, digits = 1) => `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
export const formatShortDate = (value: Date | string, { year = false }: { year?: boolean } = {}) =>
  (typeof value === "string" ? new Date(value) : value).toLocaleDateString("th-TH", { day: "numeric", month: "short", ...(year ? { year: "numeric" as const } : {}) });
export const toDateInput = (value: string) => localDateInput(new Date(value));
export const toFiniteNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
export const toMoneyAmount = (value: unknown) => Math.max(0, toFiniteNumber(value));
export const clampInteger = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Math.trunc(toFiniteNumber(value, fallback));
  return Math.min(max, Math.max(min, number));
};
export const normalizeBillingDay = (value: unknown) => clampInteger(value, 1, 31, 1);
