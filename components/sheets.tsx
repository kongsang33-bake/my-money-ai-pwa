"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import type { User } from "@supabase/supabase-js";
import {
  Check,
  Copy,
  Download,
  Lightbulb,
  LineChart,
  Lock,
  Moon,
  PiggyBank,
  Receipt,
  Sun,
  Trash2,
  TrendingUp,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AI_CHAT_MESSAGE_COLUMNS, MONTH_START_DAY_MAX, MONTH_START_DAY_MIN, TABLES } from "@/lib/constants";
import { authHeaders } from "@/lib/api";
import { formatMoney, formatSignedMoney, moneySign, clampInteger } from "@/lib/format";
import { entriesInRange, reportBounds, reportLabel } from "@/lib/cycle";
import { totalWallet } from "@/lib/money";
import { buildReportCsv, downloadCsv } from "@/lib/csv";
import { compressProfileImage } from "@/lib/image";
import { nameInitial } from "@/lib/category";
import type { AiChatMessage, AiFinanceContext, Entry, NetWorthDisplaySettings, Profile, ReportPeriod, Theme, Wallet } from "@/lib/types";
import { SheetFrame, StateCard, useEscapeToClose, useFocusTrap } from "@/components/primitives";

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

export function AskFinanceSheet({ context, userId, onClose, closing }: { context: AiFinanceContext; userId: string; onClose: () => void; closing?: boolean }) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { setLoadingHistory(false); return; }
      const { data, error: loadError } = await supabase
        .from(TABLES.aiChatMessages)
        .select(AI_CHAT_MESSAGE_COLUMNS)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (loadError) setError(loadError.message);
      else setMessages((data ?? []) as AiChatMessage[]);
      setLoadingHistory(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, busy]);

  const ask = async () => {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setBusy(true); setError("");
    const userMessage: AiChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMessage]);
    setQuestion("");
    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    try {
      const response = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ question: trimmed, context, history }) });
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

  return <SheetFrame onClose={onClose} className="edit-sheet ask-ai-sheet" closing={closing}>
    <div className="sheet-head">
      <div><p className="eyebrow">ผู้ช่วยการเงิน</p><h2>ถาม AI เรื่องเงิน</h2></div>
      <div className="ask-ai-head-actions">
        {messages.length > 0 && <button className="ask-ai-reset" onClick={() => { void resetChat(); }} aria-label="เริ่มแชทใหม่"><Trash2 size={16} strokeWidth={2.25} /></button>}
        <button onClick={onClose}>×</button>
      </div>
    </div>
    <p className="ask-ai-period">อ้างอิงตัวเลขที่แอปคำนวณไว้ใน{context.periodLabel}</p>
    {messages.length === 0 && (
      <div className="ask-ai-examples"><span>ลองถาม</span><button onClick={() => setQuestion("เดือนนี้ฉันใช้เงินกับหมวดไหนมากที่สุด")}>หมวดไหนใช้เยอะสุด</button><button onClick={() => setQuestion("ช่วงนี้เงินของฉันเหลือเป็นอย่างไร")}>เงินเหลือเป็นอย่างไร</button></div>
    )}
    <div className="ask-ai-thread" ref={threadRef}>
      {loadingHistory && <p className="ask-ai-thread-hint">กำลังโหลดประวัติแชท...</p>}
      {!loadingHistory && messages.length === 0 && <p className="ask-ai-thread-hint">เริ่มถาม AI เรื่องการเงินของคุณได้เลย</p>}
      {messages.map((message) => (
        <div key={message.id} className={`ask-ai-bubble ${message.role}`}>
          <p>{message.content}</p>
          <button className="ask-ai-copy" onClick={() => { void copyMessage(message); }} aria-label="คัดลอกข้อความ">
            {copiedId === message.id ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={2.25} />}
          </button>
        </div>
      ))}
      {busy && <div className="ask-ai-bubble assistant pending"><p>กำลังวิเคราะห์...</p></div>}
    </div>
    {error && <StateCard tone="error" title="ถาม AI ไม่สำเร็จ" detail={error} />}
    <textarea className="ask-ai-input" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="เช่น เดือนนี้มีรายจ่ายอะไรที่ควรระวังบ้าง" />
    <button className="save" onClick={() => { void ask(); }} disabled={busy || !question.trim()}>{busy ? "กำลังวิเคราะห์..." : "ถาม AI"}</button>
  </SheetFrame>;
}

export function ReportExportSheet({
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
    <SheetFrame onClose={onClose} className="edit-sheet report-sheet" closing={closing}>
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
        <input placeholder=" " type="number" min={2000} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} />
        <span>เลือกปี</span>
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
    </SheetFrame>
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

export function SideMenu({
  user,
  profile,
  onClose,
  onLogout,
  onOpenProfile,
  onOpenBudgets,
  onOpenReport,
  onOpenAsk,
  onOpenPin,
  theme,
  onSetTheme,
  closing,
}: {
  user: User;
  profile: Profile | null;
  onClose: () => void;
  onLogout: () => void;
  onOpenProfile: () => void;
  onOpenBudgets: () => void;
  onOpenReport: () => void;
  onOpenAsk: () => void;
  onOpenPin: () => void;
  theme: Theme;
  onSetTheme: (theme: Theme) => void;
  closing?: boolean;
}) {
  const metadata = user.user_metadata ?? {};
  const name = profile?.nickname || metadata.full_name || metadata.name || "ผู้ใช้";
  const appIcon = profile?.app_icon || user.email?.[0]?.toUpperCase() || "฿";
  const appIconImage = profile?.app_icon_image || "";

  useEscapeToClose(onClose);
  const asideRef = useFocusTrap<HTMLElement>(!closing);

  return (
    <div className={`side-menu-backdrop ${closing ? "closing" : ""}`} onClick={onClose}>
      <aside
        ref={asideRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`side-menu ${closing ? "closing" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
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
            <p>เครื่องมือ</p>
            <button onClick={onOpenBudgets}>
              <TrendingUp size={16} strokeWidth={2.25} aria-hidden="true" />
              <span>งบประมาณ</span>
            </button>
            <button onClick={onOpenAsk}>
              <Lightbulb size={16} strokeWidth={2.25} aria-hidden="true" />
              <span>ถาม AI เรื่องเงิน</span>
            </button>
            <button onClick={onOpenReport}>
              <Download size={16} strokeWidth={2.25} aria-hidden="true" />
              <span>ส่งออกรีพอร์ท</span>
            </button>
          </div>
          <div className="side-menu-section">
            <p>ตั้งค่า</p>
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

export function MoreSheet({
  onClose,
  onOpenDebtors,
  onOpenRecurring,
  onOpenGoals,
  onOpenPortfolio,
  receivableTotal,
  payableTotal,
  recurringTotal,
  portfolioTotal,
  closing,
}: {
  onClose: () => void;
  onOpenDebtors: () => void;
  onOpenRecurring: () => void;
  onOpenGoals: () => void;
  onOpenPortfolio: () => void;
  receivableTotal: number;
  payableTotal: number;
  recurringTotal: number;
  portfolioTotal: number;
  closing?: boolean;
}) {
  const debtNet = receivableTotal - payableTotal;
  return (
    <SheetFrame onClose={onClose} className="edit-sheet more-sheet" closing={closing}>
      <div className="sheet-head">
        <div>
          <p className="eyebrow">เพิ่มเติม</p>
          <h2>ฟีเจอร์ทั้งหมด</h2>
        </div>
        <button onClick={onClose} aria-label="ปิด">×</button>
      </div>
      <div className="more-grid">
        <button onClick={onOpenDebtors}>
          <span className="more-tile-icon"><Users size={20} strokeWidth={2.25} aria-hidden="true" /></span>
          <span>จัดการหนี้</span>
          <b>{debtNet < 0 ? "−" : ""}{moneySign}{formatMoney(Math.abs(debtNet))}</b>
        </button>
        <button onClick={onOpenRecurring}>
          <span className="more-tile-icon"><Receipt size={20} strokeWidth={2.25} aria-hidden="true" /></span>
          <span>รายจ่ายประจำ</span>
          <b>{moneySign}{formatMoney(recurringTotal)}</b>
        </button>
        <button onClick={onOpenGoals}>
          <span className="more-tile-icon"><PiggyBank size={20} strokeWidth={2.25} aria-hidden="true" /></span>
          <span>เป้าหมายการเงิน</span>
        </button>
        <button onClick={onOpenPortfolio}>
          <span className="more-tile-icon"><LineChart size={20} strokeWidth={2.25} aria-hidden="true" /></span>
          <span>พอร์ตลงทุน</span>
          <b>{moneySign}{formatMoney(portfolioTotal)}</b>
        </button>
      </div>
    </SheetFrame>
  );
}

export function ProfileEditSheet({
  profile,
  busy,
  error,
  onClose,
  onSave,
  closing,
  netWorthDisplay,
  onSaveNetWorthDisplay,
}: {
  profile: Profile | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (next: { nickname: string; app_icon: string; app_icon_image: string; month_start_day: number }) => Promise<boolean>;
  closing?: boolean;
  netWorthDisplay: NetWorthDisplaySettings;
  onSaveNetWorthDisplay: (next: NetWorthDisplaySettings) => void;
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
        <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="เช่น ก้อง" />
        <span>ชื่อเล่น</span>
      </label>
      <label>
        เปลี่ยนรูปโปรไฟล์
        <input type="file" accept="image/*" onChange={(event) => { void chooseProfileImage(event.target.files); event.currentTarget.value = ""; }} />
        <small>รองรับรูปจากมือถือได้ถึง 10MB ระบบจะย่อเป็นไอคอนให้อัตโนมัติ</small>
      </label>
      {!!app_icon_image && <button className="side-ghost" onClick={() => setAppIconImage("")}>ลบรูปไอคอน</button>}
      <label>
        <input placeholder=" " type="number" min={MONTH_START_DAY_MIN} max={MONTH_START_DAY_MAX} value={month_start_day} onChange={(event) => setMonthStartDay(clampInteger(event.target.value, MONTH_START_DAY_MIN, MONTH_START_DAY_MAX, 1))} />
        <span>วันเริ่มรอบเดือน</span>
      </label>
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
    </SheetFrame>
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
