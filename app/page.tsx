"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type EntryKind = "expense" | "income";
type Tab = "home" | "add" | "history";

type Entry = {
  id: string;
  title: string;
  category: string;
  amount: number;
  type: EntryKind;
  occurred_at: string;
  source_text?: string | null;
};

type Draft = Omit<Entry, "id"> & { id: string };

const categories = ["อาหาร", "เดินทาง", "ของใช้", "ที่อยู่อาศัย", "สุขภาพ", "บันเทิง", "รายได้", "อื่น ๆ"];

const categoryIcon = (category: string) => {
  if (category === "อาหาร") return "🍜";
  if (category === "เดินทาง") return "🚕";
  if (category === "รายได้") return "💼";
  if (category === "สุขภาพ") return "✚";
  return "▣";
};

const todayDate = () => new Date().toISOString().slice(0, 10);
const monthKey = (date: Date) => date.toISOString().slice(0, 7);
const formatMoney = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const formatDateTime = (value: string) => new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
const toDateInput = (value: string) => new Date(value).toISOString().slice(0, 10);
const fromDateInput = (value: string) => `${value}T12:00:00`;

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState("วันนี้กินข้าว 120 บาท แล้วนั่งรถกลับบ้าน 85 บาท");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<Entry | null>(null);
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

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

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
      .select("id,title,category,amount,kind,occurred_at,source_text")
      .order("occurred_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    setEntries(
      (data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        category: row.category,
        amount: Number(row.amount),
        type: row.kind,
        occurred_at: row.occurred_at,
        source_text: row.source_text,
      })),
    );
  }

  const allIncome = useMemo(() => totalByType(entries, "income"), [entries]);
  const allExpense = useMemo(() => totalByType(entries, "expense"), [entries]);

  const monthlyEntries = useMemo(
    () => entries.filter((entry) => entry.occurred_at.slice(0, 7) === selectedMonth),
    [entries, selectedMonth],
  );
  const monthlyIncome = useMemo(() => totalByType(monthlyEntries, "income"), [monthlyEntries]);
  const monthlyExpense = useMemo(() => totalByType(monthlyEntries, "expense"), [monthlyEntries]);
  const monthlyBalance = monthlyIncome - monthlyExpense;

  const categorySummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of monthlyEntries) {
      if (entry.type !== "expense") continue;
      map.set(entry.category, (map.get(entry.category) ?? 0) + entry.amount);
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
        body: JSON.stringify({
          text,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setDrafts(
        data.items.map((item: { title: string; category: string; amount: number; type: EntryKind; date: string }, index: number) => ({
          id: `${Date.now()}-${index}`,
          title: item.title,
          category: item.category,
          amount: item.amount,
          type: item.type,
          occurred_at: fromDateInput(item.date),
          source_text: text,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }

    setBusy(false);
  }

  async function saveAll() {
    if (!supabase || !user || !drafts.length) return;

    setBusy(true);
    setError("");

    const payload = drafts.map((draft) => ({
      user_id: user.id,
      title: draft.title.trim(),
      category: draft.category,
      amount: draft.amount,
      kind: draft.type,
      occurred_at: draft.occurred_at,
      source_text: draft.source_text,
    }));

    const { error } = await supabase.from("transactions").insert(payload);

    if (error) {
      setError(error.message);
    } else {
      setDrafts([]);
      setText("");
      setTab("home");
      await loadEntries();
    }

    setBusy(false);
  }

  async function updateEntry() {
    if (!supabase || !editing) return;

    setBusy(true);
    setError("");

    const { error } = await supabase
      .from("transactions")
      .update({
        title: editing.title.trim(),
        category: editing.category,
        amount: editing.amount,
        kind: editing.type,
        occurred_at: editing.occurred_at,
      })
      .eq("id", editing.id);

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

    if (error) {
      setError(error.message);
    } else {
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      if (editing?.id === entry.id) setEditing(null);
    }

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
          <button className="avatar" onClick={() => supabase?.auth.signOut()} title="ออกจากระบบ">
            {user.email?.[0].toUpperCase()}
          </button>
        </header>

        {tab === "home" && (
          <div className="view">
            <section className="balance-card">
              <div className="balance-head">
                <span>ยอดคงเหลือทั้งหมด</span>
                <span className="sync">ซิงก์แล้ว</span>
              </div>
              <strong>฿{formatMoney(allIncome - allExpense)}</strong>
              <div className="balance-stats">
                <div>
                  <span className="dot income" />
                  รายรับ <b>฿{formatMoney(allIncome)}</b>
                </div>
                <div>
                  <span className="dot expense" />
                  รายจ่าย <b>฿{formatMoney(allExpense)}</b>
                </div>
              </div>
            </section>

            <button className="ai-card" onClick={() => setTab("add")}>
              <span className="spark">AI</span>
              <span>
                <b>เล่าให้ AI ฟัง</b>
                <small>พิมพ์หลายรายการพร้อมกันได้</small>
              </span>
              <span className="arrow">›</span>
            </button>

            <MonthSummary
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
              income={monthlyIncome}
              expense={monthlyExpense}
              balance={monthlyBalance}
              categories={categorySummary}
            />

            {error && <p className="error-box">{error}</p>}

            <div className="section-title">
              <h2>รายการล่าสุด</h2>
              <button onClick={() => setTab("history")}>ดูทั้งหมด</button>
            </div>
            <EntryList entries={entries.slice(0, 5)} onEdit={setEditing} onDelete={deleteEntry} />
            {!entries.length && (
              <div className="tips">
                <b>ยังไม่มีรายการ</b>
                <p>แตะ “เล่าให้ AI ฟัง” เพื่อเริ่มบันทึกครั้งแรก</p>
              </div>
            )}
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
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="เช่น วันนี้กินข้าว 120 บาท เติมน้ำมัน 800 บาท"
              />
              <div className="input-tools">
                <span>Gemini จะช่วยแยกและจัดหมวดหมู่</span>
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
                    <p>พบ {drafts.length} รายการ แก้ไขได้ก่อนยืนยัน</p>
                  </div>
                  <span>AI</span>
                </div>
                {drafts.map((draft, index) => (
                  <DraftRow key={draft.id} draft={draft} onChange={(next) => setDrafts((items) => items.map((item, i) => (i === index ? next : item)))} />
                ))}
                <button className="save" onClick={saveAll} disabled={busy}>
                  บันทึก {drafts.length} รายการ
                </button>
                <p className="privacy">บันทึกเฉพาะหลังจากคุณตรวจสอบและกดยืนยัน</p>
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
              expense={monthlyExpense}
              balance={monthlyBalance}
              categories={categorySummary}
            />
            <EntryList entries={monthlyEntries} onEdit={setEditing} onDelete={deleteEntry} />
          </div>
        )}

        {editing && (
          <EditSheet
            entry={editing}
            busy={busy}
            onChange={setEditing}
            onClose={() => setEditing(null)}
            onSave={updateEntry}
          />
        )}

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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);

    const { error } = await supabase!.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });

    setMessage(error ? error.message : "ส่งลิงก์เข้าใช้งานแล้ว กรุณาตรวจอีเมลของคุณ");
    setBusy(false);
  }

  return (
    <main className="shell">
      <section className="phone auth-screen">
        <div className="auth-mark">฿</div>
        <p className="eyebrow">รายรับรายจ่ายที่เข้าใจคุณ</p>
        <h1>เงินของฉัน</h1>
        <p className="auth-copy">ให้ AI ช่วยแยกรายการ แล้วซิงก์ข้อมูลอย่างปลอดภัยทุกเครื่อง</p>
        <form onSubmit={submit}>
          <label htmlFor="email">อีเมล</label>
          <input id="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
          <button className="primary" disabled={busy}>
            {busy ? "กำลังส่ง..." : "ส่งลิงก์เข้าใช้งาน"}
          </button>
        </form>
        {message && <p className="auth-message">{message}</p>}
        <small>ไม่ต้องจำรหัสผ่าน เราจะส่งลิงก์เข้าใช้งานให้ทางอีเมล</small>
      </section>
    </main>
  );
}

function MonthSummary({
  selectedMonth,
  setSelectedMonth,
  income,
  expense,
  balance,
  categories,
}: {
  selectedMonth: string;
  setSelectedMonth: (value: string) => void;
  income: number;
  expense: number;
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
        <Metric label="รับ" value={income} tone="income" />
        <Metric label="จ่าย" value={expense} tone="expense" />
        <Metric label="สุทธิ" value={balance} tone={balance >= 0 ? "income" : "expense"} />
      </div>
      <div className="category-bars">
        {categories.length ? (
          categories.map((item) => (
            <div className="category-bar" key={item.category}>
              <div>
                <span>{categoryIcon(item.category)}</span>
                <b>{item.category}</b>
              </div>
              <strong>฿{formatMoney(item.amount)}</strong>
              <i style={{ width: `${Math.max(8, (item.amount / Math.max(...categories.map((x) => x.amount))) * 100)}%` }} />
            </div>
          ))
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
      <b>฿{formatMoney(Math.abs(value))}</b>
    </div>
  );
}

function DraftRow({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
  return (
    <div className="draft">
      <span className="cat-icon">{categoryIcon(draft.category)}</span>
      <div>
        <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} />
        <select value={draft.category} onChange={(event) => onChange({ ...draft, category: event.target.value })}>
          {categories.map((category) => (
            <option key={category}>{category}</option>
          ))}
        </select>
      </div>
      <div className="draft-side">
        <select value={draft.type} onChange={(event) => onChange({ ...draft, type: event.target.value as EntryKind })}>
          <option value="expense">จ่าย</option>
          <option value="income">รับ</option>
        </select>
        <label>
          ฿
          <input inputMode="decimal" value={draft.amount} onChange={(event) => onChange({ ...draft, amount: Number(event.target.value) })} />
        </label>
      </div>
      <input className="draft-date" type="date" value={toDateInput(draft.occurred_at)} onChange={(event) => onChange({ ...draft, occurred_at: fromDateInput(event.target.value) })} />
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
              {entry.category} • {formatDateTime(entry.occurred_at)}
            </small>
          </div>
          <strong className={entry.type}>
            {entry.type === "expense" ? "−" : "+"}฿{formatMoney(entry.amount)}
          </strong>
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
          <input value={entry.title} onChange={(event) => onChange({ ...entry, title: event.target.value })} />
        </label>
        <label>
          หมวดหมู่
          <select value={entry.category} onChange={(event) => onChange({ ...entry, category: event.target.value })}>
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <label>
          ประเภท
          <select value={entry.type} onChange={(event) => onChange({ ...entry, type: event.target.value as EntryKind })}>
            <option value="expense">รายจ่าย</option>
            <option value="income">รายรับ</option>
          </select>
        </label>
        <label>
          จำนวนเงิน
          <input inputMode="decimal" value={entry.amount} onChange={(event) => onChange({ ...entry, amount: Number(event.target.value) })} />
        </label>
        <label>
          วันที่
          <input type="date" value={toDateInput(entry.occurred_at)} onChange={(event) => onChange({ ...entry, occurred_at: fromDateInput(event.target.value) })} />
        </label>

        <button className="save" onClick={onSave} disabled={busy || !entry.title.trim() || entry.amount < 0}>
          บันทึกการแก้ไข
        </button>
      </section>
    </div>
  );
}

function totalByType(entries: Entry[], type: EntryKind) {
  return entries.filter((entry) => entry.type === type).reduce((sum, entry) => sum + entry.amount, 0);
}
