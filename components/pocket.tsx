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
import { ArrowDown, ArrowUp, Barcode as BarcodeIcon, ChevronDown, ChevronLeft, ChevronRight, Copy, ImageUp, Info, Landmark, Menu, Pencil, Plus, QrCode as QrCodeIcon, RotateCcw, ScanQrCode, Share2, Trash2, WalletCards } from "lucide-react";
import { APP_NAME, POCKET_BANK_MAX_LENGTH, POCKET_CARD_LIMIT, POCKET_HOLDER_MAX_LENGTH, POCKET_LABEL_MAX_LENGTH } from "@/lib/constants";
import {
  POCKET_BANKS,
  POCKET_HUES,
  POCKET_KIND_LABELS,
  code128Widths,
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
import { EmptyNote, InfoHint, SheetClose, SheetFrame } from "@/components/primitives";

const hueStyle = (hue: string) => ({ "--hue": `var(${hue})` }) as React.CSSProperties;

export const POCKET_KIND_ICONS: Record<PocketCardKind, typeof QrCodeIcon> = {
  promptpay: QrCodeIcon,
  qr: ScanQrCode,
  barcode: BarcodeIcon,
  account: Landmark,
};

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

/** Whatever a card shows in the middle: its QR, its barcode, or its number. */
export const PocketCode = memo(function PocketCode({ card }: { card: PocketCard }) {
  const payload = pocketQrPayload(card);
  if (payload) return <QrCode payload={payload} label={`QR ของ ${card.label}`} />;
  if (card.kind === "barcode") return <Barcode value={card.value} label={`บาร์โค้ด ${card.label}`} />;
  return (
    <div className="pocket-number">
      <span>เลขบัญชี</span>
      <b>{formatAccountNumber(card.value)}</b>
    </div>
  );
});

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
  cards,
  onFlip,
  onManage,
  onAdd,
  onShare,
  onDetails,
}: {
  cards: PocketCard[];
  onFlip: () => void;
  onManage: () => void;
  onAdd: () => void;
  onShare: (card: PocketCard) => void;
  onDetails: (card: PocketCard) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const current = cards[Math.min(index, cards.length - 1)];

  const onScroll = () => {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    setIndex(Math.round(track.scrollLeft / track.clientWidth));
  };
  const goTo = (next: number) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(cards.length - 1, next));
    track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
  };

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
          เก็บพร้อมเพย์ QR จากแอปธนาคาร บาร์โค้ดบัตรสมาชิก หรือเลขบัญชีไว้ตรงนี้ ปัดซ้ายขวาเพื่อเปลี่ยนใบ กดแชร์เพื่อคัดลอกเลขหรือส่งการ์ดเป็นรูป ไม่มีการเก็บรูปภาพ มีแค่ตัวเลขและข้อความที่ใช้วาดโค้ด
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
            ยังไม่มีการ์ด เพิ่มพร้อมเพย์หรือบัญชีไว้ให้คนสแกนจ่ายได้ทันที
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
                if (event.key === "ArrowRight") { event.preventDefault(); goTo(index + 1); }
                if (event.key === "ArrowLeft") { event.preventDefault(); goTo(index - 1); }
              }}
            >
              {cards.map((card, cardIndex) => (
                <section
                  key={card.id}
                  className={`pocket-slide is-${card.kind}`}
                  style={hueStyle(card.hue)}
                  aria-roledescription="slide"
                  aria-label={`${cardIndex + 1} จาก ${cards.length}: ${card.label}`}
                >
                  <div className="pocket-code"><PocketCode card={card} /></div>
                  <div className="pocket-words">
                    <strong>{card.label}</strong>
                    <span>{pocketCardCaption(card)}</span>
                  </div>
                </section>
              ))}
            </div>
            {cards.length > 1 && (
              <>
                <button type="button" className="pocket-arrow is-prev" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="การ์ดก่อนหน้า">
                  <ChevronLeft size={20} strokeWidth={2.25} aria-hidden="true" />
                </button>
                <button type="button" className="pocket-arrow is-next" onClick={() => goTo(index + 1)} disabled={index >= cards.length - 1} aria-label="การ์ดถัดไป">
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
              <button className="billboard-cta" onClick={() => onShare(current)}>
                <Share2 size={20} strokeWidth={2.25} aria-hidden="true" />แชร์
              </button>
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
  ctx.fillStyle = paper;
  roundRect(ctx, panelX, panelY, panel, card.kind === "barcode" || card.kind === "account" ? 360 : panel, 28);
  ctx.fill();

  ctx.fillStyle = qrInk;
  const payload = pocketQrPayload(card);
  if (payload) {
    const modules = encodeQr(payload);
    const count = modules.length;
    const cell = Math.floor((panel - 80) / count);
    const offset = panelX + (panel - cell * count) / 2;
    const offsetY = panelY + (panel - cell * count) / 2;
    modules.forEach((cells, row) => cells.forEach((dark, col) => {
      if (dark) ctx.fillRect(offset + col * cell, offsetY + row * cell, cell, cell);
    }));
  } else if (card.kind === "barcode") {
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
  } else {
    ctx.font = `600 34px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText(card.bank ?? "เลขบัญชี", width / 2, panelY + 130, panel - 80);
    ctx.font = `700 76px ${font}`;
    ctx.fillText(formatAccountNumber(card.value), width / 2, panelY + 240, panel - 80);
  }

  const wordsY = card.kind === "barcode" || card.kind === "account" ? panelY + 480 : panelY + panel + 110;
  ctx.textAlign = "center";
  ctx.fillStyle = ink;
  ctx.font = `700 58px ${font}`;
  ctx.fillText(card.label, width / 2, wordsY, width - 200);
  ctx.fillStyle = ink2;
  ctx.font = `500 36px ${font}`;
  ctx.fillText(pocketCardCaption(card), width / 2, wordsY + 64, width - 200);
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
  if (card.kind === "account") facts.push(["เลขบัญชี", formatAccountNumber(card.value)]);
  if (card.kind === "barcode") facts.push(["เลขบาร์โค้ด", card.value]);
  if (card.kind === "qr") facts.push(["ชนิด QR", describeScannedQr(card.value) ?? "ข้อความทั่วไป"]);
  if (card.bank) facts.push([card.kind === "barcode" ? "ร้าน/ผู้ออกบัตร" : "ธนาคาร", card.bank]);
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

const POCKET_KINDS: PocketCardKind[] = ["promptpay", "qr", "barcode", "account"];

async function decodeQrFromImage(file: File): Promise<string | null> {
  const { default: jsQR } = await import("jsqr");
  const bitmap = await createImageBitmap(file);
  // A phone screenshot is ~1200x2600; the QR in it reads just as well at half
  // that, in a quarter of the time.
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(image.data, image.width, image.height)?.data ?? null;
}

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
  const [draft, setDraft] = useState<PocketCard>(
    card ?? { id: "", kind: "promptpay", label: "", holder: null, bank: null, value: "", hue: POCKET_HUES[0] },
  );
  const [scanError, setScanError] = useState("");
  const [scanning, setScanning] = useState(false);
  const set = (patch: Partial<PocketCard>) => setDraft((current) => ({ ...current, ...patch }));
  const problem = pocketDraftProblem(draft);
  const scanned = draft.kind === "qr" && draft.value ? describeScannedQr(draft.value) : null;

  return (
    <SheetFrame onClose={onClose} closing={closing} className="edit-sheet pocket-sheet">
      <div className="sheet-head">
        <div><p className="eyebrow">กระเป๋าการ์ด</p><h2>{card ? "แก้ไขการ์ด" : "เพิ่มการ์ด"}</h2></div>
        <SheetClose onClick={onClose} />
      </div>

      <div className="sheet-field">
        <span className="sheet-field-label">ชนิดการ์ด</span>
        <div className="pocket-kind-tiles" role="radiogroup" aria-label="ชนิดการ์ด">
          {POCKET_KINDS.map((kind) => {
            const Icon = POCKET_KIND_ICONS[kind];
            return (
              <button
                type="button"
                key={kind}
                role="radio"
                aria-checked={draft.kind === kind}
                className={draft.kind === kind ? "active" : ""}
                onClick={() => { set({ kind, value: "" }); setScanError(""); }}
              >
                <Icon size={20} strokeWidth={2.25} aria-hidden="true" />
                <span>{POCKET_KIND_LABELS[kind]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <label>
        ชื่อการ์ด
        <input value={draft.label} maxLength={POCKET_LABEL_MAX_LENGTH} onChange={(event) => set({ label: event.target.value })} placeholder={draft.kind === "barcode" ? "เช่น The 1" : "เช่น พร้อมเพย์ส่วนตัว"} />
      </label>

      {draft.kind === "promptpay" && (
        <label>
          เบอร์โทร หรือเลขบัตรประชาชน
          <input inputMode="numeric" value={draft.value} onChange={(event) => set({ value: digitsOnly(event.target.value).slice(0, 15) })} placeholder="0812345678" />
        </label>
      )}

      {draft.kind === "qr" && (
        <div className="sheet-field">
          <span className="sheet-field-label">รูป QR (แคปหน้าจอจากแอปธนาคาร)</span>
          <label className="file-button">
            <ImageUp size={18} strokeWidth={2.25} aria-hidden="true" />
            {scanning ? "กำลังอ่าน QR..." : draft.value ? "เปลี่ยนรูป" : "เลือกรูป"}
            <input
              type="file"
              accept="image/*"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setScanning(true);
                setScanError("");
                try {
                  const text = await decodeQrFromImage(file);
                  if (text) set({ value: text });
                  else setScanError("ไม่พบ QR ในรูปนี้ ลองครอปให้เห็น QR ชัด ๆ");
                } catch {
                  setScanError("เปิดรูปนี้ไม่ได้");
                } finally {
                  setScanning(false);
                }
              }}
            />
          </label>
          <p className="pocket-form-note">
            {draft.value
              ? `อ่านได้แล้ว: ${scanned ?? "QR ทั่วไป"} · แอปเก็บแค่ข้อความใน QR ไม่เก็บรูป`
              : "แอปจะอ่านข้อความใน QR แล้ววาดขึ้นใหม่ ตัวรูปไม่ถูกเก็บ"}
          </p>
          {scanError && <p className="pocket-form-error" role="alert">{scanError}</p>}
        </div>
      )}

      {draft.kind === "barcode" && (
        <label>
          เลขบาร์โค้ด
          <input value={draft.value} maxLength={80} autoCapitalize="characters" onChange={(event) => set({ value: event.target.value.trim() })} placeholder="เลขที่พิมพ์ใต้บาร์โค้ดบนบัตร" />
        </label>
      )}

      {draft.kind === "account" && (
        <label>
          เลขบัญชี
          <input inputMode="numeric" value={draft.value} onChange={(event) => set({ value: digitsOnly(event.target.value).slice(0, 15) })} placeholder="1234567890" />
        </label>
      )}

      {(draft.kind === "account" || draft.kind === "barcode") && (
        <label>
          {draft.kind === "account" ? "ธนาคาร" : "ร้าน/ผู้ออกบัตร (ถ้ามี)"}
          {draft.kind === "account" ? (
            <div className="select-shell">
              <select value={draft.bank ?? ""} onChange={(event) => set({ bank: event.target.value || null })}>
                <option value="">เลือกธนาคาร</option>
                {POCKET_BANKS.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
              </select>
              <ChevronDown className="select-shell-chevron" aria-hidden="true" />
            </div>
          ) : (
            <input value={draft.bank ?? ""} maxLength={POCKET_BANK_MAX_LENGTH} onChange={(event) => set({ bank: event.target.value || null })} placeholder="เช่น Central" />
          )}
        </label>
      )}

      <label>
        ชื่อเจ้าของ (ให้คนสแกนเห็น)
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
      <button className="save" disabled={!!problem || busy || scanning} onClick={() => onSave({ ...draft, label: draft.label.trim() })}>
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

