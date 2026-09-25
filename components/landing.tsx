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

// Paged mode (a mouse or trackpad, see Landing): how long one page turn
// takes -- keep it in step with --t-page in globals.css, which runs the
// slide -- how far a wheel gesture travels before it counts, and the quiet
// gap between wheel events that ends a gesture (a trackpad keeps sending
// inertia events for a while after the fingers lift).
const LANDING_PAGE_MS = 560;
const WHEEL_PAGE_THRESHOLD = 12;
const WHEEL_GESTURE_GAP_MS = 180;

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

const PAGED_QUERY = "(hover: hover) and (pointer: fine)";

function readPagedMode() {
  return typeof window !== "undefined" && window.matchMedia(PAGED_QUERY).matches;
}

function subscribePagedMode(listener: () => void) {
  const query = window.matchMedia(PAGED_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

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

  // Two ways to move between the screens. Touch keeps the browser's own
  // scroll with snapping, which a finger drives well. A mouse or trackpad
  // gets "paged" mode instead: the screens sit on a track that slides by a
  // CSS transform (composited, so it stays smooth even while the page is
  // busy), one screen per wheel gesture or key press. Snapping under a wheel
  // nudged the page a notch and dragged it back, and animating scrollTop
  // from script was still tied to the main thread.
  const paged = useSyncExternalStore(subscribePagedMode, readPagedMode, () => false);
  // The showing screen, kept in a ref as well for the input handlers, which
  // are bound once per mode and must not read a stale render's value.
  const activeSectionRef = useRef(0);
  const turningUntilRef = useRef(0);
  const showSection = useCallback((index: number) => {
    activeSectionRef.current = index;
    setActiveSection(index);
  }, []);

  // Which screen is showing, for the dots on the right. Paged mode sets it
  // directly; in scroll mode the observer reads it off the scroll.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (paged || !scroller || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const index = SECTIONS.findIndex((section) => section.id === entry.target.id);
        if (index >= 0) showSection(index);
      }
    }, { root: scroller, threshold: 0.6 });
    scroller.querySelectorAll(".landing-section").forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [paged, showSection]);

  // Switching modes (a window dragged to a touch screen, say) keeps the same
  // screen in view: the track is reset in scroll mode, so scroll to it.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (paged) scroller.scrollTop = 0;
    else document.getElementById(SECTIONS[activeSectionRef.current].id)?.scrollIntoView({ block: "start" });
  }, [paged]);

  const goTo = useCallback((index: number) => {
    const next = Math.max(0, Math.min(SECTIONS.length - 1, index));
    if (readPagedMode()) {
      if (next === activeSectionRef.current) return;
      turningUntilRef.current = performance.now() + LANDING_PAGE_MS;
      showSection(next);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(SECTIONS[next].id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [showSection]);

  // Paged mode's input. A screen taller than the window scrolls inside
  // itself first and only turns the page at its edge. One wheel gesture
  // turns one page: the trackpad's inertia afterwards is swallowed, but a
  // fresh flick during that inertia (its deltas grow again, where inertia
  // only ever decays) turns the next page straight away rather than waiting
  // for the old gesture to die out.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!paged || !scroller) return;
    const currentSection = () => scroller.querySelectorAll<HTMLElement>(".landing-section")[activeSectionRef.current];
    const canScrollInside = (dir: number) => {
      const section = currentSection();
      if (!section) return false;
      return dir > 0
        ? section.scrollTop + section.clientHeight < section.scrollHeight - 1
        : section.scrollTop > 0;
    };
    const turning = () => performance.now() < turningUntilRef.current;
    const page = (dir: number) => goTo(activeSectionRef.current + dir);

    let lastWheel = 0;
    let lastAbs = 0;
    let consumed = false;
    let travel = 0;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      const dir = Math.sign(event.deltaY);
      if (!dir) return;
      const now = performance.now();
      const abs = Math.abs(event.deltaY);
      const newGesture = now - lastWheel > WHEEL_GESTURE_GAP_MS || (!turning() && abs > lastAbs * 1.4 + 4);
      lastWheel = now;
      lastAbs = abs;
      if (newGesture) {
        consumed = false;
        travel = 0;
      }
      if (!consumed && !turning() && canScrollInside(dir)) return;
      event.preventDefault();
      if (consumed || turning()) return;
      travel += event.deltaY;
      if (Math.abs(travel) < WHEEL_PAGE_THRESHOLD) return;
      consumed = true;
      page(dir);
    };

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (target?.closest("input, textarea, select, [role='dialog'], [role='tablist']")) return;
      // Space presses a focused button or link; it is not a page turn there.
      if (event.key === " " && target?.closest("button, a, summary")) return;
      const dir = event.key === "ArrowDown" || event.key === "PageDown" || (event.key === " " && !event.shiftKey) ? 1
        : event.key === "ArrowUp" || event.key === "PageUp" || (event.key === " " && event.shiftKey) ? -1
          : event.key === "Home" ? -SECTIONS.length
            : event.key === "End" ? SECTIONS.length
              : 0;
      if (!dir || (Math.abs(dir) === 1 && canScrollInside(dir))) return;
      event.preventDefault();
      if (!turning()) page(dir);
    };

    // Tabbing into a screen that is off the track brings that screen in; the
    // scroller itself never scrolls in this mode (the browser would try, to
    // reveal the focused element, and knock the track out of line).
    const onFocus = (event: FocusEvent) => {
      const section = (event.target as HTMLElement | null)?.closest<HTMLElement>(".landing-section");
      const index = SECTIONS.findIndex((item) => item.id === section?.id);
      scroller.scrollTop = 0;
      if (index >= 0 && index !== activeSectionRef.current) goTo(index);
    };
    const onScroll = () => { if (scroller.scrollTop !== 0) scroller.scrollTop = 0; };

    scroller.addEventListener("wheel", onWheel, { passive: false });
    scroller.addEventListener("focusin", onFocus);
    scroller.addEventListener("scroll", onScroll);
    window.addEventListener("keydown", onKey);
    return () => {
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("focusin", onFocus);
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
    };
  }, [paged, goTo]);

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

      <div className={`landing ${paged ? "is-paged" : ""}`} ref={scrollerRef}>
        <div
          className="landing-track"
          style={paged ? ({ "--landing-page": activeSection } as React.CSSProperties) : undefined}
        >
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
