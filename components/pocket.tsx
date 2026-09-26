"use client";

// The billboard's back: a pocket of the user's own cards (lib/pocket.ts).
//
// The front of the billboard is the balance and always what Home opens on; a
// button in its corner turns it over, and the back is this -- one card at a
// time, swiped sideways, each showing its code straight away with a line
// under it saying whose it is. Turning it back is the button in the same
// corner. The two actions under the code are the front's two buttons, doing
// the card's jobs instead: แชร์ and รายละเอียด.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Copy, CreditCard, IdCard, ImageUp, Info, Landmark, Menu, Pencil, Plus, QrCode as QrCodeIcon, RotateCcw, ScanQrCode, Share2, Sparkles, Ticket, Trash2, WalletCards } from "lucide-react";
import {
  APP_NAME,
  POCKET_BANK_MAX_LENGTH,
  POCKET_BARCODE_MAX_LENGTH,
  POCKET_CARD_LIMIT,
  POCKET_DETAIL_MAX_LENGTH,
  POCKET_HOLDER_MAX_LENGTH,
  POCKET_LABEL_MAX_LENGTH,
  POCKET_VALUE_MAX_LENGTH,
} from "@/lib/constants";
import { authHeaders } from "@/lib/api";
import { todayDateInput } from "@/lib/cycle";
import { compressSlipImage } from "@/lib/image";
import {
  POCKET_BANKS,
  POCKET_HUES,
  POCKET_CODE_LABELS,
  POCKET_KIND_GROUPS,
  POCKET_KIND_LABELS,
  applyTicketReading,
  canEncodeCode128,
  code128Widths,
  isGeneralPocketKind,
  isPocketPast,
  normalizeTicketReading,
  orderPocketForDisplay,
  pocketCodeFormat,
  pocketDetailLine,
  formatPocketWhen,
  describeScannedQr,
  digitsOnly,
  encodeQr,
  formatAccountNumber,
  formatPromptPayNumber,
  pocketCardCaption,
  pocketCopyValue,
  pocketDraftProblem,
  pocketQrPayload,
  promptPayTarget,
  type PocketCard,
  type PocketCardKind,
} from "@/lib/pocket";
import { DateField, EmptyNote, InfoHint, SheetClose, SheetFrame } from "@/components/primitives";

const hueStyle = (hue: string) => ({ "--hue": `var(${hue})` }) as React.CSSProperties;

export const POCKET_KIND_ICONS: Record<PocketCardKind, typeof QrCodeIcon> = {
  promptpay: QrCodeIcon,
  qr: ScanQrCode,
  account: Landmark,
  membership: IdCard,
  ticket: Ticket,
  other: CreditCard,
};

/** What a general card's issuer field is called, by what the card is. */
function pocketIssuerLabel(kind: PocketCardKind) {
  if (kind === "ticket") return "ผู้จัด/โรงหนัง";
  if (kind === "membership") return "ร้าน/ผู้ออกบัตร";
  return "ผู้ออกบัตร";
}

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------

/**
 * A QR as one SVG path of its dark modules, black on the white paper every
 * scanner expects -- the app is dark, but a light-on-dark QR is one many
 * camera apps will not read.
 */
//
// Memoised on its text: encoding a QR is the most expensive thing on Home,
// and Home re-renders on every tab change -- re-encoding the pocket's cards
// each time cost a tap to History its frame budget.
export const QrCode = memo(function QrCode({ payload, label }: { payload: string; label: string }) {
  const quiet = 3;
  const { path, size } = useMemo(() => {
    const modules = encodeQr(payload);
    let d = "";
    modules.forEach((cells, row) => cells.forEach((dark, col) => {
      if (dark) d += `M${col + quiet} ${row + quiet}h1v1h-1z`;
    }));
    return { path: d, size: modules.length + quiet * 2 };
  }, [payload]);
  return (
    <svg className="pocket-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} className="pocket-paper" />
      <path d={path} className="pocket-ink" />
    </svg>
  );
});

export const Barcode = memo(function Barcode({ value, label }: { value: string; label: string }) {
  const widths = code128Widths(value);
  const quiet = 10;
  const total = widths.reduce((sum, width) => sum + width, 0) + quiet * 2;
  // Each bar starts where every element before it ends.
  const starts = widths.map((_, index) => quiet + widths.slice(0, index).reduce((sum, width) => sum + width, 0));
  const bars = widths.map((width, index) =>
    index % 2 === 0 ? <rect key={index} x={starts[index]} y={0} width={width} height={40} className="pocket-ink" /> : null,
  );
  return (
    <figure className="pocket-barcode">
      <svg viewBox={`0 0 ${total} 40`} preserveAspectRatio="none" role="img" aria-label={label} shapeRendering="crispEdges">
        <rect width={total} height={40} className="pocket-paper" />
        {bars}
      </svg>
      <figcaption>{value}</figcaption>
    </figure>
  );
});

/**
 * Whatever a card shows in the middle: its QR, its barcode, or -- for an
 * account, or a card with no code -- its number or its name set large.
 */
export const PocketCode = memo(function PocketCode({ card }: { card: PocketCard }) {
  const payload = pocketQrPayload(card);
  if (payload) return <QrCode payload={payload} label={`QR ของ ${card.label}`} />;
  const format = pocketCodeFormat(card);
  if (format === "barcode" && card.value) return <Barcode value={card.value} label={`บาร์โค้ด ${card.label}`} />;
  if (card.kind === "account") {
    return (
      <div className="pocket-number">
        <span>เลขบัญชี</span>
        <b>{formatAccountNumber(card.value)}</b>
      </div>
    );
  }
  return (
    <div className="pocket-number is-title">
      <span>{POCKET_KIND_LABELS[card.kind]}</span>
      <b>{card.details.title || card.label}</b>
    </div>
  );
});

/**
 * The clock the pocket reads "has this ticket passed" against. Moves once a
 * minute, which is as fine as a ticket's time is printed.
 */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

// ---------------------------------------------------------------------------
// The flip
// ---------------------------------------------------------------------------

/**
 * The billboard's two faces in one box. Holds only which face is up, and
 * starts on the front every time Home mounts -- the balance is what the app
 * opens on, never whatever card was left showing. The face that is turned
 * away is `inert`, so neither a tab key nor a screen reader lands on a
 * button that is facing the wall.
 */
export function FlipBillboard({
  front,
  back,
}: {
  front: (flip: () => void) => React.ReactNode;
  back: (flip: () => void) => React.ReactNode;
}) {
  // Counted rather than a boolean, so the effect below can tell "never
  // turned" (Home just opened) from "turned back to the front".
  const [turns, setTurns] = useState(0);
  const flipped = turns % 2 === 1;
  const rootRef = useRef<HTMLDivElement>(null);
  const flip = useCallback(() => setTurns((count) => count + 1), []);
  // Focus follows the turn to the button that turns it back, so a keyboard
  // is not left on a face that just went inert. Not on mount: Home opening
  // must not steal focus.
  useEffect(() => {
    if (!turns) return;
    rootRef.current?.querySelector<HTMLElement>(".billboard-face:not([inert]) .billboard-flip-button")?.focus({ preventScroll: true });
  }, [turns]);
  return (
    <div ref={rootRef} className={`billboard-flip${flipped ? " is-flipped" : ""}`}>
      <div className="billboard-face is-front" inert={flipped}>{front(flip)}</div>
      <div className="billboard-face is-back" inert={!flipped}>{back(flip)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The back
// ---------------------------------------------------------------------------

export function PocketFace({
  cards: savedOrder,
  onFlip,
  onManage,
  onAdd,
  onShare,
  onDetails,
  onDelete,
}: {
  cards: PocketCard[];
  onFlip: () => void;
  onManage: () => void;
  onAdd: () => void;
  onShare: (card: PocketCard) => void;
  onDetails: (card: PocketCard) => void;
  onDelete: (card: PocketCard) => void;
}) {
  // Tickets whose event is over go to the back of the deck, dimmed, with a
  // way to throw them out -- never deleted on their own.
  const now = useMinuteClock();
  const cards = useMemo(() => orderPocketForDisplay(savedOrder, now), [savedOrder, now]);
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const current = cards[Math.min(index, cards.length - 1)];

  // Where an arrow press is heading while the smooth scroll is still on its
  // way. Counting each press from the slide last settled on made three quick
  // presses move one card; counted from here, each one moves one more.
  const headingRef = useRef<number | null>(null);
  const onScroll = () => {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    const settled = Math.round(track.scrollLeft / track.clientWidth);
    setIndex(settled);
    if (headingRef.current === settled && Math.abs(track.scrollLeft - settled * track.clientWidth) < 1) headingRef.current = null;
  };
  const goTo = (next: number) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(cards.length - 1, next));
    headingRef.current = clamped;
    track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
  };
  const step = (delta: 1 | -1) => goTo((headingRef.current ?? index) + delta);

  // A card removed or reordered from the manage sheet can leave the track
  // pointing past its end; snap back to the last one rather than to nothing.
  useEffect(() => {
    if (index > cards.length - 1 && cards.length) goTo(cards.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length]);

  return (
    <div className="pocket-face" style={current ? hueStyle(current.hue) : undefined}>
      <div className="pocket-head">
        <InfoHint label="กระเป๋าการ์ด">
          เก็บพร้อมเพย์ QR รับเงิน เลขบัญชี บัตรสมาชิก และตั๋วที่มี QR หรือบาร์โค้ดไว้ตรงนี้ ปัดซ้ายขวาเพื่อเปลี่ยนใบ กดแชร์เพื่อคัดลอกเลขหรือส่งการ์ดเป็นรูป แอปเก็บแค่ข้อความที่ใช้วาดโค้ด ไม่เก็บรูป ตั๋วที่ผ่านไปแล้วจะย้ายไปท้ายสุด
        </InfoHint>
        <b>กระเป๋าการ์ด</b>
        <span className="pocket-count">{cards.length > 0 ? `${Math.min(index, cards.length - 1) + 1}/${cards.length}` : ""}</span>
        <button type="button" className="pocket-icon-button" onClick={onManage} aria-label="จัดการการ์ด">
          <Menu size={18} strokeWidth={2.25} aria-hidden="true" />
        </button>
        <button type="button" className="pocket-icon-button billboard-flip-button" onClick={onFlip} aria-label="กลับไปที่ยอดเงิน">
          <RotateCcw size={18} strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="pocket-empty">
          <EmptyNote glyph="▣" action={{ label: "เพิ่มการ์ดแรก", onClick: onAdd }}>
            ยังไม่มีการ์ด เพิ่มพร้อมเพย์ให้คนสแกนจ่าย หรือบัตรสมาชิกและตั๋วไว้ยื่นสแกน
          </EmptyNote>
        </div>
      ) : (
        <>
          <div className="pocket-stage">
            <div
              ref={trackRef}
              className="pocket-track"
              onScroll={onScroll}
              role="group"
              aria-roledescription="carousel"
              aria-label="การ์ดในกระเป๋า"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
                if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
              }}
              // A finger takes over from any arrow press still on its way.
              onPointerDown={() => { headingRef.current = null; }}
            >
              {cards.map((card, cardIndex) => {
                const past = isPocketPast(card, now);
                const detail = pocketDetailLine(card);
                return (
                  <section
                    key={card.id}
                    className={`pocket-slide is-${card.kind}${past ? " is-past" : ""}`}
                    style={hueStyle(card.hue)}
                    aria-roledescription="slide"
                    aria-label={`${cardIndex + 1} จาก ${cards.length}: ${card.label}${past ? " (ผ่านไปแล้ว)" : ""}`}
                  >
                    <div className="pocket-code"><PocketCode card={card} /></div>
                    <div className="pocket-words">
                      {past && <span className="pocket-past">ผ่านไปแล้ว</span>}
                      <strong>{card.label}</strong>
                      <span>{pocketCardCaption(card)}</span>
                      {detail && <span className="pocket-when">{detail}</span>}
                    </div>
                  </section>
                );
              })}
            </div>
            {cards.length > 1 && (
              <>
                <button type="button" className="pocket-arrow is-prev" onClick={() => step(-1)} disabled={index === 0} aria-label="การ์ดก่อนหน้า">
                  <ChevronLeft size={20} strokeWidth={2.25} aria-hidden="true" />
                </button>
                <button type="button" className="pocket-arrow is-next" onClick={() => step(1)} disabled={index >= cards.length - 1} aria-label="การ์ดถัดไป">
                  <ChevronRight size={20} strokeWidth={2.25} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
          {cards.length > 1 && (
            <div className="pocket-dots" aria-hidden="true">
              {cards.map((card, cardIndex) => <i key={card.id} className={cardIndex === index ? "is-on" : ""} />)}
            </div>
          )}
          {current && (
            <div className="billboard-actions">
              {/* A ticket that has passed has nothing left to share: its first
                  action is throwing it out. */}
              {isPocketPast(current, now) ? (
                <button className="detail-delete pocket-past-delete" onClick={() => onDelete(current)}>
                  <Trash2 size={20} strokeWidth={2.25} aria-hidden="true" />ลบตั๋วนี้
                </button>
              ) : (
                <button className="billboard-cta" onClick={() => onShare(current)}>
                  <Share2 size={20} strokeWidth={2.25} aria-hidden="true" />แชร์
                </button>
              )}
              <button className="billboard-cta-2" onClick={() => onDetails(current)}>
                <Info size={20} strokeWidth={2.25} aria-hidden="true" />รายละเอียด
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sharing: the number as text, or the card as a picture
// ---------------------------------------------------------------------------

function cssToken(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * Draws the card the way the back of the billboard shows it -- its hue, the
 * code on white paper, the name and the line under it -- into a PNG, for
 * the share sheet. Colours come from the live tokens, so the picture never
 * drifts from the app.
 */
export async function renderPocketCardImage(card: PocketCard): Promise<Blob> {
  const width = 1080;
  const height = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const font = getComputedStyle(document.body).fontFamily;
  const hue = cssToken(card.hue) || cssToken("--accent");
  const ground = cssToken("--bg");
  const surface = cssToken("--surface");
  const ink = cssToken("--ink");
  const ink2 = cssToken("--ink-2");
  const paper = cssToken("--qr-paper");
  const qrInk = cssToken("--qr-ink");

  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, width, height);
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, hue);
  gradient.addColorStop(0.55, surface);
  gradient.addColorStop(1, ground);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = gradient;
  roundRect(ctx, 60, 60, width - 120, height - 120, 36);
  ctx.fill();
  ctx.globalAlpha = 1;

  const panel = 720;
  const panelX = (width - panel) / 2;
  const panelY = 200;
  const payload = pocketQrPayload(card);
  const barcode = !payload && pocketCodeFormat(card) === "barcode" && !!card.value;
  // A QR needs a square; a barcode, an account number or a card's name a strip.
  const panelHeight = payload ? panel : 360;
  ctx.fillStyle = paper;
  roundRect(ctx, panelX, panelY, panel, panelHeight, 28);
  ctx.fill();

  ctx.fillStyle = qrInk;
  if (payload) {
    const modules = encodeQr(payload);
    const count = modules.length;
    const cell = Math.floor((panel - 80) / count);
    const offset = panelX + (panel - cell * count) / 2;
    const offsetY = panelY + (panel - cell * count) / 2;
    modules.forEach((cells, row) => cells.forEach((dark, col) => {
      if (dark) ctx.fillRect(offset + col * cell, offsetY + row * cell, cell, cell);
    }));
  } else if (barcode) {
    const widths = code128Widths(card.value);
    const modules = widths.reduce((sum, value) => sum + value, 0);
    const unit = (panel - 80) / modules;
    let x = panelX + 40;
    widths.forEach((value, index) => {
      if (index % 2 === 0) ctx.fillRect(x, panelY + 40, value * unit, 220);
      x += value * unit;
    });
    ctx.font = `500 36px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText(card.value, width / 2, panelY + 316, panel - 80);
  } else if (card.kind === "account") {
    ctx.font = `600 34px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText(card.bank ?? "เลขบัญชี", width / 2, panelY + 130, panel - 80);
    ctx.font = `700 76px ${font}`;
    ctx.fillText(formatAccountNumber(card.value), width / 2, panelY + 240, panel - 80);
  } else {
    ctx.font = `600 34px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText(POCKET_KIND_LABELS[card.kind], width / 2, panelY + 130, panel - 80);
    ctx.font = `700 64px ${font}`;
    ctx.fillText(card.details.title || card.label, width / 2, panelY + 230, panel - 80);
  }

  const wordsY = payload ? panelY + panel + 110 : panelY + panelHeight + 120;
  ctx.textAlign = "center";
  ctx.fillStyle = ink;
  ctx.font = `700 58px ${font}`;
  ctx.fillText(card.label, width / 2, wordsY, width - 200);
  ctx.fillStyle = ink2;
  ctx.font = `500 36px ${font}`;
  ctx.fillText(pocketCardCaption(card), width / 2, wordsY + 64, width - 200);
  const detail = pocketDetailLine(card);
  if (detail) ctx.fillText(detail, width / 2, wordsY + 118, width - 200);
  ctx.font = `600 28px ${font}`;
  ctx.fillText(APP_NAME, width / 2, height - 110);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))), "image/png"));
}

/**
 * Hands the picture to the OS share sheet, or saves it where there is none
 * (most desktops). Takes a blob that is already drawn: iOS only lets a tap
 * open the share sheet if nothing slow happened in between, and drawing a
 * 1080px card is slow enough to lose it.
 */
async function shareCardImage(card: PocketCard, blob: Blob) {
  const name = `${card.label.replace(/[\\/:*?"<>|]/g, " ").trim() || APP_NAME}.png`;
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: card.label });
    return "shared" as const;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded" as const;
}

export function PocketShareSheet({
  card,
  onClose,
  onNotify,
  closing,
}: {
  card: PocketCard;
  onClose: () => void;
  onNotify: (message: string, tone?: "success" | "error") => void;
  closing?: boolean;
}) {
  const copy = pocketCopyValue(card);
  const [image, setImage] = useState<Blob | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Drawn as soon as the sheet opens, so the tap on แชร์เป็นรูป goes straight
  // to the share sheet (see shareCardImage). Fonts first: a canvas drawn
  // before the webfont is ready falls back to a system face.
  useEffect(() => {
    let live = true;
    document.fonts.ready
      .then(() => renderPocketCardImage(card))
      .then((blob) => { if (live) setImage(blob); })
      .catch(() => { if (live) setImageFailed(true); });
    return () => { live = false; };
  }, [card]);

  // National ID numbers stay masked on screen here too; the copy is whole.
  const shownCopy = copy && card.kind === "promptpay" ? formatPromptPayNumber(card.value) : copy?.text;

  return (
    <SheetFrame onClose={onClose} closing={closing} className="edit-sheet pocket-sheet">
      <div className="sheet-head">
        <div><p className="eyebrow">แชร์การ์ด</p><h2>{card.label}</h2></div>
        <SheetClose onClick={onClose} />
      </div>
      <div className="pocket-share-options">
        {copy && (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(copy.text);
                onNotify(`คัดลอก${copy.label}แล้ว`);
                onClose();
              } catch {
                onNotify("คัดลอกไม่ได้ ลองอีกครั้ง หรือเปิดรายละเอียดแล้วกดค้างที่ตัวเลข", "error");
              }
            }}
          >
            <Copy size={20} strokeWidth={2.25} aria-hidden="true" />
            <span><b>คัดลอก{copy.label}</b><small>{shownCopy}</small></span>
          </button>
        )}
        <button
          type="button"
          disabled={!image || sharing}
          onClick={async () => {
            if (!image) return;
            setSharing(true);
            try {
              const result = await shareCardImage(card, image);
              if (result === "downloaded") onNotify("บันทึกรูปการ์ดแล้ว");
              onClose();
            } catch (error) {
              // Closing the OS share sheet without picking anything rejects
              // with AbortError, which is not a failure.
              if ((error as Error).name !== "AbortError") onNotify("แชร์รูปการ์ดไม่สำเร็จ", "error");
            } finally {
              setSharing(false);
            }
          }}
        >
          <ImageUp size={20} strokeWidth={2.25} aria-hidden="true" />
          <span>
            <b>แชร์เป็นรูป</b>
            <small>{imageFailed ? "สร้างรูปการ์ดไม่สำเร็จ" : image ? "ส่งการ์ดทั้งใบให้คนอื่นสแกนได้" : "กำลังเตรียมรูป..."}</small>
          </span>
        </button>
      </div>
    </SheetFrame>
  );
}

// ---------------------------------------------------------------------------
// Details
// ---------------------------------------------------------------------------

export function PocketDetailSheet({
  card,
  onClose,
  onShare,
  onEdit,
  onDelete,
  closing,
}: {
  card: PocketCard;
  onClose: () => void;
  onShare: (card: PocketCard) => void;
  onEdit: (card: PocketCard) => void;
  onDelete: (card: PocketCard) => void;
  closing?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const isNationalId = card.kind === "promptpay" && promptPayTarget(card.value) === "national_id";
  const facts: [string, React.ReactNode][] = [["ประเภท", POCKET_KIND_LABELS[card.kind]]];
  if (card.kind === "promptpay") {
    facts.push([
      promptPayTarget(card.value) === "phone" ? "เบอร์" : "เลข",
      <span key="n" className="pocket-fact-number">
        {formatPromptPayNumber(card.value, !revealed)}
        {isNationalId && (
          <button type="button" className="text-button" onClick={() => setRevealed((value) => !value)}>
            {revealed ? "ซ่อน" : "แสดง"}
          </button>
        )}
      </span>,
    ]);
  }
  const general = isGeneralPocketKind(card.kind);
  if (card.kind === "account") facts.push(["เลขบัญชี", formatAccountNumber(card.value)]);
  if (card.kind === "qr") facts.push(["ชนิด QR", describeScannedQr(card.value) ?? "ข้อความทั่วไป"]);
  if (general) facts.push(["โค้ด", POCKET_CODE_LABELS[pocketCodeFormat(card)]]);
  if (general && card.code === "barcode" && card.value) facts.push(["เลขบาร์โค้ด", card.value]);
  if (card.details.title) facts.push([card.kind === "ticket" ? "เรื่อง/งาน" : "ชื่อบนบัตร", card.details.title]);
  const when = formatPocketWhen(card.details);
  if (when) facts.push(["วันเวลา", when]);
  if (card.details.venue) facts.push(["สถานที่", card.details.venue]);
  if (card.details.seat) facts.push(["ที่นั่ง", card.details.seat]);
  if (card.bank) facts.push([general ? pocketIssuerLabel(card.kind) : "ธนาคาร", card.bank]);
  if (card.holder) facts.push(["ชื่อ", card.holder]);

  return (
    <SheetFrame onClose={onClose} closing={closing} className="edit-sheet pocket-sheet pocket-detail-sheet">
      <div className="sheet-head">
        <div><p className="eyebrow">{POCKET_KIND_LABELS[card.kind]}</p><h2>{card.label}</h2></div>
        <SheetClose onClick={onClose} />
      </div>
      {/* As large as the sheet allows: this is the view to hold up to
          someone else's phone. */}
      <div className="pocket-detail-code" style={hueStyle(card.hue)}><PocketCode card={card} /></div>
      <dl className="pocket-facts">
        {facts.map(([term, value]) => (
          <div key={term}><dt>{term}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      <div className="detail-actions">
        <button className="billboard-cta" onClick={() => onShare(card)}>
          <Share2 size={18} strokeWidth={2.25} aria-hidden="true" />แชร์
        </button>
        <button className="billboard-cta-2" onClick={() => onEdit(card)}>
          <Pencil size={18} strokeWidth={2.25} aria-hidden="true" />แก้ไข
        </button>
        <button className="detail-delete" onClick={() => onDelete(card)}>
          <Trash2 size={18} strokeWidth={2.25} aria-hidden="true" />ลบการ์ดนี้
        </button>
      </div>
    </SheetFrame>
  );
}

// ---------------------------------------------------------------------------
// Manage (≡): the list, its order, and the way into the form
// ---------------------------------------------------------------------------

export function PocketManageSheet({
  cards,
  onClose,
  onAdd,
  onEdit,
  onMove,
  closing,
}: {
  cards: PocketCard[];
  onClose: () => void;
  onAdd: () => void;
  onEdit: (card: PocketCard) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  closing?: boolean;
}) {
  return (
    <SheetFrame onClose={onClose} closing={closing} className="edit-sheet pocket-sheet">
      <div className="sheet-head">
        <div><p className="eyebrow">กระเป๋าการ์ด</p><h2>จัดการการ์ด</h2></div>
        <SheetClose onClick={onClose} />
      </div>
      {cards.length === 0 ? (
        <EmptyNote glyph="▣">ยังไม่มีการ์ด</EmptyNote>
      ) : (
        <ol className="pocket-manage-list">
          {cards.map((card, index) => {
            const Icon = POCKET_KIND_ICONS[card.kind];
            return (
              <li key={card.id} style={hueStyle(card.hue)}>
                <button type="button" className="pocket-manage-row" onClick={() => onEdit(card)}>
                  <span className="icon-chip" aria-hidden="true"><Icon size={18} strokeWidth={2.25} /></span>
                  <span className="pocket-manage-words"><b>{card.label}</b><small>{pocketCardCaption(card)}</small></span>
                </button>
                <button type="button" className="pocket-icon-button" onClick={() => onMove(card.id, -1)} disabled={index === 0} aria-label={`เลื่อน ${card.label} ขึ้น`}>
                  <ArrowUp size={16} strokeWidth={2.25} aria-hidden="true" />
                </button>
                <button type="button" className="pocket-icon-button" onClick={() => onMove(card.id, 1)} disabled={index === cards.length - 1} aria-label={`เลื่อน ${card.label} ลง`}>
                  <ArrowDown size={16} strokeWidth={2.25} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {cards.length >= POCKET_CARD_LIMIT && <p className="pocket-form-note">ครบ {POCKET_CARD_LIMIT} ใบแล้ว ลบใบที่ไม่ใช้ก่อนเพิ่มใบใหม่</p>}
      <button className="primary" onClick={onAdd} disabled={cards.length >= POCKET_CARD_LIMIT}>
        <Plus size={20} strokeWidth={2.5} aria-hidden="true" />เพิ่มการ์ด
      </button>
    </SheetFrame>
  );
}

// ---------------------------------------------------------------------------
// The form: add or edit one card
// ---------------------------------------------------------------------------

type ScannedCode = { format: "qr" | "barcode"; text: string };

/** A photo drawn onto a canvas small enough to scan quickly, optionally turned a quarter. */
async function photoPixels(file: File, rotate = false) {
  const bitmap = await createImageBitmap(file);
  // A phone photo is ~3000px on its long side; a code in it reads just as
  // well at 1600, in a fraction of the time.
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = rotate ? height : width;
  canvas.height = rotate ? width : height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  if (rotate) {
    ctx.translate(height, 0);
    ctx.rotate(Math.PI / 2);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Finds the code in a photo, on the device: a QR first (jsQR), then -- when
 * the card may carry one -- a barcode (ZXing), lying either way round. Both
 * libraries load only here, the first time someone picks a photo.
 */
async function decodeCodeFromImage(file: File, qrOnly: boolean): Promise<ScannedCode | null> {
  const { default: jsQR } = await import("jsqr");
  const upright = await photoPixels(file);
  const qr = jsQR(upright.data, upright.width, upright.height);
  if (qr?.data) return { format: "qr", text: qr.data };
  if (qrOnly) return null;

  const { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader, RGBLuminanceSource } = await import("@zxing/library");
  const reader = new MultiFormatReader();
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.CODABAR,
    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.ITF,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  reader.setHints(hints);
  for (const pixels of [upright, await photoPixels(file, true)]) {
    const luminance = new Uint8ClampedArray(pixels.width * pixels.height);
    for (let i = 0; i < luminance.length; i++) {
      const at = i * 4;
      luminance[i] = (pixels.data[at] * 299 + pixels.data[at + 1] * 587 + pixels.data[at + 2] * 114) / 1000;
    }
    try {
      const result = reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, pixels.width, pixels.height))));
      const text = result.getText().trim();
      // Drawn back as Code 128, which carries any printable ASCII.
      if (text && canEncodeCode128(text)) return { format: "barcode", text };
    } catch {
      // Nothing found this way round; try the other.
    }
  }
  return null;
}

/** Asks /api/analyze-ticket to read what is printed on a card or ticket. */
async function readTicketWithAi(file: File, kind: PocketCardKind) {
  const image = await compressSlipImage(file);
  const response = await fetch("/api/analyze-ticket", {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({
      image: { data: image.data, mimeType: image.mimeType },
      kind,
      today: todayDateInput(),
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "อ่านรายละเอียดไม่สำเร็จ");
  return normalizeTicketReading(data.reading);
}

const emptyDraft = (): PocketCard => ({
  id: "", kind: "promptpay", label: "", holder: null, bank: null, value: "", code: "qr", details: {}, hue: POCKET_HUES[0],
});

export function PocketCardForm({
  card,
  busy,
  error,
  onClose,
  onSave,
  onDelete,
  closing,
}: {
  card: PocketCard | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  /** A new card comes with an empty id; the page gives it one on insert. */
  onSave: (card: PocketCard) => void;
  onDelete: (card: PocketCard) => void;
  closing?: boolean;
}) {
  const [draft, setDraft] = useState<PocketCard>(card ?? emptyDraft());
  // The photo stays in memory for the AI button and is never saved.
  const [photo, setPhoto] = useState<File | null>(null);
  const [scanNote, setScanNote] = useState("");
  const [scanError, setScanError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [reading, setReading] = useState(false);
  const set = (patch: Partial<PocketCard>) => setDraft((current) => ({ ...current, ...patch }));
  const setDetails = (patch: Partial<PocketCard["details"]>) =>
    setDraft((current) => ({ ...current, details: { ...current.details, ...patch } }));
  const problem = pocketDraftProblem(draft);
  const general = isGeneralPocketKind(draft.kind);
  const scanned = draft.kind === "qr" && draft.value ? describeScannedQr(draft.value) : null;
  const startsAt = draft.details.startsAt ?? "";
  const startDate = startsAt.slice(0, 10);
  const startTime = startsAt.slice(11, 16);
  const setWhen = (date: string, time: string) => setDetails({ startsAt: date ? (time ? `${date}T${time}` : date) : undefined });

  // Moving between the payment kinds, or into or out of them, starts the
  // number over: a phone number is not an account number. Moving between
  // card kinds keeps what was read off the photo.
  const changeKind = (kind: PocketCardKind) => {
    setDraft((current) => {
      if (isGeneralPocketKind(kind) && isGeneralPocketKind(current.kind)) return { ...current, kind };
      return { ...current, kind, value: "", code: "qr", details: {} };
    });
    setScanError("");
    setScanNote("");
  };

  const pickPhoto = async (file: File) => {
    setScanning(true);
    setScanError("");
    setScanNote("");
    if (general) setPhoto(file);
    try {
      const found = await decodeCodeFromImage(file, !general);
      if (!found) {
        setScanError(general
          ? "ไม่พบ QR หรือบาร์โค้ดในรูปนี้ เลือกชนิดโค้ดแล้วพิมพ์เองได้ หรือให้ AI ช่วยอ่านเลขใต้บาร์โค้ด"
          : "ไม่พบ QR ในรูปนี้ ลองครอปให้เห็น QR ชัด ๆ");
        return;
      }
      if (found.text.length > POCKET_VALUE_MAX_LENGTH) {
        setScanError("โค้ดนี้มีข้อมูลยาวเกินกว่าจะเก็บได้");
        return;
      }
      set({ value: found.text, code: found.format });
      setScanNote(found.format === "qr" ? "พบ QR ในรูปแล้ว" : `พบบาร์โค้ด ${found.text}`);
    } catch {
      setScanError("เปิดรูปนี้ไม่ได้");
    } finally {
      setScanning(false);
    }
  };

  const readWithAi = async () => {
    if (!photo) return;
    setReading(true);
    setScanError("");
    try {
      const result = await readTicketWithAi(photo, draft.kind);
      setDraft((current) => applyTicketReading(current, result));
      setScanNote("AI เติมรายละเอียดให้แล้ว ตรวจดูก่อนบันทึก");
    } catch (readError) {
      setScanError((readError as Error).message);
    } finally {
      setReading(false);
    }
  };

  return (
    <SheetFrame onClose={onClose} closing={closing} className="edit-sheet pocket-sheet">
      <div className="sheet-head">
        <div><p className="eyebrow">กระเป๋าการ์ด</p><h2>{card ? "แก้ไขการ์ด" : "เพิ่มการ์ด"}</h2></div>
        <SheetClose onClick={onClose} />
      </div>

      <label>
        ชนิดการ์ด
        <div className="select-shell">
          <select value={draft.kind} onChange={(event) => changeKind(event.target.value as PocketCardKind)}>
            {POCKET_KIND_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.kinds.map((option) => <option key={option.kind} value={option.kind}>{option.label}</option>)}
              </optgroup>
            ))}
          </select>
          <ChevronDown className="select-shell-chevron" aria-hidden="true" />
        </div>
      </label>

      {(draft.kind === "qr" || general) && (
        <div className="sheet-field">
          <span className="sheet-field-label">
            {draft.kind === "qr" ? "รูป QR รับเงิน (แคปจากแอปธนาคารหรือวอลเล็ต)" : "รูปบัตรหรือตั๋ว"}
          </span>
          <div className="pocket-photo-actions">
            <label className="file-button">
              <ImageUp size={18} strokeWidth={2.25} aria-hidden="true" />
              {scanning ? "กำลังอ่านโค้ด..." : draft.value || photo ? "เปลี่ยนรูป" : "เลือกรูป"}
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void pickPhoto(file);
                }}
              />
            </label>
            {general && (
              <button type="button" className="file-button pocket-ai-button" disabled={!photo || reading || scanning} onClick={readWithAi}>
                <Sparkles size={18} strokeWidth={2.25} aria-hidden="true" />
                {reading ? "AI กำลังอ่าน..." : "ให้ AI ช่วยกรอก"}
              </button>
            )}
          </div>
          <p className="pocket-form-note">
            {scanNote || (draft.kind === "qr"
              ? draft.value
                ? `อ่านได้แล้ว: ${scanned ?? "QR ทั่วไป"} · แอปเก็บแค่ข้อความใน QR ไม่เก็บรูป`
                : "แอปอ่าน QR ในเครื่องแล้ววาดขึ้นใหม่ ตัวรูปไม่ถูกเก็บ"
              : "แอปอ่านโค้ดในรูปบนเครื่อง ตัวรูปไม่ถูกเก็บ · กด “ให้ AI ช่วยกรอก” รูปจึงจะถูกส่งให้ AI อ่านรายละเอียด")}
          </p>
          {scanError && <p className="pocket-form-error" role="alert">{scanError}</p>}
        </div>
      )}

      <label>
        ชื่อการ์ด
        <input value={draft.label} maxLength={POCKET_LABEL_MAX_LENGTH} onChange={(event) => set({ label: event.target.value })} placeholder={pocketLabelPlaceholder(draft.kind)} />
      </label>

      {draft.kind === "promptpay" && (
        <label>
          เบอร์โทร หรือเลขบัตรประชาชน
          <input inputMode="numeric" value={draft.value} onChange={(event) => set({ value: digitsOnly(event.target.value).slice(0, 15) })} placeholder="0812345678" />
        </label>
      )}

      {draft.kind === "account" && (
        <>
          <label>
            เลขบัญชี
            <input inputMode="numeric" value={draft.value} onChange={(event) => set({ value: digitsOnly(event.target.value).slice(0, 15) })} placeholder="1234567890" />
          </label>
          <label>
            ธนาคาร
            <div className="select-shell">
              <select value={draft.bank ?? ""} onChange={(event) => set({ bank: event.target.value || null })}>
                <option value="">เลือกธนาคาร</option>
                {POCKET_BANKS.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
              </select>
              <ChevronDown className="select-shell-chevron" aria-hidden="true" />
            </div>
          </label>
        </>
      )}

      {general && (
        <>
          <div className="sheet-field">
            <span className="sheet-field-label">โค้ดบนบัตร</span>
            <div className="pocket-code-tiles" role="radiogroup" aria-label="โค้ดบนบัตร">
              {(["qr", "barcode", "none"] as const).map((format) => (
                <button
                  type="button"
                  key={format}
                  role="radio"
                  aria-checked={draft.code === format}
                  className={draft.code === format ? "active" : ""}
                  onClick={() => set({ code: format })}
                >
                  {POCKET_CODE_LABELS[format]}
                </button>
              ))}
            </div>
          </div>
          {draft.code !== "none" && (
            <label>
              {draft.code === "qr" ? "ข้อความใน QR" : "เลขบาร์โค้ด"}
              <input
                value={draft.value}
                maxLength={draft.code === "qr" ? POCKET_VALUE_MAX_LENGTH : POCKET_BARCODE_MAX_LENGTH}
                autoCapitalize="characters"
                onChange={(event) => set({ value: draft.code === "barcode" ? event.target.value.trim() : event.target.value })}
                placeholder={draft.code === "qr" ? "อ่านจากรูปให้อัตโนมัติ" : "เลขที่พิมพ์ใต้บาร์โค้ด"}
              />
            </label>
          )}
          {draft.kind === "ticket" && (
            <>
              <label>
                เรื่อง/ชื่องาน
                <input value={draft.details.title ?? ""} maxLength={POCKET_DETAIL_MAX_LENGTH} onChange={(event) => setDetails({ title: event.target.value })} placeholder="เช่น ชื่อหนังหรือคอนเสิร์ต" />
              </label>
              <div className="pocket-when-fields">
                <label>วันที่<DateField value={startDate} onChange={(date) => setWhen(date, startTime)} /></label>
                <label>
                  เวลา
                  <input type="time" value={startTime} disabled={!startDate} onChange={(event) => setWhen(startDate, event.target.value)} />
                </label>
              </div>
              <label>
                สถานที่/โรง
                <input value={draft.details.venue ?? ""} maxLength={POCKET_DETAIL_MAX_LENGTH} onChange={(event) => setDetails({ venue: event.target.value })} placeholder="เช่น โรง 5 สาขา..." />
              </label>
              <label>
                ที่นั่ง
                <input value={draft.details.seat ?? ""} maxLength={POCKET_DETAIL_MAX_LENGTH} onChange={(event) => setDetails({ seat: event.target.value })} placeholder="เช่น F12, F13" />
              </label>
            </>
          )}
          <label>
            {pocketIssuerLabel(draft.kind)} (ถ้ามี)
            <input value={draft.bank ?? ""} maxLength={POCKET_BANK_MAX_LENGTH} onChange={(event) => set({ bank: event.target.value || null })} placeholder={draft.kind === "ticket" ? "เช่น Major, SF" : "เช่น Central"} />
          </label>
        </>
      )}

      <label>
        {general ? "ชื่อผู้ถือ (ถ้ามี)" : "ชื่อเจ้าของ (ให้คนสแกนเห็น)"}
        <input value={draft.holder ?? ""} maxLength={POCKET_HOLDER_MAX_LENGTH} onChange={(event) => set({ holder: event.target.value || null })} placeholder="เช่น สมชาย ใ." />
      </label>

      <div className="sheet-field">
        <span className="sheet-field-label">สีการ์ด</span>
        <div className="pocket-hues" role="radiogroup" aria-label="สีการ์ด">
          {POCKET_HUES.map((hue, index) => (
            <button
              type="button"
              key={hue}
              role="radio"
              aria-checked={draft.hue === hue}
              aria-label={`สีที่ ${index + 1}`}
              className={draft.hue === hue ? "active" : ""}
              style={hueStyle(hue)}
              onClick={() => set({ hue })}
            />
          ))}
        </div>
      </div>

      {problem && <p className="pocket-form-note">{problem}</p>}
      {error && <p className="pocket-form-error" role="alert">{error}</p>}
      <button className="save" disabled={!!problem || busy || scanning || reading} onClick={() => onSave({ ...draft, label: draft.label.trim() })}>
        <WalletCards size={20} strokeWidth={2.25} aria-hidden="true" />
        {busy ? "กำลังบันทึก..." : card ? "บันทึกการแก้ไข" : "เพิ่มลงกระเป๋า"}
      </button>
      {card && (
        <button className="detail-delete pocket-form-delete" disabled={busy} onClick={() => onDelete(card)}>
          <Trash2 size={18} strokeWidth={2.25} aria-hidden="true" />ลบการ์ดนี้
        </button>
      )}
    </SheetFrame>
  );
}

function pocketLabelPlaceholder(kind: PocketCardKind) {
  if (kind === "ticket") return "เช่น ตั๋วหนังคืนวันเสาร์";
  if (kind === "membership") return "เช่น The 1";
  if (kind === "other") return "เช่น บัตรจอดรถ";
  if (kind === "account") return "เช่น บัญชีเงินเดือน";
  return "เช่น พร้อมเพย์ส่วนตัว";
}
