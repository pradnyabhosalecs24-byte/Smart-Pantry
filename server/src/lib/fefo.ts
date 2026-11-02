import { fromMilli, toMilli } from "./units.js";

export interface DeductibleBatch {
  id: string;
  quantity: number;
  /** effective expiry (YYYY-MM-DD) or null when unknown / no expiry */
  expiry: string | null;
  createdAt: Date;
}

export interface Allocation {
  batchId: string;
  take: number;
  remaining: number;
}

/**
 * FEFO = First-Expiry-First-Out.
 * Takes `amount` from the batches that expire soonest. Batches without a date go last,
 * then oldest purchase first. Pure function: it only plans, the caller writes to the DB.
 */
export function planFefo(batches: DeductibleBatch[], amount: number): { allocations: Allocation[]; shortfall: number } {
  const ordered = [...batches]
    .filter((b) => toMilli(b.quantity) > 0)
    .sort((a, b) => {
      if (a.expiry && b.expiry && a.expiry !== b.expiry) return a.expiry < b.expiry ? -1 : 1;
      if (a.expiry && !b.expiry) return -1;
      if (!a.expiry && b.expiry) return 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

  let need = toMilli(amount);
  const allocations: Allocation[] = [];
  for (const b of ordered) {
    if (need <= 0) break;
    const have = toMilli(b.quantity);
    const take = Math.min(have, need);
    allocations.push({ batchId: b.id, take: fromMilli(take), remaining: fromMilli(have - take) });
    need -= take;
  }
  return { allocations, shortfall: fromMilli(Math.max(need, 0)) };
}
