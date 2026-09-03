"use client";

import { useEffect, useRef, useState } from "react";
import NextImage from "next/image";
import type { User } from "@supabase/supabase-js";
import { Delete, Lock, ScanFace } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { clampInteger } from "@/lib/format";
import { isPlatformAuthenticatorAvailable, isSixDigitPin, pinLength, pinMaxAttempts } from "@/lib/pin";
import type { PinMode, Profile } from "@/lib/types";
import { PageFrame } from "@/components/primitives";

export function PinGate({
  mode,
  user,
  profile,
  busy,
  error,
  onSetup,
  onUnlock,
  onFaceIdUnlock,
  onForgot,
  onLogout,
}: {
  mode: PinMode;
  user: User;
  profile: Profile | null;
  busy: boolean;
  error: string;
  onSetup: (pin: string) => void;
  onUnlock: (pin: string) => Promise<boolean>;
  onFaceIdUnlock: () => Promise<boolean>;
  onForgot: () => void;
  onLogout: () => void;
}) {
  const [pin, setPin] = useState("");
  const [setupStage, setSetupStage] = useState<"new" | "confirm">("new");
  const [newPinDraft, setNewPinDraft] = useState("");
  const [setupError, setSetupError] = useState("");
  const [shake, setShake] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  const [prevMode, setPrevMode] = useState(mode);
  const faceIdTried = useRef(false);
  const submittingRef = useRef(false);

  // Reset entry state whenever the gate's mode changes (e.g. setup -> locked).
  // Adjusting state during render (React's documented pattern for this) rather
  // than in an effect, so it applies before this render paints.
  if (mode !== prevMode) {
    setPrevMode(mode);
    setPin("");
    setSetupStage("new");
    setNewPinDraft("");
    setSetupError("");
  }
  const blockedUntil = profile?.pin_blocked_until ? new Date(profile.pin_blocked_until).getTime() : 0;
  const blocked = blockedUntil > tick;
  const remainingMs = Math.max(0, blockedUntil - tick);
  const remainingMinutes = Math.ceil(remainingMs / 60000);
  const attempts = clampInteger(profile?.pin_failed_attempts ?? 0, 0, pinMaxAttempts, 0);
  const remainingAttempts = Math.max(0, pinMaxAttempts - attempts);
  const faceIdAvailable = !!(profile?.webauthn_enabled && profile.webauthn_credential_id);
  const metadata = user.user_metadata ?? {};
  const displayName = profile?.nickname?.trim() || metadata.full_name || metadata.name || "";
  const displayIcon = profile?.app_icon?.trim() || user.email?.[0]?.toUpperCase() || "฿";
  const displayIconImage = profile?.app_icon_image?.trim() || "";

  useEffect(() => {
    if (!blocked) return;
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [blocked]);

  useEffect(() => {
    if (mode !== "locked" || !faceIdAvailable || blocked || faceIdTried.current) return;
    faceIdTried.current = true;
    void onFaceIdUnlock();
  }, [mode, faceIdAvailable, blocked, onFaceIdUnlock]);

  const triggerShake = () => {
    setShake(true);
    window.setTimeout(() => setShake(false), 420);
  };

  const appendDigit = (digit: string) => {
    if (blocked || busy || pin.length >= pinLength) return;
    setPin((current) => `${current}${digit}`.slice(0, pinLength));
  };
  const removeDigit = () => setPin((current) => current.slice(0, -1));

  useEffect(() => {
    if (mode !== "locked" || blocked || busy || !isSixDigitPin(pin) || submittingRef.current) return;
    submittingRef.current = true;
    onUnlock(pin).then((ok) => {
      submittingRef.current = false;
      if (!ok) {
        triggerShake();
        setPin("");
      }
    });
  }, [pin, mode, blocked, busy, onUnlock]);

  useEffect(() => {
    if (mode !== "setup" || !isSixDigitPin(pin)) return;
    queueMicrotask(() => {
      if (setupStage === "new") {
        setNewPinDraft(pin);
        setPin("");
        setSetupStage("confirm");
        setSetupError("");
        return;
      }
      if (pin === newPinDraft) {
        onSetup(pin);
        return;
      }
      setSetupError("PIN สองรอบไม่ตรงกัน ลองใหม่อีกครั้ง");
      triggerShake();
      setPin("");
      setNewPinDraft("");
      setSetupStage("new");
    });
  }, [pin, mode, setupStage, newPinDraft, onSetup]);

  const title = mode === "setup"
    ? (setupStage === "new" ? "ตั้งรหัส PIN 6 หลัก" : "ยืนยันรหัส PIN อีกครั้ง")
    : displayName
      ? `สวัสดี ${displayName}`
      : "ใส่รหัส PIN";
  const copy = mode === "setup"
    ? (setupStage === "new" ? "ตั้ง PIN สำหรับเข้าใช้งานแอพนี้บนทุกเครื่องที่ล็อกอินบัญชีเดียวกัน" : "กรอกรหัสเดิมอีกครั้งเพื่อยืนยัน")
    : "ใส่รหัส PIN เพื่อเข้าใช้งาน";

  return (
    <main className="shell pin-shell">
      <section className="phone pin-screen">
        <div className={`pin-content ${shake ? "shake" : ""}`}>
          <div className="pin-identity">
            <span className={`avatar pin-avatar ${displayIconImage ? "has-image" : ""}`}>
              {displayIconImage && <NextImage className="profile-image" src={displayIconImage} alt="" width={64} height={64} unoptimized />}
              {!displayIconImage && (mode === "setup" ? <Lock size={26} strokeWidth={2.25} aria-hidden="true" /> : displayIcon)}
            </span>
            <p className="eyebrow">{mode === "setup" ? "ตั้งค่าความเป็นส่วนตัว" : "ยืนยันตัวตน"}</p>
            <h1>{title}</h1>
            <p className="pin-copy">{copy}</p>
          </div>

          {mode === "checking" && (
            <div className="pin-loading">
              <span className="loading-spinner mini" />
              <span>กำลังตรวจสอบสถานะ PIN</span>
            </div>
          )}

          {mode !== "checking" && (
            <>
              <div className="pin-dots" aria-label={`กรอกแล้ว ${pin.length} หลัก`}>
                {Array.from({ length: pinLength }, (_, index) => (
                  <span key={index} className={`${index < pin.length ? "filled" : ""} ${shake ? "error" : ""}`} />
                ))}
              </div>

              <div className="pin-status">
                {mode === "locked" && blocked && <p className="pin-error">ใส่ผิดครบ {pinMaxAttempts} ครั้ง กรุณารอประมาณ {remainingMinutes} นาที</p>}
                {mode === "locked" && !blocked && error && <p className="pin-error">{error}</p>}
                {mode === "locked" && !blocked && !error && remainingAttempts < pinMaxAttempts && <p className="pin-hint">ใส่ผิดได้อีก {remainingAttempts} ครั้ง</p>}
                {mode === "setup" && (setupError || error) && <p className="pin-error">{setupError || error}</p>}
              </div>

              <PinKeypad
                onDigit={appendDigit}
                onBackspace={removeDigit}
                disabled={busy || blocked}
                onFaceId={mode === "locked" && faceIdAvailable && !blocked ? () => onFaceIdUnlock() : undefined}
              />

              <div className="pin-footer">
                {mode === "setup" && <button className="pin-link-button" onClick={onLogout}>ออกจากระบบ</button>}
                {mode === "locked" && <button className="pin-link-button" onClick={onForgot} disabled={busy}>ลืม PIN / ออกจากระบบเพื่อรีเซ็ต</button>}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export function PinKeypad({
  onDigit,
  onBackspace,
  disabled,
  onFaceId,
}: {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  disabled: boolean;
  onFaceId?: () => void;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return (
    <div className="pin-keypad">
      {keys.map((key) => <button key={key} onClick={() => onDigit(key)} disabled={disabled}>{key}</button>)}
      {onFaceId ? (
        <button className="pin-keypad-faceid" onClick={onFaceId} disabled={disabled} aria-label="ใช้ Face ID">
          <ScanFace size={22} strokeWidth={2} aria-hidden="true" />
        </button>
      ) : <span />}
      <button onClick={() => onDigit("0")} disabled={disabled}>0</button>
      <button className="pin-keypad-delete" onClick={onBackspace} disabled={disabled} aria-label="ลบ">
        <Delete size={20} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}

export function SecurityView({
  pinEnabled,
  webauthnEnabled,
  busy,
  error,
  onBack,
  onEnable,
  onChange,
  onDisable,
  onEnableFaceId,
  onDisableFaceId,
}: {
  pinEnabled: boolean;
  webauthnEnabled: boolean;
  busy: boolean;
  error: string;
  onBack: () => void;
  onEnable: (nextPin: string) => void;
  onChange: (currentPin: string, nextPin: string) => void;
  onDisable: (currentPin: string) => void;
  onEnableFaceId: (currentPin: string) => Promise<boolean>;
  onDisableFaceId: (currentPin: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"change" | "disable" | "faceid">("change");
  const [currentPin, setCurrentPin] = useState("");
  const [nextPin, setNextPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [faceIdSupported, setFaceIdSupported] = useState(false);
  const mismatch = mode === "change" && confirmPin.length === pinLength && nextPin !== confirmPin;
  const clean = (value: string) => value.replace(/\D/g, "").slice(0, pinLength);
  const canSaveChange = pinEnabled
    ? isSixDigitPin(currentPin) && isSixDigitPin(nextPin) && nextPin === confirmPin
    : isSixDigitPin(nextPin) && nextPin === confirmPin;

  useEffect(() => {
    let cancelled = false;
    isPlatformAuthenticatorAvailable().then((available) => {
      if (!cancelled) setFaceIdSupported(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageFrame onBack={onBack} eyebrow="ความปลอดภัย" title={pinEnabled ? "จัดการ PIN" : "เปิดใช้ PIN"} className="pin-page">
        {pinEnabled && (
          <div className="report-period-toggle pin-mode-toggle">
            <button className={mode === "change" ? "active" : ""} onClick={() => setMode("change")}>เปลี่ยน PIN</button>
            <button className={mode === "disable" ? "active" : ""} onClick={() => setMode("disable")}>ปิด PIN</button>
            {faceIdSupported && (
              <button className={mode === "faceid" ? "active" : ""} onClick={() => setMode("faceid")}>Face ID</button>
            )}
          </div>
        )}

        {pinEnabled && (
          <label>
            PIN ปัจจุบัน
            <input inputMode="numeric" type="password" maxLength={pinLength} value={currentPin} onChange={(event) => setCurrentPin(clean(event.target.value))} />
          </label>
        )}

        {mode === "change" && (
          <>
            <label>
              PIN ใหม่
              <input inputMode="numeric" type="password" maxLength={pinLength} value={nextPin} onChange={(event) => setNextPin(clean(event.target.value))} />
            </label>
            <label>
              ยืนยัน PIN ใหม่
              <input inputMode="numeric" type="password" maxLength={pinLength} value={confirmPin} onChange={(event) => setConfirmPin(clean(event.target.value))} />
            </label>
            {(mismatch || error) && <p className="pin-error">{mismatch ? "PIN ใหม่สองรอบไม่ตรงกัน" : error}</p>}
            <button className="save" onClick={() => (pinEnabled ? onChange(currentPin, nextPin) : onEnable(nextPin))} disabled={busy || !canSaveChange}>
              {busy ? "กำลังบันทึก" : pinEnabled ? "บันทึก PIN ใหม่" : "เปิดใช้ PIN"}
            </button>
          </>
        )}

        {mode === "disable" && (
          <>
            {error && <p className="pin-error">{error}</p>}
            <p className="pin-hint">ปิด PIN แล้วครั้งต่อไปจะเข้าแอพได้ทันทีโดยไม่ต้องกรอกรหัส</p>
            <button className="danger pin-danger-button" onClick={() => onDisable(currentPin)} disabled={busy || !isSixDigitPin(currentPin)}>
              {busy ? "กำลังปิด PIN" : "ปิดใช้งาน PIN"}
            </button>
          </>
        )}

        {mode === "faceid" && (
          <>
            {error && <p className="pin-error">{error}</p>}
            {webauthnEnabled ? (
              <>
                <p className="pin-hint">เปิดใช้งานแล้วบนเครื่องนี้</p>
                <button className="danger pin-danger-button" onClick={() => onDisableFaceId(currentPin)} disabled={busy || !isSixDigitPin(currentPin)}>
                  {busy ? "กำลังปิด Face ID" : "ปิดใช้งาน Face ID"}
                </button>
              </>
            ) : (
              <>
                <p className="pin-hint">ใช้ Face ID ปลดล็อกแอพแทนการกรอก PIN ทุกครั้ง (ยังต้องมี PIN ไว้เป็นทางสำรอง)</p>
                <button className="save" onClick={() => onEnableFaceId(currentPin)} disabled={busy || !isSixDigitPin(currentPin)}>
                  {busy ? "กำลังเปิดใช้ Face ID" : "เปิดใช้ Face ID"}
                </button>
              </>
            )}
          </>
        )}
    </PageFrame>
  );
}

export function Auth() {
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

export function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

