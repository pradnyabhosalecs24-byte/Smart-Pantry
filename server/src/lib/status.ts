import { addDays, diffDays, minDate } from "./dates.js";

/**
 * Expiry status of a batch or item.
 * - NO_DATE:   expiry date missing — shown as "needs review", NEVER counted as safe.
 * - NO_EXPIRY: user explicitly marked the food as non-perishable (salt, sugar...).
 */
export type ExpiryStatus = "EXPIRED" | "EXPIRING" | "SAFE" | "NO_DATE" | "NO_EXPIRY";
export type ItemStatus = ExpiryStatus | "OUT_OF_STOCK";

// Lower rank = more urgent. Used to pick an item's overall status and to sort by urgency.
export const STATUS_RANK: Record<ItemStatus, number> = {
  EXPIRED: 0,
  EXPIRING: 1,
  NO_DATE: 2,
  SAFE: 3,
  NO_EXPIRY: 4,
  OUT_OF_STOCK: 5,
};

export interface EffectiveExpiry {
  date: string | null;
  /** PRINTED = label date, OPENED = opened date + shelf life (whichever comes first wins) */
  reason: "PRINTED" | "OPENED" | null;
}

/** Once a pack is opened it may spoil before its printed date — use the earlier of the two. */
export function effectiveExpiry(
  printed: string | null,
  openedAt: string | null,
  openedShelfLifeDays: number | null,
): EffectiveExpiry {
  const openedLimit =
    openedAt && openedShelfLifeDays != null ? addDays(openedAt, openedShelfLifeDays) : null;
  const date = minDate(printed, openedLimit);
  if (!date) return { date: null, reason: null };
  return { date, reason: openedLimit && date === openedLimit && date !== printed ? "OPENED" : "PRINTED" };
}

export function expiryStatus(
  expiry: string | null,
  today: string,
  warningDays: number,
  noExpiry: boolean,
): { status: ExpiryStatus; daysLeft: number | null } {
  if (!expiry) return { status: noExpiry ? "NO_EXPIRY" : "NO_DATE", daysLeft: null };
  const daysLeft = diffDays(today, expiry);
  if (daysLeft < 0) return { status: "EXPIRED", daysLeft };
  if (daysLeft <= warningDays) return { status: "EXPIRING", daysLeft };
  return { status: "SAFE", daysLeft };
}

/** The item's status is its most urgent in-stock batch; with no stock it is OUT_OF_STOCK. */
export function worstStatus(statuses: ExpiryStatus[]): ItemStatus {
  if (statuses.length === 0) return "OUT_OF_STOCK";
  return statuses.reduce<ItemStatus>(
    (worst, s) => (STATUS_RANK[s] < STATUS_RANK[worst] ? s : worst),
    "OUT_OF_STOCK",
  );
}

/** Low stock is separate from expiry: an item can be both safe AND low. */
export function isLowStock(quantity: number, minStock: number): boolean {
  if (quantity <= 0) return true;
  return minStock > 0 && quantity <= minStock;
}

export function describeDaysLeft(daysLeft: number | null): string {
  if (daysLeft == null) return "No date";
  if (daysLeft < -1) return `Expired ${-daysLeft} days ago`;
  if (daysLeft === -1) return "Expired yesterday";
  if (daysLeft === 0) return "Expires today";
  if (daysLeft === 1) return "Expires tomorrow";
  return `${daysLeft} days left`;
}
