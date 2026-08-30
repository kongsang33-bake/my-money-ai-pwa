"use client";

import { MoreHorizontal, type LucideIcon } from "lucide-react";
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
