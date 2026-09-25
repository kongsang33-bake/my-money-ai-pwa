"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, Download, KeyRound, Lock, MessageSquareText, MoreVertical, PlusSquare, Share, ShieldCheck } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { readLocalPrivacyAck, writeLocalPrivacyAck } from "@/lib/privacy";
import { SignInPanel } from "@/components/auth";
import { PrivacyPolicyContent } from "@/components/privacy";
import { SheetClose, SheetFrame, useDismiss } from "@/components/primitives";

// What everyone who is not signed in sees, every time: three full-height
// screens that snap one at a time -- what the app is and how its data is kept,
// how to put it on a phone's home screen, then the sign-in form. The last
// screen is the only sign-in there is (SignInPanel), so there is one door.

const SECTIONS = [
  { id: "landing-about", label: "รู้จักแอพ" },
  { id: "landing-install", label: "ติดตั้ง" },
  { id: "landing-signin", label: "เข้าสู่ระบบ" },
] as const;

const SECURITY_POINTS = [
  {
    icon: ShieldCheck,
    title: "ข้อมูลของคุณเห็นได้แค่คุณ",
    detail: "ทุกรายการผูกกับบัญชีของคุณด้วย Row Level Security บัญชีอื่นอ่านหรือแก้ไม่ได้",
  },
  {
    icon: KeyRound,
    title: "ไม่ต้องตั้งรหัสผ่าน",
    detail: "เข้าด้วย Google หรือลิงก์ทางอีเมล แอพไม่เห็นและไม่เก็บรหัสผ่านของคุณ",
  },
  {
    icon: Lock,
    title: "ล็อกซ้ำด้วย PIN หรือ Face ID",
    detail: "PIN เก็บเป็นค่า hash ไม่ใช่ตัวเลขจริง ใบหน้าไม่เคยออกจากเครื่อง",
  },
  {
    icon: MessageSquareText,
    title: "AI อ่านเฉพาะตอนที่คุณใช้",
    detail: "ข้อความหรือสลิปที่ส่งให้ AI ประมวลผลโดย Google Gemini และแอพไม่เก็บรูปสลิปไว้",
  },
] as const;

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

// Before sign-in the acknowledgement can only live in this device's storage
// (lib/privacy.ts); page.tsx copies it to the server record once signed in.
// Read through useSyncExternalStore so the server render (nothing
// acknowledged) and the first client render agree, and so a write here is
// picked up without a second source of truth in state.
const ackListeners = new Set<() => void>();

function writeAck() {
  writeLocalPrivacyAck();
  ackListeners.forEach((listener) => listener());
}

function subscribeAck(listener: () => void) {
  ackListeners.add(listener);
  return () => ackListeners.delete(listener);
}

export function Landing() {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeSection, setActiveSection] = useState(0);
  const storedAck = useSyncExternalStore(subscribeAck, readLocalPrivacyAck, () => false);
  // Covers storage that refuses the write: acknowledged for this visit anyway.
  const [ackThisVisit, setAckThisVisit] = useState(false);
  const acknowledged = storedAck || ackThisVisit;

  const detected = useSyncExternalStore(noopSubscribe, detectPlatform, () => "ios" as Platform);
  const [pickedPlatform, setPickedPlatform] = useState<Platform | null>(null);
  const platform = pickedPlatform ?? detected;

  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const policyDismiss = useDismiss(policyOpen, () => setPolicyOpen(false));

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

  // Which screen is showing, for the dots on the right.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const index = SECTIONS.findIndex((section) => section.id === entry.target.id);
        if (index >= 0) setActiveSection(index);
      }
    }, { root: scroller, threshold: 0.6 });
    scroller.querySelectorAll(".landing-section").forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const goTo = useCallback((index: number) => {
    document.getElementById(SECTIONS[index].id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => undefined);
    setInstallPrompt(null);
  }

  function acknowledge() {
    setAckThisVisit(true);
    writeAck();
    policyDismiss.requestClose();
  }

  const steps = INSTALL_STEPS[platform];

  return (
    <main className="landing-shell">
      <header className="pin-brand landing-brand">
        <i className="brand-mark" aria-hidden="true" />
        <b className="brand-name">{APP_NAME}</b>
      </header>

      <nav className="landing-dots" aria-label="หน้าในแนะนำแอพ">
        {SECTIONS.map((section, index) => (
          <button
            key={section.id}
            type="button"
            className={index === activeSection ? "active" : ""}
            aria-label={section.label}
            aria-current={index === activeSection ? "true" : undefined}
            onClick={() => goTo(index)}
          />
        ))}
      </nav>

      <div className="landing" ref={scrollerRef}>
        <section id="landing-about" className="landing-section landing-lit">
          <div className="landing-body">
            <div className="landing-head">
              <p className="eyebrow">แอพจดรายรับรายจ่ายด้วย AI</p>
              <h1>พิมพ์เหมือนแชท<br />แล้วให้ Nub-Mon นับให้</h1>
              <p>
                &ldquo;ข้าวมันไก่ 50&rdquo; ก็พอ AI แยกหมวด เลือกกระเป๋า และรวมยอดให้เอง
                ดูได้ว่าเงินไปไหน บิลไหนใกล้ถึง และใครยังติดเงินคุณอยู่
              </p>
            </div>
            <ul className="landing-points">
              {SECURITY_POINTS.map(({ icon: Icon, title, detail }) => (
                <li key={title}>
                  <span className="landing-point-icon"><Icon size={20} strokeWidth={2.25} aria-hidden="true" /></span>
                  <span>
                    <b>{title}</b>
                    <small>{detail}</small>
                  </span>
                </li>
              ))}
            </ul>
            <a className="landing-policy-link" href="/privacy">อ่านนโยบายความเป็นส่วนตัวฉบับเต็ม</a>
          </div>
          <button type="button" className="landing-next" onClick={() => goTo(1)}>
            ติดตั้งบนมือถือ
            <ChevronDown size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </section>

        <section id="landing-install" className="landing-section">
          <div className="landing-body">
            <div className="landing-head">
              <p className="eyebrow">ติดตั้งเป็นแอพ</p>
              <h2>อยู่บนหน้าจอโฮม<br />เปิดได้ในแตะเดียว</h2>
              <p>ไม่ต้องโหลดจาก App Store หรือ Play Store เพิ่มจากเบราว์เซอร์ได้เลย เปิดแล้วเต็มจอเหมือนแอพทั่วไป</p>
            </div>
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
          <button type="button" className="landing-next" onClick={() => goTo(2)}>
            เริ่มใช้งาน
            <ChevronDown size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </section>

        <section id="landing-signin" className="landing-section landing-lit">
          <SignInPanel acknowledged={acknowledged} onReadPolicy={() => setPolicyOpen(true)} />
        </section>
      </div>

      {policyDismiss.mounted && (
        <SheetFrame className="edit-sheet privacy-sheet" onClose={policyDismiss.requestClose} closing={policyDismiss.closing}>
          <div className="sheet-head">
            <div>
              <p className="eyebrow">{APP_NAME}</p>
              <h2>นโยบายความเป็นส่วนตัว</h2>
            </div>
            <SheetClose onClick={policyDismiss.requestClose} />
          </div>
          <PrivacyPolicyContent />
          <button type="button" className="primary privacy-accept" onClick={acknowledge}>
            อ่านแล้ว รับทราบ
          </button>
        </SheetFrame>
      )}
    </main>
  );
}
