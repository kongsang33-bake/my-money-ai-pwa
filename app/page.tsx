"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type EntryKind = "expense" | "income";
type TransactionType = "income" | "personal_expense" | "lend" | "split_half" | "debt_repayment" | "gift";
type Tab = "home" | "add" | "history";

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

const moneySign = "฿";
const unnamedDebtor = "ไม่ระบุ";
const monthKey = (date: Date) => date.toISOString().slice(0, 7);
const formatMoney = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const formatSignedMoney = (value: number) => `${value >= 0 ? "+" : "−"}${moneySign}${formatMoney(Math.abs(value))}`;
const formatDateTime = (value: string) => new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
const toDateInput = (value: string) => new Date(value).toISOString().slice(0, 10);
const fromDateInput = (value: string) => `${value}T12:00:00`;

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

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [tab, setTab] = useState<Tab>("home");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState("");
  const [slipImages, setSlipImages] = useState<SlipImage[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [debtorsOpen, setDebtorsOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()));

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

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setReady(true);
      if (data.user) void loadEntries();
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) void loadEntries();
      else setEntries([]);
    });
    return () => data.subscription.unsubscribe();
  }, [loadEntries]);

  const mainWallet = useMemo(() => entries.reduce((sum, entry) => sum + entry.wallet_impact, 0), [entries]);
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
  const totalDebt = useMemo(() => debtorSummary.reduce((sum, item) => sum + item.amount, 0), [debtorSummary]);

  const monthlyEntries = useMemo(
    () => entries.filter((entry) => entry.occurred_at.slice(0, 7) === selectedMonth),
    [entries, selectedMonth],
  );
  const monthlyIncome = useMemo(() => totalWallet(monthlyEntries, "income"), [monthlyEntries]);
  const monthlyOutflow = useMemo(() => Math.abs(totalWallet(monthlyEntries, "expense")), [monthlyEntries]);
  const monthlyDebtChange = useMemo(() => monthlyEntries.reduce((sum, entry) => sum + entry.debt_impact, 0), [monthlyEntries]);
  const monthlyBalance = monthlyIncome - monthlyOutflow;

  const categorySummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of monthlyEntries) {
      if (entry.wallet_impact >= 0) continue;
      map.set(entry.category, (map.get(entry.category) ?? 0) + Math.abs(entry.wallet_impact));
    }
    return [...map.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4);
  }, [monthlyEntries]);

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

    const payload = items.map((item) => {
      const normalized = normalizeEntry(item);
      return {
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
      };
    });

    const { error } = await supabase.from("transactions").insert(payload);

    if (error) {
      setError(error.message);
    } else {
      setDrafts([]);
      setText("");
      setSlipImages([]);
      setTab("home");
      await loadEntries();
    }

    setBusy(false);
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

  if (!ready) {
    return (
      <main className="shell">
        <section className="phone auth-screen">กำลังเตรียมบัญชี...</section>
      </main>
    );
  }

  if (!user) return <Auth />;

  return (
    <main className="shell">
      <section className="phone">
        <header className="topbar">
          <div>
            <p className="eyebrow">สวัสดี</p>
            <h1>เงินของฉัน</h1>
          </div>
          <button className="avatar" onClick={() => setProfileOpen(true)} title="โปรไฟล์">
            {user.email?.[0].toUpperCase()}
          </button>
        </header>

        {tab === "home" && (
          <div className="view">
            <section className="wallet-grid single-wallet">
              <div className="wallet-card primary-wallet">
                <span>เงินพร้อมใช้สุทธิ</span>
                <strong>{moneySign}{formatMoney(mainWallet)}</strong>
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
              setSelectedMonth={setSelectedMonth}
              income={monthlyIncome}
              outflow={monthlyOutflow}
              debtChange={monthlyDebtChange}
              balance={monthlyBalance}
              categories={categorySummary}
            />

            <section className="debtor-card">
              <div className="section-title compact-title">
                <h2>ลูกหนี้</h2>
                <button onClick={() => setDebtorsOpen(true)}>ดูทั้งหมด</button>
              </div>
              {debtorSummary.slice(0, 3).map((item) => (
                <div className="debtor-row" key={item.name}>
                  <span>{item.name}</span>
                  <strong>{moneySign}{formatMoney(item.amount)}</strong>
                </div>
              ))}
              {!debtorSummary.length && <p className="empty-note">ยังไม่มียอดลูกหนี้</p>}
              {!!debtorSummary.length && <small className="debtor-total">รวม {moneySign}{formatMoney(totalDebt)} · รายการคืนเงินบันทึกผ่าน AI</small>}
            </section>

            {error && <p className="error-box">{error}</p>}

            <div className="section-title">
              <h2>รายการล่าสุด</h2>
              <button onClick={() => setTab("history")}>ดูทั้งหมด</button>
            </div>
            <EntryList entries={entries.slice(0, 5)} onEdit={setEditing} onDelete={deleteEntry} />
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
                  <DraftRow key={draft.id} draft={draft} onChange={(next) => setDrafts((items) => items.map((item, i) => (i === index ? next : item)))} />
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
            </div>
            <MonthSummary
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
              income={monthlyIncome}
              outflow={monthlyOutflow}
              debtChange={monthlyDebtChange}
              balance={monthlyBalance}
              categories={categorySummary}
            />
            <EntryList entries={monthlyEntries} onEdit={setEditing} onDelete={deleteEntry} />
          </div>
        )}

        {editing && <EditSheet entry={editing} busy={busy} onChange={setEditing} onClose={() => setEditing(null)} onSave={updateEntry} />}
        {debtorsOpen && <DebtorSheet debtors={debtorSummary} onClose={() => setDebtorsOpen(false)} />}
        {profileOpen && <ProfileSheet user={user} onClose={() => setProfileOpen(false)} onLogout={() => { setProfileOpen(false); setLogoutOpen(true); }} />}
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

function MonthSummary({
  selectedMonth,
  setSelectedMonth,
  income,
  outflow,
  debtChange,
  balance,
  categories: categoryItems,
}: {
  selectedMonth: string;
  setSelectedMonth: (value: string) => void;
  income: number;
  outflow: number;
  debtChange: number;
  balance: number;
  categories: { category: string; amount: number }[];
}) {
  return (
    <section className="summary-panel">
      <div className="summary-head">
        <div>
          <p className="eyebrow">สรุปรายเดือน</p>
          <h2>ภาพรวมเดือนนี้</h2>
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
            const max = Math.max(...categoryItems.map((x) => x.amount));
            return (
              <div className="category-bar" key={item.category}>
                <div>
                  <span>{categoryIcon(item.category)}</span>
                  <b>{item.category}</b>
                </div>
                <strong>{moneySign}{formatMoney(item.amount)}</strong>
                <i style={{ width: `${Math.max(8, (item.amount / max) * 100)}%` }} />
              </div>
            );
          })
        ) : (
          <p className="empty-note">ยังไม่มีรายจ่ายในเดือนนี้</p>
        )}
      </div>
    </section>
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

function DraftRow({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
  const update = (patch: Partial<Draft>) => onChange(normalizeEntry({ ...draft, ...patch }));

  return (
    <div className="draft">
      <span className="cat-icon">{categoryIcon(draft.category)}</span>
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
      {(["lend", "split_half", "debt_repayment"] as TransactionType[]).includes(draft.transaction_type) && (
        <input className="draft-date" placeholder="ชื่อผู้เกี่ยวข้อง เช่น แฟน หรือ เพื่อนเอ" value={draft.debtor_name} onChange={(event) => update({ debtor_name: event.target.value })} />
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

function EntryList({ entries, onEdit, onDelete }: { entries: Entry[]; onEdit: (entry: Entry) => void; onDelete: (entry: Entry) => void }) {
  return (
    <div className="entry-list">
      {entries.map((entry) => (
        <article className="entry" key={entry.id}>
          <span className="entry-icon">{categoryIcon(entry.category)}</span>
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
          <menu>
            <button onClick={() => onEdit(entry)} title="แก้ไข">แก้</button>
            <button onClick={() => onDelete(entry)} title="ลบ">ลบ</button>
          </menu>
        </article>
      ))}
      {!entries.length && <p className="empty-note">ยังไม่มีรายการในช่วงนี้</p>}
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

function DebtorSheet({ debtors, onClose }: { debtors: { name: string; amount: number }[]; onClose: () => void }) {
  return (
    <div className="sheet-backdrop">
      <section className="edit-sheet">
        <div className="sheet-head">
          <div>
            <p className="eyebrow">สรุปยอดค้าง</p>
            <h2>ลูกหนี้ทั้งหมด</h2>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        {debtors.map((item) => (
          <div className="debtor-row large" key={item.name}>
            <span>{item.name}</span>
            <strong>{moneySign}{formatMoney(item.amount)}</strong>
          </div>
        ))}
        {!debtors.length && <p className="empty-note">ยังไม่มียอดลูกหนี้</p>}
        <p className="privacy">รายการรับชำระเงินให้พิมพ์ผ่าน AI Chat เช่น “เพื่อนเอโอนคืน 200 บาท”</p>
      </section>
    </div>
  );
}

function ProfileSheet({ user, onClose, onLogout }: { user: User; onClose: () => void; onLogout: () => void }) {
  const metadata = user.user_metadata ?? {};
  const name = metadata.full_name ?? metadata.name ?? "ผู้ใช้";
  const provider = user.app_metadata?.provider ?? "Google";
  return (
    <div className="sheet-backdrop">
      <section className="edit-sheet profile-sheet">
        <div className="sheet-head">
          <div>
            <p className="eyebrow">บัญชีของฉัน</p>
            <h2>โปรไฟล์</h2>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        <div className="profile-head">
          {metadata.avatar_url ? <span className="profile-photo" style={{ backgroundImage: `url(${metadata.avatar_url})` }} aria-label={name} /> : <div className="avatar profile-avatar">{String(name)[0]}</div>}
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
        <button className="logout-button" onClick={onLogout}>ออกจากระบบ</button>
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
