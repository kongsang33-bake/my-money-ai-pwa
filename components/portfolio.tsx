"use client";

import { useState } from "react";
import { ChevronDown, ChevronLeft, Lightbulb } from "lucide-react";
import { DATE_INPUT_PATTERN } from "@/lib/constants";
import { formatDateTime, formatMoney, formatShortDate, formatSignedMoney, formatSignedPercent, formatUnits, moneySign, toFiniteNumber, toMoneyAmount } from "@/lib/format";
import { fromDateInput, todayDateInput } from "@/lib/cycle";
import { defaultWalletId } from "@/lib/money";
import { compressSlipImage } from "@/lib/image";
import { nameColor } from "@/lib/category";
import type { Entry, Investment, InvestmentDraftItem, PortfolioHolding, SlipImage, Wallet } from "@/lib/types";
import { IconColorPicker, WalletAvatarGlyph } from "@/components/shared";
import { CountUpMoney, DateField, EmptyNote, SheetFrame, SkeletonList, StateCard, decimalInputPattern } from "@/components/primitives";

export function PortfolioTrendChart({ trend }: { trend: { date: string; value: number }[] }) {
  if (trend.length < 2) return null;
  const values = trend.map((point) => point.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, min + 1);
  const range = max - min;
  return (
    <section className="monthly-trend-panel">
      <div className="section-title">
        <h2>แนวโน้มมูลค่าพอร์ต</h2>
      </div>
      <div className="trend-legend">
        <span><i className="networth" />มูลค่าตามหน่วยที่ถืออยู่ปัจจุบัน × ราคาย้อนหลัง</span>
      </div>
      <div className="monthly-trend-bars monthly-trend-bars-networth">
        {trend.map((point, index) => (
          <div key={point.date} className={index === trend.length - 1 ? "current" : ""}>
            <span>
              <i className="networth" style={{ height: `${Math.max(6, ((point.value - min) / range) * 100)}%` }} title={`${formatShortDate(`${point.date}T00:00:00`)} · ${moneySign}${formatMoney(point.value)}`} />
            </span>
            <small>{formatShortDate(`${point.date}T00:00:00`)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PortfolioView({
  holdings,
  trend,
  totalValue,
  totalCost,
  totalGain,
  totalGainPercent,
  pendingPurchases,
  loading,
  onBack,
  onBuy,
  onSell,
  onUpdatePrice,
  onDelete,
  onConfirmPending,
  onDeletePending,
  onOpenAi,
}: {
  holdings: PortfolioHolding[];
  trend: { date: string; value: number }[];
  totalValue: number;
  totalCost: number;
  totalGain: number;
  totalGainPercent: number | null;
  pendingPurchases: Entry[];
  loading: boolean;
  onBack: () => void;
  onBuy: (target: Investment | null) => void;
  onSell: (item: Investment) => void;
  onUpdatePrice: (item: Investment) => void;
  onDelete: (item: Investment) => void;
  onConfirmPending: (entry: Entry) => void;
  onDeletePending: (entry: Entry) => void;
  onOpenAi: () => void;
}) {
  return (
    <div className="view debtor-view">
      {loading && <SkeletonList rows={3} />}
      <div className="add-title">
        <button onClick={onBack} aria-label="ย้อนกลับ"><ChevronLeft aria-hidden="true" /></button>
        <div>
          <p className="eyebrow">พอร์ตลงทุน</p>
          <h2>เงินลงทุนทั้งหมด</h2>
        </div>
        <button className="header-add-button" onClick={() => onBuy(null)}>ลงทุนใหม่</button>
      </div>

      <section className="debtor-detail-card">
        <span>มูลค่าปัจจุบัน</span>
        <strong><CountUpMoney value={totalValue} /></strong>
        {!!holdings.length && (
          <small>
            ทุน {moneySign}{formatMoney(totalCost)} ·{" "}
            <b className={totalGain >= 0 ? "income" : "expense"}>
              {formatSignedMoney(totalGain)}{totalGainPercent != null ? ` (${formatSignedPercent(totalGainPercent)})` : ""}
            </b>
          </small>
        )}
      </section>

      <button type="button" className="ai-log-button" onClick={onOpenAi}>
        <Lightbulb size={16} strokeWidth={2.25} aria-hidden="true" />
        <span>บันทึกด้วย AI (เช่น DCA รายเดือน)</span>
      </button>

      {!!pendingPurchases.length && (
        <section className="recurring-timeline" aria-label="รอยืนยันหน่วย">
          <div className="section-title-row"><h3>รอยืนยันหน่วย</h3><small>{pendingPurchases.length} รายการ</small></div>
          <div className="debtor-page-list">
            {pendingPurchases.map((entry) => (
              <article className="debtor-page-item" key={entry.id}>
                <i className="card-accent" style={{ background: nameColor(entry.title) }} />
                <button className="debtor-main-button" onClick={() => onConfirmPending(entry)}>
                  <div>
                    <span>{entry.title}</span>
                    <small>{formatDateTime(entry.occurred_at)} · จ่ายไปแล้ว {moneySign}{formatMoney(entry.amount)} · ยังไม่รู้จำนวนหน่วย</small>
                  </div>
                </button>
                <details className="kebab-menu" name="pending-kebab">
                  <summary>⋮</summary>
                  <menu>
                    <button onClick={() => onConfirmPending(entry)}>ยืนยันหน่วย</button>
                    <button onClick={() => onDeletePending(entry)}>ลบ</button>
                  </menu>
                </details>
              </article>
            ))}
          </div>
        </section>
      )}

      <PortfolioTrendChart trend={trend} />

      <div className="debtor-page-list">
        {holdings.map((holding) => (
          <article className="debtor-page-item" key={holding.id}>
            <i className="card-accent" style={{ background: holding.icon_color ?? nameColor(holding.name) }} />
            <button className="debtor-main-button" onClick={() => onUpdatePrice(holding)}>
              <span className="debtor-avatar" style={{ background: holding.icon_color ?? nameColor(holding.name) }}>
                <WalletAvatarGlyph iconKey={holding.icon} fallbackName={holding.name} />
              </span>
              <div>
                <span>{holding.name}{holding.code && holding.code !== holding.name ? ` (${holding.code})` : ""}</span>
                <small>
                  {formatUnits(holding.units)} หน่วย · ทุน {holding.avgCost.toFixed(4)}
                  {holding.latestNav != null ? ` · ล่าสุด ${holding.latestNav.toFixed(4)}` : " · ยังไม่มีราคา"}
                </small>
              </div>
            </button>
            <div className="portfolio-holding-value">
              <strong>{moneySign}{formatMoney(holding.marketValue)}</strong>
              <span className={holding.gain >= 0 ? "income" : "expense"}>
                {formatSignedMoney(holding.gain)}{holding.gainPercent != null ? ` (${formatSignedPercent(holding.gainPercent)})` : ""}
              </span>
            </div>
            <details className="kebab-menu" name="portfolio-kebab">
              <summary>⋮</summary>
              <menu>
                <button onClick={() => onBuy(holding)}>เพิ่มเงินลงทุน</button>
                <button onClick={() => onSell(holding)}>ขาย</button>
                <button onClick={() => onUpdatePrice(holding)}>อัปเดตราคา</button>
                <button onClick={() => onDelete(holding)}>ลบ</button>
              </menu>
            </details>
          </article>
        ))}
        {!holdings.length && <EmptyNote glyph="↻" action={{ label: "เพิ่มการลงทุนแรก", onClick: () => onBuy(null) }}>ยังไม่มีการลงทุนในระบบ เพิ่มกองทุน หุ้น หรือสินทรัพย์อื่นที่ถืออยู่ แล้วอัปเดตราคาเป็นระยะเพื่อดูกำไร/ขาดทุน</EmptyNote>}
      </div>
    </div>
  );
}

export function InvestmentBuySheet({
  target,
  investments,
  wallets,
  busy,
  error,
  onClose,
  onSubmit,
  onSubmitPending,
  closing,
}: {
  target: Investment | null;
  investments: Investment[];
  wallets: Wallet[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (target: Investment | null, input: { name: string; code: string; icon: string | null; icon_color: string | null; units: number; amount: number; wallet_id: string; occurred_at: string }) => Promise<boolean>;
  onSubmitPending: (input: { investmentId: string | null; name: string; code?: string; icon?: string | null; icon_color?: string | null; walletId: string; amount: number; occurredAt: string }) => Promise<boolean>;
  closing?: boolean;
}) {
  const [selectedId, setSelectedId] = useState(target?.id ?? "new");
  const [name, setName] = useState(target?.name ?? "");
  const [code, setCode] = useState(target?.code ?? "");
  const [icon, setIcon] = useState<string | null>(target?.icon ?? "trending-up");
  const [iconColor, setIconColor] = useState<string | null>(target?.icon_color ?? null);
  const [unitsText, setUnitsText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [walletId, setWalletId] = useState(defaultWalletId(wallets) ?? "");
  const [occurredAt, setOccurredAt] = useState(todayDateInput);

  const selected = selectedId === "new" ? null : investments.find((item) => item.id === selectedId) ?? null;
  const units = toFiniteNumber(unitsText);
  const amount = toMoneyAmount(amountText);
  const pricePerUnit = units > 0 && amount > 0 ? amount / units : null;

  const submit = async () => {
    const holdingName = selected ? selected.name : name;
    if (!holdingName.trim() || !(amount > 0) || !walletId) return;
    const saved = units > 0
      ? await onSubmit(selected, { name: holdingName, code: selected ? (selected.code ?? "") : code, icon: selected ? selected.icon : icon, icon_color: selected ? selected.icon_color : iconColor, units, amount, wallet_id: walletId, occurred_at: fromDateInput(occurredAt) })
      : await onSubmitPending({ investmentId: selected?.id ?? null, name: holdingName, code: selected ? (selected.code ?? "") : code, icon: selected ? selected.icon : icon, icon_color: selected ? selected.icon_color : iconColor, walletId, amount, occurredAt: fromDateInput(occurredAt) });
    if (saved) onClose();
  };

  return (
    <SheetFrame onClose={onClose} closing={closing}>
      <div className="sheet-head">
        <div>
          <p className="eyebrow">พอร์ตลงทุน</p>
          <h2>{selected ? `เพิ่มเงินลงทุนใน ${selected.name}` : "ลงทุนใหม่"}</h2>
        </div>
        <button onClick={onClose}>x</button>
      </div>
      {!target && !!investments.length && (
        <label>
          กองทุน/สินทรัพย์
          <div className="select-shell">
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            <option value="new">+ สร้างรายการใหม่</option>
            {investments.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
            <ChevronDown className="select-shell-chevron" aria-hidden="true" />
          </div>
        </label>
      )}
      {!selected && (
        <>
          <IconColorPicker value={{ icon, color: iconColor }} onChange={({ icon: nextIcon, color: nextColor }) => { setIcon(nextIcon); setIconColor(nextColor); }} fallbackName={name || "?"} />
          <label>
            ชื่อกองทุน/สินทรัพย์
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น K-WSPEEDUP, หุ้น PTT" />
          </label>
          <label>
            รหัส/สัญลักษณ์ (ถ้ามี)
            <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="เช่น K-WSPEEDUP" />
          </label>
        </>
      )}
      <label>
        จำนวนหน่วยที่ซื้อ (เว้นว่างได้ถ้ายังไม่รู้)
        <input inputMode="decimal" value={unitsText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setUnitsText(event.target.value); }} placeholder="เช่น 92.6397" />
      </label>
      <label>
        จำนวนเงินที่จ่ายไป
        <input inputMode="decimal" value={amountText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setAmountText(event.target.value); }} placeholder="เช่น 1000" />
      </label>
      {pricePerUnit != null
        ? <small className="cycle-note">ราคาต่อหน่วย {pricePerUnit.toFixed(4)}</small>
        : <small className="cycle-note">ถ้าเว้นจำนวนหน่วยว่างไว้ จะหักเงินออกจากกระเป๋าทันทีแล้วบันทึกเป็นรายการรอยืนยันหน่วย ไปกรอกหน่วยจริงทีหลังได้ที่หน้าพอร์ตลงทุน</small>}
      <label>
        หักเงินจากกระเป๋า
        <div className="select-shell">
          <select value={walletId} onChange={(event) => setWalletId(event.target.value)}>
          {wallets.map((wallet) => (
            <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
          ))}
        </select>
          <ChevronDown className="select-shell-chevron" aria-hidden="true" />
        </div>
      </label>
      <label>
        วันที่ซื้อ
        <DateField value={occurredAt} max={todayDateInput()} onChange={setOccurredAt} />
      </label>
      {error && <StateCard tone="error" title="บันทึกไม่สำเร็จ" detail={error} />}
      <button className="save" onClick={submit} disabled={busy || !(amount > 0) || !walletId || (!selected && !name.trim())}>
        {busy ? "กำลังบันทึก..." : units > 0 ? "บันทึก" : "บันทึก (รอยืนยันหน่วย)"}
      </button>
    </SheetFrame>
  );
}

export function InvestmentSellSheet({
  item,
  busy,
  error,
  onClose,
  onSubmit,
  closing,
}: {
  item: Investment;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (item: Investment, unitsSold: number) => Promise<boolean>;
  closing?: boolean;
}) {
  const [unitsText, setUnitsText] = useState("");
  const units = toFiniteNumber(unitsText);
  const valid = units > 0 && units <= item.units;

  const submit = async () => {
    if (!valid) return;
    const saved = await onSubmit(item, units);
    if (saved) onClose();
  };

  return (
    <SheetFrame onClose={onClose} closing={closing}>
      <div className="sheet-head">
        <div>
          <p className="eyebrow">พอร์ตลงทุน</p>
          <h2>ขาย {item.name}</h2>
        </div>
        <button onClick={onClose}>x</button>
      </div>
      <small className="cycle-note">ถืออยู่ {formatUnits(item.units)} หน่วย</small>
      <label>
        จำนวนหน่วยที่ขาย
        <input autoFocus inputMode="decimal" value={unitsText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setUnitsText(event.target.value); }} placeholder="เช่น 20" />
      </label>
      <button type="button" className="text-button" onClick={() => setUnitsText(String(item.units))}>ขายทั้งหมด</button>
      {unitsText && !valid && <StateCard tone="error" title="จำนวนไม่ถูกต้อง" detail={`ขายได้สูงสุด ${formatUnits(item.units)} หน่วย`} />}
      {error && <StateCard tone="error" title="บันทึกไม่สำเร็จ" detail={error} />}
      <button className="save" onClick={submit} disabled={busy || !valid}>
        {busy ? "กำลังบันทึก..." : "บันทึก"}
      </button>
    </SheetFrame>
  );
}

export function InvestmentPriceSheet({
  item,
  busy,
  error,
  onClose,
  onSubmit,
  closing,
}: {
  item: Investment;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (item: Investment, nav: number, recordedAt: string) => Promise<boolean>;
  closing?: boolean;
}) {
  const [navText, setNavText] = useState("");
  const [recordedAt, setRecordedAt] = useState(todayDateInput);
  const nav = toFiniteNumber(navText);

  const submit = async () => {
    if (!(nav > 0)) return;
    const saved = await onSubmit(item, nav, recordedAt);
    if (saved) onClose();
  };

  return (
    <SheetFrame onClose={onClose} closing={closing}>
      <div className="sheet-head">
        <div>
          <p className="eyebrow">พอร์ตลงทุน</p>
          <h2>อัปเดตราคา {item.name}</h2>
        </div>
        <button onClick={onClose}>x</button>
      </div>
      <label>
        ราคาต่อหน่วย (NAV)
        <input autoFocus inputMode="decimal" value={navText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setNavText(event.target.value); }} placeholder="เช่น 10.3400" />
      </label>
      <label>
        ราคา ณ วันที่
        <DateField value={recordedAt} max={todayDateInput()} onChange={setRecordedAt} />
      </label>
      {error && <StateCard tone="error" title="บันทึกไม่สำเร็จ" detail={error} />}
      <button className="save" onClick={submit} disabled={busy || !(nav > 0)}>
        {busy ? "กำลังบันทึก..." : "บันทึก"}
      </button>
    </SheetFrame>
  );
}

export function InvestmentConfirmUnitsSheet({
  entry,
  investmentName,
  busy,
  error,
  onClose,
  onSubmit,
  onExtractUnits,
  closing,
}: {
  entry: Entry;
  investmentName: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (entry: Entry, units: number) => Promise<boolean>;
  onExtractUnits: (image: SlipImage, targetAmount: number) => Promise<{ found: boolean; units: number; price_per_unit: number; amount: number; transaction_date: string }>;
  closing?: boolean;
}) {
  const [unitsText, setUnitsText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState<{ tone: "success" | "warning" | "error"; text: string } | null>(null);
  const units = toFiniteNumber(unitsText);
  const pricePerUnit = units > 0 ? entry.amount / units : null;

  const attachStatement = async (file: File | undefined) => {
    if (!file) return;
    setExtracting(true);
    setExtractNote(null);
    try {
      const image = await compressSlipImage(file);
      const result = await onExtractUnits(image, entry.amount);
      if (!result.found || !(result.units > 0)) {
        setExtractNote({ tone: "warning", text: "AI ไม่พบแถวรายการซื้อในรูปนี้ ลองแนบรูปที่เห็นตารางประวัติการซื้อชัดเจน หรือกรอกหน่วยเอง" });
        return;
      }
      setUnitsText(String(result.units));
      const amountDiff = Math.abs(result.amount - entry.amount);
      if (amountDiff > 1) {
        setExtractNote({ tone: "warning", text: `อ่านได้ ${formatUnits(result.units)} หน่วย แต่ยอดเงินในรูป (${moneySign}${formatMoney(result.amount)}) ไม่ตรงกับยอดที่จ่ายไป (${moneySign}${formatMoney(entry.amount)}) เท่าไหร่ — เช็คให้แน่ใจก่อนกดยืนยัน` });
      } else {
        setExtractNote({ tone: "success", text: `อ่านได้ ${formatUnits(result.units)} หน่วย ตรงกับยอด ${moneySign}${formatMoney(result.amount)} — ตรวจอีกครั้งก่อนกดยืนยัน` });
      }
    } catch (e) {
      setExtractNote({ tone: "error", text: e instanceof Error ? e.message : "อ่านรูปไม่สำเร็จ" });
    }
    setExtracting(false);
  };

  const submit = async () => {
    if (!(units > 0)) return;
    const saved = await onSubmit(entry, units);
    if (saved) onClose();
  };

  return (
    <SheetFrame onClose={onClose} closing={closing}>
      <div className="sheet-head">
        <div>
          <p className="eyebrow">พอร์ตลงทุน</p>
          <h2>ยืนยันหน่วย {investmentName}</h2>
        </div>
        <button onClick={onClose}>x</button>
      </div>
      <small className="cycle-note">จ่ายไปแล้ว {moneySign}{formatMoney(entry.amount)} เมื่อ {formatDateTime(entry.occurred_at)}</small>
      <label className="attach-button">
        {extracting ? "กำลังอ่านรูป..." : "แนบรูป statement ให้ AI อ่านหน่วยให้"}
        <input type="file" accept="image/*" disabled={extracting} onChange={(event) => { void attachStatement(event.target.files?.[0]); event.currentTarget.value = ""; }} />
      </label>
      {extractNote && (extractNote.tone === "success"
        ? <p className="pin-hint">{extractNote.text}</p>
        : <StateCard tone="error" title="ลองตรวจสอบอีกครั้ง" detail={extractNote.text} />)}
      <label>
        จำนวนหน่วยที่ได้จริง
        <input autoFocus inputMode="decimal" value={unitsText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) setUnitsText(event.target.value); }} placeholder="เช่น 92.6397" />
      </label>
      {pricePerUnit != null && <small className="cycle-note">ราคาต่อหน่วย {pricePerUnit.toFixed(4)}</small>}
      {error && <StateCard tone="error" title="บันทึกไม่สำเร็จ" detail={error} />}
      <button className="save" onClick={submit} disabled={busy || !(units > 0)}>
        {busy ? "กำลังบันทึก..." : "ยืนยัน"}
      </button>
    </SheetFrame>
  );
}

export type InvestmentAiDraft = {
  investmentId: string | null;
  investment_name: string;
  amountText: string;
  date: string;
  wallet_id: string;
  note: string;
};

export function InvestmentAiSheet({
  investments,
  wallets,
  busy,
  error,
  onClose,
  onAnalyze,
  onSave,
  closing,
}: {
  investments: Investment[];
  wallets: Wallet[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onAnalyze: (text: string) => Promise<InvestmentDraftItem[]>;
  onSave: (input: { investmentId: string | null; name: string; walletId: string; amount: number; occurredAt: string; note?: string }) => Promise<boolean>;
  closing?: boolean;
}) {
  const [text, setText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [drafts, setDrafts] = useState<InvestmentAiDraft[]>([]);

  const runAnalyze = async () => {
    if (!text.trim()) return;
    setAnalyzing(true);
    setAnalyzeError("");
    try {
      const items = await onAnalyze(text);
      if (!items.length) setAnalyzeError("AI ไม่พบรายการลงทุนในข้อความนี้ ลองพิมพ์ให้ชัดเจนขึ้น เช่น ระบุจำนวนเงิน");
      setDrafts(items.map((item) => {
        const matched = investments.find((inv) => inv.name.trim().toLowerCase() === item.investment_name.trim().toLowerCase());
        return {
          investmentId: matched?.id ?? null,
          investment_name: matched?.name ?? item.investment_name,
          amountText: item.amount ? String(item.amount) : "",
          date: DATE_INPUT_PATTERN.test(item.date) ? item.date : todayDateInput(),
          wallet_id: wallets.some((wallet) => wallet.id === item.wallet_id) ? item.wallet_id : (defaultWalletId(wallets) ?? ""),
          note: item.note,
        };
      }));
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
    setAnalyzing(false);
  };

  const updateDraft = (index: number, patch: Partial<InvestmentAiDraft>) => {
    setDrafts((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const removeDraft = (index: number) => setDrafts((current) => current.filter((_, i) => i !== index));

  const saveAll = async () => {
    for (const draft of drafts) {
      const amount = toMoneyAmount(draft.amountText);
      if (!(amount > 0) || !draft.wallet_id || (!draft.investmentId && !draft.investment_name.trim())) continue;
      const saved = await onSave({
        investmentId: draft.investmentId,
        name: draft.investment_name,
        walletId: draft.wallet_id,
        amount,
        occurredAt: fromDateInput(draft.date),
        note: draft.note,
      });
      if (!saved) return;
    }
    onClose();
  };

  return (
    <SheetFrame onClose={onClose} closing={closing}>
      <div className="sheet-head">
        <div>
          <p className="eyebrow">พอร์ตลงทุน</p>
          <h2>บันทึกด้วย AI</h2>
        </div>
        <button onClick={onClose}>x</button>
      </div>
      {!drafts.length && (
        <>
          <label>
            พิมพ์รายการลงทุน
            <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="เช่น DCA K-WSPEEDUP 1000 บาท จากกระเป๋าหลัก" />
          </label>
          {analyzeError && <StateCard tone="error" title="AI ยังวิเคราะห์ไม่ได้" detail={analyzeError} />}
          <button className="save" onClick={runAnalyze} disabled={analyzing || !text.trim()}>
            {analyzing ? "กำลังวิเคราะห์..." : "ให้ AI แยกรายการ"}
          </button>
        </>
      )}
      {!!drafts.length && (
        <>
          <p className="pin-hint">รายการนี้จะหักเงินออกจากกระเป๋าทันที แต่ยังไม่ทราบจำนวนหน่วย — ไปยืนยันหน่วยทีหลังในหน้าพอร์ตลงทุนได้เมื่อรู้ผล</p>
          {drafts.map((draft, index) => (
            <div className="review" key={index}>
              <label>
                กองทุน/สินทรัพย์
                <div className="select-shell">
                  <select value={draft.investmentId ?? "new"} onChange={(event) => updateDraft(index, { investmentId: event.target.value === "new" ? null : event.target.value })}>
                  <option value="new">+ {draft.investment_name.trim() || "สร้างใหม่"}</option>
                  {investments.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                  <ChevronDown className="select-shell-chevron" aria-hidden="true" />
                </div>
              </label>
              {!draft.investmentId && (
                <label>
                  ชื่อกองทุน/สินทรัพย์ใหม่
                  <input value={draft.investment_name} onChange={(event) => updateDraft(index, { investment_name: event.target.value })} placeholder="เช่น K-WSPEEDUP" />
                </label>
              )}
              <label>
                จำนวนเงิน
                <input inputMode="decimal" value={draft.amountText} onChange={(event) => { if (event.target.value === "" || decimalInputPattern.test(event.target.value)) updateDraft(index, { amountText: event.target.value }); }} />
              </label>
              <label>
                กระเป๋าต้นทาง
                <div className="select-shell">
                  <select value={draft.wallet_id} onChange={(event) => updateDraft(index, { wallet_id: event.target.value })}>
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
                  ))}
                </select>
                  <ChevronDown className="select-shell-chevron" aria-hidden="true" />
                </div>
              </label>
              <label>
                วันที่
                <DateField value={draft.date} max={todayDateInput()} onChange={(next) => updateDraft(index, { date: next })} />
              </label>
              <button type="button" className="review-cancel-all" onClick={() => removeDraft(index)}>ลบรายการนี้</button>
            </div>
          ))}
          {error && <StateCard tone="error" title="บันทึกไม่สำเร็จ" detail={error} />}
          <button className="save" onClick={saveAll} disabled={busy || !drafts.length}>
            {busy ? "กำลังบันทึก..." : `บันทึก ${drafts.length} รายการ`}
          </button>
        </>
      )}
    </SheetFrame>
  );
}

