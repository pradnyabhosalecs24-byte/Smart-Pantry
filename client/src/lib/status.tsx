import {
  Apple,
  Ban,
  CircleCheck,
  CircleHelp,
  Clock,
  Cookie,
  Croissant,
  CupSoda,
  Flame,
  Infinity as InfinityIcon,
  Milk,
  Package,
  Salad,
  Snowflake,
  Soup,
  TriangleAlert,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import type { ItemStatus } from "./types";

export interface StatusStyle {
  label: string;
  icon: LucideIcon;
  /** text colour */
  text: string;
  /** soft background */
  bg: string;
  /** solid colour for bars / chart */
  solid: string;
  chart: string;
}

export const STATUS: Record<ItemStatus, StatusStyle> = {
  EXPIRED: { label: "Expired", icon: TriangleAlert, text: "text-chilli", bg: "bg-chilli-soft", solid: "bg-chilli", chart: "var(--chilli)" },
  EXPIRING: { label: "Expiring soon", icon: Clock, text: "text-turmeric", bg: "bg-turmeric-soft", solid: "bg-turmeric-bar", chart: "var(--turmeric-bar)" },
  SAFE: { label: "Safe", icon: CircleCheck, text: "text-basil", bg: "bg-basil-soft", solid: "bg-basil", chart: "var(--basil)" },
  NO_DATE: { label: "Date missing", icon: CircleHelp, text: "text-slate", bg: "bg-slate-soft", solid: "bg-slate", chart: "var(--slate)" },
  NO_EXPIRY: { label: "No expiry", icon: InfinityIcon, text: "text-bay", bg: "bg-basil-soft", solid: "bg-bay", chart: "var(--bay)" },
  OUT_OF_STOCK: { label: "Out of stock", icon: Ban, text: "text-ink-2", bg: "bg-slate-soft", solid: "bg-ink-3", chart: "var(--ink-3)" },
};

/** Picks a food icon from the category name (works for custom categories too). */
export function categoryIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (/dairy|milk|cheese/.test(n)) return Milk;
  if (/fruit|veg|produce/.test(n)) return Apple;
  if (/grain|cereal|rice|flour|pulse|dal/.test(n)) return Wheat;
  if (/snack|biscuit|sweet/.test(n)) return Cookie;
  if (/bever|drink|juice/.test(n)) return CupSoda;
  if (/can|tin/.test(n)) return Soup;
  if (/spice|condiment|masala|sauce/.test(n)) return Flame;
  if (/frozen|ice/.test(n)) return Snowflake;
  if (/bak|bread/.test(n)) return Croissant;
  if (/salad|herb|leaf/.test(n)) return Salad;
  return Package;
}
