"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import type { User } from "@supabase/supabase-js";
import {
  ArrowUp,
  Bell,
  Check,
  ChevronRight,
  Copy,
  Download,
  ImagePlus,
  Lightbulb,
  LineChart,
  Lock,
  ShieldCheck,
  LogOut,
  PiggyBank,
  Receipt,
  Trash2,
  TrendingUp,
  Users,
  Wallet as WalletIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AI_CHAT_HISTORY_LIMIT, AI_CHAT_MESSAGE_COLUMNS, AI_CONTEXT_MAX_LENGTH, ASK_COMPOSER_MAX_HEIGHT, DELETE_ACCOUNT_CONFIRM_TEXT, MONTH_START_DAY_MAX, MONTH_START_DAY_MIN, TABLES } from "@/lib/constants";
import { authHeaders } from "@/lib/api";
import { formatChatTime, formatMoney, formatSignedMoney, moneySign, clampInteger } from "@/lib/format";
import { entriesInRange, reportBounds, reportLabel } from "@/lib/cycle";
import { totalWallet } from "@/lib/money";
import { buildReportCsv, downloadCsv } from "@/lib/csv";
import { compressProfileImage } from "@/lib/image";
import { nameInitial } from "@/lib/category";
import type { AiChatMessage, AiFinanceContext, Entry, NetWorthDisplaySettings, Profile, ReportPeriod, Wallet } from "@/lib/types";
import { MonthField, PageFrame, StateCard, useEscapeToClose, useFocusTrap } from "@/components/primitives";

export function cleanAiAnswer(value: string) {
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

export function AskFinanceView({ context, userId, aiContext, onBack }: { context: AiFinanceContext; userId: string; aiContext: string; onBack: () => void }) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const threadRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { setLoadingHistory(false); return; }
      // Newest-first + limit, then flipped back for display: the tail is what
      // the thread should show, and Postgres can't take the last N rows in
      // ascending order without reading all of them.
      const { data, error: loadError } = await supabase
        .from(TABLES.aiChatMessages)
        .select(AI_CHAT_MESSAGE_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(AI_CHAT_HISTORY_LIMIT);
      if (cancelled) return;
      if (loadError) setError(loadError.message);
      else setMessages(((data ?? []) as AiChatMessage[]).slice().reverse());
      setLoadingHistory(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, busy]);

  // Auto-growing composer. Collapse to `auto` first so the scrollHeight read
  // can shrink the box as well as grow it -- measuring against the current
  // height only ever ratchets upward.
  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, ASK_COMPOSER_MAX_HEIGHT)}px`;
  }, [question]);

  const ask = async () => {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setBusy(true); setError("");
    const userMessage: AiChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMessage]);
    setQuestion("");
    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    try {
      const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ question: trimmed, context, history, aiContext }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI ตอบคำถามไม่สำเร็จ");
      const answerText = cleanAiAnswer(data.answer || "ยังไม่มีคำตอบ");
      const assistantMessage: AiChatMessage = { id: crypto.randomUUID(), role: "assistant", content: answerText, created_at: new Date().toISOString() };
      setMessages((prev) => [...prev, assistantMessage]);
      if (supabase) {
        await supabase.from(TABLES.aiChatMessages).insert([
          { id: userMessage.id, user_id: userId, role: "user", content: trimmed },
          { id: assistantMessage.id, user_id: userId, role: "assistant", content: answerText },
        ]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI ตอบคำถามไม่สำเร็จ");
    }
    setBusy(false);
  };

  const resetChat = async () => {
    setMessages([]);
    setError("");
    if (supabase) await supabase.from(TABLES.aiChatMessages).delete().eq("user_id", userId);
  };

  const copyMessage = async (message: AiChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      setTimeout(() => setCopiedId((current) => (current === message.id ? "" : current)), 1500);
    } catch { /* clipboard unavailable, ignore */ }
  };

  return <PageFrame
    onBack={onBack}
    eyebrow="ผู้ช่วยการเงิน"
    title="ถาม AI เรื่องเงิน"
    className="ask-ai-page"
    actions={messages.length > 0 ? <button className="ask-ai-reset" onClick={() => { void resetChat(); }} aria-label="เริ่มแชทใหม่"><Trash2 size={16} strokeWidth={2.25} /></button> : undefined}
  >
    <div className="ask-ai-thread" ref={threadRef}>
      {/* Reads as a chat's date divider, which is exactly what it is: the
          slice of the account every answer below it was computed from. */}
      <p className="ask-ai-divider">อ้างอิงตัวเลขใน{context.periodLabel}</p>
      {loadingHistory && <p className="ask-ai-thread-hint">กำลังโหลดประวัติแชท...</p>}
      {!loadingHistory && messages.length === 0 && (
        <div className="ask-ai-empty">
          <p>เริ่มถาม AI เรื่องการเงินของคุณได้เลย</p>
          <div className="ask-ai-examples">
            <button onClick={() => setQuestion("เดือนนี้ฉันใช้เงินกับหมวดไหนมากที่สุด")}>หมวดไหนใช้เยอะสุด</button>
            <button onClick={() => setQuestion("ช่วงนี้เงินของฉันเหลือเป็นอย่างไร")}>เงินเหลือเป็นอย่างไร</button>
          </div>
        </div>
      )}
      {messages.map((message, index) => (
        // Consecutive messages from the same side group: only the last of a
        // run keeps the "tail" corner and shows its time, so a multi-message
        // answer reads as one turn rather than a stack of separate cards.
        <div
          key={message.id}
          className={`ask-ai-row ${message.role} ${messages[index + 1]?.role === message.role ? "grouped" : ""}`}
        >
          <div className="ask-ai-bubble"><p>{message.content}</p></div>
          <div className="ask-ai-meta">
            <time dateTime={message.created_at}>{formatChatTime(message.created_at)}</time>
            {message.role === "assistant" && (
              <button className="ask-ai-copy" onClick={() => { void copyMessage(message); }} aria-label="คัดลอกคำตอบ">
                {copiedId === message.id ? <><Check size={12} strokeWidth={2.5} aria-hidden="true" />คัดลอกแล้ว</> : <><Copy size={12} strokeWidth={2.25} aria-hidden="true" />คัดลอก</>}
              </button>
            )}
          </div>
        </div>
      ))}
      {busy && (
        <div className="ask-ai-row assistant">
          <div className="ask-ai-bubble pending"><p>กำลังพิมพ์...</p></div>
        </div>
      )}
    </div>
    {error && <StateCard tone="error" title="ถาม AI ไม่สำเร็จ" detail={error} />}
    <div className="ask-ai-composer">
      <textarea
        className="ask-ai-input"
        ref={inputRef}
        rows={1}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends, Shift+Enter breaks the line -- what every messaging
          // app does. isComposing guards the Thai/IME candidate window, where
          // Enter is committing a word, not submitting.
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          void ask();
        }}
        placeholder="พิมพ์คำถามเรื่องเงินของคุณ"
      />
      <button className="ask-ai-send" onClick={() => { void ask(); }} disabled={busy || !question.trim()} aria-label="ส่งคำถาม">
        <ArrowUp size={18} strokeWidth={2.75} aria-hidden="true" />
      </button>
    </div>
  </PageFrame>;
}

export function ReportExportView({
  entries,
  wallets,
  receivableSummary,
  payableSummary,
  selectedMonth,
  monthStartDay,
  onBack,
}: {
  entries: Entry[];
  wallets: Wallet[];
  receivableSummary: { name: string; amount: number }[];
  payableSummary: { name: string; amount: number }[];
  selectedMonth: string;
  monthStartDay: number;
  onBack: () => void;
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
    <PageFrame onBack={onBack} eyebrow="ส่งออกข้อมูล" title="รีพอร์ท Excel / Sheets" className="report-page">

        <div className="report-period-toggle">
          <button className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>รายเดือน</button>
          <button className={period === "year" ? "active" : ""} onClick={() => setPeriod("year")}>รายปี</button>
        </div>

        {period === "month" ? (
          <label>
            เลือกเดือน
            <MonthField value={month} onChange={setMonth} />
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
    </PageFrame>
  );
}

export function ReportSummaryTiles({ income, outflow, balance, count }: { income: number; outflow: number; balance: number; count: number }) {
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

/**
 * Everything you can do with your money, in one place -- the counterpart to
 * SideMenu, which is now everything about your account.
 *
 * The split used to run along no line at all: four money features here, three
 * more (budgets, the finance chat, the export) hidden in the hamburger. Each
 * tile also says what it is for in a line, because "จัดการหนี้" with a number
 * under it tells someone who has never used the app nothing about when they
 * would tap it.
 *
 * A screen, not a sheet: it was one, and a wrong tap on "อื่น ๆ" then had to
 * be undone by reaching for a close button in the top corner, where every
 * other tab in the nav is undone by tapping the next one.
 */
export function MoreView({
  displayName,
  displayIcon,
  displayIconImage,
  monthStartDay,
  pinEnabled,
  headsUp,
  onOpenProfile,
  onOpenSecurity,
  onLogout,
  onDeleteAccount,
  onOpenUpcoming,
  onOpenWallets,
  walletTotal,
  onOpenDebtors,
  onOpenRecurring,
  onOpenGoals,
  onOpenPortfolio,
  onOpenBudgets,
  onOpenAsk,
  onOpenReport,
  receivableTotal,
  payableTotal,
  recurringTotal,
  portfolioTotal,
  budgetTotal,
}: {
  displayName: string;
  displayIcon: string;
  displayIconImage: string;
  monthStartDay: number;
  pinEnabled: boolean;
  /** The most pressing thing on "กำลังจะมา", in a line -- or nothing to flag. */
  headsUp: { title: string; detail: string } | null;
  onOpenProfile: () => void;
  onOpenSecurity: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  onOpenUpcoming: () => void;
  onOpenWallets: () => void;
  walletTotal: number;
  onOpenDebtors: () => void;
  onOpenRecurring: () => void;
  onOpenGoals: () => void;
  onOpenPortfolio: () => void;
  onOpenBudgets: () => void;
  onOpenAsk: () => void;
  onOpenReport: () => void;
  receivableTotal: number;
  payableTotal: number;
  recurringTotal: number;
  portfolioTotal: number;
  budgetTotal: number;
}) {
  const debtNet = receivableTotal - payableTotal;
  return (
    <div className="view more-view">
      {/* "ของฉัน", the mock's "My Netflix": you at the top, the one thing worth
          a look right now, every money tool, then the account's own settings.
          This is the one way into the account: the topbar's name and face
          lead here, not past it, and "you" is a single row rather than a
          poster -- it used to be a large centred portrait plus a second
          "บัญชีและโปรไฟล์" row further down, three doors into one screen, and
          the portrait pushed the money tools below the first screenful. */}
      {/* No back chevron, for the reason History has none: this is a tab of
          the bottom nav, a peer of Home, not a screen drilled into. It had
          one that went to Home, which the nav's first tab already is. */}
      <div className="add-title">
        <div>
          <h2>ของฉัน</h2>
        </div>
      </div>
      <button className="me-head" onClick={onOpenProfile}>
        <span className={`me-avatar ${displayIconImage ? "has-image" : ""}`}>
          {displayIconImage
            ? <NextImage className="profile-image" src={displayIconImage} alt="" width={48} height={48} unoptimized />
            : displayIcon}
        </span>
        <span className="me-head-text">
          <b>{displayName}</b>
          <small>รอบเดือนเริ่มวันที่ {monthStartDay} · แก้ไขโปรไฟล์</small>
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
      {headsUp && (
        <button className="me-row me-alert" onClick={onOpenUpcoming}>
          <span className="me-row-icon"><Bell size={18} strokeWidth={2.25} aria-hidden="true" /></span>
          <span className="me-row-text">
            {headsUp.title}
            <small>{headsUp.detail}</small>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
      <h3 className="me-section">เครื่องมือเงิน</h3>
      {/* A grid, not a rail as the mock drew it: this is a menu of eight
          places to go, and a row that scrolls sideways would hide most of
          them. */}
      <div className="more-grid">
        {/* First, because it was a bottom-nav tab until "กำลังจะมา" took the
            slot: the most-used thing on this list. */}
        <button onClick={onOpenWallets}>
          <span className="more-tile-icon"><WalletIcon size={20} strokeWidth={2.25} aria-hidden="true" /></span>
          <span>กระเป๋าเงิน</span>
          <small>ยอดแต่ละกระเป๋า เทียบยอดกับธนาคาร และประวัติเงินเข้าออก</small>
          <b>{moneySign}{formatMoney(walletTotal)}</b>
        </button>
        <button onClick={onOpenDebtors}>
          <span className="more-tile-icon"><Users size={20} strokeWidth={2.25} aria-hidden="true" /></span>
          <span>จัดการหนี้</span>
          <small>ใครติดเงินคุณ คุณติดใคร บัตรเครดิตและค่างวด</small>
          <b>{debtNet < 0 ? "−" : ""}{moneySign}{formatMoney(Math.abs(debtNet))}</b>
        </button>
        <button onClick={onOpenRecurring}>
          <span className="more-tile-icon"><Receipt size={20} strokeWidth={2.25} aria-hidden="true" /></span>
          <span>รายจ่ายประจำ</span>
          <small>บิลที่ตัดเงินเป็นรอบ ให้แอพเตือนก่อนถึงกำหนด</small>
          {/* The monthly average, because the bills behind it run on different
              cycles -- a yearly one counted in full here would read as the
              biggest monthly cost the user has. */}
          <b>{moneySign}{formatMoney(recurringTotal)} / เดือน</b>
        </button>
        <button onClick={onOpenBudgets}>
          <span className="more-tile-icon"><TrendingUp size={20} strokeWidth={2.25} aria-hidden="true" /></span>
          <span>งบประมาณ</span>
          <small>ตั้งวงเงินต่อหมวด แล้วดูว่าใช้ไปเท่าไหร่แล้ว</small>
          <b>{budgetTotal ? `${moneySign}${formatMoney(budgetTotal)}` : "ยังไม่ตั้ง"}</b>
        </button>
        <button onClick={onOpenGoals}>
          <span className="more-tile-icon"><PiggyBank size={20} strokeWidth={2.25} aria-hidden="true" /></span>
          <span>เป้าหมายการเงิน</span>
          <small>ตั้งเป้าเก็บเงิน แล้วตามความคืบหน้า</small>
        </button>
        <button onClick={onOpenPortfolio}>
          <span className="more-tile-icon"><LineChart size={20} strokeWidth={2.25} aria-hidden="true" /></span>
          <span>พอร์ตลงทุน</span>
          <small>กองทุนและหุ้นที่ถืออยู่ กำไรขาดทุนรวม</small>
          <b>{moneySign}{formatMoney(portfolioTotal)}</b>
        </button>
        <button onClick={onOpenAsk}>
          <span className="more-tile-icon"><Lightbulb size={20} strokeWidth={2.25} aria-hidden="true" /></span>
          <span>ถาม AI เรื่องเงิน</span>
          <small>ถามเป็นคำถามได้ เช่น เดือนนี้ใช้อะไรเยอะสุด</small>
        </button>
        <button onClick={onOpenReport}>
          <span className="more-tile-icon"><Download size={20} strokeWidth={2.25} aria-hidden="true" /></span>
          <span>ส่งออกรีพอร์ท</span>
          <small>ดาวน์โหลดเป็นไฟล์ CSV เปิดใน Excel ได้</small>
        </button>
      </div>
      <h3 className="me-section">บัญชี</h3>
      <div className="me-list">
        <button className="me-row" onClick={onOpenSecurity}>
          <span className="me-row-icon"><Lock size={18} strokeWidth={2.25} aria-hidden="true" /></span>
          <span className="me-row-text">
            รหัส PIN
            <small>{pinEnabled ? "เปิดใช้อยู่" : "ยังไม่ได้ตั้ง"}</small>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <a className="me-row" href="/privacy">
          <span className="me-row-icon"><ShieldCheck size={18} strokeWidth={2.25} aria-hidden="true" /></span>
          <span className="me-row-text">นโยบายความเป็นส่วนตัว</span>
          <ChevronRight size={18} aria-hidden="true" />
        </a>
        <button className="me-row me-logout" onClick={onLogout}>
          <span className="me-row-icon"><LogOut size={18} strokeWidth={2.25} aria-hidden="true" /></span>
          <span className="me-row-text">ออกจากระบบ</span>
        </button>
        <button className="me-row me-logout" onClick={onDeleteAccount}>
          <span className="me-row-icon"><Trash2 size={18} strokeWidth={2.25} aria-hidden="true" /></span>
          <span className="me-row-text">
            ลบบัญชี
            <small>ลบบัญชีและข้อมูลทั้งหมดถาวร</small>
          </span>
        </button>
      </div>
    </div>
  );
}

// Starter text for the "บริบทของฉันสำหรับ AI" field. The field's placeholder
// is invisible until focus (the sheet's floating-label CSS), and an empty box
// tells a first-time user nothing about what's worth writing -- so this doubles
// as the placeholder and as one-tap starter content they edit in place. The
// coin-swap line is the case that motivated the field: a tenant trading notes
// for laundry coins is a wallet-to-wallet transfer, which no generic parsing
// rule would guess.
const aiContextTemplate = [
  "ผมดูแลอพาร์ทเมนท์ มีเครื่องซักผ้าและตู้กดน้ำหยอดเหรียญเป็นรายได้เสริม",
  "ลูกบ้าน = ผู้เช่าในอพาร์ทเมนท์",
  "ลูกบ้านแลกเหรียญ = ลูกบ้านเอาแบงก์มาแลกเหรียญ เงินรวมเท่าเดิม ไม่ใช่รายรับ ให้โอนจากกระเป๋าเหรียญสำรองเข้ากระแสเงินสด",
  "เก็บเหรียญ = เปิดเครื่องเก็บรายได้ เป็นรายรับเข้ากระเป๋าเหรียญสำรอง",
].join("\n");

/**
 * The profile form: who you are, how the app counts your month, what the AI
 * knows about your vocabulary, and how net worth reads. Only things to edit --
 * the lock and the way out are rows on "ของฉัน", which is the one way in here.
 *
 * It absorbed the side drawer, which by the end held two links (one of them
 * to here) and a sign-out button, and paid for them with a permanent
 * hamburger in the topbar and an overlay layer of its own.
 */
export function ProfileView({
  profile,
  user,
  busy,
  error,
  onBack,
  onSave,
  netWorthDisplay,
  onSaveNetWorthDisplay,
}: {
  profile: Profile | null;
  user: User;
  busy: boolean;
  error: string;
  onBack: () => void;
  onSave: (next: { nickname: string; app_icon: string; app_icon_image: string; month_start_day: number; ai_context: string }) => Promise<boolean>;
  netWorthDisplay: NetWorthDisplaySettings;
  onSaveNetWorthDisplay: (next: NetWorthDisplaySettings) => void;
}) {
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const app_icon = profile?.app_icon ?? "";
  const [app_icon_image, setAppIconImage] = useState(profile?.app_icon_image ?? "");
  const [month_start_day, setMonthStartDay] = useState(profile?.month_start_day ?? 1);
  const [ai_context, setAiContext] = useState(profile?.ai_context ?? "");
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
    const saved = await onSave({ nickname, app_icon, app_icon_image, month_start_day, ai_context });
    if (saved) onBack();
  };

  return (
    <PageFrame onBack={onBack} eyebrow="ตั้งค่า" title="บัญชีของฉัน" className="profile-page">
      {/* The picture and the controls that change it, side by side -- no
          name-and-email card repeating what "ของฉัน" just showed. The email
          stays as a line under it: it is the one thing here that can't be
          edited, and the only place the app says which account is signed in. */}
      <section className="profile-photo" aria-label="รูปโปรไฟล์">
        <span className={`profile-editor-avatar ${app_icon_image ? "has-image" : ""}`}>
          {app_icon_image ? <NextImage className="profile-image" src={app_icon_image} alt="รูปโปรไฟล์ปัจจุบัน" width={64} height={64} unoptimized /> : (app_icon || nameInitial(profileName))}
        </span>
        <div className="profile-photo-actions">
          <label className="file-button">
            <ImagePlus size={18} strokeWidth={2} aria-hidden="true" />
            {app_icon_image ? "เปลี่ยนรูป" : "เลือกรูป"}
            <input type="file" accept="image/*" onChange={(event) => { void chooseProfileImage(event.target.files); event.currentTarget.value = ""; }} />
          </label>
          {!!app_icon_image && <button className="side-ghost" onClick={() => setAppIconImage("")}>ลบรูป</button>}
        </div>
        <small className="profile-photo-email">{user.email}</small>
      </section>
      <label>
        ชื่อเล่น
        <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="เช่น ก้อง" />
      </label>
      <label>
        วันเริ่มรอบเดือน
        <input type="number" min={MONTH_START_DAY_MIN} max={MONTH_START_DAY_MAX} value={month_start_day} onChange={(event) => setMonthStartDay(clampInteger(event.target.value, MONTH_START_DAY_MIN, MONTH_START_DAY_MAX, 1))} />
      </label>
      <label>
        บริบทของฉันสำหรับ AI
        <textarea
          value={ai_context}
          maxLength={AI_CONTEXT_MAX_LENGTH}
          onChange={(event) => setAiContext(event.target.value)}
          placeholder={aiContextTemplate}
        />
        <small>
          บอก AI ว่าคุณทำอาชีพอะไร และคำที่คุณใช้ประจำแปลว่าอะไร เช่น &quot;ลูกบ้านแลกเหรียญ = แลกแบงก์เป็นเหรียญ ไม่ใช่รายรับ&quot;
          AI จะอ่านทุกครั้งที่ช่วยแยกรายการและตอบคำถามการเงิน ({ai_context.length}/{AI_CONTEXT_MAX_LENGTH})
        </small>
      </label>
      {!ai_context.trim() && (
        <button className="side-ghost" onClick={() => setAiContext(aiContextTemplate)}>ใส่ตัวอย่างให้แล้วแก้เอง</button>
      )}
      <label>
        มูลค่าสุทธิ นับหนี้แบบไหน
        <div className="report-period-toggle">
          <button
            type="button"
            className={netWorthDisplay.formula === "full" ? "active" : ""}
            onClick={() => onSaveNetWorthDisplay({ ...netWorthDisplay, formula: "full" })}
          >
            หักหนี้เต็มจำนวน
          </button>
          <button
            type="button"
            className={netWorthDisplay.formula === "obligation" ? "active" : ""}
            onClick={() => onSaveNetWorthDisplay({ ...netWorthDisplay, formula: "obligation" })}
          >
            หักเฉพาะภาระเดือนนี้
          </button>
        </div>
        <small>
          {netWorthDisplay.formula === "obligation"
            ? "หักเฉพาะยอดผ่อน/ขั้นต่ำที่ต้องจ่ายรอบนี้ ไม่ใช่หนี้ทั้งก้อน"
            : "หักยอดหนี้คงเหลือทั้งหมดตามหลักบัญชีมาตรฐาน"}
        </small>
      </label>
      <label className="sheet-check-row">
        <input
          type="checkbox"
          checked={netWorthDisplay.hideCard}
          onChange={(event) => onSaveNetWorthDisplay({ ...netWorthDisplay, hideCard: event.target.checked })}
        />
        ซ่อนการ์ดมูลค่าสุทธิจากหน้าแรก
      </label>
      {(localError || error) && <StateCard tone="error" title="บันทึกไม่สำเร็จ" detail={localError || error} />}
      <button className="save" onClick={submit} disabled={busy}>
        {busy ? "กำลังบันทึก..." : "บันทึก"}
      </button>
    </PageFrame>
  );
}
// Deleting the account cannot be undone, so it takes more than one tap: the
// dialog says exactly what goes, points at the CSV export first, and its
// button stays shut until DELETE_ACCOUNT_CONFIRM_TEXT has been typed. It
// only asks; page.tsx does the delete and keeps the dialog open on failure.
export function ConfirmDeleteAccount({
  busy,
  error,
  onCancel,
  onConfirm,
  closing,
}: {
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
  closing?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const cancel = () => { if (!busy) onCancel(); };
  useEscapeToClose(cancel);
  const dialogRef = useFocusTrap<HTMLElement>(!closing);
  const matches = typed.trim() === DELETE_ACCOUNT_CONFIRM_TEXT;

  return (
    <div className={`dialog-backdrop ${closing ? "closing" : ""}`} onMouseDown={cancel}>
      <section
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        tabIndex={-1}
        className={`confirm-dialog delete-account-dialog ${closing ? "closing" : ""}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="delete-account-title">ลบบัญชีถาวร?</h2>
        <p>
          รายการ กระเป๋าเงิน หนี้ บิล งบ เป้าหมาย พอร์ต และประวัติแชททั้งหมดจะถูกลบทันที
          และกู้คืนไม่ได้ ถ้าอยากเก็บไว้ ส่งออกเป็น CSV ที่ &ldquo;ส่งออกรีพอร์ท&rdquo; ก่อน
        </p>
        <label className="delete-account-field">
          พิมพ์ &ldquo;{DELETE_ACCOUNT_CONFIRM_TEXT}&rdquo; เพื่อยืนยัน
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </label>
        {error && <p className="delete-account-error" role="alert">{error}</p>}
        <div>
          <button onClick={cancel} disabled={busy}>ยกเลิก</button>
          <button className="danger" onClick={onConfirm} disabled={!matches || busy}>
            {busy ? "กำลังลบ..." : "ลบบัญชีถาวร"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function ConfirmLogout({ onCancel, onConfirm, closing }: { onCancel: () => void; onConfirm: () => void; closing?: boolean }) {
  useEscapeToClose(onCancel);
  const dialogRef = useFocusTrap<HTMLElement>(!closing);

  return (
    <div className={`dialog-backdrop ${closing ? "closing" : ""}`} onMouseDown={onCancel}>
      <section
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        tabIndex={-1}
        className={`confirm-dialog ${closing ? "closing" : ""}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
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
