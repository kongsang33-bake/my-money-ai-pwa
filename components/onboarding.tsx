"use client";

import { useState } from "react";
import { Banknote, Landmark, PiggyBank, Sparkles } from "lucide-react";
import type { WalletTag } from "@/lib/taxonomy";
import { AmountInput, StateCard } from "@/components/primitives";
import type { WalletInput } from "@/components/wallets-recurring";

// The first three minutes of the app, for someone who has never seen it.
//
// It is a gate rather than a tab (same shape as PinGate in components/auth.tsx)
// because the thing it is fixing is that Home had nowhere to start from: an
// account with no wallet renders every card at ฿0, and anything jotted before
// a wallet exists is dropped by buildWalletLedger, so the app looks broken
// rather than empty. Whether to show it is decided in app/page.tsx from the
// account's own data -- there is no stored "onboarded" flag, so an account
// that already has anything in it never sees this, and a skip is remembered
// per user in localStorage only.
//
// Step three deliberately hands off to the real Add tab with an example
// already typed in, instead of re-implementing analyse/review/save here. The
// screen they will use forever is the one worth teaching.

type WalletPreset = { key: string; label: string; name: string; tag: WalletTag; icon: string; Icon: typeof Banknote; hint: string };

const walletPresets: WalletPreset[] = [
  { key: "cash", label: "เงินสด", name: "เงินสด", tag: "cash", icon: "banknote", Icon: Banknote, hint: "เงินในกระเป๋าสตางค์ที่นับได้ตอนนี้" },
  { key: "bank", label: "บัญชีธนาคาร", name: "บัญชีหลัก", tag: "cash", icon: "wallet", Icon: Landmark, hint: "บัญชีที่ใช้จ่ายประจำวัน ยอดตามที่เห็นในแอปธนาคาร" },
  { key: "savings", label: "เงินออม", name: "เงินออม", tag: "savings", icon: "piggy-bank", Icon: PiggyBank, hint: "เงินที่กันไว้ ไม่รวมในยอดพร้อมใช้บนหน้าแรก" },
];

// The three sentences that show the range of what can be typed into the AI
// box -- one plain expense, several at once, and a shared bill. The first is
// what gets handed to the composer if the user takes the offer.
const composerExamples = [
  "กาแฟ 65 บาท",
  "ข้าวเที่ยง 120 กาแฟ 65 ค่าแท็กซี่ 80",
  "จ่ายค่าข้าวเย็น 900 หารกับจูน",
];

export function SetupFlow({
  displayName,
  busy,
  error,
  onCreateWallet,
  onFinish,
  onSkip,
}: {
  displayName: string;
  busy: boolean;
  error: string;
  onCreateWallet: (input: WalletInput) => Promise<boolean>;
  onFinish: (startText?: string) => void;
  onSkip: () => void;
}) {
  const [step, setStep] = useState(0);
  const [preset, setPreset] = useState<WalletPreset>(walletPresets[0]);
  const [balance, setBalance] = useState(0);
  const [walletSaved, setWalletSaved] = useState(false);

  const saveWallet = async () => {
    const created = await onCreateWallet({
      name: preset.name,
      tag: preset.tag,
      balance,
      icon: preset.icon,
      icon_color: null,
      is_default: true,
    });
    if (!created) return;
    setWalletSaved(true);
    setStep(2);
  };

  return (
    <main className="shell">
      <section className="phone setup-screen">
        <div className="setup-progress" aria-label={`ขั้นที่ ${step + 1} จาก 3`}>
          {[0, 1, 2].map((index) => (
            <i key={index} className={index === step ? "active" : index < step ? "done" : ""} />
          ))}
        </div>

        {step === 0 && (
          <div className="setup-step">
            <div className="setup-hero">
              <span className="setup-hero-mark" aria-hidden="true">฿</span>
              <p className="eyebrow">ยินดีต้อนรับ</p>
              <h1>สวัสดี {displayName}</h1>
              <p>ตั้งค่า 2 อย่างสั้น ๆ แล้วเริ่มใช้ได้เลย</p>
            </div>
            <ul className="setup-points">
              <li>
                <b>จดด้วยการพิมพ์ประโยคเดียว</b>
                <small>&ldquo;ข้าวเที่ยง 120 กาแฟ 65&rdquo; แล้ว AI แยกให้เป็นรายการ ไม่ต้องกรอกทีละช่อง</small>
              </li>
              <li>
                <b>รู้ว่าเหลือใช้จริงเท่าไหร่</b>
                <small>ยอดบนหน้าแรกคือเงินที่ใช้ได้จริง ไม่ใช่ยอดในบัญชีที่ยังไม่หักอะไรเลย</small>
              </li>
              <li>
                <b>จำได้ว่าใครติดเงินใคร</b>
                <small>ออกให้เพื่อนก่อน หารค่าข้าว จ่ายด้วยบัตร — บันทึกครั้งเดียวแล้วแอพตามยอดให้</small>
              </li>
            </ul>
            <button className="save" onClick={() => setStep(1)}>เริ่มตั้งค่า</button>
            <button className="setup-skip" onClick={onSkip}>ข้ามไปก่อน</button>
          </div>
        )}

        {step === 1 && (
          <div className="setup-step">
            <div className="setup-head">
              <p className="eyebrow">ขั้นที่ 1 จาก 2</p>
              <h1>ตอนนี้มีเงินอยู่เท่าไหร่</h1>
              <p>ยอดนี้คือจุดตั้งต้น ทุกรายการที่จดต่อจากนี้จะบวกลบจากตรงนี้ ถ้ายังไม่แน่ใจ ใส่คร่าว ๆ ไปก่อนแล้วมาปรับให้ตรงทีหลังได้</p>
            </div>
            <div className="setup-presets" role="group" aria-label="เลือกประเภทกระเป๋า">
              {walletPresets.map((item) => (
                <button
                  key={item.key}
                  className={item.key === preset.key ? "active" : ""}
                  onClick={() => setPreset(item)}
                  aria-pressed={item.key === preset.key}
                >
                  <i aria-hidden="true"><item.Icon size={18} strokeWidth={2.25} /></i>
                  <b>{item.label}</b>
                </button>
              ))}
            </div>
            <p className="setup-preset-hint">{preset.hint}</p>
            <label className="setup-amount">
              ยอดที่มีอยู่ตอนนี้
              <AmountInput value={balance} onChange={setBalance} autoFocus />
            </label>
            {error && <StateCard tone="error" title="สร้างกระเป๋าไม่สำเร็จ" detail={error} />}
            <button className="save" onClick={saveWallet} disabled={busy}>
              {busy ? "กำลังสร้าง..." : "สร้างกระเป๋า"}
            </button>
            <button className="setup-skip" onClick={() => setStep(2)}>ยังไม่สร้างตอนนี้</button>
          </div>
        )}

        {step === 2 && (
          <div className="setup-step">
            <div className="setup-head">
              <p className="eyebrow">ขั้นที่ 2 จาก 2</p>
              <h1>ลองจดรายการแรก</h1>
              <p>
                {walletSaved
                  ? "กระเป๋าพร้อมแล้ว เหลือแค่พิมพ์บอกแอพว่าวันนี้ใช้อะไรไปบ้าง"
                  : "พิมพ์บอกแอพเป็นภาษาคนได้เลย ไม่ต้องเลือกหมวดหมู่เอง"}
              </p>
            </div>
            <div className="setup-examples">
              <span className="setup-examples-label"><Sparkles size={14} strokeWidth={2.25} aria-hidden="true" />พิมพ์แบบนี้ได้เลย</span>
              {composerExamples.map((example) => (
                <button key={example} onClick={() => onFinish(example)}>
                  <span>{example}</span>
                </button>
              ))}
              <small>แนบรูปสลิปให้ AI อ่านแทนการพิมพ์ก็ได้</small>
            </div>
            <button className="save" onClick={() => onFinish(composerExamples[0])}>ลองจดรายการแรก</button>
            <button className="setup-skip" onClick={() => onFinish()}>ไปหน้าแรกก่อน</button>
          </div>
        )}
      </section>
    </main>
  );
}
