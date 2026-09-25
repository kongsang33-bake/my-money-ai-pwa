"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bus, ChevronRight, Coffee, Download, Film, HeartPulse, House, KeyRound, Lock, MessageSquareText, MoreVertical, Plane, Plus, PlusSquare, Receipt, Share, ShieldCheck, ShoppingBag, Split, Utensils, Wallet, CalendarClock, Camera } from "lucide-react";
import { APP_NAME, PRIVACY_CONTACT_EMAIL } from "@/lib/constants";
import Link from "next/link";
import { Rail } from "@/components/primitives";
import { Poster } from "@/components/home";

// What everyone who is not signed in sees, every time: one page that scrolls
// the ordinary way, laid out like Netflix's own front page in the app's
// colours -- a hero over a wall of posters, a glowing arc, a numbered rail of
// what the app does, how the data is kept, how to install it, questions --
// under a nav held at the top with the brand and "เข้าสู่ระบบ". Signing in is
// its own page, /login (components/login.tsx); every way in leads there.

const SECURITY_POINTS = [
  {
    hue: "var(--cat-bills)",
    icon: ShieldCheck,
    title: "ข้อมูลของคุณเห็นได้แค่คุณ",
    detail: "ทุกรายการผูกกับบัญชีของคุณด้วย Row Level Security บัญชีอื่นอ่านหรือแก้ไม่ได้",
  },
  {
    hue: "var(--cat-travel)",
    icon: KeyRound,
    title: "ไม่ต้องตั้งรหัสผ่าน",
    detail: "เข้าด้วย Google หรือลิงก์ทางอีเมล แอพไม่เห็นและไม่เก็บรหัสผ่านของคุณ",
  },
  {
    hue: "var(--cat-goods)",
    icon: Lock,
    title: "ล็อกซ้ำด้วย PIN หรือ Face ID",
    detail: "PIN เก็บเป็นค่า hash ไม่ใช่ตัวเลขจริง ใบหน้าไม่เคยออกจากเครื่อง",
  },
  {
    hue: "var(--cat-entertainment)",
    icon: MessageSquareText,
    title: "AI อ่านเฉพาะตอนที่คุณใช้",
    detail: "ข้อความหรือสลิปที่ส่งให้ AI ประมวลผลโดย Google Gemini และแอพไม่เก็บรูปสลิปไว้",
  },
] as const;

// The hero's backdrop: a wall of the app's own posters, the way Netflix
// puts a wall of its titles behind the sign-up. Decorative only (hidden from
// assistive tech) -- made-up entries of the kind a month really holds, drawn
// the way Home draws them: a category's hue, its icon as a pattern, the
// figure large.
type WallIcon = typeof Coffee;
const WALL_POSTERS: { hue: string; icon: WallIcon; value: string; title: string }[] = [
  { hue: "var(--cat-food)", icon: Utensils, value: "฿65", title: "ข้าวมันไก่" },
  { hue: "var(--cat-travel)", icon: Bus, value: "฿42", title: "BTS" },
  { hue: "var(--cat-bills)", icon: Receipt, value: "3 วัน", title: "ค่าไฟ" },
  { hue: "var(--cat-entertainment)", icon: Film, value: "฿419", title: "Netflix" },
  { hue: "var(--cat-home)", icon: House, value: "฿8,500", title: "ค่าห้อง" },
  { hue: "var(--cat-goods)", icon: ShoppingBag, value: "฿1,290", title: "รองเท้า" },
  { hue: "var(--cat-health)", icon: HeartPulse, value: "฿350", title: "ร้านยา" },
  { hue: "var(--cat-food)", icon: Coffee, value: "฿85", title: "กาแฟ" },
  { hue: "var(--cat-travel)", icon: Plane, value: "฿2,450", title: "ตั๋วเครื่องบิน" },
  { hue: "var(--cat-other)", icon: Wallet, value: "฿500", title: "ออมเงิน" },
];
const WALL_SIZE = 30;

// "ทำอะไรได้บ้าง" -- Netflix's numbered "Trending now" rail, holding what the
// app does instead of titles.
const FEATURES: { hue: string; icon: WallIcon; title: string; sub: string }[] = [
  { hue: "var(--cat-bills)", icon: MessageSquareText, title: "จดด้วยการพิมพ์", sub: "“ข้าว 50 กาแฟ 65” AI แยกให้" },
  { hue: "var(--cat-travel)", icon: Camera, title: "แนบสลิปได้", sub: "อ่านยอดจากรูปให้เอง" },
  { hue: "var(--cat-entertainment)", icon: Split, title: "หารบิลกับเพื่อน", sub: "จำให้ว่าใครติดเท่าไหร่" },
  { hue: "var(--cat-home)", icon: CalendarClock, title: "บิลใกล้ถึง", sub: "เตือนก่อนถึงวันจ่าย" },
  { hue: "var(--cat-goods)", icon: Wallet, title: "หลายกระเป๋าเงิน", sub: "บัญชี เงินสด บัตรเครดิต" },
];

// Answers are claims about the app, held to the same rule as the privacy
// policy: each one is something the code does today.
const FAQ: { q: string; a: string }[] = [
  {
    q: "Nub-Mon คืออะไร",
    a: "แอพจดรายรับรายจ่ายส่วนตัว พิมพ์เป็นประโยคธรรมดาหรือแนบสลิป แล้ว AI แยกรายการ หมวด และกระเป๋าเงินให้ ตรวจแล้วกดบันทึก ดูได้ว่าเงินไปไหน บิลไหนใกล้ถึง และใครยังติดเงินคุณอยู่",
  },
  {
    q: "ข้อมูลของฉันเก็บที่ไหน ใครเห็นได้บ้าง",
    a: "เก็บในฐานข้อมูลของ Supabase ที่สิงคโปร์ ทุกแถวผูกกับบัญชีของคุณด้วย Row Level Security บัญชีอื่นอ่านหรือแก้ไม่ได้ แอพไม่มีโฆษณาและไม่ขายข้อมูล",
  },
  {
    q: "AI อ่านข้อมูลอะไรของฉันบ้าง",
    a: "เฉพาะตอนที่คุณใช้ AI จดรายการ แนบสลิป หรือถามคำถาม ข้อความหรือรูปนั้นพร้อมสรุปข้อมูลที่ต้องใช้ตอบจะถูกส่งไปประมวลผลที่ Google Gemini รูปสลิปไม่ถูกเก็บไว้ในแอพ",
  },
  {
    q: "ใช้บนคอมได้ไหม",
    a: "ได้ เปิดในเบราว์เซอร์ได้เลย เข้าด้วยบัญชีเดียวกันแล้วข้อมูลตรงกันทุกเครื่อง",
  },
  {
    q: "ลบบัญชีได้ไหม",
    a: "ได้ทุกเมื่อที่ “ของฉัน” → “ลบบัญชี” บัญชีและข้อมูลทั้งหมดจะถูกลบถาวร ถ้าอยากเก็บไว้ ส่งออกเป็น CSV ก่อนได้",
  },
];

// How far the page scrolls before the nav takes a solid ground: about where
// the hero's pitch starts to pass under it.
const LANDING_NAV_SOLID_AFTER = 48;

type Platform = "ios" | "android";

const INSTALL_STEPS: Record<Platform, { icon: typeof Share; text: string }[]> = {
  ios: [
    { icon: Share, text: "เปิดหน้านี้ใน Safari แล้วแตะปุ่มแชร์ด้านล่าง" },
    { icon: PlusSquare, text: "เลื่อนหา แล้วแตะ “เพิ่มไปยังหน้าจอโฮม”" },
    { icon: Download, text: "แตะ “เพิ่ม” ไอคอน Nub-Mon จะอยู่บนหน้าจอโฮม เปิดได้เต็มจอเหมือนแอพ" },
  ],
  android: [
    { icon: MoreVertical, text: "เปิดหน้านี้ใน Chrome แล้วแตะเมนูมุมขวาบน" },
    { icon: Download, text: "แตะ “ติดตั้งแอป” หรือ “เพิ่มลงในหน้าจอหลัก”" },
    { icon: PlusSquare, text: "ยืนยัน ไอคอน Nub-Mon จะอยู่ในหน้าจอหลัก เปิดได้เต็มจอเหมือนแอพ" },
  ],
};

// Chrome's install prompt event; not in the DOM lib's types.
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const noopSubscribe = () => () => {};

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; the touch points give it away.
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "android";
}

export function Landing() {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // The nav floats clear over the hero and takes a solid ground once the
  // page has scrolled far enough for content to pass under it.
  const [scrolled, setScrolled] = useState(false);

  const detected = useSyncExternalStore(noopSubscribe, detectPlatform, () => "ios" as Platform);
  const [pickedPlatform, setPickedPlatform] = useState<Platform | null>(null);
  const platform = pickedPlatform ?? detected;

  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onScroll = () => setScrolled(scroller.scrollTop > LANDING_NAV_SOLID_AFTER);
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => undefined);
    setInstallPrompt(null);
  }

  const steps = INSTALL_STEPS[platform];

  return (
    <main className="landing-shell">
      <div className="landing" ref={scrollerRef}>
        {/* Held at the top of the page wherever it is scrolled: the brand,
            and the way in. */}
        <nav className={`landing-nav ${scrolled ? "is-solid" : ""}`} aria-label={APP_NAME}>
          <span className="landing-brand">
            <i className="brand-mark" aria-hidden="true" />
            <b className="brand-name">{APP_NAME}</b>
          </span>
          <Link className="landing-signin-link" href="/login">เข้าสู่ระบบ</Link>
        </nav>

        <header className="landing-hero">
          <div className="landing-wall" aria-hidden="true">
            {Array.from({ length: WALL_SIZE }, (_, index) => {
              const item = WALL_POSTERS[(index * 3) % WALL_POSTERS.length];
              const Icon = item.icon;
              return (
                <Poster
                  key={index}
                  hue={item.hue}
                  renderGlyph={(size) => <Icon size={size} strokeWidth={2.25} />}
                  hero={{ value: item.value, size: "compact" }}
                  title={item.title}
                />
              );
            })}
          </div>

          <div className="landing-hero-body">
            <h1>จดรายรับรายจ่าย<br />แค่พิมพ์เหมือนแชท</h1>
            <p className="landing-lead">AI แยกหมวด เลือกกระเป๋า และรวมยอดให้เอง ข้อมูลของคุณเห็นได้แค่คุณ</p>
            <p className="landing-ready">พร้อมเริ่มนับเงินแล้วหรือยัง เข้าด้วยบัญชี Google ได้ในไม่กี่วินาที</p>
            <Link className="primary landing-cta" href="/login">
              เริ่มใช้งาน
              <ChevronRight size={20} strokeWidth={2.5} aria-hidden="true" />
            </Link>
          </div>
        </header>

        <div className="landing-arc" aria-hidden="true" />

        <div className="landing-content">
          <Rail title="ทำอะไรได้บ้าง" size="rank" className="landing-features">
            {FEATURES.map((item, index) => {
              const Icon = item.icon;
              return (
                <div className="rank" key={item.title}>
                  <span className="rank-number" aria-hidden="true">{index + 1}</span>
                  <Poster
                    hue={item.hue}
                    renderGlyph={(size) => <Icon size={size} strokeWidth={2.25} />}
                    title={item.title}
                    sub={item.sub}
                  />
                </div>
              );
            })}
          </Rail>

          <section className="landing-block" aria-labelledby="landing-safety-title">
            <h2 id="landing-safety-title">ข้อมูลของคุณปลอดภัย</h2>
            <ul className="landing-reasons">
              {SECURITY_POINTS.map(({ hue, icon: Icon, title, detail }) => (
                <li key={title} style={{ "--hue": hue } as React.CSSProperties}>
                  <b>{title}</b>
                  <p>{detail}</p>
                  <span className="landing-reason-icon" aria-hidden="true"><Icon size={22} strokeWidth={2.25} /></span>
                </li>
              ))}
            </ul>
            <a className="landing-policy-link" href="/privacy">อ่านนโยบายความเป็นส่วนตัวฉบับเต็ม</a>
          </section>

          <section id="landing-install" className="landing-block" aria-labelledby="landing-install-title">
            <h2 id="landing-install-title">ติดตั้งบนมือถือ</h2>
            <p className="landing-block-lead">ไม่ต้องโหลดจาก App Store หรือ Play Store เพิ่มจากเบราว์เซอร์ได้เลย เปิดแล้วเต็มจอเหมือนแอพทั่วไป</p>
            <div className="landing-install">
              <div className="add-mode-tabs landing-tabs" role="tablist" aria-label="เลือกเครื่อง">
                {(["ios", "android"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={platform === key}
                    className={platform === key ? "active" : ""}
                    onClick={() => setPickedPlatform(key)}
                  >
                    {key === "ios" ? "iPhone / iPad" : "Android"}
                  </button>
                ))}
              </div>
              <ol className="landing-steps" role="tabpanel">
                {steps.map(({ icon: Icon, text }, index) => (
                  <li key={text}>
                    <span className="landing-step-number">{index + 1}</span>
                    <span className="landing-step-text">{text}</span>
                    <span className="landing-point-icon"><Icon size={18} strokeWidth={2.25} aria-hidden="true" /></span>
                  </li>
                ))}
              </ol>
              {installPrompt && (
                <button type="button" className="primary" onClick={install}>
                  <Download size={18} strokeWidth={2.25} aria-hidden="true" />
                  ติดตั้งเลย
                </button>
              )}
            </div>
          </section>

          <section className="landing-block" aria-labelledby="landing-faq-title">
            <h2 id="landing-faq-title">คำถามที่พบบ่อย</h2>
            <div className="landing-faq">
              {FAQ.map((item) => (
                <details key={item.q}>
                  <summary>
                    {item.q}
                    <Plus size={28} strokeWidth={1.75} aria-hidden="true" />
                  </summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </section>

          <footer className="landing-footer">
            <a href="/privacy">นโยบายความเป็นส่วนตัว</a>
            <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>ติดต่อผู้พัฒนา</a>
            <span>{APP_NAME}</span>
          </footer>
        </div>
      </div>

    </main>
  );
}
