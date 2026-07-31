"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import NextImage from "next/image";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { CATEGORIES, type TransactionType } from "@/lib/taxonomy";
import {
  Banknote,
  Bot,
  Car,
  Cloud,
  CreditCard,
  Delete,
  Download,
  Gift,
  Gamepad2,
  GraduationCap,
  HeartPulse,
  Home as HomeIcon,
  Lightbulb,
  Lock,
  Menu,
  Moon,
  MoreHorizontal,
  Music,
  MonitorPlay,
  PiggyBank,
  Plane,
  Receipt,
  ScanFace,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Sun,
  TrendingDown,
  TrendingUp,
  Tv,
  UserCog,
  Users,
  Utensils,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

type EntryKind = "expense" | "income";
type Tab = "home" | "add" | "history" | "debtors" | "wallets" | "recurring";
type Theme = "light" | "dark";

type Entry = {
  id: string;
  title: string;
  category: string;
  amount: number;
  type: EntryKind;
  transaction_type: TransactionType;
  wallet_impact: number;
  debt_impact: number;
  user_share: number;
  partner_share: number;
  debtor_name: string;
  occurred_at: string;
  source_text?: string | null;
  wallet_id?: string | null;
  note?: string | null;
  transfer_group_id?: string | null;
  transfer_to_wallet_id?: string | null;
};

type Draft = Omit<Entry, "id"> & { id: string };
type CsvImportRow = { title: string; amount: number; category: string; transaction_type: TransactionType; occurred_at: string; note: string; debtor_name: string; wallet_id: string | null };
type AiFinanceContext = {
  periodLabel: string;
  totals: { income: number; outflow: number; balance: number; cashAvailable: number; walletBalance: number; netWorth: number };
  walletBalances: { name: string; balance: number }[];
  categories: { category: string; amount: number }[];
  recurringTotal: number;
  receivableTotal: number;
  payableTotal: number;
  transactionCount: number;
  transactions: Pick<Entry, "title" | "category" | "amount" | "transaction_type" | "wallet_impact" | "occurred_at">[];
};
type Profile = {
  user_id: string;
  nickname: string | null;
  app_icon: string | null;
  app_icon_image: string | null;
  month_start_day: number;
  pin_hash: string | null;
  pin_salt: string | null;
  pin_failed_attempts: number;
  pin_blocked_until: string | null;
  webauthn_credential_id: string | null;
  webauthn_enabled: boolean;
};
type PinMode = "checking" | "setup" | "locked" | "unlocked";
type DebtorKind = "lend" | "own";
type Debtor = {
  id: string;
  user_id: string;
  name: string;
  note: string | null;
  opening_balance: number;
  kind: DebtorKind;
  monthly_installment: number | null;
  total_installments: number | null;
  paid_installments: number | null;
  credit_limit: number | null;
  icon: string | null;
  icon_color: string | null;
};
type WalletTag = "cash" | "savings" | "investment" | "other";
type Wallet = {
  id: string;
  user_id: string;
  name: string;
  tag: WalletTag;
  balance: number;
  icon: string | null;
  icon_color: string | null;
  is_default: boolean;
};
type WalletDisplay = Wallet & {
  display_balance: number;
  transaction_delta: number;
};
type RecurringExpense = {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  billing_day: number;
  icon: string | null;
  icon_color: string | null;
};
type ReportPeriod = "month" | "year";
type HistoryFilters = {
  query: string;
  category: string;
  type: "all" | TransactionType;
  minAmount: string;
  maxAmount: string;
};
type Toast = { id: number; tone: "success" | "info" | "error"; title: string; detail?: string; action?: { label: string; onClick: () => void } };
type ConfirmDialogState = {
  title: string;
  detail: string;
  confirmLabel: string;
  tone?: "danger" | "default";
  resolve: (confirmed: boolean) => void;
};
type EmptyAction = { label: string; onClick: () => void };
const walletTagLabels: Record<WalletTag, string> = {
  cash: "เงินสด",
  savings: "ออมทรัพย์",
  investment: "เงินลงทุน",
  other: "อื่น ๆ",
};
const secondaryWalletTags: { tag: WalletTag; label: string; className: string }[] = [
  { tag: "savings", label: walletTagLabels.savings, className: "savings-wallet" },
  { tag: "investment", label: walletTagLabels.investment, className: "investment-wallet" },
  { tag: "other", label: walletTagLabels.other, className: "other-wallet" },
];
type EntryInput = {
  id: string;
  title: string;
  category: string;
  amount: number;
  type?: EntryKind;
  transaction_type?: TransactionType;
  wallet_impact?: number;
  debt_impact?: number;
  user_share?: number;
  partner_share?: number;
  debtor_name?: string | null;
  occurred_at: string;
  source_text?: string | null;
  wallet_id?: string | null;
  note?: string | null;
  transfer_group_id?: string | null;
  transfer_to_wallet_id?: string | null;
};

type SlipImage = {
  id: string;
  name: string;
  mimeType: string;
  data: string;
  preview: string;
};

const categories: string[] = [...CATEGORIES];
const historyFiltersEnabled = false;
const transactionTypes: TransactionType[] = ["income", "personal_expense", "lend", "split_half", "debt_repayment", "debt_payment", "card_charge", "transfer", "gift"];

const transactionTypeLabels: Record<TransactionType, string> = {
  income: "รายรับ",
  personal_expense: "จ่ายเอง",
  lend: "ออกให้ก่อน",
  split_half: "หารร่วมกัน",
  debt_repayment: "รับชำระหนี้",
  debt_payment: "ผ่อนชำระหนี้",
  card_charge: "จ่ายด้วยบัตรเครดิต",
  transfer: "โอนเงินระหว่างกระเป๋า",
  gift: "ให้โดยไม่คิดคืน",
};

const transactionKind: Record<TransactionType, EntryKind> = {
  income: "income",
  debt_repayment: "income",
  personal_expense: "expense",
  lend: "expense",
  split_half: "expense",
  debt_payment: "expense",
  card_charge: "expense",
  transfer: "expense",
  gift: "expense",
};

const categoryIconMap: Record<string, LucideIcon> = {
  อาหาร: Utensils,
  เดินทาง: Car,
  ของใช้: ShoppingBag,
  ที่อยู่อาศัย: HomeIcon,
  สุขภาพ: HeartPulse,
  บันเทิง: Music,
  บิลประจำ: Receipt,
  รายได้: Banknote,
};
function CategoryIcon({ category, size = 14 }: { category: string; size?: number }) {
  const Icon = categoryIconMap[category] ?? MoreHorizontal;
  return <Icon size={size} strokeWidth={2.25} aria-hidden="true" />;
}

// Categorical palette validated for CVD-safe adjacency + normal-vision separation
// (dataviz skill, 7-slot subset of the default 8-hue order; brand accent reserved for income).
// Values live as CSS custom properties (--cat-*) so dark mode adapts them automatically —
// see :root / :root[data-theme="dark"] in globals.css.
const categoryColorVars: Record<string, string> = {
  เดินทาง: "--cat-travel",
  อาหาร: "--cat-food",
  บิลประจำ: "--cat-bills",
  ที่อยู่อาศัย: "--cat-home",
  บันเทิง: "--cat-entertainment",
  ของใช้: "--cat-goods",
  สุขภาพ: "--cat-health",
};
const categoryColorVar = (category: string) => categoryColorVars[category] ?? "--cat-other";
const categoryColor = (category: string) => `var(${categoryColorVar(category)})`;
const categoryTint = (category: string, alphaPercent: number) =>
  `color-mix(in srgb, var(${categoryColorVar(category)}) ${alphaPercent}%, transparent)`;

const avatarPaletteVars = Object.values(categoryColorVars);
function nameColor(name: string) {
  const sum = [...name.trim()].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return `var(${avatarPaletteVars[sum % avatarPaletteVars.length]})`;
}
function nameInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

const moneySign = "฿ ";
const unnamedDebtor = "ไม่ระบุ";
const profileImageMaxInputBytes = 10 * 1024 * 1024;
const profileImageMaxStoredBytes = 1.5 * 1024 * 1024;
const profileImageSize = 512;
const slipImageMaxInputBytes = 15 * 1024 * 1024;
const slipImageMaxStoredBytes = 3 * 1024 * 1024;
const slipImageMaxDimension = 1800;
const pinLength = 6;
const pinMaxAttempts = 5;
const pinBlockMs = 60 * 60 * 1000;
const pinBackgroundLockMs = 2 * 60 * 1000;
const pinHashIterations = 150000;
const localDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const monthKey = (date: Date) => localDateInput(date).slice(0, 7);
const formatMoney = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const formatSignedMoney = (value: number) => `${value >= 0 ? "+" : "−"}${moneySign}${formatMoney(Math.abs(value))}`;
const formatDateTime = (value: string) => new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
const toDateInput = (value: string) => localDateInput(new Date(value));
const toFiniteNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const toMoneyAmount = (value: unknown) => Math.max(0, toFiniteNumber(value));
const clampInteger = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Math.trunc(toFiniteNumber(value, fallback));
  return Math.min(max, Math.max(min, number));
};
const normalizeBillingDay = (value: unknown) => clampInteger(value, 1, 31, 1);
const isSixDigitPin = (value: string) => /^\d{6}$/.test(value);
function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}
function base64ToBytes(value: string) {
  const binary = window.atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}
async function hashPin(pin: string, salt: string) {
  const encoder = new TextEncoder();
  const key = await window.crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64ToBytes(salt),
      iterations: pinHashIterations,
    },
    key,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}
function createPinSalt() {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}
function pinBlocked(profile: Profile | null) {
  const blockedAt = profile?.pin_blocked_until ? new Date(profile.pin_blocked_until).getTime() : 0;
  return blockedAt > Date.now();
}

/**
 * Face ID / Touch ID quick-unlock, layered on top of the PIN above — never
 * a replacement. WebAuthn is the only way a web app can reach the
 * platform's biometric prompt; the app never sees the biometric data,
 * only whether the browser's promise resolved. Like the PIN, this is a
 * client-side device gate, not server-verified remote authentication:
 * treating a resolved navigator.credentials.get() as "unlocked" matches
 * the same trust level as comparing the PIN hash in the browser, so no
 * server-side WebAuthn signature verification is implemented here on
 * purpose — that would be a different, heavier feature.
 */
function isWebAuthnSupported() {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function";
}
async function isPlatformAuthenticatorAvailable() {
  if (!isWebAuthnSupported()) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}
function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return base64ToBytes(padded);
}
async function registerFaceId(user: User): Promise<string | null> {
  if (!isWebAuthnSupported()) return null;
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);
  const userId = new TextEncoder().encode(user.id);
  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        rp: { name: "Monii", id: window.location.hostname },
        user: { id: userId, name: user.email ?? user.id, displayName: user.email ?? "Monii" },
        challenge,
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 60000,
      },
    }) as PublicKeyCredential | null;
    return credential?.id ?? null;
  } catch {
    return null;
  }
}
async function verifyFaceId(credentialId: string): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: base64UrlToBytes(credentialId), type: "public-key" }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}
function withDate(dateInput: string, hours: number, minutes: number, seconds: number) {
  const [year, month, day] = dateInput.split("-").map(Number);
  return new Date(year, month - 1, day, hours, minutes, seconds).toISOString();
}
const fromDateInput = (value: string) => {
  const now = new Date();
  return withDate(value, now.getHours(), now.getMinutes(), now.getSeconds());
};
const withDateKeepingTime = (value: string, referenceIso: string) => {
  const reference = new Date(referenceIso);
  return withDate(value, reference.getHours(), reference.getMinutes(), reference.getSeconds());
};
const todayDateInput = () => localDateInput(new Date());

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

function dayLabel(value: string) {
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(new Date(value))) / 86400000);
  if (diffDays === 0) return "วันนี้";
  if (diffDays === 1) return "เมื่อวาน";
  return new Date(value).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

function groupEntriesByDay(entries: Entry[]) {
  const byDay = new Map<number, Entry[]>();
  for (const entry of entries) {
    const key = startOfDay(new Date(entry.occurred_at));
    const list = byDay.get(key);
    if (list) list.push(entry);
    else byDay.set(key, [entry]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, items]) => ({ label: dayLabel(items[0].occurred_at), items }));
}

function budgetStorageKey(userId: string) {
  return `money-ai-budgets:${userId}`;
}

function loadBudgets(userId: string): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(budgetStorageKey(userId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveBudgets(userId: string, budgets: Record<string, number>) {
  try {
    window.localStorage.setItem(budgetStorageKey(userId), JSON.stringify(budgets));
  } catch {
    // localStorage unavailable (private mode, quota) — budgets simply won't persist
  }
}

type MoneyGoal = { id: string; name: string; target: number; saved: number; deadline: string };

function goalStorageKey(userId: string) {
  return `money-ai-goals:v1:${userId}`;
}

function loadGoals(userId: string): MoneyGoal[] {
  try {
    const raw = window.localStorage.getItem(goalStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is MoneyGoal => item && typeof item.id === "string" && typeof item.name === "string" && Number(item.target) > 0)
      .map((item) => ({ ...item, target: toMoneyAmount(item.target), saved: toMoneyAmount(item.saved), deadline: typeof item.deadline === "string" ? item.deadline : "" }));
  } catch {
    return [];
  }
}

function saveGoals(userId: string, goals: MoneyGoal[]) {
  try {
    window.localStorage.setItem(goalStorageKey(userId), JSON.stringify(goals));
  } catch {
    // localStorage unavailable (private mode, quota) — goals simply won't persist
  }
}

type QuickShortcut = { title: string; category: string; transaction_type: TransactionType; amount: number; count: number };
type AiSuggestion = { label: string; detail: string; text: string; shortcut?: QuickShortcut };

function deriveQuickShortcuts(entries: Entry[]): QuickShortcut[] {
  const cutoff = Date.now() - 90 * 86400000;
  const map = new Map<string, QuickShortcut>();
  for (const entry of entries) {
    if (entry.transaction_type !== "personal_expense" && entry.transaction_type !== "income") continue;
    if (new Date(entry.occurred_at).getTime() < cutoff) continue;
    const title = entry.title.trim();
    const key = `${title.toLowerCase()}|${entry.category}|${entry.transaction_type}`;
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { title, category: entry.category, transaction_type: entry.transaction_type, amount: entry.amount, count: 1 });
  }
  return [...map.values()]
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
}

function computeStreak(entries: Entry[]) {
  const days = new Set(entries.map((entry) => startOfDay(new Date(entry.occurred_at))));
  let cursor = startOfDay(new Date());
  if (!days.has(cursor)) cursor -= 86400000;
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= 86400000;
  }
  return streak;
}

function daysRemainingInCycle(end: Date) {
  const today = startOfDay(new Date());
  const endDay = startOfDay(new Date(end.getTime() - 1));
  return Math.max(1, Math.round((endDay - today) / 86400000) + 1);
}

function buildWalletInsight(balance: number, outflow: number, cycleEnd: Date) {
  const remainingDays = daysRemainingInCycle(cycleEnd);
  const perDay = balance / remainingDays;
  if (balance < 0) {
    return {
      tone: "danger",
      label: "ต้องระวัง",
      text: `ยอดสุทธิติดลบ ${moneySign}${formatMoney(Math.abs(balance))} ในรอบนี้`,
      perDay,
    };
  }
  if (outflow <= 0) {
    return {
      tone: "calm",
      label: "เริ่มรอบใหม่",
      text: `ยังไม่มีรายจ่ายในรอบนี้ เหลืออีก ${remainingDays} วัน`,
      perDay,
    };
  }
  if (perDay < 200) {
    return {
      tone: "warn",
      label: "ใช้แบบประคอง",
      text: `เฉลี่ยใช้ได้ประมาณ ${moneySign}${formatMoney(perDay)} ต่อวัน`,
      perDay,
    };
  }
  return {
    tone: "good",
    label: "ยังดูดี",
    text: `เหลือใช้ได้ประมาณ ${moneySign}${formatMoney(perDay)} ต่อวัน`,
    perDay,
  };
}

function lastSevenDayCashFlow(entries: Entry[], anchorDate: Date) {
  const today = startOfDay(anchorDate);
  return Array.from({ length: 7 }, (_, index) => {
    const time = today - (6 - index) * 86400000;
    const dayEntries = entries.filter((entry) => startOfDay(new Date(entry.occurred_at)) === time && entry.transaction_type !== "transfer");
    const income = dayEntries.filter((entry) => entry.wallet_impact > 0).reduce((sum, entry) => sum + entry.wallet_impact, 0);
    const expense = dayEntries.filter((entry) => entry.wallet_impact < 0).reduce((sum, entry) => sum + Math.abs(entry.wallet_impact), 0);
    return {
      key: String(time),
      label: new Date(time).toLocaleDateString("th-TH", { weekday: "short" }),
      income,
      expense,
    };
  });
}

function cycleBounds(selectedMonth: string, startDay: number) {
  const [year, month] = selectedMonth.split("-").map(Number);
  const safeDay = Math.min(28, Math.max(1, startDay || 1));
  const start = new Date(year, month - 1, safeDay, 0, 0, 0, 0);
  const end = new Date(year, month, safeDay, 0, 0, 0, 0);
  return { start, end };
}

function currentCycleMonthKey(startDay: number, now = new Date()) {
  const safeStartDay = Math.min(28, Math.max(1, startDay || 1));
  return monthKey(new Date(now.getFullYear(), now.getMonth() - (now.getDate() < safeStartDay ? 1 : 0), 1));
}

function reportBounds(period: ReportPeriod, selectedMonth: string, selectedYear: number, startDay: number) {
  if (period === "month") return cycleBounds(selectedMonth, startDay);
  const safeYear = Number.isFinite(selectedYear) ? selectedYear : new Date().getFullYear();
  return {
    start: new Date(safeYear, 0, 1, 0, 0, 0, 0),
    end: new Date(safeYear + 1, 0, 1, 0, 0, 0, 0),
  };
}

function reportLabel(period: ReportPeriod, selectedMonth: string, selectedYear: number, startDay: number) {
  if (period === "year") return `รายปี ${selectedYear}`;
  const range = cycleBounds(selectedMonth, startDay);
  const start = range.start.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  const end = new Date(range.end.getTime() - 1).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  return `รายเดือน ${start} - ${end}`;
}

function entriesInRange(entries: Entry[], start: Date, end: Date) {
  return entries.filter((entry) => {
    const occurredAt = new Date(entry.occurred_at);
    return occurredAt >= start && occurredAt < end;
  });
}

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: (string | number | null | undefined)[]) {
  return values.map(csvCell).join(",");
}

function buildReportCsv({
  entries,
  wallets,
  receivableSummary,
  payableSummary,
  period,
  selectedMonth,
  selectedYear,
  monthStartDay,
}: {
  entries: Entry[];
  wallets: Wallet[];
  receivableSummary: { name: string; amount: number }[];
  payableSummary: { name: string; amount: number }[];
  period: ReportPeriod;
  selectedMonth: string;
  selectedYear: number;
  monthStartDay: number;
}) {
  const range = reportBounds(period, selectedMonth, selectedYear, monthStartDay);
  const reportEntries = entriesInRange(entries, range.start, range.end).sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
  const walletNameById = new Map(wallets.map((wallet) => [wallet.id, wallet.name]));
  const income = totalWallet(reportEntries, "income");
  const outflow = Math.abs(totalWallet(reportEntries, "expense"));
  const balance = income - outflow;
  const debtChange = reportEntries
    .filter((entry) => (["lend", "split_half", "debt_repayment"] as TransactionType[]).includes(entry.transaction_type))
    .reduce((sum, entry) => sum + entry.debt_impact, 0);
  const categoryMap = new Map<string, number>();

  for (const entry of reportEntries) {
    const spendAmount = categorySpendAmount(entry);
    if (spendAmount == null) continue;
    categoryMap.set(entry.category, (categoryMap.get(entry.category) ?? 0) + spendAmount);
  }

  const lines = [
    csvRow(["รายงาน", reportLabel(period, selectedMonth, selectedYear, monthStartDay)]),
    csvRow(["วันที่สร้างไฟล์", new Date().toLocaleString("th-TH")]),
    csvRow([""]),
    csvRow(["สรุปยอด"]),
    csvRow(["รายการ", "จำนวนเงิน"]),
    csvRow(["รายรับ", income]),
    csvRow(["รายจ่าย", outflow]),
    csvRow(["สุทธิ", balance]),
    csvRow(["ลูกหนี้เปลี่ยนแปลง", debtChange]),
    csvRow(["จำนวนรายการ", reportEntries.length]),
    csvRow([""]),
    csvRow(["สรุปหมวดหมู่รายจ่าย"]),
    csvRow(["หมวดหมู่", "จำนวนเงิน"]),
    ...[...categoryMap.entries()].sort((a, b) => b[1] - a[1]).map(([category, amount]) => csvRow([category, amount])),
    csvRow([""]),
    csvRow(["ลูกหนี้คงค้าง (คนที่ติดเรา)"]),
    csvRow(["ชื่อ", "ยอดค้าง"]),
    ...receivableSummary.map((debtor) => csvRow([debtor.name, debtor.amount])),
    csvRow([""]),
    csvRow(["หนี้ของฉันคงเหลือ (ที่ฉันติด)"]),
    csvRow(["ชื่อ", "ยอดค้าง"]),
    ...payableSummary.map((debtor) => csvRow([debtor.name, debtor.amount])),
    csvRow([""]),
    csvRow(["กระเป๋า/กองเงิน"]),
    csvRow(["ชื่อ", "ประเภท", "ยอดตั้งต้น", "กระเป๋าหลัก"]),
    ...wallets.map((wallet) => csvRow([wallet.name, walletTagLabels[wallet.tag], wallet.balance, wallet.is_default ? "yes" : ""])),
    csvRow([""]),
    csvRow(["รายการละเอียด"]),
    csvRow(["วันที่", "ชื่อรายการ", "หมวดหมู่", "ประเภท", "กระเป๋า", "จำนวน", "ผลต่อกระเป๋า", "ผลต่อลูกหนี้", "ชื่อผู้เกี่ยวข้อง", "หมายเหตุ", "ข้อความต้นทาง"]),
    ...reportEntries.map((entry) =>
      csvRow([
        formatDateTime(entry.occurred_at),
        entry.title,
        entry.category,
        transactionTypeLabels[entry.transaction_type],
        entry.wallet_id ? walletNameById.get(entry.wallet_id) ?? entry.wallet_id : "",
        entry.amount,
        entry.wallet_impact,
        entry.debt_impact,
        entry.debtor_name,
        entry.note ?? "",
        entry.source_text ?? "",
      ]),
    ),
  ];

  return `\uFEFF${lines.join("\r\n")}`;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function calculateImpacts(amount: number, transactionType: TransactionType) {
  if (transactionType === "income") {
    return { wallet_impact: amount, debt_impact: 0, user_share: amount, partner_share: 0 };
  }
  if (transactionType === "lend") {
    return { wallet_impact: -amount, debt_impact: amount, user_share: 0, partner_share: amount };
  }
  if (transactionType === "split_half") {
    return { wallet_impact: -amount, debt_impact: amount / 2, user_share: amount / 2, partner_share: amount / 2 };
  }
  if (transactionType === "debt_repayment") {
    return { wallet_impact: amount, debt_impact: -amount, user_share: 0, partner_share: 0 };
  }
  if (transactionType === "debt_payment") {
    return { wallet_impact: -amount, debt_impact: -amount, user_share: amount, partner_share: 0 };
  }
  if (transactionType === "card_charge") {
    return { wallet_impact: 0, debt_impact: amount, user_share: amount, partner_share: 0 };
  }
  if (transactionType === "transfer") {
    return { wallet_impact: -amount, debt_impact: 0, user_share: 0, partner_share: 0 };
  }
  return { wallet_impact: -amount, debt_impact: 0, user_share: amount, partner_share: 0 };
}

function categorySpendAmount(entry: Entry): number | null {
  if (entry.transaction_type === "transfer") return null;
  if (entry.wallet_impact > 0 && entry.transaction_type !== "card_charge") return null;
  return entry.user_share > 0 ? entry.user_share : null;
}

function entryDisplayImpact(entry: Entry): number {
  return entry.transaction_type === "card_charge" ? -entry.amount : entry.wallet_impact;
}

function normalizeEntry(input: EntryInput, applyDebtorDefault = true): Entry {
  const transaction_type = input.transaction_type ?? (input.type === "income" ? "income" : "personal_expense");
  const amount = toMoneyAmount(input.amount);
  // A transfer's direction (which wallet loses money vs. gains it) can't be
  // derived from amount + type alone the way every other type can — the
  // caller (building one of the two linked legs) must supply the signed
  // wallet_impact explicitly, so it's trusted here instead of recomputed.
  const impacts = transaction_type === "transfer"
    ? { wallet_impact: input.wallet_impact ?? -amount, debt_impact: 0, user_share: 0, partner_share: 0 }
    : calculateImpacts(amount, transaction_type);
  const trimmedDebtorName = input.debtor_name?.trim() ?? "";
  return {
    ...input,
    amount,
    type: transactionKind[transaction_type],
    transaction_type,
    wallet_impact: impacts.wallet_impact,
    debt_impact: impacts.debt_impact,
    user_share: impacts.user_share,
    partner_share: impacts.partner_share,
    debtor_name: trimmedDebtorName || (applyDebtorDefault ? unnamedDebtor : trimmedDebtorName),
    wallet_id: input.wallet_id ?? null,
    note: input.note?.trim() || null,
    transfer_group_id: input.transfer_group_id ?? null,
    transfer_to_wallet_id: input.transfer_to_wallet_id ?? null,
  };
}

// A transfer draft carries one wallet_impact but needs to land as two linked
// rows (one negative leg on the source wallet, one positive on the
// destination) sharing a transfer_group_id — this expands it right before
// saving so both the AI-parsed path and manual entry can share the logic.
function expandTransferDraft(draft: Draft, wallets: Wallet[]): Draft[] {
  if (draft.transaction_type !== "transfer" || !draft.transfer_to_wallet_id) return [draft];

  const sourceWallet = wallets.find((wallet) => wallet.id === draft.wallet_id);
  const destWallet = wallets.find((wallet) => wallet.id === draft.transfer_to_wallet_id);
  const groupId = crypto.randomUUID();
  const title = draft.title.trim();

  const sourceLeg = normalizeEntry({
    id: `${groupId}-out`, title: title || `โอนไป${destWallet?.name ?? "กระเป๋าอื่น"}`, category: "อื่น ๆ",
    amount: draft.amount, transaction_type: "transfer", debtor_name: "", occurred_at: draft.occurred_at,
    wallet_id: draft.wallet_id, wallet_impact: -draft.amount, note: draft.note, transfer_group_id: groupId,
  }, false);
  const destLeg = normalizeEntry({
    id: `${groupId}-in`, title: title || `โอนจาก${sourceWallet?.name ?? "กระเป๋าอื่น"}`, category: "อื่น ๆ",
    amount: draft.amount, transaction_type: "transfer", debtor_name: "", occurred_at: draft.occurred_at,
    wallet_id: draft.transfer_to_wallet_id, wallet_impact: draft.amount, note: draft.note, transfer_group_id: groupId,
  }, false);

  return [sourceLeg, destLeg];
}

function mapTransactionRow(row: {
  id: string;
  title: string;
  category: string;
  amount: number | string;
  kind: string;
  transaction_type: string | null;
  wallet_impact: number | string | null;
  debt_impact: number | string | null;
  user_share: number | string | null;
  partner_share: number | string | null;
  debtor_name: string | null;
  occurred_at: string;
  source_text: string | null;
  wallet_id: string | null;
  note: string | null;
  transfer_group_id?: string | null;
}): Entry {
  return normalizeEntry({
    id: row.id,
    title: row.title,
    category: row.category,
    amount: Number(row.amount),
    type: row.kind as EntryKind,
    transaction_type: (row.transaction_type as TransactionType | null) ?? undefined,
    wallet_impact: row.wallet_impact == null ? undefined : Number(row.wallet_impact),
    debt_impact: row.debt_impact == null ? undefined : Number(row.debt_impact),
    user_share: row.user_share == null ? undefined : Number(row.user_share),
    partner_share: row.partner_share == null ? undefined : Number(row.partner_share),
    debtor_name: row.debtor_name,
    occurred_at: row.occurred_at,
    source_text: row.source_text,
    wallet_id: row.wallet_id,
    note: row.note,
    transfer_group_id: row.transfer_group_id ?? null,
  });
}

function defaultWalletId(wallets: Wallet[]) {
  return wallets.find((wallet) => wallet.is_default)?.id ?? wallets.find((wallet) => wallet.tag === "cash")?.id ?? wallets[0]?.id ?? null;
}

function totalWallet(entries: Entry[], direction: EntryKind) {
  return entries
    .filter((entry) => entry.transaction_type !== "transfer" && (direction === "income" ? entry.wallet_impact > 0 : entry.wallet_impact < 0))
    .reduce((sum, entry) => sum + entry.wallet_impact, 0);
}

function filterEntries(entries: Entry[], filters: HistoryFilters) {
  const query = filters.query.trim().toLowerCase();
  const minAmount = filters.minAmount === "" ? null : toFiniteNumber(filters.minAmount, NaN);
  const maxAmount = filters.maxAmount === "" ? null : toFiniteNumber(filters.maxAmount, NaN);

  return entries.filter((entry) => {
    const amount = Math.abs(entry.wallet_impact);
    if (query && !`${entry.title} ${entry.category} ${entry.debtor_name} ${entry.note ?? ""}`.toLowerCase().includes(query)) return false;
    if (filters.category && entry.category !== filters.category) return false;
    if (filters.type !== "all" && entry.transaction_type !== filters.type) return false;
    if (minAmount !== null && Number.isFinite(minAmount) && amount < minAmount) return false;
    if (maxAmount !== null && Number.isFinite(maxAmount) && amount > maxAmount) return false;
    return true;
  });
}

function shiftMonthKey(key: string, delta: number) {
  const [year, month] = key.split("-").map(Number);
  return monthKey(new Date(year, month - 1 + delta, 1));
}

function defaultDayForCycle(key: string, startDay: number) {
  const [year, month] = key.split("-").map(Number);
  const today = new Date();
  const range = cycleBounds(key, startDay);
  const day = Math.min(today.getDate(), new Date(year, month, 0).getDate());
  const preferred = new Date(year, month - 1, day);
  if (preferred < range.start) return range.start.toDateString();
  if (preferred >= range.end) return new Date(range.end.getTime() - 1).toDateString();
  return preferred.toDateString();
}

function buildMonthlyTrend(entries: Entry[], selectedMonth: string, monthStartDay: number, months = 6) {
  return Array.from({ length: months }, (_, index) => {
    const key = shiftMonthKey(selectedMonth, index - months + 1);
    const range = cycleBounds(key, monthStartDay);
    const monthEntries = entriesInRange(entries, range.start, range.end);
    const income = totalWallet(monthEntries, "income");
    const outflow = Math.abs(totalWallet(monthEntries, "expense"));
    return { key, label: new Date(`${key}-01T00:00:00`).toLocaleDateString("th-TH", { month: "short" }), income, outflow };
  });
}

function matchesAnyKeyword(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function transferWalletTag(entry: Entry, wallets: Wallet[]): Exclude<WalletTag, "cash"> | null {
  if (entry.wallet_impact >= 0 || entry.transaction_type !== "personal_expense") return null;

  const text = `${entry.title} ${entry.category} ${entry.source_text ?? ""}`.trim().toLowerCase();
  if (!text) return null;

  for (const wallet of wallets) {
    if (wallet.tag === "cash" || wallet.tag === "other") continue;
    const walletName = wallet.name.trim().toLowerCase();
    const walletLabel = walletTagLabels[wallet.tag].toLowerCase();
    if ((walletName && text.includes(walletName)) || (walletLabel && text.includes(walletLabel))) return wallet.tag;
  }

  if (matchesAnyKeyword(text, ["\u0e2d\u0e2d\u0e21", "\u0e40\u0e01\u0e47\u0e1a\u0e40\u0e07\u0e34\u0e19", "\u0e40\u0e07\u0e34\u0e19\u0e40\u0e01\u0e47\u0e1a"])) return "savings";
  if (matchesAnyKeyword(text, ["\u0e25\u0e07\u0e17\u0e38\u0e19", "\u0e01\u0e2d\u0e07\u0e17\u0e38\u0e19", "\u0e2b\u0e38\u0e49\u0e19", "\u0e04\u0e23\u0e34\u0e1b\u0e42\u0e15"])) return "investment";

  return null;
}

function buildWalletLedger(wallets: Wallet[], entries: Entry[]) {
  const totals: Record<WalletTag, number> = { cash: 0, savings: 0, investment: 0, other: 0 };
  const walletDeltas = new Map<string, number>();
  const fallbackWalletId = defaultWalletId(wallets);

  for (const wallet of wallets) {
    totals[wallet.tag] += wallet.balance;
    walletDeltas.set(wallet.id, 0);
  }

  for (const entry of entries) {
    const transferTag = transferWalletTag(entry, wallets);
    const walletId = entry.wallet_id ?? (transferTag ? wallets.find((wallet) => wallet.tag === transferTag)?.id : fallbackWalletId);
    if (walletId) walletDeltas.set(walletId, (walletDeltas.get(walletId) ?? 0) + entry.wallet_impact);
  }

  const displayWallets = wallets.map((wallet) => {
      const transaction_delta = walletDeltas.get(wallet.id) ?? 0;
      return {
        ...wallet,
        transaction_delta,
        display_balance: wallet.balance + transaction_delta,
      };
    });

  const nextTotals: Record<WalletTag, number> = { cash: 0, savings: 0, investment: 0, other: 0 };
  for (const wallet of displayWallets) nextTotals[wallet.tag] += wallet.display_balance;

  return { totals: nextTotals, wallets: displayWallets };
}

function buildDebtSummary(debtors: Debtor[], entries: Entry[], kind: DebtorKind, types: TransactionType[]) {
  const map = new Map<string, number>();
  for (const debtor of debtors) {
    if (debtor.kind !== kind) continue;
    if (debtor.opening_balance) map.set(debtor.name, (map.get(debtor.name) ?? 0) + debtor.opening_balance);
  }
  for (const entry of entries) {
    if (!types.includes(entry.transaction_type)) continue;
    map.set(entry.debtor_name, (map.get(entry.debtor_name) ?? 0) + entry.debt_impact);
  }
  return [...map.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .filter((item) => item.amount > 0.005)
    .sort((a, b) => b.amount - a.amount);
}

function installmentsRemaining(debtor: Debtor, outstanding: number): number | null {
  if (!debtor.monthly_installment) return null;
  if (debtor.total_installments != null) {
    return Math.max(0, debtor.total_installments - (debtor.paid_installments ?? 0));
  }
  if (outstanding <= 0.005) return null;
  return Math.ceil(outstanding / debtor.monthly_installment);
}

function installmentStatusText(debtor: Debtor, outstanding: number): string {
  if (!debtor.monthly_installment) return "";
  const remaining = installmentsRemaining(debtor, outstanding);
  if (debtor.total_installments != null) {
    const paid = debtor.paid_installments ?? 0;
    return ` · จ่ายแล้ว ${paid}/${debtor.total_installments} งวด${remaining != null ? ` (เหลือ ${remaining} งวด)` : ""}`;
  }
  return remaining !== null && outstanding > 0.005 ? ` · เหลืออีกประมาณ ${remaining} เดือน` : "";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านไฟล์รูปไม่สำเร็จ"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function dataUrlBytes(value: string) {
  const payload = value.split(",")[1] ?? "";
  return Math.ceil((payload.length * 3) / 4);
}

function loadImage(value: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("อ่านรูปไม่สำเร็จ"));
    image.src = value;
  });
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function compressProfileImage(file: File) {
  if (file.size > profileImageMaxInputBytes) {
    throw new Error("รูปใหญ่เกินไป กรุณาเลือกรูปไม่เกิน 10MB");
  }

  const source = await fileToDataUrl(file);
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("เบราว์เซอร์ไม่รองรับการย่อรูป");

  canvas.width = profileImageSize;
  canvas.height = profileImageSize;

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - sourceSize) / 2;
  const sourceY = (image.naturalHeight - sourceSize) / 2;

  context.clearRect(0, 0, profileImageSize, profileImageSize);
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, profileImageSize, profileImageSize);

  const webpPreview = canvas.toDataURL("image/webp", 0.86);
  const mimeType = webpPreview.startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
  const qualities = [0.9, 0.82, 0.74, 0.66, 0.58];

  for (const quality of qualities) {
    const compressed = canvas.toDataURL(mimeType, quality);
    if (dataUrlBytes(compressed) <= profileImageMaxStoredBytes) return compressed;
  }

  throw new Error("ย่อรูปแล้วยังใหญ่เกินไป ลองเลือกรูปอื่นที่ไม่ซับซ้อนมากครับ");
}

// Slips need their full rectangle (unlike a cropped-to-square avatar) and
// legible text, so this scales proportionally instead of cropping, capping
// the longest edge rather than forcing a fixed square.
async function compressSlipImage(file: File): Promise<SlipImage> {
  if (file.size > slipImageMaxInputBytes) {
    throw new Error("รูปใหญ่เกินไป กรุณาเลือกรูปไม่เกิน 15MB");
  }

  const source = await fileToDataUrl(file);
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("เบราว์เซอร์ไม่รองรับการย่อรูป");

  const scale = Math.min(1, slipImageMaxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const qualities = [0.85, 0.75, 0.65, 0.55, 0.45];
  for (const quality of qualities) {
    const compressed = canvas.toDataURL("image/jpeg", quality);
    if (dataUrlBytes(compressed) <= slipImageMaxStoredBytes) {
      const [, data = ""] = compressed.split(",");
      return {
        id: `${Date.now()}-${file.name}`,
        name: file.name,
        mimeType: "image/jpeg",
        data,
        preview: compressed,
      };
    }
  }

  throw new Error("ย่อรูปแล้วยังใหญ่เกินไป ลองเลือกรูปอื่นที่ชัดเจนกว่านี้");
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [tab, setTab] = useState<Tab>("home");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [text, setText] = useState("");
  const [slipImages, setSlipImages] = useState<SlipImage[]>([]);
  const [entryDate, setEntryDate] = useState(todayDateInput);
  const [addMode, setAddMode] = useState<"ai" | "manual">("ai");
  const [quickAddPreset, setQuickAddPreset] = useState<QuickShortcut | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [debtorSheetMode, setDebtorSheetMode] = useState<"create" | "edit" | null>(null);
  const [editingDebtor, setEditingDebtor] = useState<Debtor | null>(null);
  const [selectedDebtor, setSelectedDebtor] = useState<Debtor | null>(null);
  const [debtorKindTab, setDebtorKindTab] = useState<DebtorKind>("lend");
  const [walletSheetMode, setWalletSheetMode] = useState<"create" | "edit" | null>(null);
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);
  const [recurringSheetMode, setRecurringSheetMode] = useState<"create" | "edit" | null>(null);
  const [editingRecurringExpense, setEditingRecurringExpense] = useState<RecurringExpense | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date().toDateString());
  const [historyFilters, setHistoryFilters] = useState<HistoryFilters>({ query: "", category: "", type: "all", minAmount: "", maxAmount: "" });
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [goals, setGoals] = useState<MoneyGoal[]>([]);
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);
  const [budgetSheetOpen, setBudgetSheetOpen] = useState(false);
  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [askAiOpen, setAskAiOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [closingToastIds, setClosingToastIds] = useState<number[]>([]);
  const [savePulse, setSavePulse] = useState(0);
  const [theme, setTheme] = useState<Theme>("light");
  const [pinMode, setPinMode] = useState<PinMode>("checking");
  const [pinError, setPinError] = useState("");
  const [pinSheetOpen, setPinSheetOpen] = useState(false);
  const backgroundedAtRef = useRef<number | null>(null);
  const authUserIdRef = useRef<string | null | undefined>(undefined);
  const cycleMonthSettingRef = useRef<string | null>(null);
  const displayName = profile?.nickname?.trim() || user?.user_metadata?.full_name || user?.user_metadata?.name || "เงินของฉัน";
  const displayIcon = profile?.app_icon?.trim() || user?.email?.[0]?.toUpperCase() || "฿";
  const displayIconImage = profile?.app_icon_image?.trim() || "";
  const monthStartDay = profile?.month_start_day || 1;

  useEffect(() => {
    const settingKey = profile ? `${profile.user_id}:${monthStartDay}` : null;
    if (!settingKey || cycleMonthSettingRef.current === settingKey) return;
    cycleMonthSettingRef.current = settingKey;
    setSelectedMonth(currentCycleMonthKey(monthStartDay));
    setSelectedDay(new Date().toDateString());
  }, [profile, monthStartDay]);

  const notify = useCallback((toast: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((items) => [...items.slice(-2), { id, ...toast }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setClosingToastIds((current) => (current.includes(id) ? current : [...current, id]));
    window.setTimeout(() => {
      setToasts((items) => items.filter((toast) => toast.id !== id));
      setClosingToastIds((ids) => ids.filter((closingId) => closingId !== id));
    }, 200);
  }, []);

  const requestConfirm = useCallback((dialog: Omit<ConfirmDialogState, "resolve">) => (
    new Promise<boolean>((resolve) => setConfirmDialog({ ...dialog, resolve }))
  ), []);

  const closeConfirmDialog = useCallback((confirmed: boolean) => {
    setConfirmDialog((dialog) => {
      dialog?.resolve(confirmed);
      return null;
    });
  }, []);

  useEffect(() => {
    const next = toasts.find((toast) => !closingToastIds.includes(toast.id));
    if (!next) return;
    const timer = window.setTimeout(() => dismissToast(next.id), 3200);
    return () => window.clearTimeout(timer);
  }, [toasts, closingToastIds, dismissToast]);


  const themeLoadedRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem("money-ai-theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
      themeLoadedRef.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (themeLoadedRef.current) window.localStorage.setItem("money-ai-theme", theme);
  }, [theme]);

  const loadEntries = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("transactions")
      .select("id,title,category,amount,kind,transaction_type,wallet_impact,debt_impact,user_share,partner_share,debtor_name,occurred_at,source_text,wallet_id,note,transfer_group_id")
      .order("occurred_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    setEntries((data ?? []).map(mapTransactionRow));
  }, []);

  const loadProfile = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("user_id,nickname,app_icon,app_icon_image,month_start_day,pin_hash,pin_salt,pin_failed_attempts,pin_blocked_until,webauthn_credential_id,webauthn_enabled")
      .maybeSingle();
    if (error) {
      setError(error.message);
      return null;
    }
    const nextProfile = data
      ? {
          ...data,
          month_start_day: clampInteger(data.month_start_day, 1, 28, 1),
          pin_failed_attempts: clampInteger(data.pin_failed_attempts, 0, pinMaxAttempts, 0),
        } as Profile
      : null;
    setProfile(nextProfile);
    return nextProfile;
  }, []);

  const loadDebtors = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("debtors")
      .select("id,user_id,name,note,opening_balance,kind,monthly_installment,total_installments,paid_installments,credit_limit,icon,icon_color")
      .order("name", { ascending: true });
    if (error) {
      setError(error.message);
      return;
    }
    setDebtors((data ?? []).map((row) => ({
      ...row,
      opening_balance: toMoneyAmount(row.opening_balance),
      monthly_installment: row.monthly_installment == null ? null : Number(row.monthly_installment),
      total_installments: row.total_installments == null ? null : Number(row.total_installments),
      paid_installments: row.paid_installments == null ? null : Number(row.paid_installments),
      credit_limit: row.credit_limit == null ? null : Number(row.credit_limit),
    })) as Debtor[]);
  }, []);

  const loadWallets = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("wallets")
      .select("id,user_id,name,tag,balance,icon,icon_color,is_default")
      .order("created_at", { ascending: true });
    if (error) {
      setError(error.message);
      return;
    }
    setWallets((data ?? []).map((row) => ({ ...row, balance: toFiniteNumber(row.balance), is_default: !!row.is_default })) as Wallet[]);
  }, []);

  const loadRecurringExpenses = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("recurring_expenses")
      .select("id,user_id,name,amount,billing_day,icon,icon_color")
      .order("billing_day", { ascending: true });
    if (error) {
      setError(error.message);
      return;
    }
    setRecurringExpenses((data ?? []).map((row) => ({ ...row, amount: toMoneyAmount(row.amount), billing_day: normalizeBillingDay(row.billing_day) })) as RecurringExpense[]);
  }, []);

  const loadUserData = useCallback(async (userId: string) => {
    setDataLoading(true);
    setError("");
    try {
      await Promise.all([loadEntries(), loadDebtors(), loadWallets(), loadRecurringExpenses()]);
      setBudgets(loadBudgets(userId));
      setGoals(loadGoals(userId));
    } finally {
      setDataLoading(false);
    }
  }, [loadDebtors, loadEntries, loadWallets, loadRecurringExpenses]);

  const clearPrivateState = useCallback(() => {
    setEntries([]);
    setDebtors([]);
    setWallets([]);
    setRecurringExpenses([]);
    setBudgets({});
    setGoals([]);
    setDrafts([]);
    setText("");
    setSlipImages([]);
    setEditing(null);
    setDataLoading(false);
  }, []);

  const preparePinGate = useCallback(async (userId: string) => {
    setPinMode("checking");
    setPinError("");
    clearPrivateState();
    const nextProfile = await loadProfile();
    if (nextProfile?.pin_hash && nextProfile.pin_salt) {
      setPinMode("locked");
    } else {
      setPinMode("unlocked");
      await loadUserData(userId);
    }
  }, [clearPrivateState, loadProfile, loadUserData]);

  const applyAuthUser = useCallback((nextUser: User | null) => {
    setUser(nextUser);
    const nextId = nextUser?.id ?? null;
    // supabase-js re-fires onAuthStateChange for the same signed-in user on
    // events like a background token refresh, or when the tab regains focus
    // after being briefly backgrounded — not just on a real sign-in/sign-out.
    // Without this guard, switching apps for even a few seconds would replay
    // the PIN gate and wipe in-progress typing every single time.
    if (authUserIdRef.current === nextId) return;
    authUserIdRef.current = nextId;
    if (nextUser) {
      void preparePinGate(nextUser.id);
    } else {
      setProfile(null);
      setPinMode("checking");
      setPinError("");
      clearPrivateState();
    }
  }, [clearPrivateState, preparePinGate]);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      setReady(true);
      applyAuthUser(data.user);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      applyAuthUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, [applyAuthUser]);

  useEffect(() => {
    if (!ready) return;
    const startedAt = (window as unknown as { __splashStartedAt?: number }).__splashStartedAt ?? Date.now();
    const remaining = Math.max(0, 2400 - (Date.now() - startedAt));
    const timer = setTimeout(() => {
      const el = document.getElementById("app-splash");
      if (!el) return;
      el.classList.add("app-splash-fade");
      setTimeout(() => { el.style.display = "none"; }, 500);
    }, remaining);
    return () => clearTimeout(timer);
  }, [ready]);

  const overlayOpen =
    menuOpen ||
    profileSheetOpen ||
    !!editing ||
    !!debtorSheetMode ||
    !!walletSheetMode ||
    !!recurringSheetMode ||
    budgetSheetOpen ||
    reportSheetOpen ||
    csvImportOpen ||
    askAiOpen ||
    goalSheetOpen ||
    recapOpen ||
    pinSheetOpen ||
    logoutOpen;
  useEffect(() => {
    if (!overlayOpen) return;
    const scrollY = window.scrollY;
    const { body } = document;
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    return () => {
      body.style.position = "";
      body.style.top = "";
      body.style.width = "";
      window.scrollTo(0, scrollY);
    };
  }, [overlayOpen]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        backgroundedAtRef.current = Date.now();
        return;
      }
      const backgroundedAt = backgroundedAtRef.current;
      backgroundedAtRef.current = null;
      if (!backgroundedAt || pinMode !== "unlocked" || !profile?.pin_hash) return;
      if (Date.now() - backgroundedAt < pinBackgroundLockMs) return;
      setMenuOpen(false);
      setProfileSheetOpen(false);
      setBudgetSheetOpen(false);
      setReportSheetOpen(false);
      setRecapOpen(false);
      setDebtorSheetMode(null);
      setWalletSheetMode(null);
      setRecurringSheetMode(null);
      setPinSheetOpen(false);
      setConfirmDialog(null);
      setPinError("");
      setPinMode("locked");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [pinMode, profile?.pin_hash]);

  const walletLedger = useMemo(() => buildWalletLedger(wallets, entries), [wallets, entries]);
  const walletTotals = walletLedger.totals;
  const displayWallets = walletLedger.wallets;
  const walletBalanceTotal = useMemo(
    () => Object.values(walletTotals).reduce((sum, amount) => sum + amount, 0),
    [walletTotals],
  );

  const mainWallet = useMemo(
    () => walletTotals.cash,
    [walletTotals.cash],
  );
  const streak = useMemo(() => computeStreak(entries), [entries]);
  const quickShortcuts = useMemo(() => deriveQuickShortcuts(entries), [entries]);
  const receivableSummary = useMemo(
    () => buildDebtSummary(debtors, entries, "lend", ["lend", "split_half", "debt_repayment"]),
    [debtors, entries],
  );
  const payableSummary = useMemo(
    () => buildDebtSummary(debtors, entries, "own", ["debt_payment", "card_charge"]),
    [debtors, entries],
  );

  const dueSoonRecurring = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return recurringExpenses
      .map((item) => {
        const daysInThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        let billingDate = new Date(now.getFullYear(), now.getMonth(), Math.min(item.billing_day, daysInThisMonth));
        if (billingDate < startOfToday) {
          const daysInNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate();
          billingDate = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(item.billing_day, daysInNextMonth));
        }
        const daysUntil = Math.round((billingDate.getTime() - startOfToday.getTime()) / 86400000);
        return { item, billingDate, daysUntil };
      })
      .filter(({ daysUntil }) => daysUntil >= 0 && daysUntil <= 3)
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [recurringExpenses]);

  useEffect(() => {
    if (!user || !dueSoonRecurring.length) return;
    const key = `money-ai-recurring-reminded:${user.id}:${todayDateInput()}`;
    if (window.localStorage.getItem(key)) return;
    const timer = window.setTimeout(() => {
      const detail = dueSoonRecurring
        .map(({ item, billingDate }) => `${item.name} ${moneySign}${formatMoney(item.amount)} (${billingDate.getDate()}/${billingDate.getMonth() + 1})`)
        .join(", ");
      notify({ tone: "info", title: "ใกล้ถึงกำหนดตัดเงิน", detail });
      window.localStorage.setItem(key, "1");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dueSoonRecurring, user, notify]);

  const cycleRange = useMemo(() => cycleBounds(selectedMonth, monthStartDay), [selectedMonth, monthStartDay]);
  const defaultHistoryDay = useMemo(() => defaultDayForCycle(selectedMonth, monthStartDay), [selectedMonth, monthStartDay]);
  const selectHistoryMonth = useCallback((value: string) => {
    setSelectedMonth(value);
    setSelectedDay(defaultDayForCycle(value, monthStartDay));
  }, [monthStartDay]);
  const monthlyEntries = useMemo(() => {
    const { start, end } = cycleRange;
    return entries.filter((entry) => {
      const occurred = new Date(entry.occurred_at);
      return occurred >= start && occurred < end;
    });
  }, [entries, cycleRange]);
  const filteredMonthlyEntries = useMemo(() => filterEntries(monthlyEntries, historyFilters), [monthlyEntries, historyFilters]);
  const monthlyIncome = useMemo(() => totalWallet(monthlyEntries, "income"), [monthlyEntries]);
  const monthlyOutflow = useMemo(() => Math.abs(totalWallet(monthlyEntries, "expense")), [monthlyEntries]);
  const monthlyDebtChange = useMemo(
    () =>
      monthlyEntries
        .filter((entry) => (["lend", "split_half", "debt_repayment"] as TransactionType[]).includes(entry.transaction_type))
        .reduce((sum, entry) => sum + entry.debt_impact, 0),
    [monthlyEntries],
  );
  const monthlyBalance = monthlyIncome - monthlyOutflow;
  const receivableTotal = receivableSummary.reduce((sum, item) => sum + item.amount, 0);
  const payableTotal = payableSummary.reduce((sum, item) => sum + item.amount, 0);
  const netWorth = walletBalanceTotal + receivableTotal - payableTotal;
  const savingsRate = monthlyIncome > 0 ? (monthlyBalance / monthlyIncome) * 100 : 0;
  const walletInsight = useMemo(() => buildWalletInsight(mainWallet, monthlyOutflow, cycleRange.end), [mainWallet, monthlyOutflow, cycleRange.end]);
  const cashFlowTrend = useMemo(() => lastSevenDayCashFlow(entries, new Date()), [entries]);
  const monthlyTrend = useMemo(() => buildMonthlyTrend(entries, selectedMonth, monthStartDay, 6), [entries, selectedMonth, monthStartDay]);
  const aiSuggestions = useMemo<AiSuggestion[]>(() => {
    const fromHistory = quickShortcuts.map((shortcut) => ({
      label: shortcut.title,
      detail: `${moneySign}${formatMoney(shortcut.amount)}`,
      text: `${shortcut.title} ${shortcut.amount}`,
      shortcut,
    }));
    const defaults = [
      { label: "อาหารกลางวัน", detail: "120", text: "อาหารกลางวัน 120 บาท" },
      { label: "กาแฟ", detail: "65", text: "กาแฟ 65 บาท" },
      { label: "เพื่อนคืนเงิน", detail: "500", text: "เพื่อนเอโอนคืน 500 บาท" },
      { label: "ออกให้ก่อน", detail: "300", text: "ออกให้เพื่อนก่อน 300 บาท" },
    ];
    return [...fromHistory, ...defaults].slice(0, 4);
  }, [quickShortcuts]);
  const activeDay = selectedDay;
  const dayEntries = useMemo(
    () => activeDay ? filteredMonthlyEntries.filter((entry) => new Date(entry.occurred_at).toDateString() === activeDay) : filteredMonthlyEntries,
    [activeDay, filteredMonthlyEntries],
  );

  const categorySummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of monthlyEntries) {
      const spendAmount = categorySpendAmount(entry);
      if (spendAmount == null) continue;
      map.set(entry.category, (map.get(entry.category) ?? 0) + spendAmount);
    }
    for (const category of Object.keys(budgets)) {
      if (!map.has(category)) map.set(category, 0);
    }
    const sorted = [...map.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
    const shown = sorted.slice(0, 4);
    const shownNames = new Set(shown.map((item) => item.category));
    const missingBudgeted = sorted.filter((item) => !shownNames.has(item.category) && budgets[item.category] > 0);
    return [...shown, ...missingBudgeted];
  }, [monthlyEntries, budgets]);
  const monthlyLentOut = useMemo(
    () => monthlyEntries.reduce((sum, entry) => {
      if (entry.transaction_type === "transfer" || entry.wallet_impact >= 0) return sum;
      return sum + (Math.abs(entry.wallet_impact) - (categorySpendAmount(entry) ?? 0));
    }, 0),
    [monthlyEntries],
  );
  const incomeSummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of monthlyEntries) {
      if (entry.transaction_type === "transfer" || entry.wallet_impact <= 0) continue;
      map.set(entry.category, (map.get(entry.category) ?? 0) + entry.wallet_impact);
    }
    return [...map.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount).slice(0, 4);
  }, [monthlyEntries]);
  const budgetGlance = useMemo(() => {
    const budgeted = Object.entries(budgets)
      .map(([category, budget]) => {
        const spent = categorySummary.find((item) => item.category === category)?.amount ?? 0;
        return { category, budget, spent, percent: budget > 0 ? (spent / budget) * 100 : 0 };
      })
      .filter((item) => item.budget > 0)
      .sort((a, b) => b.percent - a.percent);
    return {
      items: budgeted.slice(0, 3),
      totalBudget: budgeted.reduce((sum, item) => sum + item.budget, 0),
      totalSpent: budgeted.reduce((sum, item) => sum + item.spent, 0),
    };
  }, [budgets, categorySummary]);
  const aiFinanceContext = useMemo<AiFinanceContext>(() => ({
    periodLabel: reportLabel("month", selectedMonth, Number(selectedMonth.slice(0, 4)), monthStartDay),
    totals: {
      income: monthlyIncome,
      outflow: monthlyOutflow,
      balance: monthlyBalance,
      cashAvailable: mainWallet,
      walletBalance: walletBalanceTotal,
      netWorth,
    },
    walletBalances: displayWallets.map((wallet) => ({ name: wallet.name, balance: wallet.display_balance })),
    categories: categorySummary.filter((item) => item.amount > 0),
    recurringTotal: recurringExpenses.reduce((sum, item) => sum + item.amount, 0),
    receivableTotal,
    payableTotal,
    transactionCount: monthlyEntries.length,
    transactions: monthlyEntries.slice(0, 120).map(({ title, category, amount, transaction_type, wallet_impact, occurred_at }) => ({ title, category, amount, transaction_type, wallet_impact, occurred_at })),
  }), [selectedMonth, monthStartDay, monthlyIncome, monthlyOutflow, monthlyBalance, mainWallet, walletBalanceTotal, netWorth, displayWallets, categorySummary, recurringExpenses, receivableTotal, payableTotal, monthlyEntries]);

  async function addSlipFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");

    const nextFiles = [...files].slice(0, 3 - slipImages.length);
    if (nextFiles.some((file) => !file.type.startsWith("image/"))) {
      setError("รองรับเฉพาะไฟล์รูปภาพเท่านั้น");
      return;
    }

    try {
      const images = await Promise.all(nextFiles.map(compressSlipImage));
      setSlipImages((current) => [...current, ...images].slice(0, 3));
      notify({ tone: "success", title: "แนบสลิปแล้ว", detail: `${images.length} รูปพร้อมให้ AI อ่าน` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "แนบรูปไม่สำเร็จ");
      notify({ tone: "error", title: "แนบรูปไม่สำเร็จ", detail: e instanceof Error ? e.message : undefined });
    }
  }

  const openAddTab = useCallback((mode: "ai" | "manual" = "ai", shortcut?: QuickShortcut) => {
    setEntryDate(todayDateInput());
    setAddMode(mode);
    setQuickAddPreset(shortcut ?? null);
    setTab("add");
  }, []);

  const addWithAiAction = useMemo(() => ({ label: "จดด้วย AI", onClick: openAddTab }), [openAddTab]);

  function retrySync() {
    setError("");
    if (user) void loadUserData(user.id);
  }

  function persistGoals(next: MoneyGoal[]) {
    setGoals(next);
    if (user) saveGoals(user.id, next);
  }

  function createGoal(input: Omit<MoneyGoal, "id">) {
    persistGoals([{ ...input, id: crypto.randomUUID() }, ...goals]);
    setGoalSheetOpen(false);
    notify({ tone: "success", title: "สร้างเป้าหมายแล้ว", detail: input.name });
  }

  async function removeGoal(goal: MoneyGoal) {
    const confirmed = await requestConfirm({ title: "ลบเป้าหมายนี้?", detail: goal.name, confirmLabel: "ลบเป้าหมาย", tone: "danger" });
    if (confirmed) persistGoals(goals.filter((item) => item.id !== goal.id));
  }

  function addQuickShortcut(shortcut: { title: string; category: string; transaction_type: TransactionType; amount: number }) {
    setDrafts((items) => [
      ...items,
      normalizeEntry({
        id: `${Date.now()}-quick`,
        title: shortcut.title,
        category: shortcut.category,
        amount: shortcut.amount,
        transaction_type: shortcut.transaction_type,
        occurred_at: fromDateInput(entryDate),
        source_text: "ทางลัด",
      }, false),
    ]);
    notify({ tone: "info", title: "เพิ่มรายการลัดแล้ว", detail: shortcut.title });
  }

  function applySuggestion(textValue: string, shortcut?: { title: string; category: string; transaction_type: TransactionType; amount: number }) {
    if (shortcut) {
      addQuickShortcut(shortcut);
      return;
    }
    setText((current) => (current.trim() ? `${current.trim()}\n${textValue}` : textValue));
  }

  async function analyze() {
    if (!text.trim() && !slipImages.length) {
      setError("กรุณาพิมพ์ข้อความหรือแนบรูปสลิปก่อน");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          text,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          defaultDate: entryDate,
          images: slipImages.map(({ data, mimeType, name }) => ({ data, mimeType, name })),
          debtors: debtors.map((debtor) => ({ name: debtor.name, kind: debtor.kind })),
          wallets: wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, tag: wallet.tag, is_default: wallet.is_default })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      const source = [text.trim(), slipImages.length ? `แนบรูปสลิป ${slipImages.length} รูป` : ""].filter(Boolean).join(" | ");
      setDrafts(
        data.items.map((item: { title: string; category: string; amount: number; transaction_type: TransactionType; debtor_name?: string; date: string; note?: string; wallet_id?: string | null; transfer_to_wallet_id?: string | null }, index: number) =>
          {
            const aiWalletId = item.wallet_id && wallets.some((wallet) => wallet.id === item.wallet_id) ? item.wallet_id : null;
            const aiDestWalletId = item.transfer_to_wallet_id && wallets.some((wallet) => wallet.id === item.transfer_to_wallet_id) ? item.transfer_to_wallet_id : null;
            return normalizeEntry({
            id: `${Date.now()}-${index}`,
            title: item.title,
            category: item.category,
            amount: item.amount,
            transaction_type: item.transaction_type,
            debtor_name: item.debtor_name,
            occurred_at: fromDateInput(item.date),
            source_text: source,
            wallet_id: aiWalletId || defaultWalletId(wallets),
            note: item.note,
            transfer_to_wallet_id: aiDestWalletId,
            }, false);
          },
        ),
      );
      notify({ tone: "success", title: "AI แยกรายการแล้ว", detail: `พบ ${data.items.length} รายการให้ตรวจสอบ` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      notify({ tone: "error", title: "AI ยังวิเคราะห์ไม่ได้", detail: e instanceof Error ? e.message : undefined });
    }

    setBusy(false);
  }

  async function saveEntries(items: Draft[]) {
    if (!supabase || !user || !items.length) return;

    const confirmed = await requestConfirm({
      title: "ยืนยันการบันทึก",
      detail: `กำลังจะบันทึก ${items.length} รายการ รวม ${moneySign}${formatMoney(items.reduce((sum, item) => sum + item.amount, 0))}`,
      confirmLabel: "บันทึกเลย",
      tone: "default",
    });
    if (!confirmed) return;

    setBusy(true);
    setError("");
    const normalizedItems = items
      .flatMap((item) => expandTransferDraft(item, wallets))
      .map((item) => normalizeEntry(item));

    const payload = normalizedItems.map((normalized) => ({
      user_id: user.id,
      title: normalized.title.trim(),
      category: normalized.category,
      amount: normalized.amount,
      kind: normalized.type,
      transaction_type: normalized.transaction_type,
      debtor_name: normalized.debtor_name,
      wallet_impact: normalized.wallet_impact,
      debt_impact: normalized.debt_impact,
      user_share: normalized.user_share,
      partner_share: normalized.partner_share,
      occurred_at: normalized.occurred_at,
      source_text: normalized.source_text,
      wallet_id: normalized.wallet_id ?? defaultWalletId(wallets),
      note: normalized.note,
      transfer_group_id: normalized.transfer_group_id,
    }));

    const { data, error } = await supabase
      .from("transactions")
      .insert(payload)
      .select("id,title,category,amount,kind,transaction_type,wallet_impact,debt_impact,user_share,partner_share,debtor_name,occurred_at,source_text,wallet_id,note,transfer_group_id");

    if (error) {
      setError(error.message);
    } else {
      await createMissingDebtors(normalizedItems);
      const inserted = (data ?? []).map(mapTransactionRow);
      setEntries((current) => [...inserted, ...current].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)));
      setDrafts([]);
      setText("");
      setSlipImages([]);
      setTab("home");
      setSavePulse(normalizedItems.length);
      notify({ tone: "success", title: "บันทึกรายการแล้ว", detail: `${normalizedItems.length} รายการถูกซิงค์เรียบร้อย` });
    }

    setBusy(false);
  }

  async function importEntries(rows: CsvImportRow[]) {
    if (!supabase || !user || !rows.length) return false;
    setBusy(true);
    setError("");
    const normalized = rows.map((row, index) => normalizeEntry({
      id: `csv-${Date.now()}-${index}`,
      title: row.title,
      category: categories.includes(row.category) ? row.category : "อื่น ๆ",
      amount: toMoneyAmount(row.amount),
      transaction_type: transactionTypes.includes(row.transaction_type) ? row.transaction_type : "personal_expense",
      debtor_name: row.debtor_name,
      occurred_at: fromDateInput(row.occurred_at || todayDateInput()),
      wallet_id: wallets.some((wallet) => wallet.id === row.wallet_id) ? row.wallet_id : defaultWalletId(wallets),
      note: row.note,
      source_text: "CSV import",
    }, false));
    const { data, error: insertError } = await supabase.from("transactions").insert(normalized.map((item) => ({
      user_id: user.id, title: item.title.trim(), category: item.category, amount: item.amount, kind: item.type,
      transaction_type: item.transaction_type, debtor_name: item.debtor_name, wallet_impact: item.wallet_impact,
      debt_impact: item.debt_impact, user_share: item.user_share, partner_share: item.partner_share,
      occurred_at: item.occurred_at, source_text: item.source_text, wallet_id: item.wallet_id, note: item.note,
    }))).select("id,title,category,amount,kind,transaction_type,wallet_impact,debt_impact,user_share,partner_share,debtor_name,occurred_at,source_text,wallet_id,note,transfer_group_id");
    if (insertError) { setError(insertError.message); setBusy(false); return false; }
    setEntries((current) => [...(data ?? []).map(mapTransactionRow), ...current].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)));
    setBusy(false);
    setCsvImportOpen(false);
    notify({ tone: "success", title: "นำเข้า CSV แล้ว", detail: `${normalized.length} รายการ` });
    return true;
  }

  async function createMissingDebtors(items: Entry[]) {
    if (!supabase || !user) return;
    const known = new Set(debtors.map((debtor) => debtor.name.trim().toLowerCase()));
    const debtTypes: TransactionType[] = ["lend", "split_half", "debt_repayment", "debt_payment", "card_charge"];
    const nameKinds = new Map<string, DebtorKind>();
    for (const item of items) {
      if (!debtTypes.includes(item.transaction_type)) continue;
      const name = item.debtor_name.trim();
      if (!name || name === unnamedDebtor || known.has(name.toLowerCase())) continue;
      if (!nameKinds.has(name)) nameKinds.set(name, (["debt_payment", "card_charge"] as TransactionType[]).includes(item.transaction_type) ? "own" : "lend");
    }

    for (const [name, kind] of nameKinds) {
      const { error } = await supabase.from("debtors").insert({ user_id: user.id, name, kind });
      if (error && error.code !== "23505") {
        setError(error.message);
        return;
      }
    }
    if (nameKinds.size) await loadDebtors();
  }

  async function updateEntry(transferToWalletId?: string | null) {
    if (!supabase || !editing || !user) return false;

    const original = entries.find((item) => item.id === editing.id);
    const convertingToTransfer = editing.transaction_type === "transfer" && original?.transaction_type !== "transfer";

    setBusy(true);
    setError("");

    if (convertingToTransfer) {
      if (!transferToWalletId || transferToWalletId === editing.wallet_id) {
        setError("กรุณาเลือกกระเป๋าปลายทาง");
        setBusy(false);
        return false;
      }
      const sourceWalletId = editing.wallet_id ?? defaultWalletId(wallets);
      const [sourceLeg, destLeg] = expandTransferDraft(
        { ...editing, wallet_id: sourceWalletId, transfer_to_wallet_id: transferToWalletId },
        wallets,
      );

      const { error: updateError } = await supabase
        .from("transactions")
        .update({
          title: sourceLeg.title.trim(),
          category: sourceLeg.category,
          amount: sourceLeg.amount,
          kind: sourceLeg.type,
          transaction_type: sourceLeg.transaction_type,
          debtor_name: sourceLeg.debtor_name,
          wallet_impact: sourceLeg.wallet_impact,
          debt_impact: sourceLeg.debt_impact,
          user_share: sourceLeg.user_share,
          partner_share: sourceLeg.partner_share,
          occurred_at: sourceLeg.occurred_at,
          wallet_id: sourceLeg.wallet_id,
          note: sourceLeg.note,
          transfer_group_id: sourceLeg.transfer_group_id,
        })
        .eq("id", editing.id);

      if (updateError) {
        setError(updateError.message);
        setBusy(false);
        return false;
      }

      const { data, error: insertError } = await supabase
        .from("transactions")
        .insert({
          user_id: user.id,
          title: destLeg.title.trim(),
          category: destLeg.category,
          amount: destLeg.amount,
          kind: destLeg.type,
          transaction_type: destLeg.transaction_type,
          debtor_name: destLeg.debtor_name,
          wallet_impact: destLeg.wallet_impact,
          debt_impact: destLeg.debt_impact,
          user_share: destLeg.user_share,
          partner_share: destLeg.partner_share,
          occurred_at: destLeg.occurred_at,
          wallet_id: destLeg.wallet_id,
          note: destLeg.note,
          transfer_group_id: destLeg.transfer_group_id,
        })
        .select("id,title,category,amount,kind,transaction_type,wallet_impact,debt_impact,user_share,partner_share,debtor_name,occurred_at,source_text,wallet_id,note,transfer_group_id");

      if (insertError) {
        setError(insertError.message);
        setBusy(false);
        return false;
      }

      const savedSource = { ...sourceLeg, id: editing.id };
      const savedDest = data?.[0] ? mapTransactionRow(data[0]) : destLeg;
      setEntries((current) =>
        [savedDest, ...current.map((item) => (item.id === savedSource.id ? savedSource : item))].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)),
      );
      setBusy(false);
      return true;
    }

    const normalized = normalizeEntry(editing);
    const resolvedWalletId = normalized.wallet_id ?? defaultWalletId(wallets);

    const { error } = await supabase
      .from("transactions")
      .update({
        title: normalized.title.trim(),
        category: normalized.category,
        amount: normalized.amount,
        kind: normalized.type,
        transaction_type: normalized.transaction_type,
        debtor_name: normalized.debtor_name,
        wallet_impact: normalized.wallet_impact,
        debt_impact: normalized.debt_impact,
        user_share: normalized.user_share,
        partner_share: normalized.partner_share,
        occurred_at: normalized.occurred_at,
        wallet_id: resolvedWalletId,
        note: normalized.note,
      })
      .eq("id", normalized.id);

    if (error) {
      setError(error.message);
      setBusy(false);
      return false;
    }

    const savedEntry = { ...normalized, wallet_id: resolvedWalletId };
    setEntries((current) => current.map((item) => (item.id === savedEntry.id ? savedEntry : item)));
    setBusy(false);
    return true;
  }

  const restoreEntries = useCallback(async (entriesToRestore: Entry[]) => {
    if (!supabase || !user || !entriesToRestore.length) return;
    const { error } = await supabase.from("transactions").insert(entriesToRestore.map((entry) => ({
      id: entry.id,
      user_id: user.id,
      title: entry.title,
      category: entry.category,
      amount: entry.amount,
      kind: entry.type,
      transaction_type: entry.transaction_type,
      debtor_name: entry.debtor_name,
      wallet_impact: entry.wallet_impact,
      debt_impact: entry.debt_impact,
      user_share: entry.user_share,
      partner_share: entry.partner_share,
      occurred_at: entry.occurred_at,
      source_text: entry.source_text,
      wallet_id: entry.wallet_id ?? defaultWalletId(wallets),
      note: entry.note,
      transfer_group_id: entry.transfer_group_id,
    })));
    if (error) {
      setError(error.message);
      notify({ tone: "error", title: "ย้อนคืนรายการไม่สำเร็จ", detail: error.message });
      return;
    }
    setEntries((current) => [...entriesToRestore, ...current].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)));
    notify({ tone: "success", title: "ย้อนคืนรายการแล้ว", detail: entriesToRestore[0].title });
  }, [user, wallets, notify]);

  const deleteEntry = useCallback(async (entry: Entry) => {
    if (!supabase) return;
    const pairedEntry = entry.transfer_group_id
      ? entries.find((item) => item.id !== entry.id && item.transfer_group_id === entry.transfer_group_id)
      : null;
    const entriesToDelete = pairedEntry ? [entry, pairedEntry] : [entry];
    const confirmed = await requestConfirm({
      title: pairedEntry ? "ลบรายการโอนเงินนี้?" : "ลบรายการนี้?",
      detail: pairedEntry
        ? `ลบรายการโอนเงิน "${entry.title}" ทั้งสองฝั่ง (ต้นทางและปลายทาง) ออกจากประวัติ`
        : `ลบ "${entry.title}" ออกจากประวัติ`,
      confirmLabel: "ลบรายการ",
      tone: "danger",
    });
    if (!confirmed) return;

    setBusy(true);
    setError("");

    const { error } = await supabase.from("transactions").delete().in("id", entriesToDelete.map((item) => item.id));
    if (error) setError(error.message);
    else {
      const deletedIds = new Set(entriesToDelete.map((item) => item.id));
      setEntries((current) => current.filter((item) => !deletedIds.has(item.id)));
      notify({
        tone: "info",
        title: pairedEntry ? "ลบรายการโอนเงินแล้ว" : "ลบรายการแล้ว",
        detail: entry.title,
        action: {
          label: "ย้อนคืน",
          onClick: () => { void restoreEntries(entriesToDelete); },
        },
      });
    }

    setBusy(false);
  }, [entries, requestConfirm, notify, restoreEntries]);

  function updateBudgets(next: Record<string, number>) {
    if (!user) return;
    setBudgets(next);
    saveBudgets(user.id, next);
  }

  async function saveProfile(next: {
    nickname: string;
    app_icon: string;
    app_icon_image: string;
    month_start_day: number;
  }) {
    if (!supabase || !user) return false;
    setBusy(true);
    setError("");

    const payload = {
      user_id: user.id,
      nickname: next.nickname.trim() || null,
      app_icon: next.app_icon.trim() || null,
      app_icon_image: next.app_icon_image.trim() || null,
      month_start_day: clampInteger(next.month_start_day, 1, 28, 1),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select("user_id,nickname,app_icon,app_icon_image,month_start_day,pin_hash,pin_salt,pin_failed_attempts,pin_blocked_until,webauthn_credential_id,webauthn_enabled")
      .single();

    if (error) {
      setError(error.message);
      setBusy(false);
      return false;
    }
    setProfile(data as Profile);
    setBusy(false);
    return true;
  }

  async function savePin(pin: string, nextMode: PinMode = "unlocked") {
    if (!supabase || !user || !isSixDigitPin(pin)) return;
    setBusy(true);
    setPinError("");
    const pin_salt = createPinSalt();
    const pin_hash = await hashPin(pin, pin_salt);
    const { data, error } = await supabase
      .from("profiles")
      .upsert({
        user_id: user.id,
        pin_hash,
        pin_salt,
        pin_failed_attempts: 0,
        pin_blocked_until: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select("user_id,nickname,app_icon,app_icon_image,month_start_day,pin_hash,pin_salt,pin_failed_attempts,pin_blocked_until,webauthn_credential_id,webauthn_enabled")
      .single();

    if (error) {
      setPinError(error.message);
    } else {
      setProfile(data as Profile);
      setPinMode(nextMode);
      if (nextMode === "unlocked") await loadUserData(user.id);
      notify({ tone: "success", title: "ตั้งรหัส PIN แล้ว", detail: "บัญชีนี้จะถาม PIN ก่อนเข้าใช้งาน" });
    }
    setBusy(false);
  }

  async function verifyPin(pin: string) {
    if (!supabase || !user || !isSixDigitPin(pin)) return false;
    setBusy(true);
    setPinError("");
    const latestProfile = await loadProfile();
    if (!latestProfile?.pin_hash || !latestProfile.pin_salt) {
      setPinMode("unlocked");
      setBusy(false);
      if (user) await loadUserData(user.id);
      return false;
    }
    if (pinBlocked(latestProfile)) {
      setPinError("บัญชีถูกบล็อกชั่วคราว กรุณารอให้ครบ 1 ชั่วโมง");
      setBusy(false);
      return false;
    }

    const candidateHash = await hashPin(pin, latestProfile.pin_salt);
    if (timingSafeEqual(candidateHash, latestProfile.pin_hash)) {
      const { data, error } = await supabase
        .from("profiles")
        .update({ pin_failed_attempts: 0, pin_blocked_until: null, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .select("user_id,nickname,app_icon,app_icon_image,month_start_day,pin_hash,pin_salt,pin_failed_attempts,pin_blocked_until,webauthn_credential_id,webauthn_enabled")
        .single();
      if (error) {
        setPinError(error.message);
        setBusy(false);
        return false;
      }
      setProfile(data as Profile);
      setPinMode("unlocked");
      await loadUserData(user.id);
      setBusy(false);
      return true;
    }

    const nextAttempts = clampInteger(latestProfile.pin_failed_attempts + 1, 0, pinMaxAttempts, 1);
    const blockedUntil = nextAttempts >= pinMaxAttempts ? new Date(Date.now() + pinBlockMs).toISOString() : null;
    const { data, error } = await supabase
      .from("profiles")
      .update({ pin_failed_attempts: nextAttempts, pin_blocked_until: blockedUntil, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select("user_id,nickname,app_icon,app_icon_image,month_start_day,pin_hash,pin_salt,pin_failed_attempts,pin_blocked_until,webauthn_credential_id,webauthn_enabled")
      .single();
    if (data) setProfile(data as Profile);
    if (blockedUntil) {
      setPinSheetOpen(false);
      setPinMode("locked");
    }
    setPinError(error ? error.message : blockedUntil ? "ใส่ PIN ผิดครบ 5 ครั้ง บล็อกการเข้าใช้งาน 1 ชั่วโมง" : `PIN ไม่ถูกต้อง เหลือ ${pinMaxAttempts - nextAttempts} ครั้ง`);
    setBusy(false);
    return false;
  }

  async function unlockWithFaceId() {
    if (!supabase || !user || !profile?.webauthn_enabled || !profile.webauthn_credential_id) return false;
    if (pinBlocked(profile)) return false;
    setBusy(true);
    setPinError("");
    const ok = await verifyFaceId(profile.webauthn_credential_id);
    if (!ok) {
      setBusy(false);
      return false;
    }
    const { data, error } = await supabase
      .from("profiles")
      .update({ pin_failed_attempts: 0, pin_blocked_until: null, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select("user_id,nickname,app_icon,app_icon_image,month_start_day,pin_hash,pin_salt,pin_failed_attempts,pin_blocked_until,webauthn_credential_id,webauthn_enabled")
      .single();
    if (error) {
      setPinError(error.message);
      setBusy(false);
      return false;
    }
    if (data) setProfile(data as Profile);
    setPinMode("unlocked");
    await loadUserData(user.id);
    setBusy(false);
    return true;
  }

  async function changePin(currentPin: string, nextPin: string) {
    const ok = await verifyPin(currentPin);
    if (!ok) return false;
    await savePin(nextPin, "unlocked");
    return true;
  }

  async function disablePin(currentPin: string) {
    if (!supabase || !user) return false;
    const ok = await verifyPin(currentPin);
    if (!ok) return false;
    setBusy(true);
    setPinError("");
    const { data, error } = await supabase
      .from("profiles")
      .update({ pin_hash: null, pin_salt: null, pin_failed_attempts: 0, pin_blocked_until: null, webauthn_credential_id: null, webauthn_enabled: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select("user_id,nickname,app_icon,app_icon_image,month_start_day,pin_hash,pin_salt,pin_failed_attempts,pin_blocked_until,webauthn_credential_id,webauthn_enabled")
      .single();
    if (error) {
      setPinError(error.message);
      setBusy(false);
      return false;
    }
    if (data) setProfile(data as Profile);
    setPinMode("unlocked");
    notify({ tone: "success", title: "ปิด PIN แล้ว", detail: "เข้าแอพได้โดยไม่ต้องกรอก PIN" });
    setBusy(false);
    return true;
  }

  async function enableFaceId(currentPin: string) {
    if (!supabase || !user) return false;
    const ok = await verifyPin(currentPin);
    if (!ok) return false;
    setBusy(true);
    setPinError("");
    const credentialId = await registerFaceId(user);
    if (!credentialId) {
      setPinError("เปิดใช้ Face ID ไม่สำเร็จ กรุณาลองใหม่");
      setBusy(false);
      return false;
    }
    const { data, error } = await supabase
      .from("profiles")
      .update({ webauthn_credential_id: credentialId, webauthn_enabled: true, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select("user_id,nickname,app_icon,app_icon_image,month_start_day,pin_hash,pin_salt,pin_failed_attempts,pin_blocked_until,webauthn_credential_id,webauthn_enabled")
      .single();
    if (error) {
      setPinError(error.message);
      setBusy(false);
      return false;
    }
    if (data) setProfile(data as Profile);
    notify({ tone: "success", title: "เปิดใช้ Face ID แล้ว", detail: "ปลดล็อกแอพด้วย Face ID ได้ทันที" });
    setBusy(false);
    return true;
  }

  async function disableFaceId(currentPin: string) {
    if (!supabase || !user) return false;
    const ok = await verifyPin(currentPin);
    if (!ok) return false;
    setBusy(true);
    setPinError("");
    const { data, error } = await supabase
      .from("profiles")
      .update({ webauthn_credential_id: null, webauthn_enabled: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select("user_id,nickname,app_icon,app_icon_image,month_start_day,pin_hash,pin_salt,pin_failed_attempts,pin_blocked_until,webauthn_credential_id,webauthn_enabled")
      .single();
    if (error) {
      setPinError(error.message);
      setBusy(false);
      return false;
    }
    if (data) setProfile(data as Profile);
    notify({ tone: "success", title: "ปิด Face ID แล้ว", detail: "ใช้ PIN เพื่อเข้าแอพต่อไป" });
    setBusy(false);
    return true;
  }

  async function resetPinAndSignOut() {
    if (!supabase || !user) return;
    setBusy(true);
    await supabase
      .from("profiles")
      .update({ pin_hash: null, pin_salt: null, pin_failed_attempts: 0, pin_blocked_until: null, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
    await supabase.auth.signOut();
    setBusy(false);
  }

  async function createDebtor(input: DebtorInput) {
    if (!supabase || !user || !input.name.trim()) return false;
    setBusy(true);
    setError("");
    const { data, error } = await supabase
      .from("debtors")
      .insert({
        user_id: user.id,
        name: input.name.trim(),
        note: input.note.trim() || null,
        opening_balance: toMoneyAmount(input.opening_balance),
        kind: input.kind,
        monthly_installment: input.monthly_installment,
        total_installments: input.total_installments,
        paid_installments: input.paid_installments,
        credit_limit: input.credit_limit,
        icon: input.icon,
        icon_color: input.icon_color,
      })
      .select("id,user_id,name,note,opening_balance,kind,monthly_installment,total_installments,paid_installments,credit_limit,icon,icon_color")
      .single();
    if (error) {
      setError(error.code === "23505" ? "มีชื่อนี้อยู่แล้ว" : error.message);
      setBusy(false);
      return false;
    }
    const created = { ...data, opening_balance: toMoneyAmount(data.opening_balance) } as Debtor;
    setDebtors((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
    setBusy(false);
    return true;
  }
  async function updateDebtor(debtor: Debtor, patch: DebtorInput) {
    if (!supabase) return false;
    setBusy(true);
    setError("");
    const openingBalance = toMoneyAmount(patch.opening_balance);
    const { error } = await supabase
      .from("debtors")
      .update({
        name: patch.name.trim(),
        note: patch.note.trim() || null,
        opening_balance: openingBalance,
        kind: patch.kind,
        monthly_installment: patch.monthly_installment,
        total_installments: patch.total_installments,
        paid_installments: patch.paid_installments,
        credit_limit: patch.credit_limit,
        icon: patch.icon,
        icon_color: patch.icon_color,
        updated_at: new Date().toISOString(),
      })
      .eq("id", debtor.id);
    if (error) {
      setError(error.code === "23505" ? "มีชื่อนี้อยู่แล้ว" : error.message);
      setBusy(false);
      return false;
    }
    const updated: Debtor = { ...debtor, ...patch, name: patch.name.trim(), note: patch.note.trim() || null, opening_balance: openingBalance };
    if (selectedDebtor?.id === debtor.id) setSelectedDebtor(updated);
    setDebtors((current) => current.map((item) => (item.id === debtor.id ? updated : item)).sort((a, b) => a.name.localeCompare(b.name)));
    setBusy(false);
    return true;
  }
  async function deleteDebtor(debtor: Debtor) {
    if (!supabase) return;
    const confirmed = await requestConfirm({
      title: "ลบรายชื่อนี้?",
      detail: `ลบ "${debtor.name}" ออกจากรายชื่อ รายการเก่าจะไม่ถูกลบ`,
      confirmLabel: "ลบรายชื่อ",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.from("debtors").delete().eq("id", debtor.id);
    if (error) setError(error.message);
    else {
      if (selectedDebtor?.id === debtor.id) setSelectedDebtor(null);
      setDebtors((current) => current.filter((item) => item.id !== debtor.id));
      notify({
        tone: "info",
        title: "ลบรายชื่อแล้ว",
        detail: debtor.name,
        action: { label: "ย้อนคืน", onClick: () => { void restoreDebtor(debtor); } },
      });
    }
    setBusy(false);
  }

  async function restoreDebtor(debtor: Debtor) {
    if (!supabase) return;
    const { error } = await supabase.from("debtors").insert(debtor);
    if (error) {
      setError(error.message);
      notify({ tone: "error", title: "ย้อนคืนรายชื่อไม่สำเร็จ", detail: error.message });
      return;
    }
    setDebtors((current) => [...current, debtor].sort((a, b) => a.name.localeCompare(b.name)));
    notify({ tone: "success", title: "ย้อนคืนรายชื่อแล้ว", detail: debtor.name });
  }

  async function createWallet(input: WalletInput) {
    if (!supabase || !user || !input.name.trim()) return false;
    setBusy(true);
    setError("");
    if (input.is_default) await supabase.from("wallets").update({ is_default: false, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    const { data, error } = await supabase
      .from("wallets")
      .insert({
        user_id: user.id,
        name: input.name.trim(),
        tag: input.tag,
        balance: toFiniteNumber(input.balance),
        icon: input.icon,
        icon_color: input.icon_color,
        is_default: input.is_default,
      })
      .select("id,user_id,name,tag,balance,icon,icon_color,is_default")
      .single();
    if (error) {
      setError(error.message);
      setBusy(false);
      return false;
    }
    const created = { ...data, balance: toFiniteNumber(data.balance), is_default: !!data.is_default } as Wallet;
    setWallets((current) => [
      ...(created.is_default ? current.map((item) => ({ ...item, is_default: false })) : current),
      created,
    ]);
    setBusy(false);
    return true;
  }
  async function updateWallet(wallet: Wallet, patch: WalletInput) {
    if (!supabase) return false;
    setBusy(true);
    setError("");
    if (patch.is_default) await supabase.from("wallets").update({ is_default: false, updated_at: new Date().toISOString() }).eq("user_id", wallet.user_id).neq("id", wallet.id);
    const { error } = await supabase
      .from("wallets")
      .update({
        name: patch.name.trim(),
        tag: patch.tag,
        balance: toFiniteNumber(patch.balance),
        icon: patch.icon,
        icon_color: patch.icon_color,
        is_default: patch.is_default,
        updated_at: new Date().toISOString(),
      })
      .eq("id", wallet.id);
    if (error) {
      setError(error.message);
      setBusy(false);
      return false;
    }
    const updated: Wallet = { ...wallet, ...patch, name: patch.name.trim(), balance: toFiniteNumber(patch.balance) };
    setWallets((current) =>
      current.map((item) => {
        if (item.id === wallet.id) return updated;
        return updated.is_default ? { ...item, is_default: false } : item;
      }),
    );
    setBusy(false);
    return true;
  }
  async function deleteWallet(wallet: Wallet) {
    if (!supabase) return;
    const confirmed = await requestConfirm({
      title: "ลบกระเป๋านี้?",
      detail: `ลบ "${wallet.name}" ออกจากกระเป๋าตังค์`,
      confirmLabel: "ลบกระเป๋า",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.from("wallets").delete().eq("id", wallet.id);
    if (error) setError(error.message);
    else {
      setWallets((current) => current.filter((item) => item.id !== wallet.id));
      notify({
        tone: "info",
        title: "ลบกระเป๋าแล้ว",
        detail: wallet.name,
        action: { label: "ย้อนคืน", onClick: () => { void restoreWallet(wallet); } },
      });
    }
    setBusy(false);
  }

  async function restoreWallet(wallet: Wallet) {
    if (!supabase) return;
    const { error } = await supabase.from("wallets").insert(wallet);
    if (error) {
      setError(error.message);
      notify({ tone: "error", title: "ย้อนคืนกระเป๋าไม่สำเร็จ", detail: error.message });
      return;
    }
    setWallets((current) => [
      ...(wallet.is_default ? current.map((item) => ({ ...item, is_default: false })) : current),
      wallet,
    ]);
    notify({ tone: "success", title: "ย้อนคืนกระเป๋าแล้ว", detail: wallet.name });
  }

  async function createRecurringExpense(input: RecurringExpenseInput) {
    if (!supabase || !user || !input.name.trim()) return false;
    setBusy(true);
    setError("");
    const { data, error } = await supabase
      .from("recurring_expenses")
      .insert({
        user_id: user.id,
        name: input.name.trim(),
        amount: toMoneyAmount(input.amount),
        billing_day: normalizeBillingDay(input.billing_day),
        icon: input.icon,
        icon_color: input.icon_color,
      })
      .select("id,user_id,name,amount,billing_day,icon,icon_color")
      .single();
    if (error) {
      setError(error.message);
      setBusy(false);
      return false;
    }
    const created = { ...data, amount: toMoneyAmount(data.amount), billing_day: normalizeBillingDay(data.billing_day) } as RecurringExpense;
    setRecurringExpenses((current) => [...current, created].sort((a, b) => a.billing_day - b.billing_day));
    setBusy(false);
    return true;
  }
  async function updateRecurringExpense(item: RecurringExpense, patch: RecurringExpenseInput) {
    if (!supabase) return false;
    setBusy(true);
    setError("");
    const billingDay = normalizeBillingDay(patch.billing_day);
    const { error } = await supabase
      .from("recurring_expenses")
      .update({
        name: patch.name.trim(),
        amount: toMoneyAmount(patch.amount),
        billing_day: billingDay,
        icon: patch.icon,
        icon_color: patch.icon_color,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    if (error) {
      setError(error.message);
      setBusy(false);
      return false;
    }
    const updated: RecurringExpense = { ...item, ...patch, name: patch.name.trim(), amount: toMoneyAmount(patch.amount), billing_day: billingDay };
    setRecurringExpenses((current) => current.map((row) => (row.id === item.id ? updated : row)).sort((a, b) => a.billing_day - b.billing_day));
    setBusy(false);
    return true;
  }
  async function deleteRecurringExpense(item: RecurringExpense) {
    if (!supabase) return;
    const confirmed = await requestConfirm({
      title: "ลบรายจ่ายประจำ?",
      detail: `ลบ "${item.name}" ออกจากรายการประจำ`,
      confirmLabel: "ลบรายการ",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.from("recurring_expenses").delete().eq("id", item.id);
    if (error) setError(error.message);
    else {
      setRecurringExpenses((current) => current.filter((row) => row.id !== item.id));
      notify({
        tone: "info",
        title: "ลบรายจ่ายประจำแล้ว",
        detail: item.name,
        action: { label: "ย้อนคืน", onClick: () => { void restoreRecurringExpense(item); } },
      });
    }
    setBusy(false);
  }

  async function restoreRecurringExpense(item: RecurringExpense) {
    if (!supabase) return;
    const { error } = await supabase.from("recurring_expenses").insert(item);
    if (error) {
      setError(error.message);
      notify({ tone: "error", title: "ย้อนคืนรายจ่ายประจำไม่สำเร็จ", detail: error.message });
      return;
    }
    setRecurringExpenses((current) => [...current, item].sort((a, b) => a.billing_day - b.billing_day));
    notify({ tone: "success", title: "ย้อนคืนรายจ่ายประจำแล้ว", detail: item.name });
  }

  const editingDismiss = useDismiss(!!editing, () => setEditing(null));
  const debtorSheetDismiss = useDismiss(!!debtorSheetMode, () => { setDebtorSheetMode(null); setEditingDebtor(null); });
  const walletSheetDismiss = useDismiss(!!walletSheetMode, () => { setWalletSheetMode(null); setEditingWallet(null); });
  const recurringSheetDismiss = useDismiss(!!recurringSheetMode, () => { setRecurringSheetMode(null); setEditingRecurringExpense(null); });
  const menuDismiss = useDismiss(menuOpen, () => setMenuOpen(false));
  const menuVisible = menuDismiss.mounted && !menuDismiss.closing;
  const profileSheetDismiss = useDismiss(profileSheetOpen, () => setProfileSheetOpen(false));
  const budgetSheetDismiss = useDismiss(budgetSheetOpen, () => setBudgetSheetOpen(false));
  const goalSheetDismiss = useDismiss(goalSheetOpen, () => setGoalSheetOpen(false));
  const reportSheetDismiss = useDismiss(reportSheetOpen, () => setReportSheetOpen(false));
  const csvImportDismiss = useDismiss(csvImportOpen, () => setCsvImportOpen(false));
  const askAiDismiss = useDismiss(askAiOpen, () => setAskAiOpen(false));
  const recapDismiss = useDismiss(recapOpen, () => setRecapOpen(false));
  const pinSheetDismiss = useDismiss(pinSheetOpen, () => { setPinSheetOpen(false); setPinError(""); });
  const logoutDismiss = useDismiss<[boolean]>(logoutOpen, (confirmed) => { setLogoutOpen(false); if (confirmed) void supabase?.auth.signOut(); });
  const confirmDialogDismiss = useDismiss<[boolean]>(!!confirmDialog, (confirmed) => closeConfirmDialog(confirmed));
  const clearSavePulse = useCallback(() => setSavePulse(0), []);
  const savePulseDismiss = useDismiss(!!savePulse, clearSavePulse, 200);
  const { requestClose: closeSavePulse } = savePulseDismiss;

  useEffect(() => {
    if (!savePulse) return;
    const timer = window.setTimeout(() => closeSavePulse(), 4200);
    return () => window.clearTimeout(timer);
  }, [savePulse, closeSavePulse]);

  if (!ready) return null;

  if (!user) return <Auth />;
  if (pinMode !== "unlocked") {
    return (
      <PinGate
        mode={pinMode}
        user={user}
        profile={profile}
        busy={busy}
        error={pinError}
        onSetup={(pin) => savePin(pin)}
        onUnlock={verifyPin}
        onFaceIdUnlock={unlockWithFaceId}
        onForgot={resetPinAndSignOut}
        onLogout={() => supabase?.auth.signOut()}
      />
    );
  }

  return (
    <main className="shell">
      <section className={`phone tab-${tab}`}>
        <header className="topbar">
          <div className="home-identity">
            <span className={`home-profile-icon ${displayIconImage ? "has-image" : ""}`}>
              {displayIconImage && <NextImage className="profile-image" src={displayIconImage} alt="" width={42} height={42} unoptimized />}
              {!displayIconImage && displayIcon}
            </span>
            <div>
            <p className="eyebrow">สวัสดี</p>
              <h1>{displayName}</h1>
            </div>
          </div>
          <button className={`menu-button ${menuVisible ? "active" : ""}`} onClick={() => { if (menuVisible) menuDismiss.requestClose(); else setMenuOpen(true); }} title={menuVisible ? "ปิดเมนู" : "เมนู"} aria-label={menuVisible ? "ปิดเมนู" : "เปิดเมนู"} aria-expanded={menuVisible}>
            {menuVisible ? <X size={18} strokeWidth={2.25} aria-hidden="true" /> : <Menu size={18} strokeWidth={2.25} aria-hidden="true" />}
          </button>
        </header>

        {tab === "home" && (
          <div className="view">
            {dataLoading && <SkeletonDashboard />}
            {savePulseDismiss.mounted && <SuccessPulse count={savePulse} onAddMore={openAddTab} closing={savePulseDismiss.closing} />}
            {!dataLoading && (
              <>
                <section className="wallet-grid single-wallet">
                  <HeroWalletCard balance={mainWallet} insight={walletInsight} streak={streak} />
                </section>
                <HomeInsightGrid
                  netWorth={netWorth}
                  savingsRate={savingsRate}
                  receivableTotal={receivableTotal}
                  payableTotal={payableTotal}
                />
                <QuickAddStrip shortcuts={quickShortcuts.slice(0, 4)} onSelect={(shortcut) => openAddTab("manual", shortcut)} onMore={() => openAddTab()} />
                <GoalCard goals={goals} onAdd={() => setGoalSheetOpen(true)} onDelete={removeGoal} />
                {(dueSoonRecurring.length > 0 || budgetGlance.totalBudget > 0) && (
                  <div className="home-focus-grid">
                    {dueSoonRecurring.length > 0 && <DueSoonCard items={dueSoonRecurring} onManage={() => setTab("recurring")} />}
                    {budgetGlance.totalBudget > 0 && <BudgetGlanceCard budgetGlance={budgetGlance} onManage={() => setBudgetSheetOpen(true)} />}
                  </div>
                )}
                <CashFlowTrendCard trend={cashFlowTrend} />
                <SpendingPersonalityCard topCategory={categorySummary[0] ?? null} monthlyOutflow={monthlyOutflow} />
              </>
            )}

            {!dataLoading && !wallets.length && !entries.length && !debtors.length && (
              <FirstRunHomeState
                onCreateWallet={() => { setEditingWallet(null); setWalletSheetMode("create"); }}
                onSetBudget={() => setBudgetSheetOpen(true)}
                onAddEntry={() => openAddTab()}
              />
            )}

            {!dataLoading && secondaryWalletTags.some((entry) => wallets.some((wallet) => wallet.tag === entry.tag)) && (
              <section className="wallet-grid">
                {secondaryWalletTags
                  .filter((entry) => wallets.some((wallet) => wallet.tag === entry.tag))
                  .map((entry) => {
                    const wallet = wallets.find((item) => item.tag === entry.tag);
                    return (
                      <button className={`wallet-card secondary-wallet-card ${entry.className}`} key={entry.tag} onClick={() => setTab("wallets")}>
                        {wallet && (
                          <i className="debtor-avatar sm" style={{ background: wallet.icon_color ?? nameColor(wallet.name) }}>
                            <WalletAvatarGlyph iconKey={wallet.icon} fallbackName={wallet.name} size={16} />
                          </i>
                        )}
                        <span>{entry.label}</span>
                        <strong><CountUpMoney value={walletTotals[entry.tag]} /></strong>
                      </button>
                    );
                  })}
              </section>
            )}

            {!dataLoading && <RecentActivityTimeline entries={entries} onEdit={setEditing} />}

            {error && <ErrorActions onRetry={retrySync} onDismiss={() => setError("")} />}
            {error && <StateCard tone="error" title="มีบางอย่างไม่สำเร็จ" detail={error} />}
          </div>
        )}

        {tab === "add" && (
          <div className="view add-view">
            {dataLoading && <SkeletonList rows={3} />}
            <div className="add-title add-title-compact">
              <button onClick={() => setTab("home")}>‹</button>
              <div>
                <p className="eyebrow">{addMode === "manual" ? "เพิ่มรายการ" : "AI Chat"}</p>
                <h2>{addMode === "manual" ? "กรอกรายการด้วยตัวเอง" : busy ? "กำลังอ่านให้แบบตั้งใจสุด ๆ" : drafts.length ? "แยกข้อมูลให้แล้ว ลองตรวจอีกนิด" : "วันนี้มีรายการอะไรบ้าง?"}</h2>
              </div>
            </div>

            <div className="report-period-toggle">
              <button className={addMode === "ai" ? "active" : ""} onClick={() => setAddMode("ai")}>ให้ AI ช่วยจด</button>
              <button className={addMode === "manual" ? "active" : ""} onClick={() => setAddMode("manual")}>เขียนเอง</button>
            </div>

            {addMode === "ai" && (
              <>
                <label className="entry-date-picker compact">
                  <span>บันทึกของวันที่</span>
                  <input type="date" value={entryDate} max={todayDateInput()} onChange={(event) => setEntryDate(event.target.value)} />
                </label>

                <div className="ai-suggestions">
                  <span>แตะตัวอย่างเพื่อเริ่มเร็ว</span>
                  <div className="quick-shortcuts">
                    {aiSuggestions.map((suggestion) => (
                      <button
                        key={`${suggestion.label}|${suggestion.detail}`}
                        className="quick-chip"
                        onClick={() => applySuggestion(suggestion.text, suggestion.shortcut)}
                      >
                        <i className="card-accent" style={{ background: suggestion.shortcut ? categoryColor(suggestion.shortcut.category) : undefined }} />
                        <span className="cat-dot" style={{ background: suggestion.shortcut ? categoryTint(suggestion.shortcut.category, 13) : undefined }}>
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
                  <div className="assistant-rail" aria-hidden="true">
                    <span>AI</span>
                    <i />
                  </div>
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

                  <div className="input-tools">
                    <label className="attach-button">
                      แนบสลิป
                      <input type="file" accept="image/*" multiple onChange={(event) => { void addSlipFiles(event.target.files); event.currentTarget.value = ""; }} />
                    </label>
                    <span>{slipImages.length ? `${slipImages.length}/3 รูป` : "Gemini ช่วยอ่านรูปและข้อความ"}</span>
                  </div>
                </div>

                <button className="primary" onClick={analyze} disabled={busy || (!text.trim() && !slipImages.length)}>
                  {busy ? "กำลังวิเคราะห์..." : "ให้ AI แยกรายการ"}
                </button>
                {busy && <SkeletonList rows={2} />}
                {error && <StateCard tone="error" title="AI ยังทำรายการนี้ไม่ได้" detail={error} />}

                {!!drafts.length && (
                  <section className="review">
                    <div className="review-head">
                      <div>
                        <h3>ตรวจสอบก่อนบันทึก</h3>
                        <p>พบ {drafts.length} รายการ แก้ข้อมูลได้ก่อนยืนยัน</p>
                      </div>
                      <div className="review-head-actions">
                        <span>AI</span>
                        <button className="review-cancel-all" onClick={() => setDrafts([])}>ยกเลิกทั้งหมด</button>
                      </div>
                    </div>
                    {drafts.map((draft, index) => (
                      <DraftRow
                        key={draft.id}
                        draft={draft}
                        knownDebtors={debtors}
                        wallets={wallets}
                        onChange={(next) => setDrafts((items) => items.map((item, i) => (i === index ? next : item)))}
                        onRemove={() => setDrafts((items) => items.filter((_, i) => i !== index))}
                      />
                    ))}
                    <DraftImpact items={drafts} />
                    {drafts.some((draft) => draft.transaction_type === "transfer" && (!draft.transfer_to_wallet_id || draft.transfer_to_wallet_id === draft.wallet_id)) && (
                      <p className="pin-hint">มีรายการโอนเงินที่ยังไม่ได้เลือกกระเป๋าปลายทาง</p>
                    )}
                    <button
                      className="save"
                      onClick={() => saveEntries(drafts)}
                      disabled={busy || drafts.some((draft) => draft.transaction_type === "transfer" && (!draft.transfer_to_wallet_id || draft.transfer_to_wallet_id === draft.wallet_id))}
                    >
                      บันทึก {drafts.length} รายการ
                    </button>
                    <p className="privacy">AI ช่วยอ่านและแยกข้อมูล แต่สูตรคำนวณกระเป๋า/ลูกหนี้ยังล็อกอยู่ในแอพ</p>
                  </section>
                )}
              </>
            )}

            {addMode === "manual" && (
              <ManualEntryForm
                key={`${quickAddPreset?.title ?? "manual"}|${quickAddPreset?.amount ?? 0}`}
                wallets={wallets}
                busy={busy}
                error={error}
                initialDate={entryDate}
                initialPreset={quickAddPreset}
                onSave={(drafts) => saveEntries(drafts)}
              />
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="view history-view">
            {dataLoading && <SkeletonList rows={5} />}
            <div className="add-title">
              <button onClick={() => setTab("home")}>‹</button>
              <div>
                <h2>รายการทั้งหมด</h2>
              </div>
              <button className="header-add-button" onClick={() => setRecapOpen(true)}>สรุปเดือนนี้</button>
            </div>
            <MonthSummary
              selectedMonth={selectedMonth}
              setSelectedMonth={selectHistoryMonth}
              income={monthlyIncome}
              outflow={monthlyOutflow}
              debtChange={monthlyDebtChange}
              balance={monthlyBalance}
              categories={categorySummary}
              lentOut={monthlyLentOut}
              monthStartDay={monthStartDay}
              budgets={budgets}
            />
            <MonthlyTrendChart trend={monthlyTrend} />
            <IncomeBreakdown items={incomeSummary} />
            {historyFiltersEnabled && (
              <HistoryFilterBar
                filters={historyFilters}
                onChange={setHistoryFilters}
                onClear={() => setHistoryFilters({ query: "", category: "", type: "all", minAmount: "", maxAmount: "" })}
              />
            )}
            <CalendarHeatmap start={cycleRange.start} end={cycleRange.end} entries={monthlyEntries} selectedMonth={selectedMonth} onChangeMonth={selectHistoryMonth} selectedDay={selectedDay} defaultDay={defaultHistoryDay} onSelectDay={setSelectedDay} />
            {activeDay && <HistoryInsight entries={dayEntries} />}
            <EntryList entries={dayEntries} onEdit={setEditing} onDelete={deleteEntry} emptyAction={addWithAiAction} />
          </div>
        )}

        {tab === "debtors" && (
          <DebtorsView
            debtors={debtors}
            entries={entries}
            receivableSummary={receivableSummary}
            payableSummary={payableSummary}
            selectedDebtor={selectedDebtor}
            activeKind={debtorKindTab}
            onChangeActiveKind={setDebtorKindTab}
            onBack={() => selectedDebtor ? setSelectedDebtor(null) : setTab("home")}
            onAdd={() => { setEditingDebtor(null); setDebtorSheetMode("create"); }}
            onSelect={(debtor) => setSelectedDebtor(debtor)}
            onEdit={(debtor) => { setEditingDebtor(debtor); setDebtorSheetMode("edit"); }}
            onDelete={deleteDebtor}
          />
        )}

        {tab === "wallets" && (
          <WalletsView
            wallets={displayWallets}
            entries={entries}
            onBack={() => setTab("home")}
            onAdd={() => { setEditingWallet(null); setWalletSheetMode("create"); }}
            onEdit={(wallet) => { setEditingWallet(wallet); setWalletSheetMode("edit"); }}
            onDelete={deleteWallet}
          />
        )}

        {tab === "recurring" && (
          <RecurringExpensesView
            items={recurringExpenses}
            onBack={() => setTab("home")}
            onAdd={() => { setEditingRecurringExpense(null); setRecurringSheetMode("create"); }}
            onEdit={(item) => { setEditingRecurringExpense(item); setRecurringSheetMode("edit"); }}
            onDelete={deleteRecurringExpense}
          />
        )}

        {editingDismiss.mounted && editing && (
          <EditSheet entry={editing} wallets={wallets} busy={busy} error={error} onChange={setEditing} onClose={editingDismiss.requestClose} onSave={updateEntry} closing={editingDismiss.closing} />
        )}
        {debtorSheetDismiss.mounted && debtorSheetMode && (
          <DebtorEditSheet
            debtor={debtorSheetMode === "edit" ? editingDebtor : null}
            busy={busy}
            error={error}
            defaultKind={debtorKindTab}
            onClose={debtorSheetDismiss.requestClose}
            onCreate={createDebtor}
            onUpdate={updateDebtor}
            closing={debtorSheetDismiss.closing}
          />
        )}
        {walletSheetDismiss.mounted && walletSheetMode && (
          <WalletEditSheet
            wallet={walletSheetMode === "edit" ? editingWallet : null}
            busy={busy}
            error={error}
            onClose={walletSheetDismiss.requestClose}
            onCreate={createWallet}
            onUpdate={updateWallet}
            existingWallets={wallets}
            closing={walletSheetDismiss.closing}
          />
        )}
        {recurringSheetDismiss.mounted && recurringSheetMode && (
          <RecurringExpenseEditSheet
            item={recurringSheetMode === "edit" ? editingRecurringExpense : null}
            busy={busy}
            error={error}
            onClose={recurringSheetDismiss.requestClose}
            onCreate={createRecurringExpense}
            onUpdate={updateRecurringExpense}
            closing={recurringSheetDismiss.closing}
          />
        )}
        {menuDismiss.mounted && (
          <SideMenu
            user={user}
            profile={profile}
            onClose={menuDismiss.requestClose}
            onLogout={() => { menuDismiss.requestClose(); setLogoutOpen(true); }}
            onOpenProfile={() => { menuDismiss.requestClose(); setProfileSheetOpen(true); }}
            onOpenWallets={() => { menuDismiss.requestClose(); setTab("wallets"); }}
            onOpenDebtors={() => { menuDismiss.requestClose(); setSelectedDebtor(null); setTab("debtors"); }}
            onOpenRecurring={() => { menuDismiss.requestClose(); setTab("recurring"); }}
            onOpenBudgets={() => { menuDismiss.requestClose(); setBudgetSheetOpen(true); }}
            onOpenReport={() => { menuDismiss.requestClose(); setReportSheetOpen(true); }}
            onOpenImport={() => { menuDismiss.requestClose(); setCsvImportOpen(true); }}
            onOpenAsk={() => { menuDismiss.requestClose(); setAskAiOpen(true); }}
            onOpenPin={() => { menuDismiss.requestClose(); setPinSheetOpen(true); }}
            theme={theme}
            onSetTheme={setTheme}
            walletTotal={walletBalanceTotal}
            receivableTotal={receivableTotal}
            payableTotal={payableTotal}
            recurringTotal={recurringExpenses.reduce((sum, item) => sum + item.amount, 0)}
            closing={menuDismiss.closing}
          />
        )}
        {profileSheetDismiss.mounted && (
          <ProfileEditSheet profile={profile} busy={busy} error={error} onClose={profileSheetDismiss.requestClose} onSave={saveProfile} closing={profileSheetDismiss.closing} />
        )}
        {budgetSheetDismiss.mounted && (
          <BudgetSheet budgets={budgets} onClose={budgetSheetDismiss.requestClose} onSave={updateBudgets} closing={budgetSheetDismiss.closing} />
        )}
        {goalSheetDismiss.mounted && (
          <GoalEditSheet onClose={goalSheetDismiss.requestClose} onCreate={createGoal} closing={goalSheetDismiss.closing} />
        )}
        {reportSheetDismiss.mounted && (
          <ReportExportSheet
            entries={entries}
            wallets={wallets}
            receivableSummary={receivableSummary}
            payableSummary={payableSummary}
            selectedMonth={selectedMonth}
            monthStartDay={monthStartDay}
            onClose={reportSheetDismiss.requestClose}
            closing={reportSheetDismiss.closing}
          />
        )}
        {csvImportDismiss.mounted && (
          <CsvImportSheet busy={busy} error={error} onClose={csvImportDismiss.requestClose} onImport={importEntries} closing={csvImportDismiss.closing} />
        )}
        {askAiDismiss.mounted && (
          <AskFinanceSheet context={aiFinanceContext} onClose={askAiDismiss.requestClose} closing={askAiDismiss.closing} />
        )}
        {recapDismiss.mounted && (
          <RecapSheet
            selectedMonth={selectedMonth}
            income={monthlyIncome}
            outflow={monthlyOutflow}
            balance={monthlyBalance}
            topCategory={categorySummary[0] ?? null}
            streak={streak}
            onClose={recapDismiss.requestClose}
            closing={recapDismiss.closing}
          />
        )}
        {pinSheetDismiss.mounted && (
          <PinSecuritySheet
            pinEnabled={!!profile?.pin_hash && !!profile.pin_salt}
            webauthnEnabled={!!profile?.webauthn_enabled}
            busy={busy}
            error={pinError}
            onClose={pinSheetDismiss.requestClose}
            onEnable={async (nextPin) => {
              await savePin(nextPin, "unlocked");
              pinSheetDismiss.requestClose();
            }}
            onChange={async (currentPin, nextPin) => {
              const ok = await changePin(currentPin, nextPin);
              if (ok) pinSheetDismiss.requestClose();
            }}
            onDisable={async (currentPin) => {
              const ok = await disablePin(currentPin);
              if (ok) pinSheetDismiss.requestClose();
            }}
            onEnableFaceId={enableFaceId}
            onDisableFaceId={disableFaceId}
            closing={pinSheetDismiss.closing}
          />
        )}
        {logoutDismiss.mounted && (
          <ConfirmLogout onCancel={() => logoutDismiss.requestClose(false)} onConfirm={() => logoutDismiss.requestClose(true)} closing={logoutDismiss.closing} />
        )}
        {confirmDialogDismiss.mounted && confirmDialog && (
          <ConfirmDialog dialog={confirmDialog} onClose={confirmDialogDismiss.requestClose} closing={confirmDialogDismiss.closing} />
        )}
        <ToastHost toasts={toasts} closingIds={closingToastIds} onDismiss={dismissToast} />

        {!overlayOpen && (
          <nav className="bottom-nav">
            <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")} aria-label="หน้าหลัก">
              <span className="nav-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M4 10.8 12 4l8 6.8v8.7a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5v-8.7Z" />
                </svg>
              </span>
              <span className="nav-label">หน้าหลัก</span>
            </button>
            <button className="add-button" onClick={() => openAddTab()} aria-label="เพิ่มรายการด้วย AI">
              <span className="nav-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </button>
            <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")} aria-label="รายการ">
              <span className="nav-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M6.5 5.5h11v13h-11z" />
                  <path d="M9.5 9h5M9.5 12h5M9.5 15h3" />
                </svg>
              </span>
              <span className="nav-label">รายการ</span>
            </button>
          </nav>
        )}
      </section>
    </main>
  );
}

function PinGate({
  mode,
  user,
  profile,
  busy,
  error,
  onSetup,
  onUnlock,
  onFaceIdUnlock,
  onForgot,
  onLogout,
}: {
  mode: PinMode;
  user: User;
  profile: Profile | null;
  busy: boolean;
  error: string;
  onSetup: (pin: string) => void;
  onUnlock: (pin: string) => Promise<boolean>;
  onFaceIdUnlock: () => Promise<boolean>;
  onForgot: () => void;
  onLogout: () => void;
}) {
  const [pin, setPin] = useState("");
  const [setupStage, setSetupStage] = useState<"new" | "confirm">("new");
  const [newPinDraft, setNewPinDraft] = useState("");
  const [setupError, setSetupError] = useState("");
  const [shake, setShake] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  const [prevMode, setPrevMode] = useState(mode);
  const faceIdTried = useRef(false);
  const submittingRef = useRef(false);

  // Reset entry state whenever the gate's mode changes (e.g. setup -> locked).
  // Adjusting state during render (React's documented pattern for this) rather
  // than in an effect, so it applies before this render paints.
  if (mode !== prevMode) {
    setPrevMode(mode);
    setPin("");
    setSetupStage("new");
    setNewPinDraft("");
    setSetupError("");
  }
  const blockedUntil = profile?.pin_blocked_until ? new Date(profile.pin_blocked_until).getTime() : 0;
  const blocked = blockedUntil > tick;
  const remainingMs = Math.max(0, blockedUntil - tick);
  const remainingMinutes = Math.ceil(remainingMs / 60000);
  const attempts = clampInteger(profile?.pin_failed_attempts ?? 0, 0, pinMaxAttempts, 0);
  const remainingAttempts = Math.max(0, pinMaxAttempts - attempts);
  const faceIdAvailable = !!(profile?.webauthn_enabled && profile.webauthn_credential_id);
  const metadata = user.user_metadata ?? {};
  const displayName = profile?.nickname?.trim() || metadata.full_name || metadata.name || "";
  const displayIcon = profile?.app_icon?.trim() || user.email?.[0]?.toUpperCase() || "฿";
  const displayIconImage = profile?.app_icon_image?.trim() || "";

  useEffect(() => {
    if (!blocked) return;
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [blocked]);

  useEffect(() => {
    if (mode !== "locked" || !faceIdAvailable || blocked || faceIdTried.current) return;
    faceIdTried.current = true;
    void onFaceIdUnlock();
  }, [mode, faceIdAvailable, blocked, onFaceIdUnlock]);

  const triggerShake = () => {
    setShake(true);
    window.setTimeout(() => setShake(false), 420);
  };

  const appendDigit = (digit: string) => {
    if (blocked || busy || pin.length >= pinLength) return;
    setPin((current) => `${current}${digit}`.slice(0, pinLength));
  };
  const removeDigit = () => setPin((current) => current.slice(0, -1));

  useEffect(() => {
    if (mode !== "locked" || blocked || busy || !isSixDigitPin(pin) || submittingRef.current) return;
    submittingRef.current = true;
    onUnlock(pin).then((ok) => {
      submittingRef.current = false;
      if (!ok) {
        triggerShake();
        setPin("");
      }
    });
  }, [pin, mode, blocked, busy, onUnlock]);

  useEffect(() => {
    if (mode !== "setup" || !isSixDigitPin(pin)) return;
    queueMicrotask(() => {
      if (setupStage === "new") {
        setNewPinDraft(pin);
        setPin("");
        setSetupStage("confirm");
        setSetupError("");
        return;
      }
      if (pin === newPinDraft) {
        onSetup(pin);
        return;
      }
      setSetupError("PIN สองรอบไม่ตรงกัน ลองใหม่อีกครั้ง");
      triggerShake();
      setPin("");
      setNewPinDraft("");
      setSetupStage("new");
    });
  }, [pin, mode, setupStage, newPinDraft, onSetup]);

  const title = mode === "setup"
    ? (setupStage === "new" ? "ตั้งรหัส PIN 6 หลัก" : "ยืนยันรหัส PIN อีกครั้ง")
    : displayName
      ? `สวัสดี ${displayName}`
      : "ใส่รหัส PIN";
  const copy = mode === "setup"
    ? (setupStage === "new" ? "ตั้ง PIN สำหรับเข้าใช้งานแอพนี้บนทุกเครื่องที่ล็อกอินบัญชีเดียวกัน" : "กรอกรหัสเดิมอีกครั้งเพื่อยืนยัน")
    : "ใส่รหัส PIN เพื่อเข้าใช้งาน";

  return (
    <main className="shell pin-shell">
      <section className="phone pin-screen">
        <div className={`pin-content ${shake ? "shake" : ""}`}>
          <div className="pin-identity">
            <span className={`avatar pin-avatar ${displayIconImage ? "has-image" : ""}`}>
              {displayIconImage && <NextImage className="profile-image" src={displayIconImage} alt="" width={64} height={64} unoptimized />}
              {!displayIconImage && (mode === "setup" ? <Lock size={26} strokeWidth={2.25} aria-hidden="true" /> : displayIcon)}
            </span>
            <p className="eyebrow">{mode === "setup" ? "ตั้งค่าความเป็นส่วนตัว" : "ยืนยันตัวตน"}</p>
            <h1>{title}</h1>
            <p className="pin-copy">{copy}</p>
          </div>

          {mode === "checking" && (
            <div className="pin-loading">
              <span className="loading-spinner mini" />
              <span>กำลังตรวจสอบสถานะ PIN</span>
            </div>
          )}

          {mode !== "checking" && (
            <>
              <div className="pin-dots" aria-label={`กรอกแล้ว ${pin.length} หลัก`}>
                {Array.from({ length: pinLength }, (_, index) => (
                  <span key={index} className={`${index < pin.length ? "filled" : ""} ${shake ? "error" : ""}`} />
                ))}
              </div>

              <div className="pin-status">
                {mode === "locked" && blocked && <p className="pin-error">ใส่ผิดครบ 5 ครั้ง กรุณารอประมาณ {remainingMinutes} นาที</p>}
                {mode === "locked" && !blocked && error && <p className="pin-error">{error}</p>}
                {mode === "locked" && !blocked && !error && remainingAttempts < pinMaxAttempts && <p className="pin-hint">ใส่ผิดได้อีก {remainingAttempts} ครั้ง</p>}
                {mode === "setup" && (setupError || error) && <p className="pin-error">{setupError || error}</p>}
              </div>

              <PinKeypad
                onDigit={appendDigit}
                onBackspace={removeDigit}
                disabled={busy || blocked}
                onFaceId={mode === "locked" && faceIdAvailable && !blocked ? () => onFaceIdUnlock() : undefined}
              />

              <div className="pin-footer">
                {mode === "setup" && <button className="pin-link-button" onClick={onLogout}>ออกจากระบบ</button>}
                {mode === "locked" && <button className="pin-link-button" onClick={onForgot} disabled={busy}>ลืม PIN / ออกจากระบบเพื่อรีเซ็ต</button>}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function PinKeypad({
  onDigit,
  onBackspace,
  disabled,
  onFaceId,
}: {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  disabled: boolean;
  onFaceId?: () => void;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return (
    <div className="pin-keypad">
      {keys.map((key) => <button key={key} onClick={() => onDigit(key)} disabled={disabled}>{key}</button>)}
      {onFaceId ? (
        <button className="pin-keypad-faceid" onClick={onFaceId} disabled={disabled} aria-label="ใช้ Face ID">
          <ScanFace size={22} strokeWidth={2} aria-hidden="true" />
        </button>
      ) : <span />}
      <button onClick={() => onDigit("0")} disabled={disabled}>0</button>
      <button className="pin-keypad-delete" onClick={onBackspace} disabled={disabled} aria-label="ลบ">
        <Delete size={20} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}

function PinSecuritySheet({
  pinEnabled,
  webauthnEnabled,
  busy,
  error,
  onClose,
  onEnable,
  onChange,
  onDisable,
  onEnableFaceId,
  onDisableFaceId,
  closing,
}: {
  pinEnabled: boolean;
  webauthnEnabled: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onEnable: (nextPin: string) => void;
  onChange: (currentPin: string, nextPin: string) => void;
  onDisable: (currentPin: string) => void;
  onEnableFaceId: (currentPin: string) => Promise<boolean>;
  onDisableFaceId: (currentPin: string) => Promise<boolean>;
  closing?: boolean;
}) {
  const [mode, setMode] = useState<"change" | "disable" | "faceid">("change");
  const [currentPin, setCurrentPin] = useState("");
  const [nextPin, setNextPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [faceIdSupported, setFaceIdSupported] = useState(false);
  const mismatch = mode === "change" && confirmPin.length === pinLength && nextPin !== confirmPin;
  const clean = (value: string) => value.replace(/\D/g, "").slice(0, pinLength);
  const canSaveChange = pinEnabled
    ? isSixDigitPin(currentPin) && isSixDigitPin(nextPin) && nextPin === confirmPin
    : isSixDigitPin(nextPin) && nextPin === confirmPin;

  useEffect(() => {
    let cancelled = false;
    isPlatformAuthenticatorAvailable().then((available) => {
      if (!cancelled) setFaceIdSupported(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={`sheet-backdrop ${closing ? "closing" : ""}`}>
      <section className={`edit-sheet pin-edit-sheet ${closing ? "closing" : ""}`}>
        <div className="sheet-head">
          <div>
            <p className="eyebrow">ความปลอดภัย</p>
            <h2>{pinEnabled ? "จัดการ PIN" : "เปิดใช้ PIN"}</h2>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        {pinEnabled && (
          <div className="report-period-toggle pin-mode-toggle">
            <button className={mode === "change" ? "active" : ""} onClick={() => setMode("change")}>เปลี่ยน PIN</button>
            <button className={mode === "disable" ? "active" : ""} onClick={() => setMode("disable")}>ปิด PIN</button>
            {faceIdSupported && (
              <button className={mode === "faceid" ? "active" : ""} onClick={() => setMode("faceid")}>Face ID</button>
            )}
          </div>
        )}

        {pinEnabled && (
          <label>
            PIN ปัจจุบัน
            <input inputMode="numeric" type="password" maxLength={pinLength} value={currentPin} onChange={(event) => setCurrentPin(clean(event.target.value))} />
          </label>
        )}

        {mode === "change" && (
          <>
            <label>
              PIN ใหม่
              <input inputMode="numeric" type="password" maxLength={pinLength} value={nextPin} onChange={(event) => setNextPin(clean(event.target.value))} />
            </label>
            <label>
              ยืนยัน PIN ใหม่
              <input inputMode="numeric" type="password" maxLength={pinLength} value={confirmPin} onChange={(event) => setConfirmPin(clean(event.target.value))} />
            </label>
            {(mismatch || error) && <p className="pin-error">{mismatch ? "PIN ใหม่สองรอบไม่ตรงกัน" : error}</p>}
            <button className="save" onClick={() => (pinEnabled ? onChange(currentPin, nextPin) : onEnable(nextPin))} disabled={busy || !canSaveChange}>
              {busy ? "กำลังบันทึก" : pinEnabled ? "บันทึก PIN ใหม่" : "เปิดใช้ PIN"}
            </button>
          </>
        )}

        {mode === "disable" && (
          <>
            {error && <p className="pin-error">{error}</p>}
            <p className="pin-hint">ปิด PIN แล้วครั้งต่อไปจะเข้าแอพได้ทันทีโดยไม่ต้องกรอกรหัส</p>
            <button className="danger pin-danger-button" onClick={() => onDisable(currentPin)} disabled={busy || !isSixDigitPin(currentPin)}>
              {busy ? "กำลังปิด PIN" : "ปิดใช้งาน PIN"}
            </button>
          </>
        )}

        {mode === "faceid" && (
          <>
            {error && <p className="pin-error">{error}</p>}
            {webauthnEnabled ? (
              <>
                <p className="pin-hint">เปิดใช้งานแล้วบนเครื่องนี้</p>
                <button className="danger pin-danger-button" onClick={() => onDisableFaceId(currentPin)} disabled={busy || !isSixDigitPin(currentPin)}>
                  {busy ? "กำลังปิด Face ID" : "ปิดใช้งาน Face ID"}
                </button>
              </>
            ) : (
              <>
                <p className="pin-hint">ใช้ Face ID ปลดล็อกแอพแทนการกรอก PIN ทุกครั้ง (ยังต้องมี PIN ไว้เป็นทางสำรอง)</p>
                <button className="save" onClick={() => onEnableFaceId(currentPin)} disabled={busy || !isSixDigitPin(currentPin)}>
                  {busy ? "กำลังเปิดใช้ Face ID" : "เปิดใช้ Face ID"}
                </button>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Auth() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function signInWithGoogle() {
    if (!supabase) return;
    setBusy(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          access_type: "offline",
          prompt: "select_account",
        },
      },
    });

    if (error) {
      setMessage(error.message);
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    setMessage(error ? error.message : "ส่งลิงก์เข้าใช้งานแล้ว กรุณาตรวจอีเมลของคุณ");
    setBusy(false);
  }

  return (
    <main className="shell">
      <section className="phone auth-screen">
        <div className="auth-card">
          <div className="auth-mark">฿</div>
          <p className="eyebrow">รายรับรายจ่ายที่เข้าใจคุณ</p>
          <h1>เข้าสู่ระบบ</h1>
          <p className="auth-copy">ใช้บัญชี Google เพื่อซิงก์ข้อมูลรายรับรายจ่ายทุกเครื่อง</p>
          <button className="google-button" onClick={signInWithGoogle} disabled={busy}>
            <GoogleIcon />
            {busy ? "กำลังพาไป Google..." : "ดำเนินการต่อด้วย Google"}
          </button>
          <details className="email-fallback">
            <summary>หรือเข้าใช้งานด้วยอีเมล</summary>
            <form onSubmit={submit}>
              <label htmlFor="email">อีเมล</label>
              <input id="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
              <button className="primary" disabled={busy}>
                {busy ? "กำลังส่ง..." : "ส่งลิงก์เข้าใช้งาน"}
              </button>
            </form>
          </details>
          <small>
            การเข้าสู่ระบบถือว่าคุณยอมรับ <span>ข้อกำหนด</span> และ <span>นโยบาย</span>
          </small>
        </div>
        {message && <p className="auth-message">{message}</p>}
      </section>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

const CalendarHeatmap = memo(function CalendarHeatmap({
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

function HeatmapLegend({ total, activeDays }: { total: number; activeDays: number }) {
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

const CountUpMoney = memo(function CountUpMoney({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = window.requestAnimationFrame(() => {
        setShown(value);
        fromRef.current = value;
      });
      return () => window.cancelAnimationFrame(id);
    }
    const from = fromRef.current;
    const to = value;
    const duration = 420;
    let startTime: number | null = null;
    let frameId: number;
    const tick = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min(1, (timestamp - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(from + (to - from) * eased);
      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [value]);

  return <>{moneySign}{formatMoney(shown)}</>;
});

function HeroWalletCard({
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

function HomeInsightGrid({
  netWorth,
  savingsRate,
  receivableTotal,
  payableTotal,
}: {
  netWorth: number;
  savingsRate: number;
  receivableTotal: number;
  payableTotal: number;
}) {
  const savingsPositive = savingsRate >= 0;
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const cardCount = 4;
  const scrollFrameRef = useRef<number | null>(null);

  const handleScroll = () => {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const track = trackRef.current;
      if (!track || !track.clientWidth) return;
      const index = Math.round(track.scrollLeft / track.clientWidth);
      setActiveIndex(Math.max(0, Math.min(cardCount - 1, index)));
    });
  };

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
  }, []);

  const scrollToIndex = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: index * track.clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <section className="home-insight-wrap">
      <div className="home-insight-grid" ref={trackRef} onScroll={handleScroll} aria-label="ภาพรวมทรัพย์สิน">
        <div className="home-insight-card net-worth">
          <span><i className="home-insight-icon neutral"><Wallet size={13} strokeWidth={2.25} aria-hidden="true" /></i>มูลค่าสุทธิ</span>
          <strong>{formatSignedMoney(netWorth)}</strong>
          <small>กระเป๋า + ลูกหนี้ - หนี้ที่ต้องจ่าย</small>
        </div>
        <div className={`home-insight-card ${savingsPositive ? "income" : "expense"}`}>
          <span>
            <i className={`home-insight-icon ${savingsPositive ? "income" : "expense"}`}>
              {savingsPositive ? <TrendingUp size={13} strokeWidth={2.25} aria-hidden="true" /> : <TrendingDown size={13} strokeWidth={2.25} aria-hidden="true" />}
            </i>
            อัตราเงินเหลือ
          </span>
          <strong>{Number.isFinite(savingsRate) ? `${Math.round(savingsRate)}%` : "0%"}</strong>
          <small>เทียบกับรายรับในรอบนี้</small>
        </div>
        <div className="home-insight-card">
          <span><i className="home-insight-icon neutral"><Users size={13} strokeWidth={2.25} aria-hidden="true" /></i>ลูกหนี้</span>
          <strong><CountUpMoney value={receivableTotal} /></strong>
          <small>ยอดที่ควรได้รับคืน</small>
        </div>
        <div className="home-insight-card">
          <span><i className="home-insight-icon neutral"><CreditCard size={13} strokeWidth={2.25} aria-hidden="true" /></i>หนี้ผ่อน</span>
          <strong><CountUpMoney value={payableTotal} /></strong>
          <small>ยอดที่ยังต้องจ่าย</small>
        </div>
      </div>
      <div className="home-insight-dots" aria-hidden="true">
        {Array.from({ length: cardCount }, (_, index) => (
          <button
            key={index}
            className={index === activeIndex ? "active" : ""}
            onClick={() => scrollToIndex(index)}
            tabIndex={-1}
          />
        ))}
      </div>
    </section>
  );
}

function DueSoonCard({
  items,
  onManage,
}: {
  items: { item: RecurringExpense; billingDate: Date; daysUntil: number }[];
  onManage: () => void;
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
          {items.slice(0, 3).map(({ item, billingDate, daysUntil }) => (
            <div key={item.id}>
              <i className="cat-dot" style={{ background: item.icon_color ?? nameColor(item.name) }}><WalletAvatarGlyph iconKey={item.icon} fallbackName={item.name} size={14} /></i>
              <span>{item.name}</span>
              <small>{daysUntil === 0 ? "วันนี้" : `อีก ${daysUntil} วัน`} · {billingDate.getDate()}/{billingDate.getMonth() + 1}</small>
              <b>{moneySign}{formatMoney(item.amount)}</b>
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

function BudgetGlanceCard({
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
                <i className="cat-dot" style={{ background: categoryTint(item.category, 13) }}><CategoryIcon category={item.category} /></i>
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

function GoalCard({ goals, onAdd, onDelete }: { goals: MoneyGoal[]; onAdd: () => void; onDelete: (goal: MoneyGoal) => void }) {
  if (!goals.length) {
    return (
      <section className="goal-card goal-empty">
        <div>
          <p className="eyebrow">เป้าหมายการเงิน</p>
          <h2>เก็บเงินให้มีแรงส่ง</h2>
          <p>ตั้งเป้าหมายแรก แล้วติดตามความคืบหน้าได้จากหน้าแรก</p>
        </div>
        <button className="text-button" onClick={onAdd}>สร้างเป้าหมาย</button>
      </section>
    );
  }

  return (
    <section className="goal-card">
      <div className="goal-card-head"><div><p className="eyebrow">เป้าหมายการเงิน</p><h2>{goals.length} เป้าหมาย</h2></div><button className="text-button" onClick={onAdd}>เพิ่มเป้าหมาย</button></div>
      <div className="goal-list">
        {goals.slice(0, 3).map((goal) => {
          const progress = Math.min(100, Math.max(0, (goal.saved / goal.target) * 100));
          return <div className="goal-item" key={goal.id}>
            <div className="goal-item-head"><b>{goal.name}</b><button className="icon-button" onClick={() => onDelete(goal)} aria-label={`ลบเป้าหมาย ${goal.name}`}>×</button></div>
            <div className="goal-card-values"><strong>{moneySign}{formatMoney(goal.saved)}</strong><span>จาก {moneySign}{formatMoney(goal.target)}</span></div>
            <div className="goal-progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress}%` }} /></div>
            <small>{Math.round(progress)}%{goal.deadline ? ` · เป้าหมาย ${new Date(`${goal.deadline}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}` : ""}</small>
          </div>;
        })}
      </div>
    </section>
  );
}

function GoalEditSheet({ onClose, onCreate, closing }: { onClose: () => void; onCreate: (input: Omit<MoneyGoal, "id">) => void; closing?: boolean }) {
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
      <label>ชื่อเป้าหมาย<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น เงินฉุกเฉิน" /></label>
      <label>ยอดเป้าหมาย<input inputMode="decimal" value={targetText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setTargetText(event.target.value); }} placeholder="50000" /></label>
      <label>มีเงินเก็บแล้ว<input inputMode="decimal" value={savedText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setSavedText(event.target.value); }} placeholder="0" /></label>
      <label>วันที่อยากบรรลุ (ถ้ามี)<input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
      <button className="save" onClick={submit} disabled={!name.trim() || toMoneyAmount(targetText) <= 0}>สร้างเป้าหมาย</button>
    </SheetFrame>
  );
}

function CashFlowTrendCard({ trend }: { trend: { key: string; label: string; income: number; expense: number }[] }) {
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

function SpendingPersonalityCard({ topCategory, monthlyOutflow }: { topCategory: { category: string; amount: number } | null; monthlyOutflow: number }) {
  const hasSpend = !!topCategory && topCategory.amount > 0.005;
  const percent = hasSpend && monthlyOutflow > 0 ? Math.round((topCategory!.amount / monthlyOutflow) * 100) : 0;

  return (
    <section className="home-focus-card spending-personality-card">
      <div className="home-focus-head">
        <div>
          <span>นิสัยการใช้เงินเดือนนี้</span>
          <strong>{hasSpend ? topCategory!.category : "ยังไม่มีข้อมูล"}</strong>
        </div>
        {hasSpend && (
          <i className="cat-dot" style={{ background: categoryTint(topCategory!.category, 13) }}><CategoryIcon category={topCategory!.category} /></i>
        )}
      </div>
      {hasSpend ? (
        <p className="spending-personality-note">
          คุณใช้จ่ายด้าน{topCategory!.category}มากที่สุด — {moneySign}{formatMoney(topCategory!.amount)} หรือ {percent}% ของรายจ่ายทั้งหมดเดือนนี้
        </p>
      ) : (
        <div className="home-compact-empty">
          <span aria-hidden="true">●</span>
          <p>เริ่มจดรายการเพื่อดูว่าคุณใช้จ่ายด้านไหนมากที่สุด</p>
        </div>
      )}
    </section>
  );
}

function FirstRunHomeState({
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

function SuccessPulse({ count, onAddMore, closing }: { count: number; onAddMore: () => void; closing?: boolean }) {
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

function HistoryInsight({ entries }: { entries: Entry[] }) {
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

function HistoryFilterBar({
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
            <select value={filters.category} onChange={(event) => update({ category: event.target.value })}>
              <option value="">ทุกหมวด</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            ประเภทรายการ
            <select value={filters.type} onChange={(event) => update({ type: event.target.value as HistoryFilters["type"] })}>
              <option value="all">ทุกชนิด</option>
              {Object.entries(transactionTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
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

function MonthlyTrendChart({ trend }: { trend: { key: string; label: string; income: number; outflow: number }[] }) {
  const max = Math.max(...trend.flatMap((item) => [item.income, item.outflow]), 1);
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
    </details>
  );
}

function IncomeBreakdown({ items }: { items: { category: string; amount: number }[] }) {
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
            <span className="cat-dot" style={{ background: categoryTint(item.category, 13) }}><CategoryIcon category={item.category} /></span>
            <b>{item.category}</b>
            <strong>{moneySign}{formatMoney(item.amount)}</strong>
          </div>
        ))}
      </div>
    </details>
  );
}

function MonthSummary({
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
        <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
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
                  <span className="cat-dot" style={{ background: categoryTint(item.category, 13) }}><CategoryIcon category={item.category} /></span>
                  <b>{item.category}</b>
                  {overBudget && <span className="over-budget-chip">เกินงบ</span>}
                  <small>{hasBudget ? `${moneySign}${formatMoney(item.amount)} / ${moneySign}${formatMoney(budget)}` : `${percent.toFixed(0)}%`}</small>
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
              <small>{outflow > 0 ? `${((lentOut / outflow) * 100).toFixed(0)}%` : "0%"}</small>
              <strong>{moneySign}{formatMoney(lentOut)}</strong>
            </div>
            <i style={{ width: `${Math.max(4, Math.min(100, outflow > 0 ? (lentOut / outflow) * 100 : 0))}%` }} />
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyNote({ glyph, children, action }: { glyph: string; children: React.ReactNode; action?: EmptyAction }) {
  return (
    <div className="empty-note">
      <span className="empty-glyph">{glyph}</span>
      <p>{children}</p>
      {action && <button onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}

function ToastHost({ toasts, closingIds, onDismiss }: { toasts: Toast[]; closingIds: number[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="toast-host" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          className={`toast ${toast.tone} ${closingIds.includes(toast.id) ? "closing" : ""}`}
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
        >
          <span aria-hidden="true">{toast.tone === "success" ? "✓" : toast.tone === "error" ? "!" : "✦"}</span>
          <span>
            <b>{toast.title}</b>
            {toast.detail && <small>{toast.detail}</small>}
            {toast.action && (
              <small className="toast-action">
                {toast.action.label}
              </small>
            )}
          </span>
        </button>
      ))}
    </div>,
    document.body,
  );
}

function SheetFrame({ children, onClose, className = "edit-sheet", closing = false }: { children: React.ReactNode; onClose: () => void; className?: string; closing?: boolean }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className={`sheet-backdrop ${closing ? "closing" : ""}`} onMouseDown={onClose}>
      <section className={`${className} ${closing ? "closing" : ""}`} onMouseDown={(event) => event.stopPropagation()}>
        {children}
      </section>
    </div>
  );
}

/**
 * Keeps an overlay mounted for `duration` after `active` goes false so its
 * CSS exit animation (the `.closing` class) can finish instead of the
 * overlay just vanishing. `onExited` fires once the animation completes —
 * that's when the caller should actually clear its own state.
 */
function useDismiss<A extends unknown[] = []>(active: boolean, onExited: (...args: A) => void, duration = 320) {
  const [mounted, setMounted] = useState(active);
  const [closing, setClosing] = useState(false);
  const [prevActive, setPrevActive] = useState(active);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reopening while still "closing" (or after having fully closed) needs to
  // reset synchronously so the sheet doesn't flash away mid re-open. This is
  // React's documented pattern for adjusting state when a prop changes.
  if (active !== prevActive) {
    setPrevActive(active);
    if (active) {
      setMounted(true);
      setClosing(false);
    }
  }

  useEffect(() => {
    if (active && timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [active]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const requestClose = useCallback((...args: A) => {
    setClosing(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setMounted(false);
      setClosing(false);
      onExited(...args);
    }, duration);
  }, [duration, onExited]);

  return { mounted, closing, requestClose };
}

function ConfirmDialog({ dialog, onClose, closing = false }: { dialog: ConfirmDialogState; onClose: (confirmed: boolean) => void; closing?: boolean }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className={`dialog-backdrop ${closing ? "closing" : ""}`} onMouseDown={() => onClose(false)}>
      <section className={`confirm-dialog ${closing ? "closing" : ""}`} onMouseDown={(event) => event.stopPropagation()}>
        <h2>{dialog.title}</h2>
        <p>{dialog.detail}</p>
        <div>
          <button onClick={() => onClose(false)}>ยกเลิก</button>
          <button className={dialog.tone === "danger" ? "danger" : undefined} onClick={() => onClose(true)}>
            {dialog.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

const decimalInputPattern = /^\d*\.?\d*$/;

function AmountInput({ value, onChange, disabled }: { value: number; onChange: (value: number) => void; disabled?: boolean }) {
  const [text, setText] = useState(() => (value ? String(value) : ""));

  if ((Number(text) || 0) !== value) {
    setText(value ? String(value) : "");
  }

  return (
    <input
      inputMode="decimal"
      value={text}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value;
        if (next !== "" && !decimalInputPattern.test(next)) return;
        setText(next);
        onChange(Number(next) || 0);
      }}
    />
  );
}

function StateCard({
  tone,
  title,
  detail,
  action,
}: {
  tone: "loading" | "empty" | "error";
  title: string;
  detail: string;
  action?: EmptyAction;
}) {
  return (
    <div className={`state-card ${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span className="state-orb" aria-hidden="true">
        {tone === "loading" ? <span className="loading-spinner mini" /> : tone === "error" ? "!" : "•"}
      </span>
      <div>
        <b>{title}</b>
        <small>{detail}</small>
        {action && <button onClick={action.onClick}>{action.label}</button>}
      </div>
    </div>
  );
}

function SkeletonDashboard() {
  return (
    <div className="skeleton-stack" aria-hidden="true">
      <div className="skeleton-card hero" />
      <div className="skeleton-grid">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="skeleton-panel">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index}>
          <i />
          <b />
          <em />
        </span>
      ))}
    </div>
  );
}

function ErrorActions({ onRetry, onDismiss }: { onRetry: () => void; onDismiss: () => void }) {
  return (
    <div className="error-actions">
      <button onClick={onRetry}>ลองซิงค์อีกครั้ง</button>
      <button onClick={onDismiss}>ปิดข้อความ</button>
    </div>
  );
}

function Metric({ label, value, tone, showPositiveSign = false }: { label: string; value: number; tone?: "income" | "expense"; showPositiveSign?: boolean }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <b>{value < 0 ? "−" : showPositiveSign && value > 0 ? "+" : ""}<CountUpMoney value={Math.abs(value)} /></b>
    </div>
  );
}

function DraftRow({ draft, knownDebtors, wallets, onChange, onRemove }: { draft: Draft; knownDebtors: Debtor[]; wallets: Wallet[]; onChange: (draft: Draft) => void; onRemove: () => void }) {
  const update = (patch: Partial<Draft>) => onChange(normalizeEntry({ ...draft, ...patch }, false));
  const isDebtType = (["lend", "split_half", "debt_repayment", "debt_payment", "card_charge"] as TransactionType[]).includes(draft.transaction_type);
  const isOwnDebtType = (["debt_payment", "card_charge"] as TransactionType[]).includes(draft.transaction_type);
  const relevantKind: DebtorKind = isOwnDebtType ? "own" : "lend";
  const knownNames = knownDebtors.filter((debtor) => debtor.kind === relevantKind).map((debtor) => debtor.name);
  const isNewDebtor = isDebtType && !!draft.debtor_name.trim() && draft.debtor_name !== unnamedDebtor && !knownNames.some((name) => name.trim().toLowerCase() === draft.debtor_name.trim().toLowerCase());
  const isTransfer = draft.transaction_type === "transfer";
  const transferInvalid = isTransfer && (!draft.transfer_to_wallet_id || draft.transfer_to_wallet_id === draft.wallet_id);

  return (
    <div className={`draft draft-${draft.transaction_type}`}>
      <button className="draft-remove" onClick={onRemove} aria-label="ลบรายการนี้ออกจากรายการที่ตรวจสอบ">
        <X size={14} strokeWidth={2.5} />
      </button>
      <span className="cat-icon" style={{ background: categoryTint(draft.category, 13) }}><CategoryIcon category={draft.category} size={18} /></span>
      <div>
        <input value={draft.title} onChange={(event) => update({ title: event.target.value })} />
        <select value={draft.category} onChange={(event) => update({ category: event.target.value })}>
          {categories.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
      </div>
      <div className="draft-side">
        <span className="draft-type-badge">{transactionTypeLabels[draft.transaction_type]}</span>
        <select value={draft.transaction_type} onChange={(event) => update({ transaction_type: event.target.value as TransactionType })}>
          {Object.entries(transactionTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label>
          {moneySign}
          <AmountInput value={draft.amount} onChange={(amount) => update({ amount })} />
        </label>
      </div>
      {isTransfer ? (
        <div className="impact-row">
          <span>โอนออก {formatSignedMoney(-draft.amount)}</span>
          <span>โอนเข้า {formatSignedMoney(draft.amount)}</span>
        </div>
      ) : (
        <div className="impact-row">
          <span>กระเป๋า {formatSignedMoney(draft.wallet_impact)}</span>
          <span>หนี้ {formatSignedMoney(draft.debt_impact)}</span>
        </div>
      )}
      {isDebtType && (
        <div className="draft-debtor-field">
          <input
            className="draft-date"
            placeholder={draft.transaction_type === "card_charge" ? "ชื่อบัตร เช่น กรุงศรีเฟิร์สช้อย" : relevantKind === "own" ? "ชื่อหนี้ เช่น ผ่อนบ้าน ผ่อนรถ" : "ชื่อผู้เกี่ยวข้อง เช่น แฟน หรือ เพื่อนเอ"}
            value={draft.debtor_name}
            onChange={(event) => update({ debtor_name: event.target.value })}
          />
          {isNewDebtor && <small>{relevantKind === "own" ? "หนี้ใหม่" : "ลูกหนี้ใหม่"} · จะสร้างให้อัตโนมัติเมื่อบันทึก</small>}
        </div>
      )}
      <input className="draft-date" type="date" value={toDateInput(draft.occurred_at)} onChange={(event) => update({ occurred_at: withDateKeepingTime(event.target.value, draft.occurred_at) })} />
      {!!wallets.length && draft.transaction_type !== "card_charge" && (
        <select className="draft-date" value={draft.wallet_id ?? defaultWalletId(wallets) ?? ""} onChange={(event) => update({ wallet_id: event.target.value || null })}>
          {wallets.map((wallet) => (
            <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
          ))}
        </select>
      )}
      {isTransfer && !!wallets.length && (
        <select className="draft-date" aria-invalid={transferInvalid} value={draft.transfer_to_wallet_id ?? ""} onChange={(event) => update({ transfer_to_wallet_id: event.target.value || null })}>
          <option value="">ไปกระเป๋า…</option>
          {wallets.map((wallet) => (
            <option key={wallet.id} value={wallet.id} disabled={wallet.id === draft.wallet_id}>{wallet.name}</option>
          ))}
        </select>
      )}
      <input className="draft-date" value={draft.note ?? ""} onChange={(event) => update({ note: event.target.value })} placeholder="หมายเหตุ" />
    </div>
  );
}

function DraftImpact({ items }: { items: Draft[] }) {
  const wallet = items.filter((item) => item.transaction_type !== "transfer").reduce((sum, item) => sum + item.wallet_impact, 0);
  const debt = items.reduce((sum, item) => sum + item.debt_impact, 0);

  return (
    <div className="draft-impact">
      <span>กระเป๋าหลัก {formatSignedMoney(wallet)}</span>
      <span>ลูกหนี้ {formatSignedMoney(debt)}</span>
    </div>
  );
}

const EntryList = memo(function EntryList({
  entries,
  onEdit,
  onDelete,
  emptyAction,
  amountField = "wallet",
}: {
  entries: Entry[];
  onEdit?: (entry: Entry) => void;
  onDelete?: (entry: Entry) => void;
  emptyAction?: EmptyAction;
  amountField?: "wallet" | "debt";
}) {
  const groups = useMemo(() => groupEntriesByDay(entries), [entries]);

  return (
    <div className="entry-list">
      {groups.map((group) => (
        <div className="entry-group" key={group.label}>
          <p className="entry-day">{group.label}</p>
          {group.items.map((entry) => {
            const impact = amountField === "debt" ? entry.debt_impact : entryDisplayImpact(entry);
            return (
            <article
              className={onEdit ? "entry entry-tappable" : "entry"}
              key={entry.id}
              onClick={onEdit ? () => onEdit(entry) : undefined}
              role={onEdit ? "button" : undefined}
              tabIndex={onEdit ? 0 : undefined}
            >
              <span className="entry-icon" style={{ background: categoryTint(entry.category, 13) }}><CategoryIcon category={entry.category} size={18} /></span>
              <div>
                <b>{entry.title}</b>
                <small>
                  {transactionTypeLabels[entry.transaction_type]} · {entry.category} · {formatDateTime(entry.occurred_at)}
                  {entry.debt_impact !== 0 ? ` · ${entry.debtor_name}` : ""}
                </small>
                {entry.note && <small className="entry-note" title={entry.note}>{entry.note}</small>}
              </div>
              <strong className={impact >= 0 ? "income" : "expense"}>{formatSignedMoney(impact)}</strong>
              {(onEdit || onDelete) && (
                <menu onClick={(event) => event.stopPropagation()}>
                  {onEdit && <button onClick={() => onEdit(entry)} title="แก้ไข">แก้</button>}
                  {onDelete && <button onClick={() => onDelete(entry)} title="ลบ">ลบ</button>}
                </menu>
              )}
            </article>
            );
          })}
        </div>
      ))}
      {!entries.length && <EmptyNote glyph="▪" action={emptyAction}>ยังไม่มีรายการในช่วงนี้</EmptyNote>}
    </div>
  );
});

function RecentActivityTimeline({ entries, onEdit }: { entries: Entry[]; onEdit: (entry: Entry) => void }) {
  const recent = entries.slice(0, 4);
  if (!recent.length) return null;

  return (
    <section className="activity-timeline">
      <p className="activity-timeline-title">รายการล่าสุด</p>
      <div className="activity-timeline-list">
        {recent.map((entry) => (
          <button className="activity-timeline-row" key={entry.id} onClick={() => onEdit(entry)}>
            <i className="cat-dot" style={{ background: categoryTint(entry.category, 13) }}><CategoryIcon category={entry.category} size={14} /></i>
            <span className="activity-timeline-info">
              <b>{entry.title}</b>
              <small>{entry.category} · {formatDateTime(entry.occurred_at)}</small>
            </span>
            <span className={`activity-timeline-amount ${entryDisplayImpact(entry) >= 0 ? "income" : "expense"}`}>
              {formatSignedMoney(entryDisplayImpact(entry))}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function QuickAddStrip({
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
    <section className="quick-add-strip" aria-label="เพิ่มรายการด่วน">
      <div className="quick-add-head">
        <div>
          <p className="eyebrow">บันทึกให้เร็วขึ้น</p>
          <h2>รายการที่ใช้บ่อย</h2>
        </div>
        <button className="text-button" onClick={onMore}>รายการอื่น</button>
      </div>
      <div className="quick-add-list">
        {shortcuts.map((shortcut) => (
          <button className="quick-add-chip" key={`${shortcut.title}|${shortcut.category}`} onClick={() => onSelect(shortcut)}>
            <span className="cat-dot" style={{ background: categoryTint(shortcut.category, 13) }}>
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
}

function ManualEntryForm({
  wallets,
  busy,
  error,
  initialDate,
  initialPreset,
  onSave,
}: {
  wallets: Wallet[];
  busy: boolean;
  error: string;
  initialDate: string;
  initialPreset?: QuickShortcut | null;
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
  const update = (patch: Partial<Draft>) => setDraft(normalizeEntry({ ...draft, ...patch }, false));
  const isTransfer = draft.transaction_type === "transfer";
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
      <label>
        ชนิดรายการ
        <select value={draft.transaction_type} onChange={(event) => update({ transaction_type: event.target.value as TransactionType })}>
          {Object.entries(transactionTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        ชื่อรายการ{isTransfer && <small> (เว้นว่างได้ จะตั้งชื่อให้อัตโนมัติ)</small>}
        <input autoFocus value={draft.title} onChange={(event) => update({ title: event.target.value })} />
      </label>
      {!isTransfer && (
        <label>
          หมวดหมู่
          <select value={draft.category} onChange={(event) => update({ category: event.target.value })}>
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        จำนวนเงิน
        <AmountInput value={draft.amount} onChange={(amount) => update({ amount })} />
      </label>
      {(["lend", "split_half", "debt_repayment", "debt_payment", "card_charge"] as TransactionType[]).includes(draft.transaction_type) && (
        <label>
          {draft.transaction_type === "card_charge" ? "ชื่อบัตร" : "ชื่อผู้เกี่ยวข้อง"}
          <input type="text" placeholder={draft.transaction_type === "card_charge" ? "เช่น กรุงศรีเฟิร์สช้อย" : "เช่น เพื่อนเอ"} value={draft.debtor_name} onChange={(event) => update({ debtor_name: event.target.value })} />
        </label>
      )}
      <label>
        วันที่
        <input type="date" value={toDateInput(draft.occurred_at)} max={todayDateInput()} onChange={(event) => update({ occurred_at: withDateKeepingTime(event.target.value, draft.occurred_at) })} />
      </label>
      {!!wallets.length && draft.transaction_type !== "card_charge" && (
        <label>
          {isTransfer ? "จากกระเป๋า" : "กระเป๋า"}
          <select value={draft.wallet_id ?? defaultWalletId(wallets) ?? ""} onChange={(event) => update({ wallet_id: event.target.value || null })}>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
            ))}
          </select>
        </label>
      )}
      {isTransfer && !!wallets.length && (
        <label>
          ไปกระเป๋า
          <select value={destWalletId ?? ""} onChange={(event) => setDestWalletId(event.target.value || null)}>
            <option value="">เลือกกระเป๋าปลายทาง</option>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id} disabled={wallet.id === draft.wallet_id}>{wallet.name}</option>
            ))}
          </select>
        </label>
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

function EditSheet({
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
  const [destWalletId, setDestWalletId] = useState<string | null>(null);
  const wasTransfer = originalType === "transfer";
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
        <button onClick={onClose}>x</button>
      </div>

      {wasTransfer && <p className="pin-hint">รายการโอนเงินแก้ไขได้เฉพาะชื่อ วันที่ และหมายเหตุ — ลบได้ทั้งสองฝั่งพร้อมกัน</p>}
      {convertingToTransfer && <p className="pin-hint">เลือกกระเป๋าปลายทางก่อนบันทึกเป็นรายการโอน</p>}

      <label>
        ชื่อรายการ
        <input value={entry.title} onChange={(event) => update({ title: event.target.value })} />
      </label>
      {!isTransfer && (
        <label>
          หมวดหมู่
          <select value={entry.category} onChange={(event) => update({ category: event.target.value })}>
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        ชนิดรายการ
        <select value={entry.transaction_type} disabled={wasTransfer} onChange={(event) => update({ transaction_type: event.target.value as TransactionType })}>
          {Object.entries(transactionTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        จำนวนเงิน
        <AmountInput value={entry.amount} onChange={(amount) => update({ amount })} disabled={wasTransfer} />
      </label>
      {(["lend", "split_half", "debt_repayment", "debt_payment", "card_charge"] as TransactionType[]).includes(entry.transaction_type) && (
        <label>
          {entry.transaction_type === "card_charge" ? "ชื่อบัตร" : "ชื่อผู้เกี่ยวข้อง"}
          <input type="text" placeholder={entry.transaction_type === "card_charge" ? "เช่น กรุงศรีเฟิร์สช้อย" : "เช่น เพื่อนเอ"} value={entry.debtor_name} onChange={(event) => update({ debtor_name: event.target.value })} />
        </label>
      )}
      <label>
        วันที่
        <input type="date" value={toDateInput(entry.occurred_at)} onChange={(event) => update({ occurred_at: withDateKeepingTime(event.target.value, entry.occurred_at) })} />
      </label>
      {!!wallets.length && entry.transaction_type !== "card_charge" && !wasTransfer && (
        <label>
          {isTransfer ? "จากกระเป๋า" : "กระเป๋า"}
          <select value={entry.wallet_id ?? defaultWalletId(wallets) ?? ""} onChange={(event) => update({ wallet_id: event.target.value || null })}>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
            ))}
          </select>
        </label>
      )}
      {convertingToTransfer && !!wallets.length && (
        <label>
          ไปกระเป๋า
          <select value={destWalletId ?? ""} onChange={(event) => setDestWalletId(event.target.value || null)}>
            <option value="">เลือกกระเป๋าปลายทาง</option>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id} disabled={wallet.id === entry.wallet_id}>{wallet.name}</option>
            ))}
          </select>
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
function DebtorsView({
  debtors,
  entries,
  receivableSummary,
  payableSummary,
  selectedDebtor,
  activeKind,
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
          <button onClick={onBack}>‹</button>
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
          {selectedDebtor.kind === "own" && selectedDebtor.monthly_installment ? (
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

  return (
    <div className="view debtor-view">
      <div className="add-title">
        <button onClick={onBack}>‹</button>
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
        <span>{activeKind === "own" ? "หนี้ที่ต้องผ่อนรวม" : "ยอดรวมที่ค้างรับ"}</span>
        <strong><CountUpMoney value={summaryTotal} /></strong>
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
                  {debtor.kind === "own" && debtor.monthly_installment ? (
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

function CreditLimitMeter({ outstanding, creditLimit }: { outstanding: number; creditLimit: number }) {
  const pct = creditLimit > 0 ? Math.min(100, Math.max(0, (outstanding / creditLimit) * 100)) : 0;
  const tone = pct >= 90 ? "danger" : pct >= 70 ? "warn" : "safe";
  const remaining = Math.max(0, creditLimit - outstanding);

  return (
    <div className={`credit-limit-meter credit-limit-meter-${tone}`}>
      <div className="credit-limit-meter-track">
        <div className="credit-limit-meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <small>ใช้ไป {moneySign}{formatMoney(outstanding)} จากวงเงิน {moneySign}{formatMoney(creditLimit)} ({Math.round(pct)}%)</small>
      <small className="credit-limit-remaining">เหลือวงเงินใช้ได้ {moneySign}{formatMoney(remaining)}</small>
    </div>
  );
}

function DebtorStatementSummary({ entries, kind }: { entries: Entry[]; kind: DebtorKind }) {
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

const walletIconOptions: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: "wallet", label: "กระเป๋าเงิน", Icon: Wallet },
  { key: "piggy-bank", label: "เงินออม", Icon: PiggyBank },
  { key: "trending-up", label: "เงินลงทุน", Icon: TrendingUp },
  { key: "banknote", label: "เงินสด", Icon: Banknote },
  { key: "home", label: "บ้าน", Icon: HomeIcon },
  { key: "car", label: "รถ", Icon: Car },
  { key: "credit-card", label: "บัตรเครดิต", Icon: CreditCard },
  { key: "shopping-bag", label: "ช้อปปิ้ง", Icon: ShoppingBag },
  { key: "heart-pulse", label: "สุขภาพ", Icon: HeartPulse },
  { key: "graduation-cap", label: "การศึกษา", Icon: GraduationCap },
  { key: "plane", label: "ท่องเที่ยว", Icon: Plane },
  { key: "gift", label: "ของขวัญ", Icon: Gift },
  { key: "users", label: "ครอบครัว", Icon: Users },
  { key: "more-horizontal", label: "อื่น ๆ", Icon: MoreHorizontal },
];
const walletIconMap: Record<string, LucideIcon> = Object.fromEntries(walletIconOptions.map((option) => [option.key, option.Icon]));

const recurringIconOptions: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: "tv", label: "สตรีมมิง", Icon: Tv },
  { key: "monitor-play", label: "วิดีโอ", Icon: MonitorPlay },
  { key: "music", label: "เพลง", Icon: Music },
  { key: "bot", label: "AI", Icon: Bot },
  { key: "cloud", label: "คลาวด์", Icon: Cloud },
  { key: "gamepad", label: "เกม", Icon: Gamepad2 },
  { key: "receipt", label: "บริการรายเดือน", Icon: Receipt },
  { key: "credit-card", label: "การชำระเงิน", Icon: CreditCard },
];
const recurringIconMap: Record<string, LucideIcon> = Object.fromEntries(recurringIconOptions.map((option) => [option.key, option.Icon]));
const recurringServiceIconKeywords: { terms: string[]; key: string }[] = [
  { terms: ["netflix", "disney", "hbo", "prime video", "streaming"], key: "tv" },
  { terms: ["youtube", "video", "tiktok"], key: "monitor-play" },
  { terms: ["spotify", "apple music", "youtube music", "music"], key: "music" },
  { terms: ["claude", "chatgpt", "openai", "gemini", "ai"], key: "bot" },
  { terms: ["icloud", "google one", "dropbox", "onedrive", "cloud"], key: "cloud" },
  { terms: ["playstation", "xbox", "nintendo", "game pass", "gaming"], key: "gamepad" },
];

function inferredRecurringIcon(name: string) {
  const normalizedName = name.trim().toLowerCase();
  return recurringServiceIconKeywords.find(({ terms }) => terms.some((term) => normalizedName.includes(term)))?.key ?? "receipt";
}

function WalletAvatarGlyph({ iconKey, fallbackName, size = 18 }: { iconKey: string | null; fallbackName: string; size?: number }) {
  const Icon = (iconKey && walletIconMap[iconKey]) || null;
  if (!Icon) return <>{nameInitial(fallbackName)}</>;
  return <Icon size={size} strokeWidth={2.25} aria-hidden="true" />;
}

const iconColorSwatches = [
  "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7", "#e34948",
  "#14181c", "#c97a14", "#898781",
];

function IconColorPicker({
  value,
  onChange,
  fallbackName,
  iconOptions = walletIconOptions,
  renderGlyph = WalletAvatarGlyph,
}: {
  value: { icon: string | null; color: string | null };
  onChange: (next: { icon: string | null; color: string | null }) => void;
  fallbackName: string;
  iconOptions?: { key: string; label: string; Icon: LucideIcon }[];
  renderGlyph?: typeof WalletAvatarGlyph;
}) {
  const previewColor = value.color ?? nameColor(fallbackName);
  const Glyph = renderGlyph;

  return (
    <div className="icon-color-picker">
      <div className="icon-color-picker-preview">
        <span className="debtor-avatar" style={{ background: previewColor }}>
          <Glyph iconKey={value.icon} fallbackName={fallbackName} size={20} />
        </span>
        {(value.icon || value.color) && (
          <button type="button" className="icon-color-picker-reset" onClick={() => onChange({ icon: null, color: null })}>
            ใช้ค่าเริ่มต้น
          </button>
        )}
      </div>
      <div className="icon-color-picker-glyphs" role="group" aria-label="เลือกไอคอน">
        {iconOptions.map(({ key, label, Icon }) => (
          <button type="button" key={key} className={value.icon === key ? "active" : ""} onClick={() => onChange({ ...value, icon: key })} aria-label={label} title={label}>
            <Icon size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="icon-color-picker-swatches" role="group" aria-label="เลือกสี">
        {iconColorSwatches.map((hex) => (
          <button type="button" key={hex} className={value.color === hex ? "active" : ""} style={{ background: hex }} onClick={() => onChange({ ...value, color: hex })} aria-label={hex} />
        ))}
      </div>
    </div>
  );
}

type DebtorInput = {
  name: string;
  note: string;
  opening_balance: number;
  kind: DebtorKind;
  monthly_installment: number | null;
  total_installments: number | null;
  paid_installments: number | null;
  credit_limit: number | null;
  icon: string | null;
  icon_color: string | null;
};

function DebtorEditSheet({
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
  const [paidInstallmentsText, setPaidInstallmentsText] = useState(debtor?.paid_installments != null ? String(debtor.paid_installments) : "");
  const [totalInstallmentsText, setTotalInstallmentsText] = useState(debtor?.total_installments != null ? String(debtor.total_installments) : "");
  const [creditLimitText, setCreditLimitText] = useState(debtor?.credit_limit != null ? String(debtor.credit_limit) : "");
  const [icon, setIcon] = useState<string | null>(debtor?.icon ?? null);
  const [iconColor, setIconColor] = useState<string | null>(debtor?.icon_color ?? null);

  const hasInstallment = kind === "own" && monthlyInstallmentText !== "";

  const submit = async () => {
    if (!name.trim()) return;
    const totalInstallments = hasInstallment && totalInstallmentsText !== "" ? Math.max(0, Math.round(Number(totalInstallmentsText))) : null;
    let paidInstallments = hasInstallment && paidInstallmentsText !== "" ? Math.max(0, Math.round(Number(paidInstallmentsText))) : null;
    if (totalInstallments != null && paidInstallments != null && paidInstallments > totalInstallments) {
      paidInstallments = totalInstallments;
    }
    const payload: DebtorInput = {
      name,
      note,
      opening_balance: toMoneyAmount(openingBalanceText),
      kind,
      monthly_installment: hasInstallment ? toMoneyAmount(monthlyInstallmentText) : null,
      total_installments: totalInstallments,
      paid_installments: paidInstallments,
      credit_limit: kind === "own" && creditLimitText !== "" ? toMoneyAmount(creditLimitText) : null,
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
        ชื่อ
        <input autoFocus={!debtor} value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "own" ? "เช่น ผ่อนบ้าน ผ่อนรถ" : "เช่น เพื่อนเอ"} />
      </label>
      <label>
        หมายเหตุ
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={kind === "own" ? "เช่น ธนาคาร หรือรายละเอียดหนี้" : "เช่น เพื่อนร่วมงาน"} />
      </label>
      <label>
        {kind === "own" ? "ยอดหนี้คงเหลือ" : "ยอดเริ่มต้น"}
        <input inputMode="decimal" value={openingBalanceText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setOpeningBalanceText(event.target.value); }} />
      </label>
      {kind === "own" && (
        <>
          <label>
            ผ่อนต่อเดือน
            <input inputMode="decimal" value={monthlyInstallmentText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setMonthlyInstallmentText(event.target.value); }} placeholder="เช่น 15000" />
          </label>
          {hasInstallment && (
            <div className="field-pair">
              <label>
                จ่ายไปแล้ว (งวด)
                <input inputMode="numeric" value={paidInstallmentsText} onChange={(event) => { if (event.target.value === "" || /^\d*$/.test(event.target.value)) setPaidInstallmentsText(event.target.value); }} placeholder="เช่น 6" />
              </label>
              <label>
                ทั้งหมด (งวด)
                <input inputMode="numeric" value={totalInstallmentsText} onChange={(event) => { if (event.target.value === "" || /^\d*$/.test(event.target.value)) setTotalInstallmentsText(event.target.value); }} placeholder="เช่น 24" />
              </label>
            </div>
          )}
          <label>
            วงเงิน (สำหรับบัตรเครดิต)
            <input inputMode="decimal" value={creditLimitText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setCreditLimitText(event.target.value); }} placeholder="เช่น 50000" />
          </label>
        </>
      )}
      {error && <StateCard tone="error" title="บันทึกไม่สำเร็จ" detail={error} />}
      <button className="save" onClick={submit} disabled={busy || !name.trim()}>
        {busy ? "กำลังบันทึก..." : "บันทึก"}
      </button>
    </SheetFrame>
  );
}
function RecapSheet({
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
    <div className={`sheet-backdrop ${closing ? "closing" : ""}`}>
      <section className={`recap-card ${closing ? "closing" : ""}`}>
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
            <span className="cat-dot" style={{ background: categoryTint(topCategory.category, 20) }}><CategoryIcon category={topCategory.category} /></span>
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
      </section>
    </div>
  );
}

function BudgetSheet({
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
    <div className={`sheet-backdrop ${closing ? "closing" : ""}`}>
      <section className={`edit-sheet budget-sheet ${closing ? "closing" : ""}`}>
        <div className="sheet-head">
          <div>
            <p className="eyebrow">ตั้งค่า</p>
            <h2>งบประมาณต่อเดือน</h2>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        <p className="budget-hint">ตั้งวงเงินต่อหมวดหมู่ เว้นว่างไว้ถ้าไม่ต้องการจำกัด บันทึกเฉพาะในเครื่องนี้เท่านั้น</p>
        {expenseCategories.map((category) => (
          <label key={category} className="budget-row">
            <span className="cat-dot" style={{ background: categoryTint(category, 13) }}><CategoryIcon category={category} /></span>
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
      </section>
    </div>
  );
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') { value += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { values.push(value.trim()); value = ""; continue; }
    value += char;
  }
  values.push(value.trim());
  return values;
}

function RecurringAvatarGlyph({ iconKey, fallbackName, size = 18 }: { iconKey: string | null; fallbackName: string; size?: number }) {
  const Icon = (iconKey && (recurringIconMap[iconKey] || walletIconMap[iconKey])) || recurringIconMap[inferredRecurringIcon(fallbackName)];
  return <Icon size={size} strokeWidth={2.25} aria-hidden="true" />;
}

function normalizeImportedDate(value: string) {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parts = text.split(/[/-]/).map(Number);
  if (parts.length === 3 && parts[2] > 1900) return `${parts[2]}-${String(parts[1]).padStart(2, "0")}-${String(parts[0]).padStart(2, "0")}`;
  return todayDateInput();
}

function CsvImportSheet({ busy, error, onClose, onImport, closing }: { busy: boolean; error: string; onClose: () => void; onImport: (rows: CsvImportRow[]) => Promise<boolean>; closing?: boolean }) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<keyof CsvImportRow, string>>({ title: "", amount: "", category: "", transaction_type: "", occurred_at: "", note: "", debtor_name: "", wallet_id: "" });
  const fields: { key: keyof CsvImportRow; label: string; required?: boolean }[] = [
    { key: "title", label: "ชื่อรายการ", required: true }, { key: "amount", label: "จำนวนเงิน", required: true }, { key: "occurred_at", label: "วันที่", required: true },
    { key: "category", label: "หมวดหมู่" }, { key: "transaction_type", label: "ประเภทรายการ" }, { key: "note", label: "หมายเหตุ" }, { key: "debtor_name", label: "ชื่อผู้เกี่ยวข้อง" }, { key: "wallet_id", label: "Wallet ID" },
  ];
  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    const lines = (await file.text()).split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return;
    const nextHeaders = parseCsvLine(lines[0]);
    setHeaders(nextHeaders);
    setRawRows(lines.slice(1).map(parseCsvLine));
    const guess = (names: string[]) => nextHeaders.find((header) => names.some((name) => header.toLowerCase().includes(name))) ?? "";
    setMapping({ title: guess(["title", "name", "รายการ", "ชื่อ"]), amount: guess(["amount", "เงิน", "ยอด"]), occurred_at: guess(["date", "วันที่", "occurred"]), category: guess(["category", "หมวด"]), transaction_type: guess(["type", "ประเภท"]), note: guess(["note", "หมายเหตุ"]), debtor_name: guess(["debtor", "ลูกหนี้", "ผู้เกี่ยวข้อง"]), wallet_id: guess(["wallet"]), });
  };
  const rows = useMemo(() => rawRows.map((cells) => {
    const value = (key: keyof CsvImportRow) => { const header = mapping[key]; return header ? cells[headers.indexOf(header)] ?? "" : ""; };
    return { title: value("title"), amount: toMoneyAmount(value("amount").replace(/[,฿]/g, "")), category: value("category") || "อื่น ๆ", transaction_type: (value("transaction_type") as TransactionType) || "personal_expense", occurred_at: normalizeImportedDate(value("occurred_at")), note: value("note"), debtor_name: value("debtor_name"), wallet_id: value("wallet_id") || null } satisfies CsvImportRow;
  }), [rawRows, mapping, headers]);
  const valid = rows.filter((row) => row.title.trim() && row.amount > 0 && row.occurred_at);
  return (
    <div className={`sheet-backdrop ${closing ? "closing" : ""}`}><section className={`edit-sheet report-sheet csv-import-sheet ${closing ? "closing" : ""}`}>
      <div className="sheet-head"><div><p className="eyebrow">นำเข้าข้อมูล</p><h2>นำเข้า CSV</h2></div><button onClick={onClose}>×</button></div>
      <label className="csv-file-picker">เลือกไฟล์ CSV<input type="file" accept=".csv,text/csv" onChange={(event) => { void chooseFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
      {!!headers.length && <>
        <p className="budget-hint">จับคู่คอลัมน์ก่อนนำเข้า ระบบจะไม่บันทึกจนกว่าจะกดยืนยัน</p>
        <div className="csv-mapping-grid">{fields.map((field) => <label key={field.key}>{field.label}{field.required && " *"}<select value={mapping[field.key]} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value }))}><option value="">ไม่ใช้คอลัมน์นี้</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div>
        <div className="csv-preview"><b>ตัวอย่าง {Math.min(valid.length, 5)} จาก {valid.length} รายการ</b>{valid.slice(0, 5).map((row, index) => <div key={`${row.title}-${index}`}><span>{row.title}</span><small>{row.occurred_at} · {row.category}</small><strong>{moneySign}{formatMoney(row.amount)}</strong></div>)}</div>
        {error && <StateCard tone="error" title="นำเข้าไม่สำเร็จ" detail={error} />}
        <button className="save" onClick={() => { void onImport(valid); }} disabled={busy || valid.length === 0}>นำเข้า {valid.length} รายการ</button>
      </>}
    </section></div>
  );
}

function cleanAiAnswer(value: string) {
  const withoutCodeMarkers = value
    .replace(/```[a-zA-Z]*\s*/g, "")
    .replace(/```/g, "")
    .trim();
  let plainText = withoutCodeMarkers;
  if (withoutCodeMarkers.startsWith("{") && withoutCodeMarkers.endsWith("}")) {
    try {
      const parsed = JSON.parse(withoutCodeMarkers) as Record<string, unknown>;
      plainText = [parsed.answer, parsed.response, parsed.message, ...Object.values(parsed)]
        .find((item): item is string => typeof item === "string" && item.trim().length > 0) ?? withoutCodeMarkers;
    } catch {
      plainText = withoutCodeMarkers;
    }
  }
  return plainText
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "– ")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .trim();
}

function AskFinanceSheet({ context, onClose, closing }: { context: AiFinanceContext; onClose: () => void; closing?: boolean }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ask = async () => {
    if (!question.trim()) return;
    setBusy(true); setError(""); setAnswer("");
    try {
      const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ question: question.trim(), context }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI ตอบคำถามไม่สำเร็จ");
      setAnswer(cleanAiAnswer(data.answer || "ยังไม่มีคำตอบ"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "AI ตอบคำถามไม่สำเร็จ"); }
    setBusy(false);
  };
  return <div className={`sheet-backdrop ${closing ? "closing" : ""}`}><section className={`edit-sheet ask-ai-sheet ${closing ? "closing" : ""}`}>
    <div className="sheet-head"><div><p className="eyebrow">ผู้ช่วยการเงิน</p><h2>ถาม AI เรื่องเงิน</h2></div><button onClick={onClose}>×</button></div>
    <p className="ask-ai-period">อ้างอิงตัวเลขที่แอปคำนวณไว้ใน{context.periodLabel}</p>
    <div className="ask-ai-examples"><span>ลองถาม</span><button onClick={() => setQuestion("เดือนนี้ฉันใช้เงินกับหมวดไหนมากที่สุด")}>หมวดไหนใช้เยอะสุด</button><button onClick={() => setQuestion("ช่วงนี้เงินของฉันเหลือเป็นอย่างไร")}>เงินเหลือเป็นอย่างไร</button></div>
    <textarea className="ask-ai-input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="เช่น เดือนนี้มีรายจ่ายอะไรที่ควรระวังบ้าง" />
    {error && <StateCard tone="error" title="ถาม AI ไม่สำเร็จ" detail={error} />}
    {answer && <div className="ask-ai-answer"><span>AI</span><p>{answer}</p></div>}
    <button className="save" onClick={() => { void ask(); }} disabled={busy || !question.trim()}>{busy ? "กำลังวิเคราะห์..." : "ถาม AI"}</button>
  </section></div>;
}

function ReportExportSheet({
  entries,
  wallets,
  receivableSummary,
  payableSummary,
  selectedMonth,
  monthStartDay,
  onClose,
  closing,
}: {
  entries: Entry[];
  wallets: Wallet[];
  receivableSummary: { name: string; amount: number }[];
  payableSummary: { name: string; amount: number }[];
  selectedMonth: string;
  monthStartDay: number;
  onClose: () => void;
  closing?: boolean;
}) {
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const [month, setMonth] = useState(selectedMonth);
  const [year, setYear] = useState(Number(selectedMonth.slice(0, 4)) || new Date().getFullYear());
  const range = useMemo(() => reportBounds(period, month, year, monthStartDay), [period, month, year, monthStartDay]);
  const reportEntries = useMemo(() => entriesInRange(entries, range.start, range.end), [entries, range]);
  const income = useMemo(() => totalWallet(reportEntries, "income"), [reportEntries]);
  const outflow = useMemo(() => Math.abs(totalWallet(reportEntries, "expense")), [reportEntries]);
  const balance = income - outflow;

  function submit() {
    const safeYear = Number.isFinite(year) ? year : new Date().getFullYear();
    const filenamePeriod = period === "month" ? month : String(safeYear);
    const csv = buildReportCsv({
      entries,
      wallets,
      receivableSummary,
      payableSummary,
      period,
      selectedMonth: month,
      selectedYear: safeYear,
      monthStartDay,
    });
    downloadCsv(`money-report-${filenamePeriod}.csv`, csv);
  }

  return (
    <div className={`sheet-backdrop ${closing ? "closing" : ""}`}>
      <section className={`edit-sheet report-sheet ${closing ? "closing" : ""}`}>
        <div className="sheet-head">
          <div>
            <p className="eyebrow">ส่งออกข้อมูล</p>
            <h2>รีพอร์ท Excel / Sheets</h2>
          </div>
          <button onClick={onClose}>×</button>
        </div>

        <div className="report-period-toggle">
          <button className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>รายเดือน</button>
          <button className={period === "year" ? "active" : ""} onClick={() => setPeriod("year")}>รายปี</button>
        </div>

        {period === "month" ? (
          <label>
            เลือกเดือน
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
            <small>ใช้รอบเดือนตามวันที่เริ่มรอบที่ตั้งไว้: วันที่ {monthStartDay}</small>
          </label>
        ) : (
          <label>
            เลือกปี
            <input type="number" min={2000} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} />
          </label>
        )}

        <ReportSummaryTiles income={income} outflow={outflow} balance={balance} count={reportEntries.length} />

        <div className="report-preview">
          <div>
            <span>ช่วงรายงาน</span>
            <b>{reportLabel(period, month, year, monthStartDay)}</b>
          </div>
          <div>
            <span>รายรับ</span>
            <b>{moneySign}{formatMoney(income)}</b>
          </div>
          <div>
            <span>รายจ่าย</span>
            <b>{moneySign}{formatMoney(outflow)}</b>
          </div>
          <div>
            <span>สุทธิ</span>
            <b>{formatSignedMoney(balance)}</b>
          </div>
          <div>
            <span>จำนวนรายการ</span>
            <b>{reportEntries.length}</b>
          </div>
        </div>

        <div className="report-includes">
          <span>CSV พร้อมเปิดใน Excel / Sheets</span>
          <b>สรุปยอด · หมวดหมู่ · ลูกหนี้ · กระเป๋า · รายการละเอียด</b>
        </div>
        <p className="budget-hint">ไฟล์ CSV เปิดด้วย Excel, Google Sheets หรือ Numbers ได้ และมีทั้งสรุปยอด หมวดหมู่ ลูกหนี้ กระเป๋า และรายการละเอียด</p>
        <button className="save" onClick={submit}>
          ดาวน์โหลดไฟล์ CSV
        </button>
      </section>
    </div>
  );
}

function ReportSummaryTiles({ income, outflow, balance, count }: { income: number; outflow: number; balance: number; count: number }) {
  return (
    <div className="report-summary-tiles">
      <div className="income">
        <span>รายรับ</span>
        <b>{moneySign}{formatMoney(income)}</b>
      </div>
      <div className="expense">
        <span>รายจ่าย</span>
        <b>{moneySign}{formatMoney(outflow)}</b>
      </div>
      <div className={balance >= 0 ? "income" : "expense"}>
        <span>สุทธิ</span>
        <b>{formatSignedMoney(balance)}</b>
      </div>
      <div>
        <span>รายการ</span>
        <b>{count}</b>
      </div>
    </div>
  );
}

function SideMenu({
  user,
  profile,
  onClose,
  onLogout,
  onOpenProfile,
  onOpenWallets,
  onOpenDebtors,
  onOpenRecurring,
  onOpenBudgets,
  onOpenReport,
  onOpenImport,
  onOpenAsk,
  onOpenPin,
  theme,
  onSetTheme,
  walletTotal,
  receivableTotal,
  payableTotal,
  recurringTotal,
  closing,
}: {
  user: User;
  profile: Profile | null;
  onClose: () => void;
  onLogout: () => void;
  onOpenProfile: () => void;
  onOpenWallets: () => void;
  onOpenDebtors: () => void;
  onOpenRecurring: () => void;
  onOpenBudgets: () => void;
  onOpenReport: () => void;
  onOpenImport: () => void;
  onOpenAsk: () => void;
  onOpenPin: () => void;
  theme: Theme;
  onSetTheme: (theme: Theme) => void;
  walletTotal: number;
  receivableTotal: number;
  payableTotal: number;
  recurringTotal: number;
  closing?: boolean;
}) {
  const metadata = user.user_metadata ?? {};
  const name = profile?.nickname || metadata.full_name || metadata.name || "ผู้ใช้";
  const appIcon = profile?.app_icon || user.email?.[0]?.toUpperCase() || "฿";
  const appIconImage = profile?.app_icon_image || "";

  return (
    <div className={`side-menu-backdrop ${closing ? "closing" : ""}`} onClick={onClose}>
      <aside className={`side-menu ${closing ? "closing" : ""}`} onClick={(event) => event.stopPropagation()}>
        <div className="profile-head drawer-account">
          <div className={`avatar ${appIconImage ? "has-image" : ""}`}>
            {appIconImage && <NextImage className="profile-image" src={appIconImage} alt="" width={44} height={44} unoptimized />}
            {!appIconImage && appIcon}
          </div>
          <div>
            <b>{name}</b>
            <small>{user.email}</small>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="ปิดเมนู" title="ปิดเมนู"><X size={18} strokeWidth={2.25} aria-hidden="true" /></button>
        </div>

        <nav className="side-menu-list">
          <div className="side-menu-section">
            <p>เงินและภาระ</p>
            <button onClick={onOpenWallets}>
              <Wallet size={16} strokeWidth={2.25} aria-hidden="true" />
              <span>กระเป๋าตังค์</span>
              <b>{moneySign}{formatMoney(walletTotal)}</b>
            </button>
            <button onClick={onOpenDebtors}>
              <Users size={16} strokeWidth={2.25} aria-hidden="true" />
              <span>จัดการหนี้</span>
              <b>{(receivableTotal - payableTotal) < 0 ? "−" : ""}{moneySign}{formatMoney(Math.abs(receivableTotal - payableTotal))}</b>
            </button>
            <button onClick={onOpenRecurring}>
              <Receipt size={16} strokeWidth={2.25} aria-hidden="true" />
              <span>รายจ่ายประจำ</span>
              <b>{moneySign}{formatMoney(recurringTotal)}</b>
            </button>
          </div>
          <div className="side-menu-section">
            <p>ตั้งค่า</p>
            <button onClick={onOpenBudgets}>
              <TrendingUp size={16} strokeWidth={2.25} aria-hidden="true" />
              <span>งบประมาณ</span>
            </button>
            <button onClick={onOpenReport}>
              <Download size={16} strokeWidth={2.25} aria-hidden="true" />
              <span>ส่งออกรีพอร์ท</span>
            </button>
            <button onClick={onOpenImport}>
              <Receipt size={16} strokeWidth={2.25} aria-hidden="true" />
              <span>นำเข้า CSV</span>
            </button>
            <button onClick={onOpenAsk}>
              <Lightbulb size={16} strokeWidth={2.25} aria-hidden="true" />
              <span>ถาม AI เรื่องเงิน</span>
            </button>
            <button onClick={onOpenProfile}>
              <UserCog size={16} strokeWidth={2.25} aria-hidden="true" />
              <span>จัดการโปรไฟล์</span>
            </button>
            <button onClick={onOpenPin}>
              <Lock size={16} strokeWidth={2.25} aria-hidden="true" />
              <span>รหัส PIN</span>
            </button>
          </div>
        </nav>

        <div className="side-menu-footer">
          <div className={`theme-toggle theme-toggle-${theme}`} role="group" aria-label="ธีมสีของแอพ">
            <span className="theme-toggle-thumb" aria-hidden="true" />
            <button className={theme === "light" ? "active" : ""} onClick={() => onSetTheme("light")} aria-label="ธีมสว่าง" title="ธีมสว่าง">
              <Sun size={16} strokeWidth={2.25} aria-hidden="true" />
            </button>
            <button className={theme === "dark" ? "active" : ""} onClick={() => onSetTheme("dark")} aria-label="ธีมมืด" title="ธีมมืด">
              <Moon size={16} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </div>
          <button className="logout-button" onClick={onLogout}>ออกจากระบบ</button>
        </div>
      </aside>
    </div>
  );
}

function ProfileEditSheet({
  profile,
  busy,
  error,
  onClose,
  onSave,
  closing,
}: {
  profile: Profile | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (next: { nickname: string; app_icon: string; app_icon_image: string; month_start_day: number }) => Promise<boolean>;
  closing?: boolean;
}) {
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const app_icon = profile?.app_icon ?? "";
  const [app_icon_image, setAppIconImage] = useState(profile?.app_icon_image ?? "");
  const [month_start_day, setMonthStartDay] = useState(profile?.month_start_day ?? 1);
  const [localError, setLocalError] = useState("");
  const profileName = nickname.trim() || "ผู้ใช้";

  async function chooseProfileImage(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    setLocalError("");
    try {
      setAppIconImage(await compressProfileImage(file));
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "เลือกรูปไม่สำเร็จ");
    }
  }

  const submit = async () => {
    const saved = await onSave({ nickname, app_icon, app_icon_image, month_start_day });
    if (saved) onClose();
  };

  return (
    <SheetFrame onClose={onClose} closing={closing}>
      <div className="sheet-head">
        <div>
          <p className="eyebrow">ตั้งค่า</p>
          <h2>จัดการโปรไฟล์</h2>
        </div>
        <button onClick={onClose}>x</button>
      </div>
      <section className="profile-editor-preview" aria-label="ตัวอย่างโปรไฟล์">
        <span className={`profile-editor-avatar ${app_icon_image ? "has-image" : ""}`}>
          {app_icon_image ? <NextImage className="profile-image" src={app_icon_image} alt="รูปโปรไฟล์ปัจจุบัน" width={72} height={72} unoptimized /> : (app_icon || nameInitial(profileName))}
        </span>
        <div>
          <small>รูปโปรไฟล์ปัจจุบัน</small>
          <b>{profileName}</b>
          <span>เปลี่ยนรูปหรือชื่อได้ด้านล่าง</span>
        </div>
      </section>
      <label>
        ชื่อเล่น
        <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="เช่น ก้อง" />
      </label>
      <label>
        เปลี่ยนรูปโปรไฟล์
        <input type="file" accept="image/*" onChange={(event) => { void chooseProfileImage(event.target.files); event.currentTarget.value = ""; }} />
        <small>รองรับรูปจากมือถือได้ถึง 10MB ระบบจะย่อเป็นไอคอนให้อัตโนมัติ</small>
      </label>
      {!!app_icon_image && <button className="side-ghost" onClick={() => setAppIconImage("")}>ลบรูปไอคอน</button>}
      <label>
        วันเริ่มรอบเดือน
        <input type="number" min={1} max={28} value={month_start_day} onChange={(event) => setMonthStartDay(clampInteger(event.target.value, 1, 28, 1))} />
      </label>
      {(localError || error) && <StateCard tone="error" title="บันทึกไม่สำเร็จ" detail={localError || error} />}
      <button className="save" onClick={submit} disabled={busy}>
        {busy ? "กำลังบันทึก..." : "บันทึก"}
      </button>
    </SheetFrame>
  );
}
function WalletsView({
  wallets,
  entries,
  onBack,
  onAdd,
  onEdit,
  onDelete,
}: {
  wallets: WalletDisplay[];
  entries: Entry[];
  onBack: () => void;
  onAdd: () => void;
  onEdit: (wallet: Wallet) => void;
  onDelete: (wallet: Wallet) => void;
}) {
  const total = wallets.reduce((sum, wallet) => sum + wallet.display_balance, 0);
  const [openWalletId, setOpenWalletId] = useState<string | null>(null);
  const entriesByWallet = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of entries) {
      if (!entry.wallet_id) continue;
      const list = map.get(entry.wallet_id) ?? [];
      list.push(entry);
      map.set(entry.wallet_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
    return map;
  }, [entries]);
  const selectedWallet = wallets.find((wallet) => wallet.id === openWalletId) ?? null;
  const selectedWalletEntries = selectedWallet ? (entriesByWallet.get(selectedWallet.id) ?? []).slice(0, 8) : [];

  return (
    <div className="view debtor-view">
      <div className="add-title">
        <button onClick={onBack}>‹</button>
        <div>
          <p className="eyebrow">จัดการกองเงิน</p>
          <h2>กระเป๋าตังค์</h2>
        </div>
        <button className="header-add-button" onClick={onAdd}>เพิ่ม</button>
      </div>
      <section className="debtor-detail-card">
        <span>ยอดรวมทุกกระเป๋า</span>
        <strong><CountUpMoney value={total} /></strong>
      </section>
      <div className="debtor-page-list">
        {wallets.map((wallet) => (
          <article className={`debtor-page-item ${openWalletId === wallet.id ? "active" : ""}`} key={wallet.id}>
            <i className="card-accent" style={{ background: wallet.icon_color ?? nameColor(wallet.name) }} />
            <button className="debtor-main-button" onClick={() => setOpenWalletId((current) => current === wallet.id ? null : wallet.id)}>
              <span className="debtor-avatar" style={{ background: wallet.icon_color ?? nameColor(wallet.name) }}>
                <WalletAvatarGlyph iconKey={wallet.icon} fallbackName={wallet.name} />
              </span>
              <div>
                <span>{wallet.name}</span>
                <small>
                  {walletTagLabels[wallet.tag]} · {moneySign}{formatMoney(wallet.display_balance)}
                  {wallet.is_default ? " · กระเป๋าหลัก" : ""}
                </small>
              </div>
            </button>
            <details className="kebab-menu" name="wallet-kebab">
              <summary>⋮</summary>
              <menu>
                <button onClick={() => onEdit(wallet)}>แก้ไข</button>
                <button onClick={() => onDelete(wallet)}>ลบ</button>
              </menu>
            </details>
          </article>
        ))}
        {!wallets.length && <EmptyNote glyph="▣" action={{ label: "เพิ่มกระเป๋า", onClick: onAdd }}>ยังไม่มีกระเป๋าตังค์ สร้างกองเงินแรกของคุณได้เลย</EmptyNote>}
      </div>
      {selectedWallet && (
        <section className="wallet-statement-panel">
          <div className="section-title">
            <h2>รายการใน {selectedWallet.name}</h2>
            <button onClick={() => onEdit(selectedWallet)}>แก้ไขกระเป๋า</button>
          </div>
          <div className="wallet-statement">
            {selectedWalletEntries.length ? (
              selectedWalletEntries.map((entry) => (
                <div className="wallet-statement-row" key={entry.id}>
                  <span>{entry.title}</span>
                  <small>{formatDateTime(entry.occurred_at)}</small>
                  <b className={entry.wallet_impact >= 0 ? "income" : "expense"}>{formatSignedMoney(entry.wallet_impact)}</b>
                </div>
              ))
            ) : (
              <p>ยังไม่มีรายการในกระเป๋านี้</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

type WalletInput = {
  name: string;
  tag: WalletTag;
  balance: number;
  icon: string | null;
  icon_color: string | null;
  is_default: boolean;
};

function WalletEditSheet({
  wallet,
  busy,
  error,
  onClose,
  onCreate,
  onUpdate,
  existingWallets,
  closing,
}: {
  wallet: Wallet | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onCreate: (input: WalletInput) => Promise<boolean>;
  onUpdate: (wallet: Wallet, patch: WalletInput) => Promise<boolean>;
  existingWallets: Wallet[];
  closing?: boolean;
}) {
  const [name, setName] = useState(wallet?.name ?? "");
  const [tag, setTag] = useState<WalletTag>(wallet?.tag ?? "cash");
  const [balanceText, setBalanceText] = useState(wallet?.balance ? String(wallet.balance) : "");
  const [icon, setIcon] = useState<string | null>(wallet?.icon ?? null);
  const [iconColor, setIconColor] = useState<string | null>(wallet?.icon_color ?? null);
  const [isDefault, setIsDefault] = useState(wallet?.is_default ?? !existingWallets.length);

  const submit = async () => {
    if (!name.trim()) return;
    const payload: WalletInput = { name, tag, balance: toFiniteNumber(balanceText), icon, icon_color: iconColor, is_default: isDefault };
    const saved = wallet ? await onUpdate(wallet, payload) : await onCreate(payload);
    if (saved) onClose();
  };

  return (
    <SheetFrame onClose={onClose} closing={closing}>
      <div className="sheet-head">
        <div>
          <p className="eyebrow">{wallet ? "แก้ไขกระเป๋าตังค์" : "เพิ่มกระเป๋าตังค์"}</p>
          <h2>{wallet ? wallet.name : "กระเป๋าใหม่"}</h2>
        </div>
        <button onClick={onClose}>x</button>
      </div>
      <IconColorPicker value={{ icon, color: iconColor }} onChange={({ icon: nextIcon, color: nextColor }) => { setIcon(nextIcon); setIconColor(nextColor); }} fallbackName={name || "?"} />
      <label>
        ชื่อกระเป๋า
        <input autoFocus={!wallet} value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น กระเป๋าหลัก, ออมทรัพย์ SCB" />
      </label>
      <label>
        ประเภท
        <select value={tag} onChange={(event) => setTag(event.target.value as WalletTag)}>
          {(Object.keys(walletTagLabels) as WalletTag[]).map((key) => (
            <option key={key} value={key}>{walletTagLabels[key]}</option>
          ))}
        </select>
      </label>
      <label>
        ยอดเงิน
        <input inputMode="decimal" value={balanceText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setBalanceText(event.target.value); }} />
      </label>
      <label className="sheet-check-row">
        <input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
        ใช้เป็นกระเป๋าหลัก
      </label>
      {error && <StateCard tone="error" title="บันทึกไม่สำเร็จ" detail={error} />}
      <button className="save" onClick={submit} disabled={busy || !name.trim()}>
        {busy ? "กำลังบันทึก..." : "บันทึก"}
      </button>
    </SheetFrame>
  );
}
function RecurringExpensesView({
  items,
  onBack,
  onAdd,
  onEdit,
  onDelete,
}: {
  items: RecurringExpense[];
  onBack: () => void;
  onAdd: () => void;
  onEdit: (item: RecurringExpense) => void;
  onDelete: (item: RecurringExpense) => void;
}) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const upcoming = items.map((item) => {
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    let date = new Date(today.getFullYear(), today.getMonth(), Math.min(item.billing_day, daysInMonth));
    if (date < startOfToday) date = new Date(today.getFullYear(), today.getMonth() + 1, Math.min(item.billing_day, new Date(today.getFullYear(), today.getMonth() + 2, 0).getDate()));
    return { item, date, days: Math.round((date.getTime() - startOfToday.getTime()) / 86400000) };
  }).sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 4);

  return (
    <div className="view debtor-view">
      <div className="add-title">
        <button onClick={onBack}>‹</button>
        <div>
          <p className="eyebrow">รายจ่ายประจำ</p>
          <h2>ค่าใช้จ่ายรายเดือน</h2>
        </div>
        <button className="header-add-button" onClick={onAdd}>เพิ่ม</button>
      </div>
      <section className="debtor-detail-card">
        <span>ยอดรวมต่อเดือน</span>
        <strong><CountUpMoney value={total} /></strong>
      </section>
      {!!upcoming.length && (
        <section className="recurring-timeline" aria-label="กำหนดตัดเงินถัดไป">
          <div className="section-title-row"><h3>กำหนดตัดเงินถัดไป</h3><small>{upcoming.length} รายการ</small></div>
          <div className="recurring-timeline-list">
            {upcoming.map(({ item, date, days }) => (
              <button key={item.id} className="recurring-timeline-row" onClick={() => onEdit(item)}>
                <span className="recurring-date"><b>{date.getDate()}</b><small>{date.toLocaleDateString("th-TH", { month: "short" })}</small></span>
                <span className="recurring-service"><i style={{ background: item.icon_color ?? nameColor(item.name) }}><RecurringAvatarGlyph iconKey={item.icon} fallbackName={item.name} size={15} /></i><span><b>{item.name}</b><small>{days === 0 ? "วันนี้" : `อีก ${days} วัน`}</small></span></span>
                <strong>{moneySign}{formatMoney(item.amount)}</strong>
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="debtor-page-list">
        {items.map((item) => (
          <article className="debtor-page-item" key={item.id}>
            <i className="card-accent" style={{ background: item.icon_color ?? nameColor(item.name) }} />
            <button className="debtor-main-button" onClick={() => onEdit(item)}>
              <span className="debtor-avatar" style={{ background: item.icon_color ?? nameColor(item.name) }}>
                <RecurringAvatarGlyph iconKey={item.icon} fallbackName={item.name} />
              </span>
              <div>
                <span>{item.name}</span>
                <small>ตัดเงินทุกวันที่ {item.billing_day} · {moneySign}{formatMoney(item.amount)}</small>
              </div>
            </button>
            <details className="kebab-menu" name="recurring-kebab">
              <summary>⋮</summary>
              <menu>
                <button onClick={() => onEdit(item)}>แก้ไข</button>
                <button onClick={() => onDelete(item)}>ลบ</button>
              </menu>
            </details>
          </article>
        ))}
        {!items.length && <EmptyNote glyph="↻" action={{ label: "เพิ่มรายจ่ายประจำ", onClick: onAdd }}>ยังไม่มีรายจ่ายประจำ ลองเพิ่มค่าสมัครสมาชิกที่จ่ายทุกเดือน เช่น Netflix, Claude Pro</EmptyNote>}
      </div>
    </div>
  );
}

type RecurringExpenseInput = {
  name: string;
  amount: number;
  billing_day: number;
  icon: string | null;
  icon_color: string | null;
};

function RecurringExpenseEditSheet({
  item,
  busy,
  error,
  onClose,
  onCreate,
  onUpdate,
  closing,
}: {
  item: RecurringExpense | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onCreate: (input: RecurringExpenseInput) => Promise<boolean>;
  onUpdate: (item: RecurringExpense, patch: RecurringExpenseInput) => Promise<boolean>;
  closing?: boolean;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [amountText, setAmountText] = useState(item?.amount ? String(item.amount) : "");
  const [billingDay, setBillingDay] = useState(item?.billing_day ?? 1);
  const [icon, setIcon] = useState<string | null>(item?.icon ?? null);
  const [iconColor, setIconColor] = useState<string | null>(item?.icon_color ?? null);

  const submit = async () => {
    if (!name.trim()) return;
    const payload: RecurringExpenseInput = { name, amount: toMoneyAmount(amountText), billing_day: billingDay, icon, icon_color: iconColor };
    const saved = item ? await onUpdate(item, payload) : await onCreate(payload);
    if (saved) onClose();
  };

  return (
    <SheetFrame onClose={onClose} closing={closing}>
      <div className="sheet-head">
        <div>
          <p className="eyebrow">{item ? "แก้ไขรายจ่ายประจำ" : "เพิ่มรายจ่ายประจำ"}</p>
          <h2>{item ? item.name : "รายการใหม่"}</h2>
        </div>
        <button onClick={onClose}>x</button>
      </div>
      <IconColorPicker value={{ icon, color: iconColor }} onChange={({ icon: nextIcon, color: nextColor }) => { setIcon(nextIcon); setIconColor(nextColor); }} fallbackName={name || "?"} iconOptions={recurringIconOptions} renderGlyph={RecurringAvatarGlyph} />
      <label>
        ชื่อรายการ
        <input autoFocus={!item} value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น Netflix, Claude Pro, YouTube Premium" />
      </label>
      <label>
        ยอดต่อเดือน
        <input inputMode="decimal" value={amountText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setAmountText(event.target.value); }} />
      </label>
      <label>
        ตัดเงินทุกวันที่
        <select value={billingDay} onChange={(event) => setBillingDay(normalizeBillingDay(event.target.value))}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
            <option key={day} value={day}>{day}</option>
          ))}
        </select>
      </label>
      {error && <StateCard tone="error" title="บันทึกไม่สำเร็จ" detail={error} />}
      <button className="save" onClick={submit} disabled={busy || !name.trim()}>
        {busy ? "กำลังบันทึก..." : "บันทึก"}
      </button>
    </SheetFrame>
  );
}
function ConfirmLogout({ onCancel, onConfirm, closing }: { onCancel: () => void; onConfirm: () => void; closing?: boolean }) {
  return (
    <div className={`dialog-backdrop ${closing ? "closing" : ""}`}>
      <section className={`confirm-dialog ${closing ? "closing" : ""}`}>
        <h2>ออกจากระบบ?</h2>
        <p>คุณสามารถกลับมาเข้าสู่ระบบและดูข้อมูลเดิมได้ทุกเมื่อ</p>
        <div>
          <button onClick={onCancel}>ยกเลิก</button>
          <button className="danger" onClick={onConfirm}>ออกจากระบบ</button>
        </div>
      </section>
    </div>
  );
}
