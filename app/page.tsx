"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Entry = { id: string | number; title: string; category: string; amount: number; type: "expense" | "income"; time: string; occurred_at?: string };
const categories = ["อาหาร", "เดินทาง", "ของใช้", "ที่อยู่อาศัย", "สุขภาพ", "บันเทิง", "รายได้", "อื่น ๆ"];
const icon = (category: string) => category === "อาหาร" ? "🍜" : category === "เดินทาง" ? "🚕" : category === "รายได้" ? "💼" : "🧾";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<"home" | "add" | "history">("home");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState("วันนี้กินข้าว 120 บาท แล้วนั่งรถกลับบ้าน 85 บาท");
  const [drafts, setDrafts] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    supabase.auth.getUser().then(({ data }) => { setUser(data.user); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !supabase) return;
    supabase.from("transactions").select("id,title,category,amount,kind,occurred_at").order("occurred_at", { ascending: false }).then(({ data, error }) => {
      if (error) return setError(error.message);
      setEntries((data ?? []).map(r => ({ id:r.id, title:r.title, category:r.category, amount:Number(r.amount), type:r.kind, occurred_at:r.occurred_at, time:new Date(r.occurred_at).toLocaleString("th-TH", { dateStyle:"medium", timeStyle:"short" }) })) as Entry[]);
    });
  }, [user]);

  const expense = useMemo(() => entries.filter(e => e.type === "expense").reduce((s,e) => s + e.amount, 0), [entries]);
  const income = useMemo(() => entries.filter(e => e.type === "income").reduce((s,e) => s + e.amount, 0), [entries]);

  async function analyze() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/analyze", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ text, timezone:Intl.DateTimeFormat().resolvedOptions().timeZone }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDrafts(data.items.map((x: { title:string; category:string; amount:number; type:"income"|"expense"; date:string }, i:number) => ({ ...x, id:Date.now()+i, occurred_at:`${x.date}T12:00:00`, time:"รอตรวจสอบ" })));
    } catch (e) { setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด"); }
    setBusy(false);
  }

  async function saveAll() {
    if (!supabase || !user) return;
    setBusy(true); setError("");
    const { data, error } = await supabase.from("transactions").insert(drafts.map(x => ({ user_id:user.id, title:x.title, category:x.category, amount:x.amount, kind:x.type, occurred_at:x.occurred_at, source_text:text }))).select("id,title,category,amount,kind,occurred_at");
    if (error) setError(error.message);
    else {
      const saved = (data ?? []).map(r => ({ id:r.id, title:r.title, category:r.category, amount:Number(r.amount), type:r.kind, occurred_at:r.occurred_at, time:"เมื่อสักครู่" })) as Entry[];
      setEntries(old => [...saved, ...old]); setDrafts([]); setText(""); setTab("home");
    }
    setBusy(false);
  }

  if (!ready) return <main className="shell"><section className="phone auth-screen">กำลังเตรียมบัญชี…</section></main>;
  if (!user) return <Auth />;

  return <main className="shell"><section className="phone">
    <header className="topbar"><div><p className="eyebrow">สวัสดี</p><h1>เงินของฉัน</h1></div><button className="avatar" onClick={() => supabase?.auth.signOut()} title="ออกจากระบบ">{user.email?.[0].toUpperCase()}</button></header>
    {tab === "home" && <div className="view">
      <section className="balance-card"><div className="balance-head"><span>ยอดคงเหลือทั้งหมด</span><span className="sync">● ซิงก์แล้ว</span></div><strong>฿{(income-expense).toLocaleString("th-TH")}</strong><div className="balance-stats"><div><span className="dot income"/>รายรับ <b>฿{income.toLocaleString("th-TH")}</b></div><div><span className="dot expense"/>รายจ่าย <b>฿{expense.toLocaleString("th-TH")}</b></div></div></section>
      <button className="ai-card" onClick={() => setTab("add")}><span className="spark">✦</span><span><b>เล่าให้ AI ฟัง</b><small>พิมพ์หลายรายการพร้อมกันได้</small></span><span className="arrow">›</span></button>
      {error && <p className="error-box">{error}</p>}
      <div className="section-title"><h2>รายการล่าสุด</h2><button onClick={() => setTab("history")}>ดูทั้งหมด</button></div><EntryList entries={entries.slice(0,5)} />
      {!entries.length && <div className="tips"><b>ยังไม่มีรายการ</b><p>แตะ “เล่าให้ AI ฟัง” เพื่อเริ่มบันทึกครั้งแรก</p></div>}
    </div>}
    {tab === "add" && <div className="view add-view">
      <div className="add-title"><button onClick={() => setTab("home")}>‹</button><div><p className="eyebrow">บันทึกแบบรวดเร็ว</p><h2>วันนี้มีรายการอะไรบ้าง?</h2></div></div>
      <div className="ai-input-wrap"><textarea value={text} onChange={e => setText(e.target.value)} placeholder="เช่น วันนี้กินข้าว 120 บาท เติมน้ำมัน 800 บาท"/><div className="input-tools"><span>Gemini จะช่วยแยกและจัดหมวดหมู่</span><span>✦</span></div></div>
      <button className="primary" onClick={analyze} disabled={busy || !text.trim()}>{busy ? "กำลังวิเคราะห์…" : "✦ ให้ AI แยกรายการ"}</button>
      {error && <p className="error-box">{error}</p>}
      {!!drafts.length && <section className="review"><div className="review-head"><div><h3>ตรวจสอบก่อนบันทึก</h3><p>พบ {drafts.length} รายการ • แก้ไขได้ก่อนยืนยัน</p></div><span>AI</span></div>
        {drafts.map((d,i) => <div className="draft" key={d.id}><span className="cat-icon">{icon(d.category)}</span><div><input value={d.title} onChange={e => setDrafts(ds => ds.map((x,n) => n===i?{...x,title:e.target.value}:x))}/><select value={d.category} onChange={e => setDrafts(ds => ds.map((x,n) => n===i?{...x,category:e.target.value}:x))}>{categories.map(c => <option key={c}>{c}</option>)}</select></div><label>฿<input inputMode="decimal" value={d.amount} onChange={e => setDrafts(ds => ds.map((x,n) => n===i?{...x,amount:Number(e.target.value)}:x))}/></label></div>)}
        <button className="save" onClick={saveAll} disabled={busy}>บันทึก {drafts.length} รายการ</button><p className="privacy">บันทึกเฉพาะหลังจากคุณตรวจสอบและกดยืนยัน</p>
      </section>}
    </div>}
    {tab === "history" && <div className="view history-view"><div className="add-title"><button onClick={() => setTab("home")}>‹</button><div><p className="eyebrow">ข้อมูลที่ซิงก์แล้ว</p><h2>รายการทั้งหมด</h2></div></div><EntryList entries={entries}/></div>}
    <nav className="bottom-nav"><button className={tab==="home"?"active":""} onClick={() => setTab("home")}><span>⌂</span>หน้าหลัก</button><button className="add-button" onClick={() => setTab("add")}><span>＋</span></button><button className={tab==="history"?"active":""} onClick={() => setTab("history")}><span>▤</span>รายการ</button></nav>
  </section></main>;
}

function Auth() {
  const [email,setEmail] = useState(""); const [busy,setBusy] = useState(false); const [message,setMessage] = useState("");
  async function submit(e:React.FormEvent) { e.preventDefault(); setBusy(true); const { error } = await supabase!.auth.signInWithOtp({ email, options:{ emailRedirectTo:window.location.origin } }); setMessage(error?error.message:"ส่งลิงก์เข้าใช้งานแล้ว กรุณาตรวจอีเมลของคุณ"); setBusy(false); }
  return <main className="shell"><section className="phone auth-screen"><div className="auth-mark">฿</div><p className="eyebrow">รายรับรายจ่ายที่เข้าใจคุณ</p><h1>เงินของฉัน</h1><p className="auth-copy">ให้ AI ช่วยแยกรายการ แล้วซิงก์ข้อมูลอย่างปลอดภัยทุกเครื่อง</p><form onSubmit={submit}><label htmlFor="email">อีเมล</label><input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com"/><button className="primary" disabled={busy}>{busy?"กำลังส่ง…":"ส่งลิงก์เข้าใช้งาน"}</button></form>{message&&<p className="auth-message">{message}</p>}<small>ไม่ต้องจำรหัสผ่าน เราจะส่งลิงก์เข้าใช้งานให้ทางอีเมล</small></section></main>;
}

function EntryList({entries}:{entries:Entry[]}) { return <div className="entry-list">{entries.map(e => <article className="entry" key={e.id}><span className="entry-icon">{icon(e.category)}</span><div><b>{e.title}</b><small>{e.category} • {e.time}</small></div><strong className={e.type}>{e.type==="expense"?"−":"+"}฿{e.amount.toLocaleString("th-TH")}</strong></article>)}</div>; }
