"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type EntryKind = "expense" | "income";
type TransactionType = "income" | "personal_expense" | "lend" | "split_half" | "debt_repayment" | "gift";
type Tab = "home" | "add" | "history" | "debtors";

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
};
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
  if (category === "อาหาร") return "🍜";
  if (category === "เดินทาง") return "🚕";
  if (category === "รายได้") return "💼";
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
const todayEntryDate = () => fromDateInput(new Date().toISOString().slice(0, 10));

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

function cycleBounds(selectedMonth: string, startDay: number) {
  const [year, month] = selectedMonth.split("-").map(Number);
  const safeDay = Math.min(28, Math.max(1, startDay || 1));
  const start = new Date(year, month - 1, safeDay, 0, 0, 0, 0);
  const end = new Date(year, month, safeDay, 0, 0, 0, 0);
  return { start, end };
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
  const [text, setText] = useState("");
  const [slipImages, setSlipImages] = useState<SlipImage[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [debtorSheetMode, setDebtorSheetMode] = useState<"create" | "edit" | null>(null);
  const [editingDebtor, setEditingDebtor] = useState<Debtor | null>(null);
  const [selectedDebtor, setSelectedDebtor] = useState<Debtor | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [budgetSheetOpen, setBudgetSheetOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const displayName = profile?.nickname?.trim() || user?.user_metadata?.full_name || user?.user_metadata?.name || "เงินของฉัน";
  const displayIcon = profile?.app_icon?.trim() || user?.email?.[0]?.toUpperCase() || "฿";
  const displayIconImage = profile?.app_icon_image?.trim() || "";
  const monthStartDay = profile?.month_start_day || 1;

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

    const { data, error } = await supabase.from("profiles").select("user_id,nickname,app_icon,app_icon_image,month_start_day").maybeSingle();
    if (error) {
      setError(error.message);
      return;
    }
    setProfile(data as Profile | null);
  }, []);

  const loadDebtors = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase.from("debtors").select("id,user_id,name,note").order("name", { ascending: true });
    if (error) {
      setError(error.message);
      return;
    }
    setDebtors((data ?? []) as Debtor[]);
  }, []);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setReady(true);
      if (data.user) {
        void loadEntries();
        void loadProfile();
        void loadDebtors();
        setBudgets(loadBudgets(data.user.id));
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        void loadEntries();
        void loadProfile();
        void loadDebtors();
        setBudgets(loadBudgets(session.user.id));
      } else {
        setEntries([]);
        setProfile(null);
        setDebtors([]);
        setBudgets({});
      }
    });
    return () => data.subscription.unsubscribe();
  }, [loadDebtors, loadEntries, loadProfile]);

  const mainWallet = useMemo(() => entries.reduce((sum, entry) => sum + entry.wallet_impact, 0), [entries]);
  const streak = useMemo(() => computeStreak(entries), [entries]);
  const quickShortcuts = useMemo(() => deriveQuickShortcuts(entries), [entries]);
  const debtorSummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      if (!["lend", "split_half", "debt_repayment"].includes(entry.transaction_type)) continue;
      map.set(entry.debtor_name, (map.get(entry.debtor_name) ?? 0) + entry.debt_impact);
    }
    return [...map.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .filter((item) => item.amount > 0.005)
      .sort((a, b) => b.amount - a.amount);
  }, [entries]);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "แนบรูปไม่สำเร็จ");
    }
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
        occurred_at: todayEntryDate(),
        source_text: "ทางลัด",
      }),
    ]);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
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

  async function saveProfile(next: { nickname: string; app_icon: string; app_icon_image: string; month_start_day: number }) {
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
    const { data, error } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" }).select("user_id,nickname,app_icon,app_icon_image,month_start_day").single();

    if (error) setError(error.message);
    else setProfile(data as Profile);
    setBusy(false);
  }

  async function createDebtor(name: string, note = "") {
    if (!supabase || !user || !name.trim()) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.from("debtors").insert({ user_id: user.id, name: name.trim(), note: note.trim() || null });
    if (error) setError(error.code === "23505" ? "มีลูกหนี้ชื่อนี้แล้ว" : error.message);
    else await loadDebtors();
    setBusy(false);
  }

  async function updateDebtor(debtor: Debtor, patch: { name: string; note: string }) {
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error } = await supabase
      .from("debtors")
      .update({ name: patch.name.trim(), note: patch.note.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", debtor.id);
    if (error) setError(error.code === "23505" ? "มีลูกหนี้ชื่อนี้แล้ว" : error.message);
    else {
      if (selectedDebtor?.id === debtor.id) setSelectedDebtor({ ...debtor, name: patch.name.trim(), note: patch.note.trim() || null });
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
      <section className="phone">
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
            <section className="wallet-grid single-wallet">
              <div className="wallet-card primary-wallet">
                <span>เงินพร้อมใช้สุทธิ</span>
                <div>
                  <strong>{moneySign}{formatMoney(mainWallet)}</strong>
                  {streak >= 2 && <small className="streak-badge">🔥 {streak} วันติด</small>}
                </div>
              </div>
            </section>

            <button className="ai-card" onClick={() => setTab("add")}>
              <span className="spark">AI</span>
              <span>
                <b>เล่าให้ AI ฟัง</b>
                <small>พิมพ์รายการ หรือแนบรูปสลิปให้ AI แยกยอดและหมวดหมู่</small>
              </span>
              <span className="arrow">›</span>
            </button>

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
            />

            {error && <p className="error-box">{error}</p>}

            <div className="section-title">
              <h2>รายการล่าสุด</h2>
              <button onClick={() => setTab("history")}>ดูทั้งหมด</button>
            </div>
            <div className="latest-scroll">
              <EntryList entries={entries.slice(0, 20)} onEdit={setEditing} onDelete={deleteEntry} />
            </div>
          </div>
        )}

        {tab === "add" && (
          <div className="view add-view">
            <div className="add-title">
              <button onClick={() => setTab("home")}>‹</button>
              <div>
                <p className="eyebrow">AI Chat</p>
                <h2>วันนี้มีรายการอะไรบ้าง?</h2>
              </div>
            </div>

            {!!quickShortcuts.length && (
              <div className="quick-shortcuts">
                {quickShortcuts.map((shortcut) => (
                  <button key={`${shortcut.title}|${shortcut.category}|${shortcut.transaction_type}`} className="quick-chip" onClick={() => addQuickShortcut(shortcut)}>
                    <span className="cat-dot" style={{ background: `${categoryColor(shortcut.category)}22` }}>{categoryIcon(shortcut.category)}</span>
                    <span>
                      <b>{shortcut.title}</b>
                      <small>{moneySign}{formatMoney(shortcut.amount)}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="ai-input-wrap">
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
            {error && <p className="error-box">{error}</p>}

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
            />
            <CalendarHeatmap start={cycleRange.start} end={cycleRange.end} entries={monthlyEntries} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
            <EntryList entries={dayEntries} onEdit={setEditing} onDelete={deleteEntry} />
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

        {editing && <EditSheet entry={editing} busy={busy} onChange={setEditing} onClose={() => setEditing(null)} onSave={updateEntry} />}
        {debtorSheetMode && (
          <DebtorEditSheet
            debtor={debtorSheetMode === "edit" ? editingDebtor : null}
            busy={busy}
            onClose={() => { setDebtorSheetMode(null); setEditingDebtor(null); }}
            onCreate={(name, note) => createDebtor(name, note)}
            onUpdate={(debtor, patch) => updateDebtor(debtor, patch)}
          />
        )}
        {menuOpen && (
          <SideMenu
            user={user}
            profile={profile}
            debtorSummary={debtorSummary}
            busy={busy}
            onClose={() => setMenuOpen(false)}
            onLogout={() => { setMenuOpen(false); setLogoutOpen(true); }}
            onSaveProfile={saveProfile}
            onOpenDebtors={() => { setMenuOpen(false); setSelectedDebtor(null); setTab("debtors"); }}
            onOpenBudgets={() => { setMenuOpen(false); setBudgetSheetOpen(true); }}
          />
        )}
        {budgetSheetOpen && <BudgetSheet budgets={budgets} onClose={() => setBudgetSheetOpen(false)} onSave={updateBudgets} />}
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

        <nav className="bottom-nav">
          <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}>
            <span>⌂</span>หน้าหลัก
          </button>
          <button className="add-button" onClick={() => setTab("add")}>
            <span>＋</span>
          </button>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
            <span>▣</span>รายการ
          </button>
        </nav>
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
          <EmptyNote glyph="📊">ยังไม่มีรายจ่ายในเดือนนี้</EmptyNote>
        )}
      </div>
    </section>
  );
}

function EmptyNote({ glyph, children }: { glyph: string; children: React.ReactNode }) {
  return (
    <div className="empty-note">
      <span className="empty-glyph">{glyph}</span>
      <p>{children}</p>
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
    <div className="draft">
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

function EntryList({ entries, onEdit, onDelete }: { entries: Entry[]; onEdit?: (entry: Entry) => void; onDelete?: (entry: Entry) => void }) {
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
      {!entries.length && <EmptyNote glyph="🧾">ยังไม่มีรายการในช่วงนี้</EmptyNote>}
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
        {!debtors.length && <EmptyNote glyph="🤝">ยังไม่มีรายชื่อลูกหนี้</EmptyNote>}
      </div>
    </div>
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
  onCreate: (name: string, note: string) => void;
  onUpdate: (debtor: Debtor, patch: { name: string; note: string }) => void;
}) {
  const [name, setName] = useState(debtor?.name ?? "");
  const [note, setNote] = useState(debtor?.note ?? "");

  const submit = () => {
    if (!name.trim()) return;
    if (debtor) onUpdate(debtor, { name, note });
    else onCreate(name, note);
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
  const closingLine = balance >= 0 ? "เก่งมาก เดือนนี้ยังมีเงินเหลือเก็บ 🎉" : "เดือนหน้าลองคุมงบดูอีกนิดนะ สู้ๆ 💪";

  async function share() {
    const text = [
      `สรุปเดือน ${monthLabel}`,
      `รายรับ ${moneySign}${formatMoney(income)}`,
      `รายจ่าย ${moneySign}${formatMoney(outflow)}`,
      `คงเหลือสุทธิ ${moneySign}${formatMoney(balance)}`,
      topCategory ? `ใช้จ่ายเยอะสุด: ${topCategory.category} (${moneySign}${formatMoney(topCategory.amount)})` : "",
      streak >= 2 ? `จดต่อเนื่อง ${streak} วัน 🔥` : "",
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
        {streak >= 2 && <p className="recap-streak">🔥 จดต่อเนื่อง {streak} วัน</p>}
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
        <p className="budget-hint">ตั้งวงเงินต่อหมวดหมู่ เว้นว่างไว้ถ้าไม่ต้องการจำกัด — บันทึกเฉพาะในเครื่องนี้เท่านั้น</p>
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

function SideMenu({
  user,
  profile,
  debtorSummary,
  busy,
  onClose,
  onLogout,
  onSaveProfile,
  onOpenDebtors,
  onOpenBudgets,
}: {
  user: User;
  profile: Profile | null;
  debtorSummary: { name: string; amount: number }[];
  busy: boolean;
  onClose: () => void;
  onLogout: () => void;
  onSaveProfile: (profile: { nickname: string; app_icon: string; app_icon_image: string; month_start_day: number }) => void;
  onOpenDebtors: () => void;
  onOpenBudgets: () => void;
}) {
  const metadata = user.user_metadata ?? {};
  const name = profile?.nickname || metadata.full_name || metadata.name || "ผู้ใช้";
  const appIcon = profile?.app_icon || user.email?.[0]?.toUpperCase() || "฿";
  const appIconImage = profile?.app_icon_image || "";
  const provider = user.app_metadata?.provider ?? "Google";
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const app_icon = profile?.app_icon ?? "";
  const [app_icon_image, setAppIconImage] = useState(appIconImage);
  const [month_start_day, setMonthStartDay] = useState(profile?.month_start_day ?? 1);
  const totalDebt = debtorSummary.reduce((sum, item) => sum + item.amount, 0);

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
          <div className="avatar profile-avatar profile-avatar-image" style={app_icon_image ? { backgroundImage: `url(${app_icon_image})` } : undefined}>
            {!app_icon_image && appIcon}
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

        <section className="side-section">
          <h3>จัดการโปรไฟล์</h3>
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
          <button className="side-save" onClick={() => onSaveProfile({ nickname, app_icon, app_icon_image, month_start_day })} disabled={busy}>
            บันทึกโปรไฟล์
          </button>
        </section>

        <nav className="side-menu-list">
          <button onClick={onOpenDebtors}>
            <span>ลูกหนี้</span>
            <small>ยอดรวม {moneySign}{formatMoney(totalDebt)} · จัดการรายชื่อและประวัติ</small>
          </button>
          <button onClick={onOpenBudgets}>
            <span>งบประมาณ</span>
            <small>ตั้งวงเงินต่อหมวดหมู่ต่อเดือน</small>
          </button>
        </nav>

        <button className="logout-button" onClick={onLogout}>ออกจากระบบ</button>
      </aside>
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
