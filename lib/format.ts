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
// Timestamp under a chat bubble: bare clock time for anything sent today,
// prefixed with the day once the conversation is older, so a thread reloaded
// a week later doesn't read as if every message arrived this afternoon.
export const formatChatTime = (value: string, now = new Date()) => {
  const date = new Date(value);
  const time = date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return sameDay ? time : `${formatShortDate(date)} ${time}`;
};
// Money as a NUMBER at satang precision. formatMoney handles this for
// anything a person reads, but a value leaving the app as raw JSON -- the
// payload the AI chat reasons over -- keeps whatever float noise the sums
// accumulated, and the model prints it verbatim ("11886.669999999998 บาท").
export const roundMoney = (value: number) => Math.round(value * 100) / 100;

// Same, applied through a payload of unknown shape, so every amount in the
// AI context is rounded without the caller having to name each field (and
// without a field added later quietly slipping through unrounded).
export function roundMoneyDeep<T>(value: T): T {
  if (typeof value === "number") return (Number.isFinite(value) ? roundMoney(value) : value) as T;
  if (Array.isArray(value)) return value.map(roundMoneyDeep) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundMoneyDeep(item)])) as T;
  }
  return value;
}

// A yyyy-mm-dd value from an <input type="date">, rendered for reading.
// Parsed from its parts rather than through new Date(value): a bare date
// string parses as UTC midnight, which lands on the day before for anyone
// behind UTC -- Bangkok is ahead, but a browser is not always where the user
// is, and this is the string the picker round-trips.
export const formatDateInputValue = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "";
  return formatShortDate(new Date(year, month - 1, day), { year: true });
};

// The yyyy-mm value of an <input type="month">, same story as above: the
// control renders it in the browser's locale ("September 2026").
export const formatMonthInputValue = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return "";
  return new Date(year, month - 1, 1).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
};

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
