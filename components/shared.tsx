"use client";

import { ChevronDown, MoreHorizontal, type LucideIcon } from "lucide-react";
import {
  categories,
  categoryColor,
  categoryIconMap,
  categoryTint,
  iconColorSwatches,
  inferredRecurringIcon,
  nameColor,
  nameInitial,
  recurringIconMap,
  walletIconMap,
  walletIconOptions,
} from "@/lib/category";
import { defaultWalletId } from "@/lib/money";
import type { Wallet } from "@/lib/types";

export function CategoryIcon({ category, size = 14 }: { category: string; size?: number }) {
  const Icon = categoryIconMap[category] ?? MoreHorizontal;
  return <Icon size={size} strokeWidth={2.25} aria-hidden="true" />;
}

export function CategoryPicker({ value, onChange }: { value: string; onChange: (category: string) => void }) {
  return (
    <div className="category-picker" role="radiogroup">
      {categories.map((category) => (
        <button
          type="button"
          key={category}
          role="radio"
          aria-checked={value === category}
          className={`category-picker-chip ${value === category ? "active" : ""}`}
          style={value === category ? { background: categoryTint(category, 16), borderColor: categoryColor(category), color: categoryColor(category) } : undefined}
          onClick={() => onChange(category)}
        >
          <CategoryIcon category={category} size={16} />
          <span>{category}</span>
        </button>
      ))}
    </div>
  );
}

export function WalletAvatarGlyph({ iconKey, fallbackName, size = 18 }: { iconKey: string | null; fallbackName: string; size?: number }) {
  const Icon = (iconKey && walletIconMap[iconKey]) || null;
  if (!Icon) return <>{nameInitial(fallbackName)}</>;
  return <Icon size={size} strokeWidth={2.25} aria-hidden="true" />;
}

export function RecurringAvatarGlyph({ iconKey, fallbackName, size = 18 }: { iconKey: string | null; fallbackName: string; size?: number }) {
  const Icon = (iconKey && (recurringIconMap[iconKey] || walletIconMap[iconKey])) || recurringIconMap[inferredRecurringIcon(fallbackName)];
  return <Icon size={size} strokeWidth={2.25} aria-hidden="true" />;
}

export function IconColorPicker({
  value,
  onChange,
  fallbackName,
  iconOptions = walletIconOptions,
  renderGlyph = WalletAvatarGlyph,
}: {
  value: { icon: string | null; color: string | null };
  onChange: (next: { icon: string | null; color: string | null }) => void;
  fallbackName: string;
  iconOptions?: { key: string; label: string; Icon: LucideIcon }[];
  renderGlyph?: typeof WalletAvatarGlyph;
}) {
  const previewColor = value.color ?? nameColor(fallbackName);
  const Glyph = renderGlyph;

  return (
    <div className="icon-color-picker">
      <div className="icon-color-picker-preview">
        <span className="debtor-avatar" style={{ background: previewColor }}>
          <Glyph iconKey={value.icon} fallbackName={fallbackName} size={20} />
        </span>
        {(value.icon || value.color) && (
          <button type="button" className="icon-color-picker-reset" onClick={() => onChange({ icon: null, color: null })}>
            ใช้ค่าเริ่มต้น
          </button>
        )}
      </div>
      <div className="icon-color-picker-glyphs" role="group" aria-label="เลือกไอคอน">
        {iconOptions.map(({ key, label, Icon }) => (
          <button type="button" key={key} className={value.icon === key ? "active" : ""} onClick={() => onChange({ ...value, icon: key })} aria-label={label} title={label}>
            <Icon size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="icon-color-picker-swatches" role="group" aria-label="เลือกสี">
        {iconColorSwatches.map((hex) => (
          <button type="button" key={hex} className={value.color === hex ? "active" : ""} style={{ background: hex }} onClick={() => onChange({ ...value, color: hex })} aria-label={hex} />
        ))}
      </div>
    </div>
  );
}

/** "wallet:<id>" / "card:<name>" -- one dropdown, two kinds of funding. */
function splitFundingValue(value: string): [source: string, value: string] {
  const separator = value.indexOf(":");
  return [value.slice(0, separator), value.slice(separator + 1)];
}

/**
 * Where the money for one expense came from: a wallet, or a name that fronts
 * it -- a credit card, or the friend who got the round in. Cards live in the
 * debtors table (kind "own"), not in wallets, which is why a wallet dropdown
 * alone could never express "paid on SPay".
 *
 * Shared by the draft card in the Add tab and the recurring-bill sheet,
 * because they are asking the same question about the same two columns: a
 * subscription charged to a card is stored as the same pair of rows a
 * card-paid dinner is (expandDraftForSave), so it would be strange for them
 * to be asked in two different shapes.
 *
 * `cardName` is offered even when it is not in `funderNames`: the AI can read
 * a name out of a sentence that the user has no debtor record for yet, and the
 * only other way to pick it would be to go and create the debt by hand first.
 */
export function FundingSelect({
  label = "จ่ายด้วย",
  className = "",
  walletId,
  cardName,
  wallets,
  funderNames,
  onChange,
}: {
  label?: React.ReactNode;
  className?: string;
  walletId: string | null;
  cardName: string | null;
  wallets: Wallet[];
  funderNames: string[];
  onChange: (funding: { wallet_id: string | null; funding_card_name: string | null }) => void;
}) {
  const card = cardName?.trim() || "";
  const funders = card && !funderNames.includes(card) ? [...funderNames, card] : funderNames;

  return (
    <label className={className}>
      {label}
      <div className="select-shell">
        <select
          value={card ? `card:${card}` : `wallet:${walletId || defaultWalletId(wallets) || ""}`}
          onChange={(event) => {
            const [source, value] = splitFundingValue(event.target.value);
            onChange(source === "card"
              ? { funding_card_name: value, wallet_id: null }
              : { funding_card_name: null, wallet_id: value || null });
          }}
        >
          <optgroup label="กระเป๋า">
            {wallets.map((wallet) => (
              <option key={wallet.id} value={`wallet:${wallet.id}`}>{wallet.name}</option>
            ))}
          </optgroup>
          <optgroup label="บัตรเครดิต / คนที่ออกให้ก่อน">
            {funders.map((name) => (
              <option key={name} value={`card:${name}`}>{funderNames.includes(name) ? name : `${name} · ใหม่`}</option>
            ))}
          </optgroup>
        </select>
        <ChevronDown className="select-shell-chevron" aria-hidden="true" />
      </div>
    </label>
  );
}
