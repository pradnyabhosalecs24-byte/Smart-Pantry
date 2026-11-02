import clsx from "clsx";
import { PackageOpen, TrendingDown } from "lucide-react";
import { apiUrl } from "../lib/api";
import { daysLeftText } from "../lib/format";
import { categoryIcon, STATUS } from "../lib/status";
import type { ItemStatus } from "../lib/types";

export function StatusBadge({ status, className }: { status: ItemStatus; className?: string }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", s.bg, s.text, className)}>
      <Icon className="size-3.5" aria-hidden />
      {s.label}
    </span>
  );
}

export function LowStockBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-plum-soft px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-plum">
      <TrendingDown className="size-3.5" aria-hidden />
      Low stock
    </span>
  );
}

export function OpenedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-soft px-2 py-0.5 text-xs font-semibold text-slate">
      <PackageOpen className="size-3.5" aria-hidden />
      Opened
    </span>
  );
}

export function DemoBadge() {
  return <span className="rounded-full border border-dashed border-line-strong px-1.5 text-[11px] font-semibold text-ink-3">Demo</span>;
}

function diff(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * The freshness meter: how much of an item's shelf life is left, measured from the day it was
 * bought to its (effective) expiry date. Full = just bought, empty = expires today.
 */
export function FreshnessMeter({
  start,
  expiry,
  today,
  status,
  daysLeft,
  noExpiry,
  compact,
}: {
  start: string | null;
  expiry: string | null;
  today: string;
  status: ItemStatus;
  daysLeft: number | null;
  noExpiry?: boolean;
  compact?: boolean;
}) {
  const label = daysLeftText(daysLeft, noExpiry);
  if (!expiry) {
    return (
      <div className={clsx("flex flex-col gap-1", compact ? "w-28" : "w-full")}>
        <div className="h-1.5 rounded-full border border-dashed border-line-strong" aria-hidden />
        <span className={clsx("text-xs font-medium", STATUS[status].text)}>{label}</span>
      </div>
    );
  }
  const total = Math.max(diff(start ?? today, expiry), 1);
  const left = Math.max(diff(today, expiry), 0);
  const pct = status === "EXPIRED" ? 100 : Math.min(100, Math.max(4, (left / total) * 100));
  return (
    <div className={clsx("flex flex-col gap-1", compact ? "w-28" : "w-full")}>
      <div
        role="meter"
        aria-label="Shelf life remaining"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={status === "EXPIRED" ? 0 : Math.round(pct)}
        aria-valuetext={label}
        className="h-1.5 overflow-hidden rounded-full bg-line"
      >
        <div
          className={clsx("h-full rounded-full", STATUS[status === "OUT_OF_STOCK" ? "SAFE" : status].solid, status === "EXPIRED" && "opacity-35 [background-image:repeating-linear-gradient(135deg,transparent_0_4px,rgba(255,255,255,.55)_4px_8px)]")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={clsx("text-xs font-medium num", STATUS[status].text)}>{label}</span>
    </div>
  );
}

export function ItemThumb({ name, category, imageId, size = "md" }: { name: string; category: string; imageId: string | null; size?: "sm" | "md" | "lg" }) {
  const Icon = categoryIcon(category);
  const dim = size === "sm" ? "size-9" : size === "lg" ? "size-20" : "size-11";
  if (imageId) return <img src={apiUrl(`/images/${imageId}`)} alt={name} className={clsx(dim, "shrink-0 rounded-xl object-cover bg-oat")} loading="lazy" />;
  return (
    <div className={clsx(dim, "flex shrink-0 items-center justify-center rounded-xl bg-basil-soft text-bay")} aria-hidden>
      <Icon className={size === "lg" ? "size-9" : "size-5"} />
    </div>
  );
}
