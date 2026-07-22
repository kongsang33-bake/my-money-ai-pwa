"use client";

import { useEffect, useMemo, useState } from "react";
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
  occurred_at: string;
  source_text?: string | null;
};

const categories = ["อาหาร", "เดินทาง", "ของใช้", "ที่อยู่อาศัย", "สุขภาพ", "บันเทิง", "รายได้", "บิลประจำ", "อื่น ๆ"];

const transactionTypeLabels: Record<TransactionType, string> = {
  income: "รายรับ",
  personal_expense: "จ่ายเอง",
  lend: "ออกให้ก่อน",
  split_half: "หารกับแฟน",
  debt_repayment: "แฟนคืนเงิน",
  gift: "เลี้ยงแฟน",
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
  if (category === "บิลประจำ") return "▤";
  return "▣";
};

const monthKey = (date: Date) => date.toISOString().slice(0, 7);
const formatMoney = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const formatSignedMoney = (value: number) => `${value >= 0 ? "+" : "−"}฿${formatMoney(Math.abs(value))}`;
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
  const impacts = calculateImpacts(Number(input.amount), transaction_type);
  return {
    ...input,
    type: transactionKind[transaction_type],
    transaction_type,
    wallet_impact: input.wallet_impact ?? impacts.wallet_impact,
    debt_impact: input.debt_impact ?? impacts.debt_impact,
    user_share: input.user_share ?? impacts.user_share,
    partner_share: input.partner_share ?? impacts.partner_share,
  };
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState("วันนี้กินข้าว 140 บาท หารกับแฟน แล้วเติมน้ำมัน 800 บาท");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [settlementAmount, setSettlementAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()));

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setEntries([]);
      return;
    }
    void loadEntries();
  }, [user]);

  async function loadEntries() {
    if (!supabase || !user) return;

    const { data, error } = await supabase
      .from("transactions")
      .select("id,title,category,amount,kind,transaction_type,wallet_impact,debt_impact,user_share,partner_share,occurred_at,source_text")
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
          occurred_at: row.occurred_at,
          source_text: row.source_text,
        }),
      ),
    );
  }

  const mainWallet = useMemo(() => entries.reduce((sum, entry) => sum + entry.wallet_impact, 0), [entries]);
  const partnerDebt = useMemo(() => entries.reduce((sum, entry) => sum + entry.debt_impact, 0), [entries]);

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

  async function analyze() {
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setDrafts(
        data.items.map((item: { title: string; category: string; amount: number; transaction_type: TransactionType; date: string }, index: number) =>
          normalizeEntry({
            id: `${Date.now()}-${index}`,
            title: item.title,
            category: item.category,
            amount: item.amount,
            transaction_type: item.transaction_type,
            occurred_at: fromDateInput(item.date),
            source_text: text,
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
      setSettlementAmount("");
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

  async function settleDebt(full = false) {
    const amount = full ? partnerDebt : Number(settlementAmount);
    if (!amount || amount <= 0) return;

    await saveEntries([
      normalizeEntry({
        id: `${Date.now()}-settle`,
        title: full ? "แฟนโอนคืนทั้งหมด" : "แฟนโอนคืนบางส่วน",
        category: "รายได้",
        amount: Math.min(amount, Math.max(partnerDebt, amount)),
        transaction_type: "debt_repayment",
        occurred_at: fromDateInput(new Date().toISOString().slice(0, 10)),
        source_text: "quick settlement",
      }),
    ]);
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
          <button className="avatar" onClick={() => supabase?.auth.signOut()} title="ออกจากระบบ">
            {user.email?.[0].toUpperCase()}
          </button>
        </header>

        {tab === "home" && (
          <div className="view">
            <section className="wallet-grid">
              <div className="wallet-card primary-wallet">
                <span>เงินพร้อมใช้สุทธิ</span>
                <strong>฿{formatMoney(mainWallet)}</strong>
              </div>
              <div className="wallet-card debt-wallet">
                <span>แฟนค้างชำระ</span>
                <strong>฿{formatMoney(Math.max(0, partnerDebt))}</strong>
              </div>
            </section>

            <section className="settlement-card">
              <div>
                <b>Quick Settlement</b>
                <small>บันทึกเงินที่แฟนโอนคืน แล้วลดยอดค้างให้อัตโนมัติ</small>
              </div>
              <div className="settlement-actions">
                <input inputMode="decimal" placeholder="ยอดคืน" value={settlementAmount} onChange={(event) => setSettlementAmount(event.target.value)} />
                <button onClick={() => settleDebt(false)} disabled={busy || !Number(settlementAmount)}>
                  บันทึก
                </button>
                <button onClick={() => settleDebt(true)} disabled={busy || partnerDebt <= 0}>
                  คืนทั้งหมด
                </button>
              </div>
            </section>

            <button className="ai-card" onClick={() => setTab("add")}>
              <span className="spark">AI</span>
              <span>
                <b>เล่าให้ AI ฟัง</b>
                <small>รองรับจ่ายเอง หารแฟน ออกให้ก่อน คืนเงิน</small>
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
                <p className="eyebrow">บันทึกแบบรวดเร็ว</p>
                <h2>วันนี้มีรายการอะไรบ้าง?</h2>
              </div>
            </div>

            <div className="ai-input-wrap">
              <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="เช่น กินข้าว 140 หารกับแฟน เติมน้ำมัน 800 แฟนโอนคืน 500" />
              <div className="input-tools">
                <span>Gemini จะช่วยแยกชนิดรายการตาม logic กระเป๋า</span>
                <span>AI</span>
              </div>
            </div>

            <button className="primary" onClick={analyze} disabled={busy || !text.trim()}>
              {busy ? "กำลังวิเคราะห์..." : "ให้ AI แยกรายการ"}
            </button>
            {error && <p className="error-box">{error}</p>}

            {!!drafts.length && (
              <section className="review">
                <div className="review-head">
                  <div>
                    <h3>ตรวจสอบก่อนบันทึก</h3>
                    <p>พบ {drafts.length} รายการ แก้ชนิดรายการได้ก่อนยืนยัน</p>
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
                <p className="privacy">สูตรคำนวณถูกล็อกในแอพ AI มีหน้าที่ช่วยแยกประเภทเท่านั้น</p>
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

        <nav className="bottom-nav">
          <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}>
            <span>⌂</span>หน้าหลัก
          </button>
          <button className="add-button" onClick={() => setTab("add")}>
            <span>＋</span>
          </button>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>
            <span>▤</span>รายการ
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
  categories,
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
        <Metric label="หนี้แฟนเปลี่ยน" value={debtChange} tone={debtChange >= 0 ? "income" : "expense"} />
      </div>
      <div className="category-bars">
        {categories.length ? (
          categories.map((item) => {
            const max = Math.max(...categories.map((x) => x.amount));
            return (
              <div className="category-bar" key={item.category}>
                <div>
                  <span>{categoryIcon(item.category)}</span>
                  <b>{item.category}</b>
                </div>
                <strong>฿{formatMoney(item.amount)}</strong>
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
      <b>{value < 0 ? "−" : ""}฿{formatMoney(Math.abs(value))}</b>
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
          ฿
          <input inputMode="decimal" value={draft.amount} onChange={(event) => update({ amount: Number(event.target.value) })} />
        </label>
      </div>
      <div className="impact-row">
        <span>กระเป๋า {formatSignedMoney(draft.wallet_impact)}</span>
        <span>หนี้แฟน {formatSignedMoney(draft.debt_impact)}</span>
      </div>
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
      <span>หนี้แฟน {formatSignedMoney(debt)}</span>
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
              {transactionTypeLabels[entry.transaction_type]} • {entry.category} • {formatDateTime(entry.occurred_at)}
            </small>
            <small>
              กระเป๋า {formatSignedMoney(entry.wallet_impact)} • หนี้แฟน {formatSignedMoney(entry.debt_impact)}
            </small>
          </div>
          <strong className={entry.wallet_impact >= 0 ? "income" : "expense"}>{formatSignedMoney(entry.wallet_impact)}</strong>
          <menu>
            <button onClick={() => onEdit(entry)} title="แก้ไข">
              แก้
            </button>
            <button onClick={() => onDelete(entry)} title="ลบ">
              ลบ
            </button>
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
        <label>
          วันที่
          <input type="date" value={toDateInput(entry.occurred_at)} onChange={(event) => update({ occurred_at: fromDateInput(event.target.value) })} />
        </label>

        <div className="draft-impact">
          <span>กระเป๋า {formatSignedMoney(entry.wallet_impact)}</span>
          <span>หนี้แฟน {formatSignedMoney(entry.debt_impact)}</span>
        </div>

        <button className="save" onClick={onSave} disabled={busy || !entry.title.trim() || entry.amount < 0}>
          บันทึกการแก้ไข
        </button>
      </section>
    </div>
  );
}

function totalWallet(entries: Entry[], direction: EntryKind) {
  return entries
    .filter((entry) => (direction === "income" ? entry.wallet_impact > 0 : entry.wallet_impact < 0))
    .reduce((sum, entry) => sum + entry.wallet_impact, 0);
}
