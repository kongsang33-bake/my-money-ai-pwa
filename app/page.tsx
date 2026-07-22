"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type EntryKind = "expense" | "income";
type TransactionType = "income" | "personal_expense" | "lend" | "split_half" | "debt_repayment" | "gift";
type Tab = "home" | "add" | "history" | "debtors" | "wallets";
type MascotMood = "idle" | "thinking" | "happy" | "sleepy" | "oops";
type MascotVariant = "mint" | "whale" | "coin" | "berry";
type PetStats = { happiness: number; energy: number; treats: number; lastSeen: number; message: string };
const defaultPetStats: PetStats = {
  happiness: 72,
  energy: 68,
  treats: 0,
  lastSeen: 0,
  message: "แตะมาเล่นกันได้นะ",
};
const defaultMascotVariant: MascotVariant = "whale";
const mascotOptions: { id: MascotVariant; name: string; detail: string }[] = [
  { id: "whale", name: "น้องวาฬเงิน", detail: "โทนฟ้าแบบตัวอย่างที่ส่งมา" },
  { id: "mint", name: "น้องมิ้นต์", detail: "เขียวครีม เข้ากับธีมหลัก" },
  { id: "coin", name: "น้องเหรียญ", detail: "สดใส เหมาะกับสายเก็บเงิน" },
  { id: "berry", name: "น้องเบอร์รี่", detail: "ชมพูพาสเทล นุ่มและขี้เล่น" },
];

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
};

type Draft = Omit<Entry, "id"> & { id: string };
type Profile = {
  user_id: string;
  nickname: string | null;
  app_icon: string | null;
  app_icon_image: string | null;
  month_start_day: number;
};
type Debtor = {
  id: string;
  user_id: string;
  name: string;
  note: string | null;
  opening_balance: number;
};
type WalletTag = "cash" | "savings" | "investment" | "other";
type Wallet = {
  id: string;
  user_id: string;
  name: string;
  tag: WalletTag;
  balance: number;
};
type ReportPeriod = "month" | "year";
type Toast = { id: number; tone: "success" | "info" | "error"; title: string; detail?: string };
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
};

type SlipImage = {
  id: string;
  name: string;
  mimeType: string;
  data: string;
  preview: string;
};

const categories = ["อาหาร", "เดินทาง", "ของใช้", "ที่อยู่อาศัย", "สุขภาพ", "บันเทิง", "รายได้", "บิลประจำ", "อื่น ๆ"];

const transactionTypeLabels: Record<TransactionType, string> = {
  income: "รายรับ",
  personal_expense: "จ่ายเอง",
  lend: "ออกให้ก่อน",
  split_half: "หารร่วมกัน",
  debt_repayment: "รับชำระหนี้",
  gift: "ให้โดยไม่คิดคืน",
};

const transactionKind: Record<TransactionType, EntryKind> = {
  income: "income",
  debt_repayment: "income",
  personal_expense: "expense",
  lend: "expense",
  split_half: "expense",
  gift: "expense",
};

const categoryIcon = (category: string) => {
  if (category === "อาหาร") return "●";
  if (category === "เดินทาง") return "◆";
  if (category === "รายได้") return "฿";
  if (category === "สุขภาพ") return "✚";
  if (category === "บิลประจำ") return "▣";
  if (category === "บันเทิง") return "♪";
  return "▪";
};

// Categorical palette validated for CVD-safe adjacency + normal-vision separation
// (dataviz skill, 7-slot subset of the default 8-hue order; brand green reserved for income).
const categoryColors: Record<string, string> = {
  เดินทาง: "#2a78d6",
  อาหาร: "#eb6834",
  บิลประจำ: "#1baf7a",
  ที่อยู่อาศัย: "#eda100",
  บันเทิง: "#e87ba4",
  ของใช้: "#4a3aa7",
  สุขภาพ: "#e34948",
};
const categoryColor = (category: string) => categoryColors[category] ?? "#898781";

const avatarPalette = Object.values(categoryColors);
function nameColor(name: string) {
  const sum = [...name.trim()].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return avatarPalette[sum % avatarPalette.length];
}
function nameInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

const moneySign = "฿";
const unnamedDebtor = "ไม่ระบุ";
const profileImageMaxInputBytes = 10 * 1024 * 1024;
const profileImageMaxStoredBytes = 1.5 * 1024 * 1024;
const profileImageSize = 512;
const monthKey = (date: Date) => date.toISOString().slice(0, 7);
const formatMoney = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const formatSignedMoney = (value: number) => `${value >= 0 ? "+" : "−"}${moneySign}${formatMoney(Math.abs(value))}`;
const formatDateTime = (value: string) => new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
const toDateInput = (value: string) => new Date(value).toISOString().slice(0, 10);
const fromDateInput = (value: string) => `${value}T12:00:00`;
const todayDateInput = () => new Date().toISOString().slice(0, 10);

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

function lastSevenDayOutflow(entries: Entry[]) {
  const today = startOfDay(new Date());
  return Array.from({ length: 7 }, (_, index) => {
    const time = today - (6 - index) * 86400000;
    const amount = entries
      .filter((entry) => startOfDay(new Date(entry.occurred_at)) === time && entry.wallet_impact < 0)
      .reduce((sum, entry) => sum + Math.abs(entry.wallet_impact), 0);
    return {
      key: String(time),
      label: new Date(time).toLocaleDateString("th-TH", { weekday: "short" }),
      amount,
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
  debtorSummary,
  period,
  selectedMonth,
  selectedYear,
  monthStartDay,
}: {
  entries: Entry[];
  wallets: Wallet[];
  debtorSummary: { name: string; amount: number }[];
  period: ReportPeriod;
  selectedMonth: string;
  selectedYear: number;
  monthStartDay: number;
}) {
  const range = reportBounds(period, selectedMonth, selectedYear, monthStartDay);
  const reportEntries = entriesInRange(entries, range.start, range.end).sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
  const income = totalWallet(reportEntries, "income");
  const outflow = Math.abs(totalWallet(reportEntries, "expense"));
  const balance = income - outflow;
  const debtChange = reportEntries.reduce((sum, entry) => sum + entry.debt_impact, 0);
  const categoryMap = new Map<string, number>();

  for (const entry of reportEntries) {
    if (entry.wallet_impact >= 0) continue;
    categoryMap.set(entry.category, (categoryMap.get(entry.category) ?? 0) + Math.abs(entry.wallet_impact));
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
    csvRow(["ลูกหนี้คงค้าง"]),
    csvRow(["ชื่อ", "ยอดค้าง"]),
    ...debtorSummary.map((debtor) => csvRow([debtor.name, debtor.amount])),
    csvRow([""]),
    csvRow(["กระเป๋า/กองเงิน"]),
    csvRow(["ชื่อ", "ประเภท", "ยอดตั้งต้น"]),
    ...wallets.map((wallet) => csvRow([wallet.name, walletTagLabels[wallet.tag], wallet.balance])),
    csvRow([""]),
    csvRow(["รายการละเอียด"]),
    csvRow(["วันที่", "ชื่อรายการ", "หมวดหมู่", "ประเภท", "จำนวน", "ผลต่อกระเป๋า", "ผลต่อลูกหนี้", "ชื่อผู้เกี่ยวข้อง", "ข้อความต้นทาง"]),
    ...reportEntries.map((entry) =>
      csvRow([
        formatDateTime(entry.occurred_at),
        entry.title,
        entry.category,
        transactionTypeLabels[entry.transaction_type],
        entry.amount,
        entry.wallet_impact,
        entry.debt_impact,
        entry.debtor_name,
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
  return { wallet_impact: -amount, debt_impact: 0, user_share: amount, partner_share: 0 };
}

function normalizeEntry(input: EntryInput): Entry {
  const transaction_type = input.transaction_type ?? (input.type === "income" ? "income" : "personal_expense");
  const impacts = calculateImpacts(Number(input.amount) || 0, transaction_type);
  return {
    ...input,
    amount: Number(input.amount) || 0,
    type: transactionKind[transaction_type],
    transaction_type,
    wallet_impact: input.wallet_impact ?? impacts.wallet_impact,
    debt_impact: input.debt_impact ?? impacts.debt_impact,
    user_share: input.user_share ?? impacts.user_share,
    partner_share: input.partner_share ?? impacts.partner_share,
    debtor_name: input.debtor_name?.trim() || unnamedDebtor,
  };
}

function totalWallet(entries: Entry[], direction: EntryKind) {
  return entries
    .filter((entry) => (direction === "income" ? entry.wallet_impact > 0 : entry.wallet_impact < 0))
    .reduce((sum, entry) => sum + entry.wallet_impact, 0);
}

function fileToSlipImage(file: File): Promise<SlipImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านไฟล์รูปไม่สำเร็จ"));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const [, data = ""] = value.split(",");
      resolve({
        id: `${Date.now()}-${file.name}`,
        name: file.name,
        mimeType: file.type,
        data,
        preview: value,
      });
    };
    reader.readAsDataURL(file);
  });
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

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [tab, setTab] = useState<Tab>("home");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [text, setText] = useState("");
  const [slipImages, setSlipImages] = useState<SlipImage[]>([]);
  const [entryDate, setEntryDate] = useState(todayDateInput);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [debtorSheetMode, setDebtorSheetMode] = useState<"create" | "edit" | null>(null);
  const [editingDebtor, setEditingDebtor] = useState<Debtor | null>(null);
  const [selectedDebtor, setSelectedDebtor] = useState<Debtor | null>(null);
  const [walletSheetMode, setWalletSheetMode] = useState<"create" | "edit" | null>(null);
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [budgetSheetOpen, setBudgetSheetOpen] = useState(false);
  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const [mascotSheetOpen, setMascotSheetOpen] = useState(false);
  const [mascotVariant, setMascotVariant] = useState<MascotVariant>(defaultMascotVariant);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [savePulse, setSavePulse] = useState(0);
  const displayName = profile?.nickname?.trim() || user?.user_metadata?.full_name || user?.user_metadata?.name || "เงินของฉัน";
  const displayIcon = profile?.app_icon?.trim() || user?.email?.[0]?.toUpperCase() || "฿";
  const displayIconImage = profile?.app_icon_image?.trim() || "";
  const monthStartDay = profile?.month_start_day || 1;

  const notify = useCallback((toast: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((items) => [...items.slice(-2), { id, ...toast }]);
  }, []);

  useEffect(() => {
    if (!toasts.length) return;
    const timer = window.setTimeout(() => {
      setToasts((items) => items.slice(1));
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  useEffect(() => {
    if (!savePulse) return;
    const timer = window.setTimeout(() => setSavePulse(0), 4200);
    return () => window.clearTimeout(timer);
  }, [savePulse]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(`money-mascot-${user.id}`);
      if (isMascotVariant(saved)) setMascotVariant(saved);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user]);

  function chooseMascot(next: MascotVariant) {
    setMascotVariant(next);
    if (user) window.localStorage.setItem(`money-mascot-${user.id}`, next);
  }

  const loadEntries = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("transactions")
      .select("id,title,category,amount,kind,transaction_type,wallet_impact,debt_impact,user_share,partner_share,debtor_name,occurred_at,source_text")
      .order("occurred_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    setEntries(
      (data ?? []).map((row) =>
        normalizeEntry({
          id: row.id,
          title: row.title,
          category: row.category,
          amount: Number(row.amount),
          type: row.kind as EntryKind,
          transaction_type: row.transaction_type as TransactionType | undefined,
          wallet_impact: row.wallet_impact == null ? undefined : Number(row.wallet_impact),
          debt_impact: row.debt_impact == null ? undefined : Number(row.debt_impact),
          user_share: row.user_share == null ? undefined : Number(row.user_share),
          partner_share: row.partner_share == null ? undefined : Number(row.partner_share),
          debtor_name: row.debtor_name,
          occurred_at: row.occurred_at,
          source_text: row.source_text,
        }),
      ),
    );
  }, []);

  const loadProfile = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("user_id,nickname,app_icon,app_icon_image,month_start_day")
      .maybeSingle();
    if (error) {
      setError(error.message);
      return;
    }
    setProfile(data ?? null);
  }, []);

  const loadDebtors = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase.from("debtors").select("id,user_id,name,note,opening_balance").order("name", { ascending: true });
    if (error) {
      setError(error.message);
      return;
    }
    setDebtors((data ?? []).map((row) => ({ ...row, opening_balance: Number(row.opening_balance) || 0 })) as Debtor[]);
  }, []);

  const loadWallets = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase.from("wallets").select("id,user_id,name,tag,balance").order("created_at", { ascending: true });
    if (error) {
      setError(error.message);
      return;
    }
    setWallets((data ?? []).map((row) => ({ ...row, balance: Number(row.balance) || 0 })) as Wallet[]);
  }, []);

  const loadUserData = useCallback(async (userId: string) => {
    setDataLoading(true);
    setError("");
    try {
      await Promise.all([loadEntries(), loadProfile(), loadDebtors(), loadWallets()]);
      setBudgets(loadBudgets(userId));
    } finally {
      setDataLoading(false);
    }
  }, [loadDebtors, loadEntries, loadProfile, loadWallets]);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setReady(true);
      if (data.user) {
        void loadUserData(data.user.id);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        void loadUserData(session.user.id);
      } else {
        setEntries([]);
        setProfile(null);
        setDebtors([]);
        setWallets([]);
        setBudgets({});
        setDataLoading(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [loadUserData]);

  const overlayOpen =
    menuOpen ||
    profileSheetOpen ||
    !!editing ||
    !!debtorSheetMode ||
    !!walletSheetMode ||
    budgetSheetOpen ||
    reportSheetOpen ||
    mascotSheetOpen ||
    recapOpen ||
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

  const walletTotals = useMemo(() => {
    const totals: Record<WalletTag, number> = { cash: 0, savings: 0, investment: 0, other: 0 };
    for (const wallet of wallets) totals[wallet.tag] += wallet.balance;
    return totals;
  }, [wallets]);

  const mainWallet = useMemo(
    () => walletTotals.cash + entries.reduce((sum, entry) => sum + entry.wallet_impact, 0),
    [entries, walletTotals.cash],
  );
  const streak = useMemo(() => computeStreak(entries), [entries]);
  const quickShortcuts = useMemo(() => deriveQuickShortcuts(entries), [entries]);
  const debtorSummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const debtor of debtors) {
      if (debtor.opening_balance) map.set(debtor.name, (map.get(debtor.name) ?? 0) + debtor.opening_balance);
    }
    for (const entry of entries) {
      if (!["lend", "split_half", "debt_repayment"].includes(entry.transaction_type)) continue;
      map.set(entry.debtor_name, (map.get(entry.debtor_name) ?? 0) + entry.debt_impact);
    }
    return [...map.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .filter((item) => item.amount > 0.005)
      .sort((a, b) => b.amount - a.amount);
  }, [entries, debtors]);

  const cycleRange = useMemo(() => cycleBounds(selectedMonth, monthStartDay), [selectedMonth, monthStartDay]);
  const monthlyEntries = useMemo(() => {
    const { start, end } = cycleRange;
    return entries.filter((entry) => {
      const occurred = new Date(entry.occurred_at);
      return occurred >= start && occurred < end;
    });
  }, [entries, cycleRange]);
  const monthlyIncome = useMemo(() => totalWallet(monthlyEntries, "income"), [monthlyEntries]);
  const monthlyOutflow = useMemo(() => Math.abs(totalWallet(monthlyEntries, "expense")), [monthlyEntries]);
  const monthlyDebtChange = useMemo(() => monthlyEntries.reduce((sum, entry) => sum + entry.debt_impact, 0), [monthlyEntries]);
  const monthlyBalance = monthlyIncome - monthlyOutflow;
  const walletInsight = useMemo(() => buildWalletInsight(mainWallet, monthlyOutflow, cycleRange.end), [mainWallet, monthlyOutflow, cycleRange.end]);
  const sevenDayOutflow = useMemo(() => lastSevenDayOutflow(entries), [entries]);
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
  const dayEntries = useMemo(
    () => (selectedDay ? monthlyEntries.filter((entry) => new Date(entry.occurred_at).toDateString() === selectedDay) : monthlyEntries),
    [monthlyEntries, selectedDay],
  );

  const categorySummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of monthlyEntries) {
      if (entry.wallet_impact >= 0) continue;
      map.set(entry.category, (map.get(entry.category) ?? 0) + Math.abs(entry.wallet_impact));
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

  async function addSlipFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");

    const nextFiles = [...files].slice(0, 3 - slipImages.length);
    if (nextFiles.some((file) => !file.type.startsWith("image/"))) {
      setError("รองรับเฉพาะไฟล์รูปภาพเท่านั้น");
      return;
    }
    if (nextFiles.some((file) => file.size > 5 * 1024 * 1024)) {
      setError("รูปภาพต้องมีขนาดไม่เกิน 5MB ต่อรูป");
      return;
    }

    try {
      const images = await Promise.all(nextFiles.map(fileToSlipImage));
      setSlipImages((current) => [...current, ...images].slice(0, 3));
      notify({ tone: "success", title: "แนบสลิปแล้ว", detail: `${images.length} รูปพร้อมให้ AI อ่าน` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "แนบรูปไม่สำเร็จ");
      notify({ tone: "error", title: "แนบรูปไม่สำเร็จ", detail: e instanceof Error ? e.message : undefined });
    }
  }

  function openAddTab() {
    setEntryDate(todayDateInput());
    setTab("add");
  }

  function retrySync() {
    setError("");
    if (user) void loadUserData(user.id);
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
      }),
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          defaultDate: entryDate,
          images: slipImages.map(({ data, mimeType, name }) => ({ data, mimeType, name })),
          debtorNames: debtors.map((debtor) => debtor.name),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      const source = [text.trim(), slipImages.length ? `แนบรูปสลิป ${slipImages.length} รูป` : ""].filter(Boolean).join(" | ");
      setDrafts(
        data.items.map((item: { title: string; category: string; amount: number; transaction_type: TransactionType; debtor_name?: string; date: string }, index: number) =>
          normalizeEntry({
            id: `${Date.now()}-${index}`,
            title: item.title,
            category: item.category,
            amount: item.amount,
            transaction_type: item.transaction_type,
            debtor_name: item.debtor_name,
            occurred_at: fromDateInput(item.date),
            source_text: source,
          }),
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

    setBusy(true);
    setError("");
    const normalizedItems = items.map((item) => normalizeEntry(item));

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
    }));

    const { error } = await supabase.from("transactions").insert(payload);

    if (error) {
      setError(error.message);
    } else {
      await createMissingDebtors(normalizedItems);
      setDrafts([]);
      setText("");
      setSlipImages([]);
      setTab("home");
      await loadEntries();
      setSavePulse(normalizedItems.length);
      notify({ tone: "success", title: "บันทึกรายการแล้ว", detail: `${normalizedItems.length} รายการถูกซิงค์เรียบร้อย` });
    }

    setBusy(false);
  }

  async function createMissingDebtors(items: Entry[]) {
    if (!supabase || !user) return;
    const known = new Set(debtors.map((debtor) => debtor.name.trim().toLowerCase()));
    const names = [
      ...new Set(
        items
          .filter((item) => ["lend", "split_half", "debt_repayment"].includes(item.transaction_type))
          .map((item) => item.debtor_name.trim())
          .filter((name) => name && name !== unnamedDebtor && !known.has(name.toLowerCase())),
      ),
    ];

    for (const name of names) {
      const { error } = await supabase.from("debtors").insert({ user_id: user.id, name });
      if (error && error.code !== "23505") {
        setError(error.message);
        return;
      }
    }
    if (names.length) await loadDebtors();
  }

  async function updateEntry() {
    if (!supabase || !editing) return;

    const normalized = normalizeEntry(editing);
    setBusy(true);
    setError("");

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
      })
      .eq("id", normalized.id);

    if (error) {
      setError(error.message);
    } else {
      setEditing(null);
      await loadEntries();
    }

    setBusy(false);
  }

  async function deleteEntry(entry: Entry) {
    if (!supabase) return;
    if (!window.confirm(`ลบรายการ "${entry.title}" ใช่ไหม?`)) return;

    setBusy(true);
    setError("");

    const { error } = await supabase.from("transactions").delete().eq("id", entry.id);
    if (error) setError(error.message);
    else setEntries((current) => current.filter((item) => item.id !== entry.id));

    setBusy(false);
  }

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
    if (!supabase || !user) return;
    setBusy(true);
    setError("");

    const payload = {
      user_id: user.id,
      nickname: next.nickname.trim() || null,
      app_icon: next.app_icon.trim() || null,
      app_icon_image: next.app_icon_image.trim() || null,
      month_start_day: Math.min(28, Math.max(1, Number(next.month_start_day) || 1)),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "user_id" })
      .select("user_id,nickname,app_icon,app_icon_image,month_start_day")
      .single();

    if (error) setError(error.message);
    else setProfile(data as Profile);
    setBusy(false);
  }

  async function createDebtor(name: string, note = "", openingBalance = 0) {
    if (!supabase || !user || !name.trim()) return;
    setBusy(true);
    setError("");
    const { error } = await supabase
      .from("debtors")
      .insert({ user_id: user.id, name: name.trim(), note: note.trim() || null, opening_balance: Number(openingBalance) || 0 });
    if (error) setError(error.code === "23505" ? "มีลูกหนี้ชื่อนี้แล้ว" : error.message);
    else await loadDebtors();
    setBusy(false);
  }

  async function updateDebtor(debtor: Debtor, patch: { name: string; note: string; opening_balance: number }) {
    if (!supabase) return;
    setBusy(true);
    setError("");
    const openingBalance = Number(patch.opening_balance) || 0;
    const { error } = await supabase
      .from("debtors")
      .update({ name: patch.name.trim(), note: patch.note.trim() || null, opening_balance: openingBalance, updated_at: new Date().toISOString() })
      .eq("id", debtor.id);
    if (error) setError(error.code === "23505" ? "มีลูกหนี้ชื่อนี้แล้ว" : error.message);
    else {
      if (selectedDebtor?.id === debtor.id) {
        setSelectedDebtor({ ...debtor, name: patch.name.trim(), note: patch.note.trim() || null, opening_balance: openingBalance });
      }
      await loadDebtors();
    }
    setBusy(false);
  }

  async function deleteDebtor(debtor: Debtor) {
    if (!supabase) return;
    if (!window.confirm(`ลบลูกหนี้ "${debtor.name}" ออกจากรายชื่อใช่ไหม? รายการเก่าจะไม่ถูกลบ`)) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.from("debtors").delete().eq("id", debtor.id);
    if (error) setError(error.message);
    else {
      if (selectedDebtor?.id === debtor.id) setSelectedDebtor(null);
      await loadDebtors();
    }
    setBusy(false);
  }

  async function createWallet(name: string, tag: WalletTag, balance: number) {
    if (!supabase || !user || !name.trim()) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.from("wallets").insert({ user_id: user.id, name: name.trim(), tag, balance: Number(balance) || 0 });
    if (error) setError(error.message);
    else await loadWallets();
    setBusy(false);
  }

  async function updateWallet(wallet: Wallet, patch: { name: string; tag: WalletTag; balance: number }) {
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error } = await supabase
      .from("wallets")
      .update({ name: patch.name.trim(), tag: patch.tag, balance: Number(patch.balance) || 0, updated_at: new Date().toISOString() })
      .eq("id", wallet.id);
    if (error) setError(error.message);
    else await loadWallets();
    setBusy(false);
  }

  async function deleteWallet(wallet: Wallet) {
    if (!supabase) return;
    if (!window.confirm(`ลบกระเป๋าตังค์ "${wallet.name}" ใช่ไหม?`)) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.from("wallets").delete().eq("id", wallet.id);
    if (error) setError(error.message);
    else await loadWallets();
    setBusy(false);
  }

  if (!ready) {
    return (
      <main className="shell">
        <section className="phone auth-screen">
          <div className="loading-spinner" aria-hidden="true" />
          <p className="auth-copy">กำลังเตรียมบัญชี...</p>
        </section>
      </main>
    );
  }

  if (!user) return <Auth />;

  return (
    <main className="shell">
      <section className={`phone mascot-${mascotVariant}`}>
        <header className="topbar">
          <div className="home-identity">
            <span className="home-profile-icon" style={displayIconImage ? { backgroundImage: `url(${displayIconImage})` } : undefined}>
              {!displayIconImage && displayIcon}
            </span>
            <div>
            <p className="eyebrow">สวัสดี</p>
              <h1>{displayName}</h1>
            </div>
          </div>
          <button className="menu-button" onClick={() => setMenuOpen(true)} title="เมนู">
            <span />
            <span />
            <span />
          </button>
        </header>

        {tab === "home" && (
          <div className="view">
            {dataLoading && <SkeletonDashboard />}
            {dataLoading && <StateCard tone="loading" title="กำลังซิงค์ข้อมูล" detail="กำลังโหลดรายการ กระเป๋า และลูกหนี้ของคุณ" />}
            {!!savePulse && <SuccessPulse count={savePulse} onAddMore={openAddTab} />}
            <section className="wallet-grid single-wallet">
              <HeroWalletCard balance={mainWallet} insight={walletInsight} streak={streak} />
            </section>

            {secondaryWalletTags.some((entry) => wallets.some((wallet) => wallet.tag === entry.tag)) && (
              <section className="wallet-grid">
                {secondaryWalletTags
                  .filter((entry) => wallets.some((wallet) => wallet.tag === entry.tag))
                  .map((entry) => (
                    <div className={`wallet-card ${entry.className}`} key={entry.tag}>
                      <span>{entry.label}</span>
                      <strong>{moneySign}{formatMoney(walletTotals[entry.tag])}</strong>
                    </div>
                  ))}
              </section>
            )}

            <MonthSummary
              selectedMonth={selectedMonth}
              setSelectedMonth={(value) => { setSelectedMonth(value); setSelectedDay(null); }}
              income={monthlyIncome}
              outflow={monthlyOutflow}
              debtChange={monthlyDebtChange}
              balance={monthlyBalance}
              categories={categorySummary}
              monthStartDay={monthStartDay}
              budgets={budgets}
              trend={sevenDayOutflow}
            />

            {error && <ErrorActions onRetry={retrySync} onDismiss={() => setError("")} />}
            {error && <StateCard tone="error" title="มีบางอย่างไม่สำเร็จ" detail={error} />}
          </div>
        )}

        {tab === "add" && (
          <div className="view add-view">
            {dataLoading && <SkeletonList rows={3} />}
            {dataLoading && <StateCard tone="loading" title="กำลังเตรียมข้อมูล" detail="กำลังโหลดรายชื่อ ลูกหนี้ และรายการล่าสุดเพื่อช่วย AI วิเคราะห์" />}
            <div className="add-title">
              <button onClick={() => setTab("home")}>‹</button>
              <div>
                <p className="eyebrow">AI Chat</p>
                <h2>วันนี้มีรายการอะไรบ้าง?</h2>
              </div>
            </div>

            <section className="mascot-hero" aria-label="AI assistant mascot">
              <MoneyMascot mood={busy ? "thinking" : drafts.length ? "happy" : "idle"} />
              <div>
                <p className="eyebrow">AI Buddy</p>
                <h3>{busy ? "กำลังอ่านให้แบบตั้งใจสุด ๆ" : drafts.length ? "แยกข้อมูลให้แล้ว ลองตรวจอีกนิด" : "เล่าแบบภาษาคนได้เลย"}</h3>
                <small>พิมพ์รายการหรือแนบสลิป เดี๋ยวช่วยแยกยอด หมวดหมู่ วันที่ และลูกหนี้ให้</small>
              </div>
            </section>

            <label className="entry-date-picker">
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
                    <span className="cat-dot" style={{ background: suggestion.shortcut ? `${categoryColor(suggestion.shortcut.category)}22` : undefined }}>
                      {suggestion.shortcut ? categoryIcon(suggestion.shortcut.category) : "✦"}
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
              <div className="chat-bubble assistant">
                พิมพ์รายการแบบธรรมชาติ หรือแนบรูปสลิปได้เลย ผมจะแยกยอด หมวดหมู่ วันที่ และลูกหนี้ให้ตรวจสอบก่อนบันทึก
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
            {busy && <StateCard tone="loading" title="AI กำลังอ่านข้อมูล" detail="กำลังแยกยอดเงิน หมวดหมู่ วันที่ และชื่อผู้เกี่ยวข้อง" />}
            {error && <StateCard tone="error" title="AI ยังทำรายการนี้ไม่ได้" detail={error} />}

            {!!drafts.length && (
              <section className="review">
                <div className="review-head">
                  <div>
                    <h3>ตรวจสอบก่อนบันทึก</h3>
                    <p>พบ {drafts.length} รายการ แก้ข้อมูลได้ก่อนยืนยัน</p>
                  </div>
                  <span>AI</span>
                </div>
                {drafts.map((draft, index) => (
                  <DraftRow
                    key={draft.id}
                    draft={draft}
                    knownDebtorNames={debtors.map((debtor) => debtor.name)}
                    onChange={(next) => setDrafts((items) => items.map((item, i) => (i === index ? next : item)))}
                  />
                ))}
                <DraftImpact items={drafts} />
                <button className="save" onClick={() => saveEntries(drafts)} disabled={busy}>
                  บันทึก {drafts.length} รายการ
                </button>
                <p className="privacy">AI ช่วยอ่านและแยกข้อมูล แต่สูตรคำนวณกระเป๋า/ลูกหนี้ยังล็อกอยู่ในแอพ</p>
              </section>
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="view history-view">
            {dataLoading && <SkeletonList rows={5} />}
            {dataLoading && <StateCard tone="loading" title="กำลังโหลดประวัติ" detail="กำลังซิงค์รายการจาก Supabase" />}
            <div className="add-title">
              <button onClick={() => setTab("home")}>‹</button>
              <div>
                <p className="eyebrow">ข้อมูลที่ซิงก์แล้ว</p>
                <h2>รายการทั้งหมด</h2>
              </div>
              <button className="header-add-button" onClick={() => setRecapOpen(true)}>สรุปเดือนนี้</button>
            </div>
            <MonthSummary
              selectedMonth={selectedMonth}
              setSelectedMonth={(value) => { setSelectedMonth(value); setSelectedDay(null); }}
              income={monthlyIncome}
              outflow={monthlyOutflow}
              debtChange={monthlyDebtChange}
              balance={monthlyBalance}
              categories={categorySummary}
              monthStartDay={monthStartDay}
              budgets={budgets}
              trend={sevenDayOutflow}
            />
            <CalendarHeatmap start={cycleRange.start} end={cycleRange.end} entries={monthlyEntries} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
            <HistoryInsight entries={dayEntries} selectedDay={selectedDay} />
            <EntryList entries={dayEntries} onEdit={setEditing} onDelete={deleteEntry} emptyAction={{ label: "จดด้วย AI", onClick: openAddTab }} />
          </div>
        )}

        {tab === "debtors" && (
          <DebtorsView
            debtors={debtors}
            entries={entries}
            debtorSummary={debtorSummary}
            selectedDebtor={selectedDebtor}
            onBack={() => selectedDebtor ? setSelectedDebtor(null) : setTab("home")}
            onAdd={() => { setEditingDebtor(null); setDebtorSheetMode("create"); }}
            onSelect={(debtor) => setSelectedDebtor(debtor)}
            onEdit={(debtor) => { setEditingDebtor(debtor); setDebtorSheetMode("edit"); }}
            onDelete={deleteDebtor}
          />
        )}

        {tab === "wallets" && (
          <WalletsView
            wallets={wallets}
            onBack={() => setTab("home")}
            onAdd={() => { setEditingWallet(null); setWalletSheetMode("create"); }}
            onEdit={(wallet) => { setEditingWallet(wallet); setWalletSheetMode("edit"); }}
            onDelete={deleteWallet}
          />
        )}

        {editing && <EditSheet entry={editing} busy={busy} onChange={setEditing} onClose={() => setEditing(null)} onSave={updateEntry} />}
        {debtorSheetMode && (
          <DebtorEditSheet
            debtor={debtorSheetMode === "edit" ? editingDebtor : null}
            busy={busy}
            onClose={() => { setDebtorSheetMode(null); setEditingDebtor(null); }}
            onCreate={(name, note, openingBalance) => createDebtor(name, note, openingBalance)}
            onUpdate={(debtor, patch) => updateDebtor(debtor, patch)}
          />
        )}
        {walletSheetMode && (
          <WalletEditSheet
            wallet={walletSheetMode === "edit" ? editingWallet : null}
            busy={busy}
            onClose={() => { setWalletSheetMode(null); setEditingWallet(null); }}
            onCreate={(name, tag, balance) => createWallet(name, tag, balance)}
            onUpdate={(wallet, patch) => updateWallet(wallet, patch)}
          />
        )}
        {menuOpen && (
          <SideMenu
            user={user}
            profile={profile}
            debtorSummary={debtorSummary}
            walletsTotal={walletTotals.cash + walletTotals.savings + walletTotals.investment + walletTotals.other}
            onClose={() => setMenuOpen(false)}
            onLogout={() => { setMenuOpen(false); setLogoutOpen(true); }}
            onOpenProfile={() => { setMenuOpen(false); setProfileSheetOpen(true); }}
            onOpenWallets={() => { setMenuOpen(false); setTab("wallets"); }}
            onOpenDebtors={() => { setMenuOpen(false); setSelectedDebtor(null); setTab("debtors"); }}
            onOpenBudgets={() => { setMenuOpen(false); setBudgetSheetOpen(true); }}
            onOpenReport={() => { setMenuOpen(false); setReportSheetOpen(true); }}
            onOpenMascots={() => { setMenuOpen(false); setMascotSheetOpen(true); }}
          />
        )}
        {profileSheetOpen && (
          <ProfileEditSheet profile={profile} busy={busy} onClose={() => setProfileSheetOpen(false)} onSave={saveProfile} />
        )}
        {budgetSheetOpen && <BudgetSheet budgets={budgets} onClose={() => setBudgetSheetOpen(false)} onSave={updateBudgets} />}
        {reportSheetOpen && (
          <ReportExportSheet
            entries={entries}
            wallets={wallets}
            debtorSummary={debtorSummary}
            selectedMonth={selectedMonth}
            monthStartDay={monthStartDay}
            onClose={() => setReportSheetOpen(false)}
          />
        )}
        {mascotSheetOpen && <MascotSheet selected={mascotVariant} onSelect={chooseMascot} onClose={() => setMascotSheetOpen(false)} />}
        {recapOpen && (
          <RecapSheet
            selectedMonth={selectedMonth}
            income={monthlyIncome}
            outflow={monthlyOutflow}
            balance={monthlyBalance}
            topCategory={categorySummary[0] ?? null}
            streak={streak}
            onClose={() => setRecapOpen(false)}
          />
        )}
        {logoutOpen && <ConfirmLogout onCancel={() => setLogoutOpen(false)} onConfirm={() => supabase?.auth.signOut()} />}
        <ToastHost toasts={toasts} onDismiss={(id) => setToasts((items) => items.filter((toast) => toast.id !== id))} />

        {!overlayOpen && <LivingMascot storageKey={`money-pet-${user.id}`} />}

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
            <button className="add-button" onClick={openAddTab} aria-label="เพิ่มรายการด้วย AI">
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

function CalendarHeatmap({
  start,
  end,
  entries,
  selectedDay,
  onSelectDay,
}: {
  start: Date;
  end: Date;
  entries: Entry[];
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
}) {
  const dayTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      if (entry.wallet_impact >= 0) continue;
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

  return (
    <section className="heatmap-panel">
      <div className="section-title">
        <h2>ปฏิทินการใช้จ่าย</h2>
        {selectedDay && <button onClick={() => onSelectDay(null)}>ล้างตัวกรอง</button>}
      </div>
      <div className="heatmap-grid">
        {days.map((day) => (
          <button
            key={day.key}
            className={`heatmap-cell bucket-${bucket(day.amount)}${selectedDay === day.key ? " selected" : ""}`}
            onClick={() => onSelectDay(selectedDay === day.key ? null : day.key)}
            title={`${day.date.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} · ${moneySign}${formatMoney(day.amount)}`}
          >
            {day.date.getDate()}
          </button>
        ))}
      </div>
      <HeatmapLegend total={days.reduce((sum, day) => sum + day.amount, 0)} activeDays={days.filter((day) => day.amount > 0).length} />
    </section>
  );
}

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

function CountUpMoney({ value }: { value: number }) {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const start = 0;
    const diff = value;
    let frame = 0;
    const total = 26;
    const tick = () => {
      frame += 1;
      const progress = 1 - Math.pow(1 - frame / total, 3);
      setShown(start + diff * progress);
      if (frame < total) window.requestAnimationFrame(tick);
    };
    const id = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(id);
  }, [value]);

  return <>{moneySign}{formatMoney(shown)}</>;
}

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
      <strong className="hero-amount">
        {balance < 0 ? "−" : ""}
        <CountUpMoney value={Math.abs(balance)} />
      </strong>
      <div className="hero-wallet-foot">
        <small>{insight.text}</small>
        {streak >= 2 && <small className="streak-badge">{streak} วันติดต่อกัน</small>}
      </div>
    </div>
  );
}

function MiniTrend({ items }: { items: { key: string; label: string; amount: number }[] }) {
  const max = Math.max(...items.map((item) => item.amount), 1);
  return (
    <div className="mini-trend" aria-label="รายจ่าย 7 วันล่าสุด">
      <div className="mini-trend-head">
        <span>รายจ่าย 7 วันล่าสุด</span>
        <b>{moneySign}{formatMoney(items.reduce((sum, item) => sum + item.amount, 0))}</b>
      </div>
      <div className="mini-trend-bars">
        {items.map((item) => (
          <span key={item.key} title={`${item.label}: ${moneySign}${formatMoney(item.amount)}`}>
            <i style={{ height: `${Math.max(8, (item.amount / max) * 100)}%` }} />
            <small>{item.label}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

function SuccessPulse({ count, onAddMore }: { count: number; onAddMore: () => void }) {
  return (
    <section className="success-pulse" role="status">
      <MoneyMascot mood="happy" tiny />
      <span aria-hidden="true">✓</span>
      <div>
        <b>บันทึกเรียบร้อย</b>
        <small>{count} รายการถูกซิงค์แล้ว พร้อมจดรายการถัดไปได้เลย</small>
      </div>
      <button onClick={onAddMore}>+ AI</button>
    </section>
  );
}

function HistoryInsight({ entries, selectedDay }: { entries: Entry[]; selectedDay: string | null }) {
  const outflow = entries.filter((entry) => entry.wallet_impact < 0).reduce((sum, entry) => sum + Math.abs(entry.wallet_impact), 0);
  const income = entries.filter((entry) => entry.wallet_impact > 0).reduce((sum, entry) => sum + entry.wallet_impact, 0);
  const top = [...entries]
    .filter((entry) => entry.wallet_impact < 0)
    .sort((a, b) => Math.abs(b.wallet_impact) - Math.abs(a.wallet_impact))[0];

  return (
    <section className="history-insight">
      <div>
        <span>{selectedDay ? "มุมมองวันที่เลือก" : "มุมมองรอบนี้"}</span>
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

function CategorySpotlight({
  categories: categoryItems,
  outflow,
  budgets,
}: {
  categories: { category: string; amount: number }[];
  outflow: number;
  budgets: Record<string, number>;
}) {
  const top = categoryItems.find((item) => item.amount > 0);
  if (!top) return null;
  const budget = budgets[top.category] || 0;
  const percent = budget > 0 ? Math.min(140, (top.amount / budget) * 100) : outflow > 0 ? Math.min(100, (top.amount / outflow) * 100) : 0;
  const isOver = budget > 0 && top.amount > budget;

  return (
    <section className={`category-spotlight ${isOver ? "over" : ""}`}>
      <span className="cat-dot" style={{ background: `${categoryColor(top.category)}22` }}>{categoryIcon(top.category)}</span>
      <div>
        <small>{budget > 0 ? "หมวดที่ต้องจับตา" : "หมวดใช้จ่ายเด่น"}</small>
        <b>{top.category}</b>
        <i>
          <em style={{ width: `${Math.max(6, Math.min(100, percent))}%`, background: isOver ? "#d03b3b" : categoryColor(top.category) }} />
        </i>
      </div>
      <strong>{moneySign}{formatMoney(top.amount)}</strong>
    </section>
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
  monthStartDay,
  budgets,
  trend,
}: {
  selectedMonth: string;
  setSelectedMonth: (value: string) => void;
  income: number;
  outflow: number;
  debtChange: number;
  balance: number;
  categories: { category: string; amount: number }[];
  monthStartDay: number;
  budgets: Record<string, number>;
  trend: { key: string; label: string; amount: number }[];
}) {
  return (
    <section className="summary-panel">
      <div className="summary-head">
        <div>
          <p className="eyebrow">สรุปรายเดือน</p>
          <h2>ภาพรวมเดือนนี้</h2>
          <small className="cycle-note">รอบเริ่มวันที่ {monthStartDay} ของเดือน</small>
        </div>
        <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
      </div>
      <div className="summary-grid">
        <Metric label="เงินเข้า" value={income} tone="income" />
        <Metric label="เงินออก" value={outflow} tone="expense" />
        <Metric label="สุทธิ" value={balance} tone={balance >= 0 ? "income" : "expense"} />
        <Metric label="ลูกหนี้เปลี่ยน" value={debtChange} tone={debtChange >= 0 ? "income" : "expense"} />
      </div>
      <MiniTrend items={trend} />
      <CategorySpotlight categories={categoryItems} outflow={outflow} budgets={budgets} />
      <div className="category-bars">
        {categoryItems.length ? (
          categoryItems.map((item) => {
            const budget = budgets[item.category];
            const hasBudget = !!budget && budget > 0;
            const overBudget = hasBudget && item.amount > budget;
            const color = overBudget ? "#d03b3b" : categoryColor(item.category);
            const percent = hasBudget ? (item.amount / budget) * 100 : outflow > 0 ? (item.amount / outflow) * 100 : 0;
            return (
              <div className="category-bar" key={item.category}>
                <div>
                  <span className="cat-dot" style={{ background: `${categoryColor(item.category)}22` }}>{categoryIcon(item.category)}</span>
                  <b>{item.category}</b>
                  {overBudget && <span className="over-budget-chip">เกินงบ</span>}
                  <small>{hasBudget ? `${moneySign}${formatMoney(item.amount)} / ${moneySign}${formatMoney(budget)}` : `${percent.toFixed(0)}%`}</small>
                </div>
                {!hasBudget && <strong>{moneySign}{formatMoney(item.amount)}</strong>}
                <i style={{ width: `${Math.max(4, Math.min(100, percent))}%`, background: color }} />
              </div>
            );
          })
        ) : (
          <EmptyNote glyph="▣">ยังไม่มีรายจ่ายในเดือนนี้</EmptyNote>
        )}
      </div>
    </section>
  );
}

function EmptyNote({ glyph, children, action }: { glyph: string; children: React.ReactNode; action?: EmptyAction }) {
  return (
    <div className="empty-note">
      <MoneyMascot mood="sleepy" tiny />
      <span className="empty-glyph">{glyph}</span>
      <p>{children}</p>
      {action && <button onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}

function ToastHost({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((toast) => (
        <button key={toast.id} className={`toast ${toast.tone}`} onClick={() => onDismiss(toast.id)}>
          <span aria-hidden="true">{toast.tone === "success" ? "✓" : toast.tone === "error" ? "!" : "✦"}</span>
          <span>
            <b>{toast.title}</b>
            {toast.detail && <small>{toast.detail}</small>}
          </span>
        </button>
      ))}
    </div>
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
      <MoneyMascot mood={tone === "loading" ? "thinking" : tone === "error" ? "oops" : "sleepy"} tiny />
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

function LivingMascot({ storageKey }: { storageKey: string }) {
  const [open, setOpen] = useState(false);
  const [x, setX] = useState(18);
  const [facing, setFacing] = useState<"left" | "right">("right");
  const [stats, setStats] = useState<PetStats>(defaultPetStats);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return;
        const saved = JSON.parse(raw) as Partial<PetStats>;
        const now = Date.now();
        const hoursAway = Math.max(0, (now - Number(saved.lastSeen || now)) / 36e5);
        setStats({
          happiness: clampStat(Number(saved.happiness ?? defaultPetStats.happiness) - hoursAway * 2.2),
          energy: clampStat(Number(saved.energy ?? defaultPetStats.energy) - hoursAway * 1.4),
          treats: Math.max(0, Math.floor(Number(saved.treats ?? 0))),
          lastSeen: now,
          message: hoursAway > 3 ? "คิดถึงเลย กลับมาแล้ว!" : saved.message || defaultPetStats.message,
        });
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify({ ...stats, lastSeen: Date.now() }));
  }, [stats, storageKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setX((current) => {
        const next = Math.round(10 + Math.random() * 76);
        setFacing(next >= current ? "right" : "left");
        return next;
      });
      setStats((current) => ({
        ...current,
        happiness: clampStat(current.happiness - 0.8),
        energy: clampStat(current.energy - 0.6),
        lastSeen: Date.now(),
      }));
    }, 6200);
    return () => window.clearInterval(timer);
  }, []);

  const mood: MascotMood = stats.energy < 24 ? "sleepy" : stats.happiness < 28 ? "oops" : stats.happiness > 82 ? "happy" : open ? "thinking" : "idle";

  function nudge(message: string, patch: Partial<Pick<PetStats, "happiness" | "energy" | "treats">>) {
    setStats((current) => ({
      happiness: clampStat(patch.happiness ?? current.happiness),
      energy: clampStat(patch.energy ?? current.energy),
      treats: Math.max(0, Math.floor(patch.treats ?? current.treats)),
      lastSeen: Date.now(),
      message,
    }));
  }

  function play() {
    nudge("เย้! ได้เล่นแล้ว สดชื่นขึ้นเยอะ", {
      happiness: stats.happiness + 18,
      energy: stats.energy - 10,
      treats: stats.treats,
    });
  }

  function feed() {
    nudge("งั่ม ๆ เหรียญอร่อยมาก", {
      happiness: stats.happiness + 7,
      energy: stats.energy + 16,
      treats: stats.treats + 1,
    });
  }

  function rest() {
    nudge("ขอชาร์จพลังแป๊บนึงนะ", {
      happiness: stats.happiness + 3,
      energy: stats.energy + 24,
      treats: stats.treats,
    });
  }

  return (
    <aside className={`living-mascot ${open ? "open" : ""} facing-${facing}`} style={{ "--pet-left": `${x}%` } as CSSProperties} aria-label="มาสคอตผู้ช่วย">
      {open && (
        <section className="pet-panel">
          <div className="pet-panel-head">
            <b>น้องบันทึกเงิน</b>
            <button onClick={() => setOpen(false)} aria-label="ปิดมาสคอต">×</button>
          </div>
          <p>{stats.message}</p>
          <PetMeter label="สุข" value={stats.happiness} />
          <PetMeter label="พลัง" value={stats.energy} />
          <div className="pet-actions">
            <button onClick={play} disabled={stats.energy < 10}>เล่น</button>
            <button onClick={feed}>ให้อาหาร</button>
            <button onClick={rest}>พัก</button>
          </div>
          <small>ขนมเหรียญ {stats.treats} ชิ้น · รอบนี้จำในเครื่องนี้ก่อน</small>
        </section>
      )}
      <button className="pet-stage" onClick={() => setOpen((value) => !value)} aria-label={open ? "ปิดมาสคอต" : "เปิดมาสคอต"}>
        <MoneyMascot mood={mood} />
        <span className="pet-shadow-line" />
      </button>
    </aside>
  );
}

function PetMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="pet-meter">
      <span>{label}</span>
      <i>
        <em style={{ width: `${Math.round(value)}%` }} />
      </i>
      <b>{Math.round(value)}</b>
    </div>
  );
}

function clampStat(value: number) {
  return Math.max(0, Math.min(100, value));
}

function isMascotVariant(value: string | null): value is MascotVariant {
  return mascotOptions.some((option) => option.id === value);
}

function MoneyMascot({ mood = "idle", tiny = false, variant }: { mood?: MascotMood; tiny?: boolean; variant?: MascotVariant }) {
  return (
    <span className={`money-mascot ${tiny ? "tiny" : ""} ${mood} ${variant ? `variant-${variant}` : ""}`} aria-hidden="true">
      <span className="mascot-shadow" />
      <span className="mascot-body">
        <span className="mascot-ear left" />
        <span className="mascot-ear right" />
        <span className="mascot-face">
          <span className="mascot-eye left" />
          <span className="mascot-eye right" />
          <span className="mascot-mouth" />
        </span>
        <span className="mascot-coin">฿</span>
      </span>
      <span className="mascot-spark one" />
      <span className="mascot-spark two" />
    </span>
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

function Metric({ label, value, tone }: { label: string; value: number; tone: "income" | "expense" }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <b>{value < 0 ? "−" : ""}{moneySign}{formatMoney(Math.abs(value))}</b>
    </div>
  );
}

function DraftRow({ draft, knownDebtorNames, onChange }: { draft: Draft; knownDebtorNames: string[]; onChange: (draft: Draft) => void }) {
  const update = (patch: Partial<Draft>) => onChange(normalizeEntry({ ...draft, ...patch }));
  const isDebtType = (["lend", "split_half", "debt_repayment"] as TransactionType[]).includes(draft.transaction_type);
  const isNewDebtor = isDebtType && draft.debtor_name !== unnamedDebtor && !knownDebtorNames.some((name) => name.trim().toLowerCase() === draft.debtor_name.trim().toLowerCase());

  return (
    <div className={`draft draft-${draft.transaction_type}`}>
      <span className="cat-icon" style={{ background: `${categoryColor(draft.category)}22` }}>{categoryIcon(draft.category)}</span>
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
          <input inputMode="decimal" value={draft.amount} onChange={(event) => update({ amount: Number(event.target.value) })} />
        </label>
      </div>
      <div className="impact-row">
        <span>กระเป๋า {formatSignedMoney(draft.wallet_impact)}</span>
        <span>ลูกหนี้ {formatSignedMoney(draft.debt_impact)}</span>
      </div>
      {isDebtType && (
        <div className="draft-debtor-field">
          <input className="draft-date" placeholder="ชื่อผู้เกี่ยวข้อง เช่น แฟน หรือ เพื่อนเอ" value={draft.debtor_name} onChange={(event) => update({ debtor_name: event.target.value })} />
          {isNewDebtor && <small>ลูกหนี้ใหม่ · จะสร้างให้อัตโนมัติเมื่อบันทึก</small>}
        </div>
      )}
      <input className="draft-date" type="date" value={toDateInput(draft.occurred_at)} onChange={(event) => update({ occurred_at: fromDateInput(event.target.value) })} />
    </div>
  );
}

function DraftImpact({ items }: { items: Draft[] }) {
  const wallet = items.reduce((sum, item) => sum + item.wallet_impact, 0);
  const debt = items.reduce((sum, item) => sum + item.debt_impact, 0);

  return (
    <div className="draft-impact">
      <span>กระเป๋าหลัก {formatSignedMoney(wallet)}</span>
      <span>ลูกหนี้ {formatSignedMoney(debt)}</span>
    </div>
  );
}

function EntryList({
  entries,
  onEdit,
  onDelete,
  emptyAction,
}: {
  entries: Entry[];
  onEdit?: (entry: Entry) => void;
  onDelete?: (entry: Entry) => void;
  emptyAction?: EmptyAction;
}) {
  const groups = useMemo(() => groupEntriesByDay(entries), [entries]);

  return (
    <div className="entry-list">
      {groups.map((group) => (
        <div className="entry-group" key={group.label}>
          <p className="entry-day">{group.label}</p>
          {group.items.map((entry) => (
            <article
              className={onEdit ? "entry entry-tappable" : "entry"}
              key={entry.id}
              onClick={onEdit ? () => onEdit(entry) : undefined}
              role={onEdit ? "button" : undefined}
              tabIndex={onEdit ? 0 : undefined}
            >
              <span className="entry-icon" style={{ background: `${categoryColor(entry.category)}22` }}>{categoryIcon(entry.category)}</span>
              <div>
                <b>{entry.title}</b>
                <small>
                  {transactionTypeLabels[entry.transaction_type]} · {entry.category} · {formatDateTime(entry.occurred_at)}
                </small>
                <small>
                  กระเป๋า {formatSignedMoney(entry.wallet_impact)}
                  {entry.debt_impact !== 0 ? ` · ${entry.debtor_name}: ${formatSignedMoney(entry.debt_impact)}` : ""}
                </small>
              </div>
              <strong className={entry.wallet_impact >= 0 ? "income" : "expense"}>{formatSignedMoney(entry.wallet_impact)}</strong>
              {(onEdit || onDelete) && (
                <menu onClick={(event) => event.stopPropagation()}>
                  {onEdit && <button onClick={() => onEdit(entry)} title="แก้ไข">แก้</button>}
                  {onDelete && <button onClick={() => onDelete(entry)} title="ลบ">ลบ</button>}
                </menu>
              )}
            </article>
          ))}
        </div>
      ))}
      {!entries.length && <EmptyNote glyph="▪" action={emptyAction}>ยังไม่มีรายการในช่วงนี้</EmptyNote>}
    </div>
  );
}

function EditSheet({
  entry,
  busy,
  onChange,
  onClose,
  onSave,
}: {
  entry: Entry;
  busy: boolean;
  onChange: (entry: Entry) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const update = (patch: Partial<Entry>) => onChange(normalizeEntry({ ...entry, ...patch }));

  return (
    <div className="sheet-backdrop">
      <section className="edit-sheet">
        <div className="sheet-head">
          <div>
            <p className="eyebrow">แก้ไขรายการ</p>
            <h2>{entry.title || "รายการ"}</h2>
          </div>
          <button onClick={onClose}>×</button>
        </div>

        <label>
          ชื่อรายการ
          <input value={entry.title} onChange={(event) => update({ title: event.target.value })} />
        </label>
        <label>
          หมวดหมู่
          <select value={entry.category} onChange={(event) => update({ category: event.target.value })}>
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <label>
          ชนิดรายการ
          <select value={entry.transaction_type} onChange={(event) => update({ transaction_type: event.target.value as TransactionType })}>
            {Object.entries(transactionTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          จำนวนเงิน
          <input inputMode="decimal" value={entry.amount} onChange={(event) => update({ amount: Number(event.target.value) })} />
        </label>
        {(["lend", "split_half", "debt_repayment"] as TransactionType[]).includes(entry.transaction_type) && (
          <label>
            ชื่อผู้เกี่ยวข้อง
            <input type="text" placeholder="เช่น เพื่อนเอ" value={entry.debtor_name} onChange={(event) => update({ debtor_name: event.target.value })} />
          </label>
        )}
        <label>
          วันที่
          <input type="date" value={toDateInput(entry.occurred_at)} onChange={(event) => update({ occurred_at: fromDateInput(event.target.value) })} />
        </label>

        <div className="draft-impact">
          <span>กระเป๋า {formatSignedMoney(entry.wallet_impact)}</span>
          <span>ลูกหนี้ {formatSignedMoney(entry.debt_impact)}</span>
        </div>

        <button className="save" onClick={onSave} disabled={busy || !entry.title.trim() || entry.amount < 0}>
          บันทึกการแก้ไข
        </button>
      </section>
    </div>
  );
}

function DebtorsView({
  debtors,
  entries,
  debtorSummary,
  selectedDebtor,
  onBack,
  onAdd,
  onSelect,
  onEdit,
  onDelete,
}: {
  debtors: Debtor[];
  entries: Entry[];
  debtorSummary: { name: string; amount: number }[];
  selectedDebtor: Debtor | null;
  onBack: () => void;
  onAdd: () => void;
  onSelect: (debtor: Debtor) => void;
  onEdit: (debtor: Debtor) => void;
  onDelete: (debtor: Debtor) => void;
}) {
  const debtorEntries = selectedDebtor
    ? entries.filter((entry) => entry.debtor_name.trim().toLowerCase() === selectedDebtor.name.trim().toLowerCase() && entry.debt_impact !== 0)
    : [];
  const selectedAmount = selectedDebtor ? debtorSummary.find((item) => item.name.trim().toLowerCase() === selectedDebtor.name.trim().toLowerCase())?.amount ?? 0 : 0;

  if (selectedDebtor) {
    return (
      <div className="view debtor-view">
        <div className="add-title">
          <button onClick={onBack}>‹</button>
          <span className="debtor-avatar" style={{ background: nameColor(selectedDebtor.name) }}>{nameInitial(selectedDebtor.name)}</span>
          <div>
            <p className="eyebrow">ประวัติลูกหนี้</p>
            <h2>{selectedDebtor.name}</h2>
          </div>
        </div>
        <section className="debtor-detail-card">
          <span>ยอดค้างปัจจุบัน</span>
          <strong>{moneySign}{formatMoney(selectedAmount)}</strong>
          {selectedDebtor.note && <small>{selectedDebtor.note}</small>}
        </section>
        <DebtorStatementSummary entries={debtorEntries} />
        <div className="section-title">
          <h2>ประวัติยืม/จ่าย</h2>
          <button onClick={() => onEdit(selectedDebtor)}>แก้ไข</button>
        </div>
        <EntryList entries={debtorEntries} />
      </div>
    );
  }

  return (
    <div className="view debtor-view">
      <div className="add-title">
        <button onClick={onBack}>‹</button>
        <div>
          <p className="eyebrow">จัดการรายชื่อ</p>
          <h2>ลูกหนี้</h2>
        </div>
        <button className="header-add-button" onClick={onAdd}>เพิ่ม</button>
      </div>
      <div className="debtor-page-list">
        {debtors.map((debtor) => {
          const amount = debtorSummary.find((item) => item.name.trim().toLowerCase() === debtor.name.trim().toLowerCase())?.amount ?? 0;
          return (
            <article className="debtor-page-item" key={debtor.id}>
              <button className="debtor-main-button" onClick={() => onSelect(debtor)}>
                <span className="debtor-avatar" style={{ background: nameColor(debtor.name) }}>{nameInitial(debtor.name)}</span>
                <div>
                  <span>{debtor.name}</span>
                  <small>{debtor.note || "ไม่มีหมายเหตุ"} · ค้าง {moneySign}{formatMoney(amount)}</small>
                </div>
              </button>
              <details className="kebab-menu">
                <summary>⋮</summary>
                <menu>
                  <button onClick={() => onEdit(debtor)}>แก้ไข</button>
                  <button onClick={() => onDelete(debtor)}>ลบ</button>
                </menu>
              </details>
            </article>
          );
        })}
        {!debtors.length && <EmptyNote glyph="◆" action={{ label: "เพิ่มลูกหนี้", onClick: onAdd }}>ยังไม่มีรายชื่อลูกหนี้</EmptyNote>}
      </div>
    </div>
  );
}

function DebtorStatementSummary({ entries }: { entries: Entry[] }) {
  const lent = entries.filter((entry) => entry.debt_impact > 0).reduce((sum, entry) => sum + entry.debt_impact, 0);
  const paid = entries.filter((entry) => entry.debt_impact < 0).reduce((sum, entry) => sum + Math.abs(entry.debt_impact), 0);
  const latest = [...entries].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())[0];

  return (
    <section className="debtor-statement">
      <div>
        <span>ยืม/หารสะสม</span>
        <b>{moneySign}{formatMoney(lent)}</b>
      </div>
      <div>
        <span>คืนแล้ว</span>
        <b>{moneySign}{formatMoney(paid)}</b>
      </div>
      <div>
        <span>รายการ</span>
        <b>{entries.length}</b>
      </div>
      <small>{latest ? `ล่าสุด: ${latest.title}` : "ยังไม่มีประวัติการเคลื่อนไหว"}</small>
    </section>
  );
}

function DebtorEditSheet({
  debtor,
  busy,
  onClose,
  onCreate,
  onUpdate,
}: {
  debtor: Debtor | null;
  busy: boolean;
  onClose: () => void;
  onCreate: (name: string, note: string, openingBalance: number) => void;
  onUpdate: (debtor: Debtor, patch: { name: string; note: string; opening_balance: number }) => void;
}) {
  const [name, setName] = useState(debtor?.name ?? "");
  const [note, setNote] = useState(debtor?.note ?? "");
  const [openingBalance, setOpeningBalance] = useState(debtor?.opening_balance ?? 0);

  const submit = () => {
    if (!name.trim()) return;
    if (debtor) onUpdate(debtor, { name, note, opening_balance: openingBalance });
    else onCreate(name, note, openingBalance);
    onClose();
  };

  return (
    <div className="sheet-backdrop">
      <section className="edit-sheet">
        <div className="sheet-head">
          <div>
            <p className="eyebrow">{debtor ? "แก้ไขลูกหนี้" : "เพิ่มลูกหนี้"}</p>
            <h2>{debtor ? debtor.name : "ลูกหนี้ใหม่"}</h2>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        <label>
          ชื่อ
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น เพื่อนเอ" />
        </label>
        <label>
          หมายเหตุ
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="เช่น เพื่อนร่วมงาน" />
        </label>
        <label>
          ยอดเริ่มต้น (ที่ค้างอยู่ก่อนเริ่มใช้แอพ)
          <input inputMode="decimal" value={openingBalance} onChange={(event) => setOpeningBalance(Number(event.target.value) || 0)} />
        </label>
        <button className="save" onClick={submit} disabled={busy || !name.trim()}>
          บันทึก
        </button>
      </section>
    </div>
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
}: {
  selectedMonth: string;
  income: number;
  outflow: number;
  balance: number;
  topCategory: { category: string; amount: number } | null;
  streak: number;
  onClose: () => void;
}) {
  const monthLabel = new Date(`${selectedMonth}-01T00:00:00`).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
  const closingLine = balance >= 0 ? "เดือนนี้ยังมีเงินเหลือเก็บ" : "เดือนหน้าลองคุมงบดูอีกนิด";

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
      window.alert("คัดลอกสรุปเดือนนี้แล้ว");
    } catch {
      window.alert(text);
    }
  }

  return (
    <div className="sheet-backdrop">
      <section className="recap-card">
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
            <span className="cat-dot" style={{ background: `${categoryColor(topCategory.category)}33` }}>{categoryIcon(topCategory.category)}</span>
            <div>
              <small>ใช้จ่ายเยอะสุด</small>
              <b>{topCategory.category} · {moneySign}{formatMoney(topCategory.amount)}</b>
            </div>
          </div>
        )}
        {streak >= 2 && <p className="recap-streak">จดต่อเนื่อง {streak} วัน</p>}
        <p className="recap-line">{closingLine}</p>
        <button className="recap-share" onClick={share}>แชร์สรุปเดือนนี้</button>
      </section>
    </div>
  );
}

function BudgetSheet({
  budgets,
  onClose,
  onSave,
}: {
  budgets: Record<string, number>;
  onClose: () => void;
  onSave: (next: Record<string, number>) => void;
}) {
  const expenseCategories = categories.filter((category) => category !== "รายได้");
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(expenseCategories.map((category) => [category, budgets[category] ? String(budgets[category]) : ""])),
  );

  const submit = () => {
    const next: Record<string, number> = {};
    for (const category of expenseCategories) {
      const value = Number(draft[category]);
      if (draft[category]?.trim() && value > 0) next[category] = value;
    }
    onSave(next);
    onClose();
  };

  return (
    <div className="sheet-backdrop">
      <section className="edit-sheet budget-sheet">
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
            <span className="cat-dot" style={{ background: `${categoryColor(category)}22` }}>{categoryIcon(category)}</span>
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

function ReportExportSheet({
  entries,
  wallets,
  debtorSummary,
  selectedMonth,
  monthStartDay,
  onClose,
}: {
  entries: Entry[];
  wallets: Wallet[];
  debtorSummary: { name: string; amount: number }[];
  selectedMonth: string;
  monthStartDay: number;
  onClose: () => void;
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
      debtorSummary,
      period,
      selectedMonth: month,
      selectedYear: safeYear,
      monthStartDay,
    });
    downloadCsv(`money-report-${filenamePeriod}.csv`, csv);
  }

  return (
    <div className="sheet-backdrop">
      <section className="edit-sheet report-sheet">
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
  debtorSummary,
  walletsTotal,
  onClose,
  onLogout,
  onOpenProfile,
  onOpenWallets,
  onOpenDebtors,
  onOpenBudgets,
  onOpenReport,
  onOpenMascots,
}: {
  user: User;
  profile: Profile | null;
  debtorSummary: { name: string; amount: number }[];
  walletsTotal: number;
  onClose: () => void;
  onLogout: () => void;
  onOpenProfile: () => void;
  onOpenWallets: () => void;
  onOpenDebtors: () => void;
  onOpenBudgets: () => void;
  onOpenReport: () => void;
  onOpenMascots: () => void;
}) {
  const metadata = user.user_metadata ?? {};
  const name = profile?.nickname || metadata.full_name || metadata.name || "ผู้ใช้";
  const appIcon = profile?.app_icon || user.email?.[0]?.toUpperCase() || "฿";
  const appIconImage = profile?.app_icon_image || "";
  const provider = user.app_metadata?.provider ?? "Google";
  const totalDebt = debtorSummary.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="side-menu-backdrop" onClick={onClose}>
      <aside className="side-menu" onClick={(event) => event.stopPropagation()}>
        <div className="side-menu-head">
          <div>
            <p className="eyebrow">เมนู</p>
            <h2>บัญชีของฉัน</h2>
          </div>
          <button onClick={onClose}>×</button>
        </div>

        <div className="profile-head">
          <div className="avatar profile-avatar profile-avatar-image" style={appIconImage ? { backgroundImage: `url(${appIconImage})` } : undefined}>
            {!appIconImage && appIcon}
          </div>
          <div>
            <b>{name}</b>
            <small>{user.email}</small>
          </div>
        </div>
        <div className="profile-info">
          <span>เข้าสู่ระบบด้วย</span>
          <b>{provider}</b>
          <span>สร้างบัญชี</span>
          <b>{user.created_at ? new Date(user.created_at).toLocaleDateString("th-TH") : "—"}</b>
        </div>

        <nav className="side-menu-list">
          <button onClick={onOpenProfile}>
            <span>จัดการโปรไฟล์</span>
            <small>ชื่อเล่น รูปไอคอน วันเริ่มรอบเดือน</small>
          </button>
          <button onClick={onOpenWallets}>
            <span>กระเป๋าตังค์</span>
            <small>ยอดรวม {moneySign}{formatMoney(walletsTotal)} · จัดการกองเงินและแท็ก</small>
          </button>
          <button onClick={onOpenDebtors}>
            <span>ลูกหนี้</span>
            <small>ยอดรวม {moneySign}{formatMoney(totalDebt)} · จัดการรายชื่อและประวัติ</small>
          </button>
          <button onClick={onOpenBudgets}>
            <span>งบประมาณ</span>
            <small>ตั้งวงเงินต่อหมวดหมู่ต่อเดือน</small>
          </button>
          <button onClick={onOpenMascots}>
            <span>มาสคอต</span>
            <small>เลือกเพื่อนเดินในแอพ และเปลี่ยนบุคลิกตัวช่วย</small>
          </button>
          <button onClick={onOpenReport}>
            <span>ส่งออกรีพอร์ท</span>
            <small>ดาวน์โหลดสรุปรายเดือนหรือรายปีเป็นไฟล์ CSV สำหรับ Excel/Sheets</small>
          </button>
        </nav>

        <button className="logout-button" onClick={onLogout}>ออกจากระบบ</button>
      </aside>
    </div>
  );
}

function MascotSheet({
  selected,
  onSelect,
  onClose,
}: {
  selected: MascotVariant;
  onSelect: (variant: MascotVariant) => void;
  onClose: () => void;
}) {
  return (
    <div className="sheet-backdrop">
      <section className="edit-sheet mascot-sheet">
        <div className="sheet-head">
          <div>
            <p className="eyebrow">Tamagotchi Buddy</p>
            <h2>เลือกมาสคอต</h2>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        <p className="budget-hint">เลือกตัวละครที่อยากให้เดินเล่นในแอพ ตอนนี้เป็นชุดในตัวแอพก่อน ถ้ามีไฟล์ PNG/Sprite โปร่งใสจริงค่อยเพิ่มเป็นชุด custom ได้ต่อเลย</p>
        <div className="mascot-picker-grid">
          {mascotOptions.map((option) => (
            <button
              key={option.id}
              className={`mascot-choice ${selected === option.id ? "active" : ""}`}
              onClick={() => onSelect(option.id)}
            >
              <MoneyMascot mood={selected === option.id ? "happy" : "idle"} variant={option.id} />
              <span>
                <b>{option.name}</b>
                <small>{option.detail}</small>
              </span>
              {selected === option.id && <em>ใช้อยู่</em>}
            </button>
          ))}
        </div>
        <button className="save" onClick={onClose}>เสร็จแล้ว</button>
      </section>
    </div>
  );
}

function ProfileEditSheet({
  profile,
  busy,
  onClose,
  onSave,
}: {
  profile: Profile | null;
  busy: boolean;
  onClose: () => void;
  onSave: (next: { nickname: string; app_icon: string; app_icon_image: string; month_start_day: number }) => void;
}) {
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const app_icon = profile?.app_icon ?? "";
  const [app_icon_image, setAppIconImage] = useState(profile?.app_icon_image ?? "");
  const [month_start_day, setMonthStartDay] = useState(profile?.month_start_day ?? 1);

  async function chooseProfileImage(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    try {
      setAppIconImage(await compressProfileImage(file));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "เลือกรูปไม่สำเร็จ");
    }
  }

  const submit = () => {
    onSave({ nickname, app_icon, app_icon_image, month_start_day });
    onClose();
  };

  return (
    <div className="sheet-backdrop">
      <section className="edit-sheet">
        <div className="sheet-head">
          <div>
            <p className="eyebrow">ตั้งค่า</p>
            <h2>จัดการโปรไฟล์</h2>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        <label>
          ชื่อเล่น
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="เช่น ก้อง" />
        </label>
        <label>
          รูปไอคอนจากภายนอก
          <input type="file" accept="image/*" onChange={(event) => { void chooseProfileImage(event.target.files); event.currentTarget.value = ""; }} />
          <small>รองรับรูปจากมือถือได้ถึง 10MB ระบบจะย่อเป็นไอคอนให้อัตโนมัติ</small>
        </label>
        {!!app_icon_image && <button className="side-ghost" onClick={() => setAppIconImage("")}>ลบรูปไอคอน</button>}
        <label>
          วันเริ่มรอบเดือน
          <input type="number" min={1} max={28} value={month_start_day} onChange={(event) => setMonthStartDay(Number(event.target.value))} />
        </label>
        <button className="save" onClick={submit} disabled={busy}>
          บันทึก
        </button>
      </section>
    </div>
  );
}

function WalletsView({
  wallets,
  onBack,
  onAdd,
  onEdit,
  onDelete,
}: {
  wallets: Wallet[];
  onBack: () => void;
  onAdd: () => void;
  onEdit: (wallet: Wallet) => void;
  onDelete: (wallet: Wallet) => void;
}) {
  const total = wallets.reduce((sum, wallet) => sum + wallet.balance, 0);

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
        <strong>{moneySign}{formatMoney(total)}</strong>
      </section>
      <div className="debtor-page-list">
        {wallets.map((wallet) => (
          <article className="debtor-page-item" key={wallet.id}>
            <button className="debtor-main-button" onClick={() => onEdit(wallet)}>
              <span className="debtor-avatar" style={{ background: nameColor(wallet.name) }}>{nameInitial(wallet.name)}</span>
              <div>
                <span>{wallet.name}</span>
                <small>{walletTagLabels[wallet.tag]} · {moneySign}{formatMoney(wallet.balance)}</small>
              </div>
            </button>
            <details className="kebab-menu">
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
    </div>
  );
}

function WalletEditSheet({
  wallet,
  busy,
  onClose,
  onCreate,
  onUpdate,
}: {
  wallet: Wallet | null;
  busy: boolean;
  onClose: () => void;
  onCreate: (name: string, tag: WalletTag, balance: number) => void;
  onUpdate: (wallet: Wallet, patch: { name: string; tag: WalletTag; balance: number }) => void;
}) {
  const [name, setName] = useState(wallet?.name ?? "");
  const [tag, setTag] = useState<WalletTag>(wallet?.tag ?? "cash");
  const [balance, setBalance] = useState(wallet?.balance ?? 0);

  const submit = () => {
    if (!name.trim()) return;
    if (wallet) onUpdate(wallet, { name, tag, balance });
    else onCreate(name, tag, balance);
    onClose();
  };

  return (
    <div className="sheet-backdrop">
      <section className="edit-sheet">
        <div className="sheet-head">
          <div>
            <p className="eyebrow">{wallet ? "แก้ไขกระเป๋าตังค์" : "เพิ่มกระเป๋าตังค์"}</p>
            <h2>{wallet ? wallet.name : "กระเป๋าใหม่"}</h2>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        <label>
          ชื่อกระเป๋า
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น กระเป๋าหลัก, ออมทรัพย์ SCB" />
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
          <input inputMode="decimal" value={balance} onChange={(event) => setBalance(Number(event.target.value) || 0)} />
        </label>
        <button className="save" onClick={submit} disabled={busy || !name.trim()}>
          บันทึก
        </button>
      </section>
    </div>
  );
}

function ConfirmLogout({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="dialog-backdrop">
      <section className="confirm-dialog">
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
