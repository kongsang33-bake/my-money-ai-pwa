"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { DEBT_TYPES, TYPES_OWED_TO_USER, TYPES_USER_OWES, walletTagLabels, type TransactionType, type WalletTag } from "@/lib/taxonomy";
import type {
  AiFinanceContext,
  ConfirmDialogState,
  Debtor,
  DebtorKind,
  Draft,
  Entry,
  HistoryFilters,
  Investment,
  InvestmentDraftItem,
  InvestmentPrice,
  MoneyGoal,
  NetWorthDisplaySettings,
  PinMode,
  Profile,
  RecurringExpense,
  SlipImage,
  Theme,
  Toast,
  Wallet,
} from "@/lib/types";
import { clampInteger, formatMoney, formatUnits, moneySign, monthKey, normalizeBillingDay, toFiniteNumber, toMoneyAmount } from "@/lib/format";
import { currentCycleMonthKey, cycleBounds, defaultDayForCycle, entriesInRange, fromDateInput, nextBillingInfo, reportLabel, shiftMonthKey, todayDateInput } from "@/lib/cycle";
import {
  buildDebtSummary,
  buildMonthlyTrend,
  buildPortfolioHoldings,
  buildPortfolioTrend,
  buildTransactionCore,
  buildWalletLedger,
  calculateImpacts,
  categorySpendAmount,
  defaultWalletId,
  expandTransferDraft,
  filterEntries,
  mapTransactionRow,
  normalizeEntry,
  payableForDisplay,
  totalWallet,
  unnamedDebtor,
} from "@/lib/money";
import { buildWalletInsight, computeStreak, deriveQuickShortcuts, isRecurringLogged, lastSevenDayCashFlow, type QuickShortcut } from "@/lib/insights";
import { categoryColor, categoryTint, nameColor } from "@/lib/category";
import { createPinSalt, hashPin, isSixDigitPin, pinBackgroundLockMs, pinBlockMs, pinBlocked, pinMaxAttempts, registerFaceId, timingSafeEqual, verifyFaceId } from "@/lib/pin";
import { compressSlipImage } from "@/lib/image";
import { authHeaders } from "@/lib/api";
import {
  CATEGORY_DOT_TINT_ALPHA,
  DEBTOR_COLUMNS,
  INVESTMENT_COLUMNS,
  INVESTMENT_PRICE_COLUMNS,
  MAX_SLIP_IMAGES,
  MONTH_START_DAY_MAX,
  MONTH_START_DAY_MIN,
  PROFILE_COLUMNS,
  RECURRING_EXPENSE_COLUMNS,
  SEARCH_RESULT_LIMIT,
  TABLES,
  THEME_STORAGE_KEY,
  TRANSACTION_COLUMNS,
  WALLET_COLUMNS,
} from "@/lib/constants";
import { ChevronLeft, Lightbulb, Menu, MoreHorizontal, Wallet as WalletIcon, X } from "lucide-react";
import { CategoryIcon, WalletAvatarGlyph } from "@/components/shared";
import { ConfirmDialog, CountUpMoney, ErrorActions, SkeletonDashboard, SkeletonList, StateCard, ToastHost, useDismiss } from "@/components/primitives";
import { DraftImpact, DraftRow, EditSheet, EntryList, ManualEntryForm, QuickAddStrip, RecentActivityTimeline } from "@/components/add";
import {
  BudgetGlanceCard,
  CalendarHeatmap,
  CashFlowTrendCard,
  DueSoonCard,
  FirstRunHomeState,
  GoalCard,
  GoalEditSheet,
  GoalsView,
  HeroWalletCard,
  HomeInsightGrid,
  SpendingPersonalityCard,
  SuccessPulse,
} from "@/components/home";
import { HistoryFilterBar, HistoryInsight, IncomeBreakdown, MonthSummary, MonthlyTrendChart } from "@/components/history";
import { Auth, PinGate, PinSecuritySheet } from "@/components/auth";
import type { WalletInput, RecurringExpenseInput } from "@/components/wallets-recurring";
import type { DebtorInput } from "@/components/debtors";
import dynamic from "next/dynamic";

// Code-split everything below: none of it is needed for the initial Home
// paint, only once the user opens a specific tab or sheet (Debtors,
// Wallets, Recurring, Portfolio) or a secondary sheet (report export, AI
// chat, side menu, profile). ssr:false is safe here -- the whole app is
// already a client component gated behind auth/PIN, so there's no SSR
// pass for these to opt out of; it just skips server-rendering the
// placeholder on first load.
const AskFinanceSheet = dynamic(() => import("@/components/sheets").then((m) => m.AskFinanceSheet), { ssr: false });
const ConfirmLogout = dynamic(() => import("@/components/sheets").then((m) => m.ConfirmLogout), { ssr: false });
const MoreSheet = dynamic(() => import("@/components/sheets").then((m) => m.MoreSheet), { ssr: false });
const ProfileEditSheet = dynamic(() => import("@/components/sheets").then((m) => m.ProfileEditSheet), { ssr: false });
const ReportExportSheet = dynamic(() => import("@/components/sheets").then((m) => m.ReportExportSheet), { ssr: false });
const SideMenu = dynamic(() => import("@/components/sheets").then((m) => m.SideMenu), { ssr: false });

const DebtorsView = dynamic(() => import("@/components/debtors").then((m) => m.DebtorsView), { ssr: false });
const DebtorEditSheet = dynamic(() => import("@/components/debtors").then((m) => m.DebtorEditSheet), { ssr: false });
const RecapSheet = dynamic(() => import("@/components/debtors").then((m) => m.RecapSheet), { ssr: false });
const BudgetSheet = dynamic(() => import("@/components/debtors").then((m) => m.BudgetSheet), { ssr: false });

const WalletsView = dynamic(() => import("@/components/wallets-recurring").then((m) => m.WalletsView), { ssr: false });
const WalletEditSheet = dynamic(() => import("@/components/wallets-recurring").then((m) => m.WalletEditSheet), { ssr: false });
const RecurringExpensesView = dynamic(() => import("@/components/wallets-recurring").then((m) => m.RecurringExpensesView), { ssr: false });
const RecurringExpenseEditSheet = dynamic(() => import("@/components/wallets-recurring").then((m) => m.RecurringExpenseEditSheet), { ssr: false });

const PortfolioView = dynamic(() => import("@/components/portfolio").then((m) => m.PortfolioView), { ssr: false });
const InvestmentBuySheet = dynamic(() => import("@/components/portfolio").then((m) => m.InvestmentBuySheet), { ssr: false });
const InvestmentSellSheet = dynamic(() => import("@/components/portfolio").then((m) => m.InvestmentSellSheet), { ssr: false });
const InvestmentPriceSheet = dynamic(() => import("@/components/portfolio").then((m) => m.InvestmentPriceSheet), { ssr: false });
const InvestmentConfirmUnitsSheet = dynamic(() => import("@/components/portfolio").then((m) => m.InvestmentConfirmUnitsSheet), { ssr: false });
const InvestmentAiSheet = dynamic(() => import("@/components/portfolio").then((m) => m.InvestmentAiSheet), { ssr: false });

type Tab = "home" | "add" | "history" | "debtors" | "wallets" | "recurring" | "goals" | "portfolio";

const secondaryWalletTags: { tag: WalletTag; label: string; className: string }[] = [
  { tag: "savings", label: walletTagLabels.savings, className: "savings-wallet" },
  { tag: "petty", label: walletTagLabels.petty, className: "petty-wallet" },
  { tag: "other", label: walletTagLabels.other, className: "other-wallet" },
];

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

const defaultNetWorthDisplaySettings: NetWorthDisplaySettings = { formula: "full", hideCard: false };

function netWorthDisplayStorageKey(userId: string) {
  return `money-ai-net-worth-display:${userId}`;
}

function loadNetWorthDisplaySettings(userId: string): NetWorthDisplaySettings {
  try {
    const raw = window.localStorage.getItem(netWorthDisplayStorageKey(userId));
    if (!raw) return defaultNetWorthDisplaySettings;
    const parsed = JSON.parse(raw);
    return {
      formula: parsed?.formula === "obligation" ? "obligation" : "full",
      hideCard: parsed?.hideCard === true,
    };
  } catch {
    return defaultNetWorthDisplaySettings;
  }
}

function saveNetWorthDisplaySettings(userId: string, settings: NetWorthDisplaySettings) {
  try {
    window.localStorage.setItem(netWorthDisplayStorageKey(userId), JSON.stringify(settings));
  } catch {
    // localStorage unavailable (private mode, quota) — setting simply won't persist
  }
}

type AiSuggestion = { label: string; detail: string; text: string; shortcut?: QuickShortcut };

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
  const [receiptTotal, setReceiptTotal] = useState(0);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [debtorSheetMode, setDebtorSheetMode] = useState<"create" | "edit" | null>(null);
  const [editingDebtor, setEditingDebtor] = useState<Debtor | null>(null);
  const [selectedDebtor, setSelectedDebtor] = useState<Debtor | null>(null);
  const [debtorKindTab, setDebtorKindTab] = useState<DebtorKind>("lend");
  const [walletSheetMode, setWalletSheetMode] = useState<"create" | "edit" | null>(null);
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);
  const [recurringSheetMode, setRecurringSheetMode] = useState<"create" | "edit" | null>(null);
  const [editingRecurringExpense, setEditingRecurringExpense] = useState<RecurringExpense | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [investmentPrices, setInvestmentPrices] = useState<InvestmentPrice[]>([]);
  const [investmentBuySheetOpen, setInvestmentBuySheetOpen] = useState(false);
  const [investmentBuyTarget, setInvestmentBuyTarget] = useState<Investment | null>(null);
  const [investmentSellTarget, setInvestmentSellTarget] = useState<Investment | null>(null);
  const [investmentPriceTarget, setInvestmentPriceTarget] = useState<Investment | null>(null);
  const [investmentConfirmTarget, setInvestmentConfirmTarget] = useState<Entry | null>(null);
  const [investmentAiSheetOpen, setInvestmentAiSheetOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [analyzeElapsedSeconds, setAnalyzeElapsedSeconds] = useState(0);
  const [error, setError] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date().toDateString());
  const [historyFilters, setHistoryFilters] = useState<HistoryFilters>({ query: "", category: "", type: "all", minAmount: "", maxAmount: "" });
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [goals, setGoals] = useState<MoneyGoal[]>([]);
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);
  const [netWorthDisplay, setNetWorthDisplay] = useState<NetWorthDisplaySettings>(defaultNetWorthDisplaySettings);
  const [budgetSheetOpen, setBudgetSheetOpen] = useState(false);
  const [reportSheetOpen, setReportSheetOpen] = useState(false);
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

  // `error` is shared across every sheet (see the `error={error}` props
  // below) so an old failure -- e.g. a delete that errored -- doesn't stay
  // visible when a different, unrelated sheet is opened next. Wrap every
  // sheet-opening action with this instead of calling its setter directly.
  const openSheet = useCallback(<Args extends unknown[]>(action: (...args: Args) => void) => (...args: Args) => {
    setError("");
    action(...args);
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
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "light" || saved === "dark") setTheme(saved);
      themeLoadedRef.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (themeLoadedRef.current) window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const loadEntries = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from(TABLES.transactions)
      .select(TRANSACTION_COLUMNS)
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
      .from(TABLES.profiles)
      .select(PROFILE_COLUMNS)
      .maybeSingle();
    if (error) {
      setError(error.message);
      return null;
    }
    const nextProfile = data
      ? {
          ...data,
          month_start_day: clampInteger(data.month_start_day, MONTH_START_DAY_MIN, MONTH_START_DAY_MAX, 1),
          pin_failed_attempts: clampInteger(data.pin_failed_attempts, 0, pinMaxAttempts, 0),
        } as Profile
      : null;
    setProfile(nextProfile);
    return nextProfile;
  }, []);

  const loadDebtors = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from(TABLES.debtors)
      .select(DEBTOR_COLUMNS)
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
      credit_limit: row.credit_limit == null ? null : Number(row.credit_limit),
      credit_card_min_payment_percent: row.credit_card_min_payment_percent == null ? null : Number(row.credit_card_min_payment_percent),
    })) as Debtor[]);
  }, []);

  const loadWallets = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from(TABLES.wallets)
      .select(WALLET_COLUMNS)
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
      .from(TABLES.recurringExpenses)
      .select(RECURRING_EXPENSE_COLUMNS)
      .order("billing_day", { ascending: true });
    if (error) {
      setError(error.message);
      return;
    }
    setRecurringExpenses((data ?? []).map((row) => ({ ...row, amount: toMoneyAmount(row.amount), billing_day: normalizeBillingDay(row.billing_day) })) as RecurringExpense[]);
  }, []);

  const loadInvestments = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from(TABLES.investments)
      .select(INVESTMENT_COLUMNS)
      .order("created_at", { ascending: true });
    if (error) {
      setError(error.message);
      return;
    }
    setInvestments((data ?? []).map((row) => ({
      ...row,
      units: toFiniteNumber(row.units),
      cost_basis: toFiniteNumber(row.cost_basis),
    })) as Investment[]);
  }, []);

  const loadInvestmentPrices = useCallback(async () => {
    if (!supabase) return;

    const { data, error } = await supabase
      .from(TABLES.investmentPrices)
      .select(INVESTMENT_PRICE_COLUMNS)
      .order("recorded_at", { ascending: true });
    if (error) {
      setError(error.message);
      return;
    }
    setInvestmentPrices((data ?? []).map((row) => ({ ...row, nav: toFiniteNumber(row.nav) })) as InvestmentPrice[]);
  }, []);

  const loadUserData = useCallback(async (userId: string) => {
    setDataLoading(true);
    setError("");
    try {
      await Promise.all([loadEntries(), loadDebtors(), loadWallets(), loadRecurringExpenses(), loadInvestments(), loadInvestmentPrices()]);
      setBudgets(loadBudgets(userId));
      setGoals(loadGoals(userId));
      setNetWorthDisplay(loadNetWorthDisplaySettings(userId));
    } finally {
      setDataLoading(false);
    }
  }, [loadDebtors, loadEntries, loadWallets, loadRecurringExpenses, loadInvestments, loadInvestmentPrices]);

  const clearPrivateState = useCallback(() => {
    setEntries([]);
    setDebtors([]);
    setWallets([]);
    setRecurringExpenses([]);
    setInvestments([]);
    setInvestmentPrices([]);
    setBudgets({});
    setGoals([]);
    setDrafts([]);
    setReceiptTotal(0);
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
    moreOpen ||
    profileSheetOpen ||
    !!editing ||
    !!debtorSheetMode ||
    !!walletSheetMode ||
    !!recurringSheetMode ||
    investmentBuySheetOpen ||
    !!investmentSellTarget ||
    !!investmentPriceTarget ||
    !!investmentConfirmTarget ||
    investmentAiSheetOpen ||
    budgetSheetOpen ||
    reportSheetOpen ||
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
  const secondaryWallets = useMemo(() => displayWallets.filter((wallet) => wallet.tag !== "cash"), [displayWallets]);
  const portfolioHoldings = useMemo(() => buildPortfolioHoldings(investments, investmentPrices), [investments, investmentPrices]);
  const pendingInvestmentPurchases = useMemo(
    () => entries.filter((entry) => entry.transaction_type === "investment_buy" && entry.investment_units == null),
    [entries],
  );
  const portfolioTrend = useMemo(() => buildPortfolioTrend(investments, investmentPrices), [investments, investmentPrices]);
  const portfolioTotalValue = useMemo(() => portfolioHoldings.reduce((sum, holding) => sum + holding.marketValue, 0), [portfolioHoldings]);
  const portfolioTotalCost = useMemo(() => portfolioHoldings.reduce((sum, holding) => sum + holding.cost_basis, 0), [portfolioHoldings]);
  const portfolioTotalGain = portfolioTotalValue - portfolioTotalCost;
  const portfolioTotalGainPercent = portfolioTotalCost > 0 ? (portfolioTotalGain / portfolioTotalCost) * 100 : null;
  const streak = useMemo(() => computeStreak(entries), [entries]);
  const quickShortcuts = useMemo(() => deriveQuickShortcuts(entries), [entries]);
  const receivableSummary = useMemo(
    () => buildDebtSummary(debtors, entries, "lend", TYPES_OWED_TO_USER),
    [debtors, entries],
  );
  const payableSummary = useMemo(
    () => buildDebtSummary(debtors, entries, "own", TYPES_USER_OWES),
    [debtors, entries],
  );

  const dueSoonRecurring = useMemo(() => {
    const now = new Date();
    const currentCycleRange = cycleBounds(currentCycleMonthKey(monthStartDay, now), monthStartDay);
    return recurringExpenses
      .map((item) => ({ item, ...nextBillingInfo(item, now), isLogged: isRecurringLogged(item, entries, currentCycleRange) }))
      .filter(({ daysUntil }) => daysUntil >= 0 && daysUntil <= 3)
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [recurringExpenses, entries, monthStartDay]);

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
  const monthlyEntries = useMemo(
    () => entriesInRange(entries, cycleRange.start, cycleRange.end),
    [entries, cycleRange],
  );
  const filteredMonthlyEntries = useMemo(() => filterEntries(monthlyEntries, historyFilters), [monthlyEntries, historyFilters]);
  // Any active filter switches History from "this cycle's calendar" into a
  // flat search-results mode that runs across every entry ever recorded,
  // not just the selected month -- see the tab === "history" JSX below.
  const searchActive =
    historyFilters.query.trim() !== "" ||
    historyFilters.category !== "" ||
    historyFilters.type !== "all" ||
    historyFilters.minAmount !== "" ||
    historyFilters.maxAmount !== "";
  const searchResults = useMemo(
    () => (searchActive ? filterEntries(entries, historyFilters).slice(0, SEARCH_RESULT_LIMIT) : []),
    [searchActive, entries, historyFilters],
  );
  const monthlyIncome = useMemo(() => totalWallet(monthlyEntries, "income"), [monthlyEntries]);
  const monthlyOutflow = useMemo(() => Math.abs(totalWallet(monthlyEntries, "expense")), [monthlyEntries]);
  const monthlyDebtChange = useMemo(
    () =>
      monthlyEntries
        .filter((entry) => TYPES_OWED_TO_USER.includes(entry.transaction_type))
        .reduce((sum, entry) => sum + entry.debt_impact, 0),
    [monthlyEntries],
  );
  const monthlyBalance = monthlyIncome - monthlyOutflow;
  const receivableTotal = receivableSummary.reduce((sum, item) => sum + item.amount, 0);
  const payableTotal = payableSummary.reduce((sum, item) => sum + item.amount, 0);
  // What's actually due this cycle across "หนี้ของฉัน" debtors — installment
  // or card minimum where set, full balance otherwise — see monthlyDebtObligation.
  const monthlyObligationTotal = useMemo(
    () => payableForDisplay(debtors, payableSummary, "obligation"),
    [debtors, payableSummary],
  );
  const netWorthPayable = netWorthDisplay.formula === "obligation" ? monthlyObligationTotal : payableTotal;
  const netWorth = walletBalanceTotal + receivableTotal - netWorthPayable + portfolioTotalValue;
  const savingsRate = monthlyIncome > 0 ? (monthlyBalance / monthlyIncome) * 100 : 0;
  const walletInsight = useMemo(() => buildWalletInsight(mainWallet, monthlyOutflow, cycleRange.end), [mainWallet, monthlyOutflow, cycleRange.end]);
  const cashFlowTrend = useMemo(() => lastSevenDayCashFlow(entries, new Date()), [entries]);
  const monthlyTrend = useMemo(
    () => buildMonthlyTrend(entries, wallets, debtors, selectedMonth, monthStartDay, 6, portfolioTotalValue, netWorthDisplay.formula),
    [entries, wallets, debtors, selectedMonth, monthStartDay, portfolioTotalValue, netWorthDisplay.formula],
  );
  const netWorthDelta = monthlyTrend.length >= 2
    ? monthlyTrend[monthlyTrend.length - 1].netWorth - monthlyTrend[monthlyTrend.length - 2].netWorth
    : 0;
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

  const categoryMemory = useMemo(() => {
    const map = new Map<string, string>();
    const byRecency = [...entries].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
    for (const entry of byRecency) {
      const key = entry.title.trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, entry.category);
    }
    return map;
  }, [entries]);

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
  const discretionaryTopCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of monthlyEntries) {
      if (entry.category === "บิลประจำ") continue;
      const spendAmount = categorySpendAmount(entry);
      if (spendAmount == null) continue;
      map.set(entry.category, (map.get(entry.category) ?? 0) + spendAmount);
    }
    const sorted = [...map.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
    return sorted[0] ?? null;
  }, [monthlyEntries]);
  const discretionaryCategoryTrend = useMemo(() => {
    if (!discretionaryTopCategory) return null;
    const category = discretionaryTopCategory.category;
    const pastAmounts: number[] = [];
    for (let offset = 1; offset <= 3; offset++) {
      const { start, end } = cycleBounds(shiftMonthKey(selectedMonth, -offset), monthStartDay);
      const amount = entriesInRange(entries, start, end).reduce((sum, entry) => {
        if (entry.category !== category) return sum;
        const spend = categorySpendAmount(entry);
        return spend != null ? sum + spend : sum;
      }, 0);
      if (amount > 0) pastAmounts.push(amount);
    }
    if (!pastAmounts.length) return null;
    const average = pastAmounts.reduce((sum, amount) => sum + amount, 0) / pastAmounts.length;
    if (average <= 0) return null;
    const ratio = discretionaryTopCategory.amount / average;
    if (ratio >= 1.2) return { direction: "up" as const, percent: Math.round((ratio - 1) * 100) };
    if (ratio <= 0.8) return { direction: "down" as const, percent: Math.round((1 - ratio) * 100) };
    return { direction: "flat" as const, percent: 0 };
  }, [discretionaryTopCategory, entries, selectedMonth, monthStartDay]);
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

    const nextFiles = [...files].slice(0, MAX_SLIP_IMAGES - slipImages.length);
    if (nextFiles.some((file) => !file.type.startsWith("image/"))) {
      setError("รองรับเฉพาะไฟล์รูปภาพเท่านั้น");
      return;
    }

    try {
      const images = await Promise.all(nextFiles.map(compressSlipImage));
      setSlipImages((current) => [...current, ...images].slice(0, MAX_SLIP_IMAGES));
      notify({ tone: "success", title: "แนบสลิปแล้ว", detail: `${images.length} รูปพร้อมให้ AI อ่าน` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "แนบรูปไม่สำเร็จ");
      notify({ tone: "error", title: "แนบรูปไม่สำเร็จ", detail: e instanceof Error ? e.message : undefined });
    }
  }

  const openAddTab = useCallback((mode: "ai" | "manual" = "ai", shortcut?: QuickShortcut) => {
    setError("");
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
    if (!confirmed) return;
    persistGoals(goals.filter((item) => item.id !== goal.id));
    notify({ tone: "info", title: "ลบเป้าหมายแล้ว", detail: goal.name });
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
    setAnalyzeElapsedSeconds(0);
    const elapsedTimer = window.setInterval(() => setAnalyzeElapsedSeconds((seconds) => seconds + 1), 1000);

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
        data.items.map((item: { title: string; category: string; amount: number; transaction_type: TransactionType; debtor_name?: string; date: string; note?: string; wallet_id?: string | null; transfer_to_wallet_id?: string | null; ambiguous?: boolean }, index: number) =>
          {
            const aiWalletId = item.wallet_id && wallets.some((wallet) => wallet.id === item.wallet_id) ? item.wallet_id : null;
            const aiDestWalletId = item.transfer_to_wallet_id && wallets.some((wallet) => wallet.id === item.transfer_to_wallet_id) ? item.transfer_to_wallet_id : null;
            const rememberedCategory = categoryMemory.get(item.title.trim().toLowerCase());
            return {
              ...normalizeEntry({
                id: `${Date.now()}-${index}`,
                title: item.title,
                category: rememberedCategory ?? item.category,
                amount: item.amount,
                transaction_type: item.transaction_type,
                debtor_name: item.debtor_name,
                occurred_at: fromDateInput(item.date),
                source_text: source,
                wallet_id: aiWalletId || defaultWalletId(wallets),
                note: item.note,
                transfer_to_wallet_id: aiDestWalletId,
              }, false),
              ambiguous: !!item.ambiguous,
            };
          },
        ),
      );
      setReceiptTotal(typeof data.receiptTotal === "number" ? data.receiptTotal : 0);
      notify({ tone: "success", title: "AI แยกรายการแล้ว", detail: `พบ ${data.items.length} รายการให้ตรวจสอบ` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      notify({ tone: "error", title: "AI ยังวิเคราะห์ไม่ได้", detail: e instanceof Error ? e.message : undefined });
    }

    window.clearInterval(elapsedTimer);
    setBusy(false);
  }

  async function analyzeInvestmentText(text: string): Promise<InvestmentDraftItem[]> {
    const response = await fetch("/api/analyze-investment", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({
        text,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        defaultDate: todayDateInput(),
        investments: investments.map((item) => ({ id: item.id, name: item.name, code: item.code })),
        wallets: wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, tag: wallet.tag, is_default: wallet.is_default })),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return (data.items ?? []) as InvestmentDraftItem[];
  }

  async function extractUnitsFromStatement(image: SlipImage, targetAmount: number) {
    const response = await fetch("/api/analyze-investment-confirm", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ image: { data: image.data, mimeType: image.mimeType }, targetAmount }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data as { found: boolean; units: number; price_per_unit: number; amount: number; transaction_date: string };
  }

  // Always creates a *pending* purchase (investment_units left null) even
  // though the caller might already know the units for a same-day buy —
  // logging via AI is specifically for the DCA case where units aren't
  // known yet, so it never tries to guess/parse units from free text.
  async function createPendingInvestmentPurchase(input: { investmentId: string | null; name: string; code?: string; icon?: string | null; icon_color?: string | null; walletId: string; amount: number; occurredAt: string; note?: string }) {
    if (!supabase || !user || !(input.amount > 0) || !input.walletId) return false;
    setBusy(true);
    setError("");
    const target = input.investmentId ? investments.find((item) => item.id === input.investmentId) ?? null : null;
    const investment = await resolveInvestment(target, { name: input.name, code: input.code ?? "", icon: input.icon ?? "trending-up", icon_color: input.icon_color ?? null });
    if (!investment) {
      setBusy(false);
      return false;
    }
    const { data, error } = await supabase
      .from(TABLES.transactions)
      .insert({
        user_id: user.id,
        title: `ลงทุน ${investment.name}`,
        category: "อื่น ๆ",
        amount: input.amount,
        kind: "expense",
        transaction_type: "investment_buy",
        debtor_name: unnamedDebtor,
        ...calculateImpacts(input.amount, "investment_buy"),
        occurred_at: input.occurredAt,
        wallet_id: input.walletId,
        note: input.note?.trim() || null,
        investment_id: investment.id,
        investment_units: null,
      })
      .select(TRANSACTION_COLUMNS)
      .single();
    if (error) {
      setError(error.message);
      setBusy(false);
      return false;
    }
    setEntries((current) => [mapTransactionRow(data), ...current].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)));
    setBusy(false);
    notify({ tone: "success", title: "บันทึกรอยืนยันหน่วยแล้ว", detail: `${investment.name} · ${moneySign}${formatMoney(input.amount)}` });
    return true;
  }

  async function saveEntries(items: Draft[]) {
    if (!supabase || !user || !items.length) return;

    const confirmed = await requestConfirm({
      title: "ยืนยันการบันทึก",
      detail: `กำลังจะบันทึก ${items.length} รายการ รวม ${moneySign}${formatMoney(items.filter((item) => item.transaction_type !== "transfer").reduce((sum, item) => sum + item.amount, 0))}`,
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
      ...buildTransactionCore(normalized, wallets),
      source_text: normalized.source_text,
      transfer_group_id: normalized.transfer_group_id,
    }));

    const { data, error } = await supabase
      .from(TABLES.transactions)
      .insert(payload)
      .select(TRANSACTION_COLUMNS);

    if (error) {
      setError(error.message);
    } else {
      await createMissingDebtors(normalizedItems);
      const inserted = (data ?? []).map(mapTransactionRow);
      setEntries((current) => [...inserted, ...current].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)));
      setDrafts([]);
      setReceiptTotal(0);
      setText("");
      setSlipImages([]);
      setTab("home");
      setSavePulse(normalizedItems.length);
      notify({ tone: "success", title: "บันทึกรายการแล้ว", detail: `${normalizedItems.length} รายการถูกซิงค์เรียบร้อย` });
    }

    setBusy(false);
  }

  async function createMissingDebtors(items: Entry[]) {
    if (!supabase || !user) return;
    const known = new Set(debtors.map((debtor) => debtor.name.trim().toLowerCase()));
    const nameKinds = new Map<string, DebtorKind>();
    for (const item of items) {
      if (!DEBT_TYPES.includes(item.transaction_type)) continue;
      const name = item.debtor_name.trim();
      if (!name || name === unnamedDebtor || known.has(name.toLowerCase())) continue;
      if (!nameKinds.has(name)) nameKinds.set(name, TYPES_USER_OWES.includes(item.transaction_type) ? "own" : "lend");
    }

    for (const [name, kind] of nameKinds) {
      const { error } = await supabase.from(TABLES.debtors).insert({ user_id: user.id, name, kind });
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
        .from(TABLES.transactions)
        .update({
          ...buildTransactionCore(sourceLeg, wallets),
          transfer_group_id: sourceLeg.transfer_group_id,
        })
        .eq("id", editing.id);

      if (updateError) {
        setError(updateError.message);
        setBusy(false);
        return false;
      }

      const { data, error: insertError } = await supabase
        .from(TABLES.transactions)
        .insert({
          user_id: user.id,
          ...buildTransactionCore(destLeg, wallets),
          transfer_group_id: destLeg.transfer_group_id,
        })
        .select(TRANSACTION_COLUMNS);

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
    const core = buildTransactionCore(normalized, wallets);

    const { error } = await supabase
      .from(TABLES.transactions)
      .update(core)
      .eq("id", normalized.id);

    if (error) {
      setError(error.message);
      setBusy(false);
      return false;
    }

    const savedEntry = { ...normalized, wallet_id: core.wallet_id };
    setEntries((current) => current.map((item) => (item.id === savedEntry.id ? savedEntry : item)));
    setBusy(false);
    if (original) {
      notify({
        tone: "success",
        title: "บันทึกการแก้ไขแล้ว",
        detail: savedEntry.title,
        action: { label: "ย้อนคืน", onClick: () => { void revertEntryEdit(original); } },
      });
    }
    return true;
  }

  // Mirrors updateEntry's plain-edit path in reverse, writing the pre-edit
  // field values straight back with no confirm prompt -- tapping "ย้อนคืน"
  // on the just-shown toast IS the confirmation, same as undoLoggedRecurring.
  // Only the plain-edit path offers this; convertingToTransfer creates a new
  // row via a different shape and is out of scope here.
  async function revertEntryEdit(original: Entry) {
    if (!supabase) return;
    const core = buildTransactionCore(original, wallets);
    const { error } = await supabase.from(TABLES.transactions).update(core).eq("id", original.id);
    if (error) {
      notify({ tone: "error", title: "ย้อนคืนไม่สำเร็จ", detail: error.message });
      return;
    }
    setEntries((current) => current.map((item) => (item.id === original.id ? { ...original, wallet_id: core.wallet_id } : item)));
  }

  const restoreEntries = useCallback(async (entriesToRestore: Entry[]) => {
    if (!supabase || !user || !entriesToRestore.length) return;
    const { error } = await supabase.from(TABLES.transactions).insert(entriesToRestore.map((entry) => ({
      id: entry.id,
      user_id: user.id,
      ...buildTransactionCore(entry, wallets),
      source_text: entry.source_text,
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

    const { error } = await supabase.from(TABLES.transactions).delete().in("id", entriesToDelete.map((item) => item.id));
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

  // Undo for one-tap recurring logging skips deleteEntry's confirm prompt on
  // purpose -- tapping "ย้อนคืน" right after the toast appears IS the
  // confirmation, the same way restoreEntries has no prompt of its own.
  const undoLoggedRecurring = useCallback(async (entry: Entry) => {
    if (!supabase) return;
    const { error } = await supabase.from(TABLES.transactions).delete().eq("id", entry.id);
    if (error) {
      notify({ tone: "error", title: "ย้อนคืนไม่สำเร็จ", detail: error.message });
      return;
    }
    setEntries((current) => current.filter((item) => item.id !== entry.id));
  }, [notify]);

  const logRecurringNow = useCallback(async (item: RecurringExpense, billingDate: Date) => {
    if (!supabase || !user) return;
    setBusy(true);
    setError("");
    const normalized = normalizeEntry({
      id: crypto.randomUUID(),
      title: item.name,
      category: "บิลประจำ",
      amount: item.amount,
      transaction_type: "personal_expense",
      occurred_at: billingDate.toISOString(),
      wallet_id: defaultWalletId(wallets),
    });
    const { data, error } = await supabase
      .from(TABLES.transactions)
      .insert({ id: normalized.id, user_id: user.id, ...buildTransactionCore(normalized, wallets) })
      .select(TRANSACTION_COLUMNS);

    if (error) {
      setError(error.message);
    } else {
      const inserted = data?.[0] ? mapTransactionRow(data[0]) : normalized;
      setEntries((current) => [inserted, ...current].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)));
      notify({
        tone: "success",
        title: "บันทึกรายจ่ายประจำแล้ว",
        detail: `${item.name} ${moneySign}${formatMoney(item.amount)}`,
        action: { label: "ย้อนคืน", onClick: () => { void undoLoggedRecurring(inserted); } },
      });
    }
    setBusy(false);
  }, [user, wallets, notify, undoLoggedRecurring]);

  function updateBudgets(next: Record<string, number>) {
    if (!user) return;
    setBudgets(next);
    saveBudgets(user.id, next);
  }

  function updateNetWorthDisplay(next: NetWorthDisplaySettings) {
    if (!user) return;
    setNetWorthDisplay(next);
    saveNetWorthDisplaySettings(user.id, next);
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
      month_start_day: clampInteger(next.month_start_day, MONTH_START_DAY_MIN, MONTH_START_DAY_MAX, 1),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from(TABLES.profiles)
      .upsert(payload, { onConflict: "user_id" })
      .select(PROFILE_COLUMNS)
      .single();

    if (error) {
      setError(error.message);
      setBusy(false);
      return false;
    }
    setProfile(data as Profile);
    setBusy(false);
    notify({ tone: "success", title: "บันทึกโปรไฟล์แล้ว" });
    return true;
  }

  async function savePin(pin: string, nextMode: PinMode = "unlocked") {
    if (!supabase || !user || !isSixDigitPin(pin)) return;
    setBusy(true);
    setPinError("");
    const pin_salt = createPinSalt();
    const pin_hash = await hashPin(pin, pin_salt);
    const { data, error } = await supabase
      .from(TABLES.profiles)
      .upsert({
        user_id: user.id,
        pin_hash,
        pin_salt,
        pin_failed_attempts: 0,
        pin_blocked_until: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select(PROFILE_COLUMNS)
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
        .from(TABLES.profiles)
        .update({ pin_failed_attempts: 0, pin_blocked_until: null, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .select(PROFILE_COLUMNS)
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
      .from(TABLES.profiles)
      .update({ pin_failed_attempts: nextAttempts, pin_blocked_until: blockedUntil, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select(PROFILE_COLUMNS)
      .single();
    if (data) setProfile(data as Profile);
    if (blockedUntil) {
      setPinSheetOpen(false);
      setPinMode("locked");
    }
    setPinError(error ? error.message : blockedUntil ? `ใส่ PIN ผิดครบ ${pinMaxAttempts} ครั้ง บล็อกการเข้าใช้งาน ${pinBlockMs / 3_600_000} ชั่วโมง` : `PIN ไม่ถูกต้อง เหลือ ${pinMaxAttempts - nextAttempts} ครั้ง`);
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
      .from(TABLES.profiles)
      .update({ pin_failed_attempts: 0, pin_blocked_until: null, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select(PROFILE_COLUMNS)
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
      .from(TABLES.profiles)
      .update({ pin_hash: null, pin_salt: null, pin_failed_attempts: 0, pin_blocked_until: null, webauthn_credential_id: null, webauthn_enabled: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select(PROFILE_COLUMNS)
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
      .from(TABLES.profiles)
      .update({ webauthn_credential_id: credentialId, webauthn_enabled: true, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select(PROFILE_COLUMNS)
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
      .from(TABLES.profiles)
      .update({ webauthn_credential_id: null, webauthn_enabled: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .select(PROFILE_COLUMNS)
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
      .from(TABLES.profiles)
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
      .from(TABLES.debtors)
      .insert({
        user_id: user.id,
        name: input.name.trim(),
        note: input.note.trim() || null,
        opening_balance: toMoneyAmount(input.opening_balance),
        kind: input.kind,
        monthly_installment: input.monthly_installment,
        total_installments: input.total_installments,
        credit_limit: input.credit_limit,
        credit_card_min_payment_percent: input.credit_card_min_payment_percent,
        icon: input.icon,
        icon_color: input.icon_color,
      })
      .select(DEBTOR_COLUMNS)
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
      .from(TABLES.debtors)
      .update({
        name: patch.name.trim(),
        note: patch.note.trim() || null,
        opening_balance: openingBalance,
        kind: patch.kind,
        monthly_installment: patch.monthly_installment,
        total_installments: patch.total_installments,
        credit_limit: patch.credit_limit,
        credit_card_min_payment_percent: patch.credit_card_min_payment_percent,
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
    const outstanding = (debtor.kind === "own" ? payableSummary : receivableSummary)
      .find((item) => item.name.trim().toLowerCase() === debtor.name.trim().toLowerCase())?.amount ?? 0;
    const balanceWarning = outstanding > 0.005
      ? ` ตอนนี้ยัง${debtor.kind === "own" ? "เหลือหนี้ค้าง" : "มียอดค้างรับ"} ${moneySign}${formatMoney(outstanding)} อยู่`
      : "";
    const confirmed = await requestConfirm({
      title: "ลบรายชื่อนี้?",
      detail: `ลบ "${debtor.name}" ออกจากรายชื่อ รายการเก่าจะไม่ถูกลบ${balanceWarning}`,
      confirmLabel: "ลบรายชื่อ",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.from(TABLES.debtors).delete().eq("id", debtor.id);
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
    const { error } = await supabase.from(TABLES.debtors).insert(debtor);
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
    if (input.is_default) await supabase.from(TABLES.wallets).update({ is_default: false, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    const { data, error } = await supabase
      .from(TABLES.wallets)
      .insert({
        user_id: user.id,
        name: input.name.trim(),
        tag: input.tag,
        balance: toFiniteNumber(input.balance),
        icon: input.icon,
        icon_color: input.icon_color,
        is_default: input.is_default,
      })
      .select(WALLET_COLUMNS)
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
    if (patch.is_default) await supabase.from(TABLES.wallets).update({ is_default: false, updated_at: new Date().toISOString() }).eq("user_id", wallet.user_id).neq("id", wallet.id);
    const { error } = await supabase
      .from(TABLES.wallets)
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
    const currentBalance = displayWallets.find((item) => item.id === wallet.id)?.display_balance ?? wallet.balance;
    const balanceWarning = Math.abs(currentBalance) > 0.005
      ? ` ตอนนี้ยังมียอดเหลืออยู่ ${moneySign}${formatMoney(currentBalance)}`
      : "";
    const confirmed = await requestConfirm({
      title: "ลบกระเป๋านี้?",
      detail: `ลบ "${wallet.name}" ออกจากกระเป๋าตังค์${balanceWarning}`,
      confirmLabel: "ลบกระเป๋า",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.from(TABLES.wallets).delete().eq("id", wallet.id);
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
    const { error } = await supabase.from(TABLES.wallets).insert(wallet);
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
      .from(TABLES.recurringExpenses)
      .insert({
        user_id: user.id,
        name: input.name.trim(),
        amount: toMoneyAmount(input.amount),
        billing_day: normalizeBillingDay(input.billing_day),
        icon: input.icon,
        icon_color: input.icon_color,
      })
      .select(RECURRING_EXPENSE_COLUMNS)
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
      .from(TABLES.recurringExpenses)
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
    const { error } = await supabase.from(TABLES.recurringExpenses).delete().eq("id", item.id);
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
    const { error } = await supabase.from(TABLES.recurringExpenses).insert(item);
    if (error) {
      setError(error.message);
      notify({ tone: "error", title: "ย้อนคืนรายจ่ายประจำไม่สำเร็จ", detail: error.message });
      return;
    }
    setRecurringExpenses((current) => [...current, item].sort((a, b) => a.billing_day - b.billing_day));
    notify({ tone: "success", title: "ย้อนคืนรายจ่ายประจำแล้ว", detail: item.name });
  }

  async function resolveInvestment(target: Investment | null, input: { name: string; code: string; icon: string | null; icon_color: string | null }): Promise<Investment | null> {
    if (target) return target;
    if (!supabase || !user) return null;
    const { data, error } = await supabase
      .from(TABLES.investments)
      .insert({
        user_id: user.id,
        name: input.name.trim(),
        code: input.code.trim() || null,
        units: 0,
        cost_basis: 0,
        icon: input.icon,
        icon_color: input.icon_color,
      })
      .select(INVESTMENT_COLUMNS)
      .single();
    if (error) {
      setError(error.message);
      return null;
    }
    const created = { ...data, units: toFiniteNumber(data.units), cost_basis: toFiniteNumber(data.cost_basis) } as Investment;
    setInvestments((current) => [...current, created]);
    return created;
  }

  // Records the wallet debit for a purchase as a normal transaction (so
  // history/reports see it) and, since units are known at call time, applies
  // them to the holding immediately — this is the "confirmed" path, unlike
  // a pending DCA purchase (see confirmInvestmentPurchase) where the wallet
  // debit happens before the fund house reports actual units.
  async function buyInvestment(target: Investment | null, input: { name: string; code: string; icon: string | null; icon_color: string | null; units: number; amount: number; wallet_id: string; occurred_at: string; note?: string }) {
    if (!supabase || !user) return false;
    const units = Math.abs(input.units);
    const amount = Math.abs(input.amount);
    if (!units || !amount || !input.wallet_id) return false;
    setBusy(true);
    setError("");
    const investment = await resolveInvestment(target, input);
    if (!investment) {
      setBusy(false);
      return false;
    }
    const { data, error } = await supabase
      .from(TABLES.transactions)
      .insert({
        user_id: user.id,
        title: `ลงทุน ${investment.name}`,
        category: "อื่น ๆ",
        amount,
        kind: "expense",
        transaction_type: "investment_buy",
        debtor_name: unnamedDebtor,
        ...calculateImpacts(amount, "investment_buy"),
        occurred_at: input.occurred_at,
        wallet_id: input.wallet_id,
        note: input.note?.trim() || null,
        investment_id: investment.id,
        investment_units: units,
      })
      .select(TRANSACTION_COLUMNS)
      .single();
    if (error) {
      setError(error.message);
      setBusy(false);
      return false;
    }
    const { error: updateError } = await supabase
      .from(TABLES.investments)
      .update({ units: investment.units + units, cost_basis: investment.cost_basis + amount, updated_at: new Date().toISOString() })
      .eq("id", investment.id);
    if (updateError) {
      setError(updateError.message);
      setBusy(false);
      return false;
    }
    setInvestments((current) => current.map((row) => (row.id === investment.id ? { ...row, units: row.units + units, cost_basis: row.cost_basis + amount } : row)));
    setEntries((current) => [mapTransactionRow(data), ...current].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)));
    setBusy(false);
    return true;
  }

  // Resolves a pending DCA purchase (the transactions row already debited the
  // wallet with investment_units = null) once the fund house reports actual
  // units — fills in investment_units on that row and, only now, applies the
  // units/cost to the holding (cost is the amount already recorded, so no
  // double-entry of the wallet debit).
  async function confirmInvestmentPurchase(entry: Entry, units: number) {
    if (!supabase || !entry.investment_id || !(units > 0)) return false;
    const investment = investments.find((row) => row.id === entry.investment_id);
    if (!investment) return false;
    setBusy(true);
    setError("");
    const { error } = await supabase
      .from(TABLES.transactions)
      .update({ investment_units: units })
      .eq("id", entry.id);
    if (error) {
      setError(error.message);
      setBusy(false);
      return false;
    }
    const { error: updateError } = await supabase
      .from(TABLES.investments)
      .update({ units: investment.units + units, cost_basis: investment.cost_basis + entry.amount, updated_at: new Date().toISOString() })
      .eq("id", investment.id);
    if (updateError) {
      setError(updateError.message);
      setBusy(false);
      return false;
    }
    setInvestments((current) => current.map((row) => (row.id === investment.id ? { ...row, units: row.units + units, cost_basis: row.cost_basis + entry.amount } : row)));
    setEntries((current) => current.map((row) => (row.id === entry.id ? { ...row, investment_units: units } : row)));
    setBusy(false);
    notify({ tone: "success", title: "ยืนยันหน่วยแล้ว", detail: `${investment.name} · ${formatUnits(units)} หน่วย` });
    return true;
  }

  async function sellInvestment(item: Investment, unitsSold: number) {
    if (!supabase) return false;
    const sold = Math.min(Math.abs(unitsSold), item.units);
    if (!sold) return false;
    const avgCost = item.units > 0 ? item.cost_basis / item.units : 0;
    const nextUnits = Math.max(0, item.units - sold);
    const nextCostBasis = nextUnits <= 0.000001 ? 0 : Math.max(0, item.cost_basis - avgCost * sold);
    setBusy(true);
    setError("");
    const { error } = await supabase
      .from(TABLES.investments)
      .update({ units: nextUnits, cost_basis: nextCostBasis, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    if (error) {
      setError(error.message);
      setBusy(false);
      return false;
    }
    setInvestments((current) => current.map((row) => (row.id === item.id ? { ...row, units: nextUnits, cost_basis: nextCostBasis } : row)));
    setBusy(false);
    return true;
  }

  async function addInvestmentPrice(item: Investment, nav: number, recordedAt: string) {
    if (!supabase || !user || !(nav > 0)) return false;
    setBusy(true);
    setError("");
    const { data, error } = await supabase
      .from(TABLES.investmentPrices)
      .upsert({ investment_id: item.id, user_id: user.id, nav, recorded_at: recordedAt }, { onConflict: "investment_id,recorded_at" })
      .select(INVESTMENT_PRICE_COLUMNS)
      .single();
    if (error) {
      setError(error.message);
      setBusy(false);
      return false;
    }
    const saved = { ...data, nav: toFiniteNumber(data.nav) } as InvestmentPrice;
    setInvestmentPrices((current) => [...current.filter((row) => !(row.investment_id === item.id && row.recorded_at === recordedAt)), saved].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)));
    setBusy(false);
    return true;
  }

  async function deleteInvestment(item: Investment) {
    if (!supabase) return;
    const confirmed = await requestConfirm({
      title: "ลบพอร์ตนี้?",
      detail: `ลบ "${item.name}" และประวัติราคาทั้งหมดออกจากพอร์ตลงทุน`,
      confirmLabel: "ลบรายการ",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.from(TABLES.investments).delete().eq("id", item.id);
    if (error) setError(error.message);
    else {
      setInvestments((current) => current.filter((row) => row.id !== item.id));
      setInvestmentPrices((current) => current.filter((row) => row.investment_id !== item.id));
      notify({ tone: "info", title: "ลบพอร์ตแล้ว", detail: item.name });
    }
    setBusy(false);
  }

  const editingDismiss = useDismiss(!!editing, () => setEditing(null));
  const debtorSheetDismiss = useDismiss(!!debtorSheetMode, () => { setDebtorSheetMode(null); setEditingDebtor(null); });
  const walletSheetDismiss = useDismiss(!!walletSheetMode, () => { setWalletSheetMode(null); setEditingWallet(null); });
  const recurringSheetDismiss = useDismiss(!!recurringSheetMode, () => { setRecurringSheetMode(null); setEditingRecurringExpense(null); });
  const investmentBuyDismiss = useDismiss(investmentBuySheetOpen, () => { setInvestmentBuySheetOpen(false); setInvestmentBuyTarget(null); });
  const investmentSellDismiss = useDismiss(!!investmentSellTarget, () => setInvestmentSellTarget(null));
  const investmentPriceDismiss = useDismiss(!!investmentPriceTarget, () => setInvestmentPriceTarget(null));
  const investmentConfirmDismiss = useDismiss(!!investmentConfirmTarget, () => setInvestmentConfirmTarget(null));
  const investmentAiDismiss = useDismiss(investmentAiSheetOpen, () => setInvestmentAiSheetOpen(false));
  const menuDismiss = useDismiss(menuOpen, () => setMenuOpen(false));
  const menuVisible = menuDismiss.mounted && !menuDismiss.closing;
  const moreDismiss = useDismiss(moreOpen, () => setMoreOpen(false));
  const profileSheetDismiss = useDismiss(profileSheetOpen, () => setProfileSheetOpen(false));
  const budgetSheetDismiss = useDismiss(budgetSheetOpen, () => setBudgetSheetOpen(false));
  const goalSheetDismiss = useDismiss(goalSheetOpen, () => setGoalSheetOpen(false));
  const reportSheetDismiss = useDismiss(reportSheetOpen, () => setReportSheetOpen(false));
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
                  netWorthDelta={netWorthDelta}
                  netWorthFormula={netWorthDisplay.formula}
                  hideNetWorthCard={netWorthDisplay.hideCard}
                  savingsRate={savingsRate}
                  monthlyIncome={monthlyIncome}
                  monthlyObligationTotal={monthlyObligationTotal}
                  payableTotal={payableTotal}
                />
                <QuickAddStrip shortcuts={quickShortcuts.slice(0, 4)} onSelect={(shortcut) => openAddTab("manual", shortcut)} onMore={() => openAddTab()} />
                {!!goals.length && <GoalCard goals={goals} onAdd={() => setGoalSheetOpen(true)} onDelete={removeGoal} />}
                {(dueSoonRecurring.length > 0 || budgetGlance.totalBudget > 0) && (
                  <div className="home-focus-grid">
                    {dueSoonRecurring.length > 0 && <DueSoonCard items={dueSoonRecurring} onManage={() => setTab("recurring")} onLogNow={logRecurringNow} />}
                    {budgetGlance.totalBudget > 0 && <BudgetGlanceCard budgetGlance={budgetGlance} onManage={() => setBudgetSheetOpen(true)} />}
                  </div>
                )}
                <CashFlowTrendCard trend={cashFlowTrend} />
                <SpendingPersonalityCard topCategory={discretionaryTopCategory} trend={discretionaryCategoryTrend} monthlyOutflow={monthlyOutflow} hasBillsOnly={!discretionaryTopCategory && monthlyOutflow > 0} />
              </>
            )}

            {!dataLoading && !wallets.length && !entries.length && !debtors.length && (
              <FirstRunHomeState
                onCreateWallet={openSheet(() => { setEditingWallet(null); setWalletSheetMode("create"); })}
                onSetBudget={() => setBudgetSheetOpen(true)}
                onAddEntry={() => openAddTab()}
              />
            )}

            {!dataLoading && !!secondaryWallets.length && (
              <div className="wallet-carousel">
                {secondaryWallets.map((wallet) => (
                  <button className={`wallet-carousel-card ${secondaryWalletTags.find((entry) => entry.tag === wallet.tag)?.className ?? ""}`} key={wallet.id} onClick={() => setTab("wallets")}>
                    <i className="debtor-avatar sm" style={{ background: wallet.icon_color ?? nameColor(wallet.name) }}>
                      <WalletAvatarGlyph iconKey={wallet.icon} fallbackName={wallet.name} size={16} />
                    </i>
                    <span>{wallet.name}</span>
                    <strong><CountUpMoney value={wallet.display_balance} /></strong>
                  </button>
                ))}
              </div>
            )}

            {!dataLoading && <RecentActivityTimeline entries={entries} onEdit={openSheet(setEditing)} />}

            {error && <ErrorActions onRetry={retrySync} onDismiss={() => setError("")} />}
            {error && <StateCard tone="error" title="มีบางอย่างไม่สำเร็จ" detail={error} />}
          </div>
        )}

        {tab === "add" && (
          <div className="view add-view">
            {dataLoading && <SkeletonList rows={3} />}
            <div className="add-title add-title-compact">
              <button onClick={() => setTab("home")} aria-label="ย้อนกลับ"><ChevronLeft aria-hidden="true" /></button>
              <div>
                <p className="eyebrow">{addMode === "manual" ? "เพิ่มรายการ" : "AI Chat"}</p>
                <h2>{addMode === "manual" ? "กรอกรายการด้วยตัวเอง" : busy ? "กำลังอ่านให้แบบตั้งใจสุด ๆ" : drafts.length ? "แยกข้อมูลให้แล้ว ลองตรวจอีกนิด" : "วันนี้มีรายการอะไรบ้าง?"}</h2>
              </div>
            </div>

            <div className="report-period-toggle">
              <button className={addMode === "ai" ? "active" : ""} onClick={() => { setError(""); setAddMode("ai"); }}>ให้ AI ช่วยจด</button>
              <button className={addMode === "manual" ? "active" : ""} onClick={() => { setError(""); setAddMode("manual"); }}>เขียนเอง</button>
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
                        <span className="cat-dot" style={{ background: suggestion.shortcut ? categoryTint(suggestion.shortcut.category, CATEGORY_DOT_TINT_ALPHA) : undefined, color: suggestion.shortcut ? categoryColor(suggestion.shortcut.category) : undefined }}>
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
                    <span>{slipImages.length ? `${slipImages.length}/${MAX_SLIP_IMAGES} รูป` : "Gemini ช่วยอ่านรูปและข้อความ"}</span>
                  </div>
                </div>

                <button className="primary" onClick={analyze} disabled={busy || (!text.trim() && !slipImages.length)}>
                  {busy ? (
                    <span className="button-loading-row">
                      <span className="loading-spinner mini on-ink" />
                      {`กำลังวิเคราะห์... (${analyzeElapsedSeconds} วิ)`}
                    </span>
                  ) : "ให้ AI แยกรายการ"}
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
                        <button className="review-cancel-all" onClick={() => { setDrafts([]); setReceiptTotal(0); }}>ยกเลิกทั้งหมด</button>
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
                    {!!slipImages.length && receiptTotal > 0 && Math.abs(drafts.reduce((sum, draft) => sum + draft.amount, 0) - receiptTotal) > 1 && (
                      <StateCard
                        tone="error"
                        title="ยอดรวมไม่ตรงกับสลิป"
                        detail={`AI แยกรายการได้รวม ${moneySign}${formatMoney(drafts.reduce((sum, draft) => sum + draft.amount, 0))} แต่ยอดบนสลิประบุ ${moneySign}${formatMoney(receiptTotal)} ลองตรวจรายการอีกครั้งก่อนบันทึก`}
                      />
                    )}
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
                categoryMemory={categoryMemory}
                onSave={(drafts) => saveEntries(drafts)}
              />
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="view history-view">
            {dataLoading && <SkeletonList rows={5} />}
            <div className="add-title">
              <button onClick={() => setTab("home")} aria-label="ย้อนกลับ"><ChevronLeft aria-hidden="true" /></button>
              <div>
                <h2>รายการทั้งหมด</h2>
              </div>
              <button className="header-add-button" onClick={() => setRecapOpen(true)}>สรุปเดือนนี้</button>
            </div>
            <HistoryFilterBar
              filters={historyFilters}
              onChange={setHistoryFilters}
              onClear={() => setHistoryFilters({ query: "", category: "", type: "all", minAmount: "", maxAmount: "" })}
            />
            {searchActive ? (
              <>
                <p className="history-search-summary">
                  {searchResults.length >= SEARCH_RESULT_LIMIT
                    ? `แสดง ${SEARCH_RESULT_LIMIT} รายการแรกจากทุกเดือน · ลองใส่ตัวกรองเพิ่มเพื่อจำกัดผลลัพธ์`
                    : `พบ ${searchResults.length} รายการจากทุกเดือน`}
                </p>
                <EntryList entries={searchResults} onEdit={openSheet(setEditing)} onDelete={deleteEntry} emptyAction={addWithAiAction} />
              </>
            ) : (
              <>
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
                <CalendarHeatmap start={cycleRange.start} end={cycleRange.end} entries={monthlyEntries} selectedMonth={selectedMonth} onChangeMonth={selectHistoryMonth} selectedDay={selectedDay} defaultDay={defaultHistoryDay} onSelectDay={setSelectedDay} />
                {activeDay && <HistoryInsight entries={dayEntries} />}
                <EntryList entries={dayEntries} onEdit={openSheet(setEditing)} onDelete={deleteEntry} emptyAction={addWithAiAction} />
              </>
            )}
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
            loading={dataLoading}
            onChangeActiveKind={setDebtorKindTab}
            onBack={() => selectedDebtor ? setSelectedDebtor(null) : setTab("home")}
            onAdd={openSheet(() => { setEditingDebtor(null); setDebtorSheetMode("create"); })}
            onSelect={(debtor) => setSelectedDebtor(debtor)}
            onEdit={openSheet((debtor: Debtor) => { setEditingDebtor(debtor); setDebtorSheetMode("edit"); })}
            onDelete={deleteDebtor}
          />
        )}

        {tab === "wallets" && (
          <WalletsView
            wallets={displayWallets}
            entries={entries}
            loading={dataLoading}
            onBack={() => setTab("home")}
            onAdd={openSheet(() => { setEditingWallet(null); setWalletSheetMode("create"); })}
            onEdit={openSheet((wallet: Wallet) => { setEditingWallet(wallet); setWalletSheetMode("edit"); })}
            onDelete={deleteWallet}
          />
        )}

        {tab === "recurring" && (
          <RecurringExpensesView
            items={recurringExpenses}
            loading={dataLoading}
            onBack={() => setTab("home")}
            onAdd={openSheet(() => { setEditingRecurringExpense(null); setRecurringSheetMode("create"); })}
            onEdit={openSheet((item: RecurringExpense) => { setEditingRecurringExpense(item); setRecurringSheetMode("edit"); })}
            onDelete={deleteRecurringExpense}
          />
        )}

        {tab === "goals" && (
          <GoalsView
            goals={goals}
            loading={dataLoading}
            onBack={() => setTab("home")}
            onAdd={() => setGoalSheetOpen(true)}
            onDelete={removeGoal}
          />
        )}

        {tab === "portfolio" && (
          <PortfolioView
            holdings={portfolioHoldings}
            trend={portfolioTrend}
            totalValue={portfolioTotalValue}
            totalCost={portfolioTotalCost}
            totalGain={portfolioTotalGain}
            totalGainPercent={portfolioTotalGainPercent}
            pendingPurchases={pendingInvestmentPurchases}
            loading={dataLoading}
            onBack={() => setTab("home")}
            onBuy={openSheet((target: Investment | null) => { setInvestmentBuyTarget(target); setInvestmentBuySheetOpen(true); })}
            onSell={openSheet((item: Investment) => setInvestmentSellTarget(item))}
            onUpdatePrice={openSheet((item: Investment) => setInvestmentPriceTarget(item))}
            onDelete={deleteInvestment}
            onConfirmPending={openSheet((entry: Entry) => setInvestmentConfirmTarget(entry))}
            onDeletePending={deleteEntry}
            onOpenAi={openSheet(() => setInvestmentAiSheetOpen(true))}
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
        {investmentBuyDismiss.mounted && (
          <InvestmentBuySheet
            target={investmentBuyTarget}
            investments={investments}
            wallets={wallets}
            busy={busy}
            error={error}
            onClose={investmentBuyDismiss.requestClose}
            onSubmit={buyInvestment}
            onSubmitPending={createPendingInvestmentPurchase}
            closing={investmentBuyDismiss.closing}
          />
        )}
        {investmentSellDismiss.mounted && investmentSellTarget && (
          <InvestmentSellSheet
            item={investmentSellTarget}
            busy={busy}
            error={error}
            onClose={investmentSellDismiss.requestClose}
            onSubmit={sellInvestment}
            closing={investmentSellDismiss.closing}
          />
        )}
        {investmentPriceDismiss.mounted && investmentPriceTarget && (
          <InvestmentPriceSheet
            item={investmentPriceTarget}
            busy={busy}
            error={error}
            onClose={investmentPriceDismiss.requestClose}
            onSubmit={addInvestmentPrice}
            closing={investmentPriceDismiss.closing}
          />
        )}
        {investmentConfirmDismiss.mounted && investmentConfirmTarget && (
          <InvestmentConfirmUnitsSheet
            entry={investmentConfirmTarget}
            investmentName={investments.find((item) => item.id === investmentConfirmTarget.investment_id)?.name ?? investmentConfirmTarget.title}
            busy={busy}
            error={error}
            onClose={investmentConfirmDismiss.requestClose}
            onSubmit={confirmInvestmentPurchase}
            onExtractUnits={extractUnitsFromStatement}
            closing={investmentConfirmDismiss.closing}
          />
        )}
        {investmentAiDismiss.mounted && (
          <InvestmentAiSheet
            investments={investments}
            wallets={wallets}
            busy={busy}
            error={error}
            onClose={investmentAiDismiss.requestClose}
            onAnalyze={analyzeInvestmentText}
            onSave={(input) => createPendingInvestmentPurchase(input)}
            closing={investmentAiDismiss.closing}
          />
        )}
        {menuDismiss.mounted && (
          <SideMenu
            user={user}
            profile={profile}
            onClose={menuDismiss.requestClose}
            onLogout={() => { menuDismiss.requestClose(); setLogoutOpen(true); }}
            onOpenProfile={openSheet(() => { menuDismiss.requestClose(); setProfileSheetOpen(true); })}
            onOpenBudgets={() => { menuDismiss.requestClose(); setBudgetSheetOpen(true); }}
            onOpenReport={() => { menuDismiss.requestClose(); setReportSheetOpen(true); }}
            onOpenAsk={() => { menuDismiss.requestClose(); setAskAiOpen(true); }}
            onOpenPin={() => { menuDismiss.requestClose(); setPinSheetOpen(true); }}
            theme={theme}
            onSetTheme={setTheme}
            closing={menuDismiss.closing}
          />
        )}
        {moreDismiss.mounted && (
          <MoreSheet
            onClose={moreDismiss.requestClose}
            onOpenDebtors={() => { moreDismiss.requestClose(); setSelectedDebtor(null); setTab("debtors"); }}
            onOpenRecurring={() => { moreDismiss.requestClose(); setTab("recurring"); }}
            onOpenGoals={() => { moreDismiss.requestClose(); setTab("goals"); }}
            onOpenPortfolio={() => { moreDismiss.requestClose(); setTab("portfolio"); }}
            receivableTotal={receivableTotal}
            payableTotal={payableTotal}
            recurringTotal={recurringExpenses.reduce((sum, item) => sum + item.amount, 0)}
            portfolioTotal={portfolioTotalValue}
            closing={moreDismiss.closing}
          />
        )}
        {profileSheetDismiss.mounted && (
          <ProfileEditSheet profile={profile} busy={busy} error={error} onClose={profileSheetDismiss.requestClose} onSave={saveProfile} closing={profileSheetDismiss.closing} netWorthDisplay={netWorthDisplay} onSaveNetWorthDisplay={updateNetWorthDisplay} />
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
        {askAiDismiss.mounted && user && (
          <AskFinanceSheet context={aiFinanceContext} userId={user.id} onClose={askAiDismiss.requestClose} closing={askAiDismiss.closing} />
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
              <span className="nav-item">
                <span className="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M4 10.8 12 4l8 6.8v8.7a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5v-8.7Z" />
                  </svg>
                </span>
                <span className="nav-label">หน้าหลัก</span>
              </span>
            </button>
            <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")} aria-label="รายการ">
              <span className="nav-item">
                <span className="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M6.5 5.5h11v13h-11z" />
                    <path d="M9.5 9h5M9.5 12h5M9.5 15h3" />
                  </svg>
                </span>
                <span className="nav-label">รายการ</span>
              </span>
            </button>
            <button className="add-button" onClick={() => openAddTab()} aria-label="เพิ่มรายการด้วย AI">
              <span className="nav-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </button>
            <button className={tab === "wallets" ? "active" : ""} onClick={() => setTab("wallets")} aria-label="กระเป๋าตังค์">
              <span className="nav-item">
                <span className="nav-icon" aria-hidden="true">
                  <WalletIcon aria-hidden="true" />
                </span>
                <span className="nav-label">กระเป๋า</span>
              </span>
            </button>
            <button className={moreOpen ? "active" : ""} onClick={() => setMoreOpen(true)} aria-label="เพิ่มเติม">
              <span className="nav-item">
                <span className="nav-icon" aria-hidden="true">
                  <MoreHorizontal aria-hidden="true" />
                </span>
                <span className="nav-label">อื่น ๆ</span>
              </span>
            </button>
          </nav>
        )}
      </section>
    </main>
  );
}

