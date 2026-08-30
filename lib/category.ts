// Category/wallet/recurring-expense icon and color lookups, shared by
// components/shared.tsx's tiny render wrappers and by every view that
// needs to color or icon a category dot, avatar, or icon picker.
import {
  Banknote,
  Bot,
  Car,
  Cloud,
  CreditCard,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  Home as HomeIcon,
  MonitorPlay,
  MoreHorizontal,
  Music,
  PiggyBank,
  Plane,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Tv,
  Users,
  Utensils,
  Wallet as WalletIcon,
  type LucideIcon,
} from "lucide-react";
import { CATEGORIES } from "./taxonomy.ts";

export const categories: string[] = [...CATEGORIES];

export const categoryIconMap: Record<string, LucideIcon> = {
  อาหาร: Utensils,
  เดินทาง: Car,
  ของใช้: ShoppingBag,
  ที่อยู่อาศัย: HomeIcon,
  สุขภาพ: HeartPulse,
  บันเทิง: Music,
  บิลประจำ: Receipt,
  รายได้: Banknote,
};

// Categorical palette validated for CVD-safe adjacency + normal-vision separation
// (dataviz skill, 7-slot subset of the default 8-hue order; brand accent reserved for income).
// Values live as CSS custom properties (--cat-*) so dark mode adapts them automatically —
// see :root / :root[data-theme="dark"] in globals.css.
export const categoryColorVars: Record<string, string> = {
  เดินทาง: "--cat-travel",
  อาหาร: "--cat-food",
  บิลประจำ: "--cat-bills",
  ที่อยู่อาศัย: "--cat-home",
  บันเทิง: "--cat-entertainment",
  ของใช้: "--cat-goods",
  สุขภาพ: "--cat-health",
};
export const categoryColorVar = (category: string) => categoryColorVars[category] ?? "--cat-other";
export const categoryColor = (category: string) => `var(${categoryColorVar(category)})`;
export const categoryTint = (category: string, alphaPercent: number) =>
  `color-mix(in srgb, var(${categoryColorVar(category)}) ${alphaPercent}%, transparent)`;

export const avatarPaletteVars = Object.values(categoryColorVars);
export function nameColor(name: string) {
  const sum = [...name.trim()].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return `var(${avatarPaletteVars[sum % avatarPaletteVars.length]})`;
}
export function nameInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export const walletIconOptions: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: "wallet", label: "กระเป๋าเงิน", Icon: WalletIcon },
  { key: "piggy-bank", label: "เงินออม", Icon: PiggyBank },
  { key: "trending-up", label: "เงินลงทุน", Icon: TrendingUp },
  { key: "banknote", label: "เงินสด", Icon: Banknote },
  { key: "home", label: "บ้าน", Icon: HomeIcon },
  { key: "car", label: "รถ", Icon: Car },
  { key: "credit-card", label: "บัตรเครดิต", Icon: CreditCard },
  { key: "shopping-bag", label: "ช้อปปิ้ง", Icon: ShoppingBag },
  { key: "heart-pulse", label: "สุขภาพ", Icon: HeartPulse },
  { key: "graduation-cap", label: "การศึกษา", Icon: GraduationCap },
  { key: "plane", label: "ท่องเที่ยว", Icon: Plane },
  { key: "gift", label: "ของขวัญ", Icon: Gift },
  { key: "users", label: "ครอบครัว", Icon: Users },
  { key: "more-horizontal", label: "อื่น ๆ", Icon: MoreHorizontal },
];
export const walletIconMap: Record<string, LucideIcon> = Object.fromEntries(walletIconOptions.map((option) => [option.key, option.Icon]));

export const recurringIconOptions: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: "tv", label: "สตรีมมิง", Icon: Tv },
  { key: "monitor-play", label: "วิดีโอ", Icon: MonitorPlay },
  { key: "music", label: "เพลง", Icon: Music },
  { key: "bot", label: "AI", Icon: Bot },
  { key: "cloud", label: "คลาวด์", Icon: Cloud },
  { key: "gamepad", label: "เกม", Icon: Gamepad2 },
  { key: "receipt", label: "บริการรายเดือน", Icon: Receipt },
  { key: "credit-card", label: "การชำระเงิน", Icon: CreditCard },
];
export const recurringIconMap: Record<string, LucideIcon> = Object.fromEntries(recurringIconOptions.map((option) => [option.key, option.Icon]));
export const recurringServiceIconKeywords: { terms: string[]; key: string }[] = [
  { terms: ["netflix", "disney", "hbo", "prime video", "streaming"], key: "tv" },
  { terms: ["youtube", "video", "tiktok"], key: "monitor-play" },
  { terms: ["spotify", "apple music", "youtube music", "music"], key: "music" },
  { terms: ["claude", "chatgpt", "openai", "gemini", "ai"], key: "bot" },
  { terms: ["icloud", "google one", "dropbox", "onedrive", "cloud"], key: "cloud" },
  { terms: ["playstation", "xbox", "nintendo", "game pass", "gaming"], key: "gamepad" },
];

export function inferredRecurringIcon(name: string) {
  const normalizedName = name.trim().toLowerCase();
  return recurringServiceIconKeywords.find(({ terms }) => terms.some((term) => normalizedName.includes(term)))?.key ?? "receipt";
}

export const iconColorSwatches = [
  "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7", "#e34948",
  "#14181c", "#c97a14", "#898781",
];
