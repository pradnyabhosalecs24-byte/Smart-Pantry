import { prisma, num, numOrNull, Prisma, type Tx } from "../db.js";
import { dateToStr, todayInTz } from "../lib/dates.js";
import { notFound } from "../lib/http.js";
import {
  effectiveExpiry,
  expiryStatus,
  isLowStock,
  STATUS_RANK,
  worstStatus,
  type ExpiryStatus,
  type ItemStatus,
} from "../lib/status.js";
import { fromMilli, toMilli } from "../lib/units.js";

export interface Ctx {
  userId: string;
  today: string;
  warningDays: number;
  timezone: string;
  currency: string;
}

/** Settings row is created lazily so older accounts and imports always have one. */
export async function getSettings(userId: string, db: Tx | typeof prisma = prisma) {
  return db.settings.upsert({ where: { userId }, update: {}, create: { userId } });
}

export async function getCtx(userId: string, now = new Date()): Promise<Ctx> {
  const s = await getSettings(userId);
  return { userId, today: todayInTz(s.timezone, now), warningDays: s.warningDays, timezone: s.timezone, currency: s.currency };
}

export const itemInclude = {
  category: true,
  location: true,
  batches: { orderBy: [{ createdAt: "asc" }] },
} satisfies Prisma.ItemInclude;

export type ItemRow = Prisma.ItemGetPayload<{ include: typeof itemInclude }>;

export interface BatchView {
  id: string;
  quantity: number;
  initialQuantity: number;
  purchaseDate: string | null;
  expiryDate: string | null;
  openedAt: string | null;
  effectiveExpiry: string | null;
  expiryReason: "PRINTED" | "OPENED" | null;
  status: ExpiryStatus;
  daysLeft: number | null;
  cost: number | null;
  createdAt: Date;
}

export interface ItemView {
  id: string;
  name: string;
  brand: string | null;
  unit: string;
  quantity: number;
  minStock: number;
  lowStock: boolean;
  status: ItemStatus;
  daysLeft: number | null;
  nextExpiry: string | null;
  /** Start of the freshness meter: purchase date of the batch that expires next */
  nextStart: string | null;
  purchaseDate: string | null;
  noExpiry: boolean;
  openedShelfLifeDays: number | null;
  effectiveOpenedShelfLifeDays: number | null;
  category: { id: string; name: string };
  location: { id: string; name: string };
  barcode: string | null;
  notes: string | null;
  imageId: string | null;
  isDemo: boolean;
  version: number;
  stockValue: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  batches: BatchView[];
}

export function toItemView(row: ItemRow, ctx: Pick<Ctx, "today" | "warningDays">): ItemView {
  const shelfLife = row.openedShelfLifeDays ?? row.category.openedShelfLifeDays ?? null;

  const batches: BatchView[] = row.batches.map((b) => {
    const eff = effectiveExpiry(dateToStr(b.expiryDate), dateToStr(b.openedAt), shelfLife);
    const st = expiryStatus(eff.date, ctx.today, ctx.warningDays, row.noExpiry);
    return {
      id: b.id,
      quantity: num(b.quantity),
      initialQuantity: num(b.initialQuantity),
      purchaseDate: dateToStr(b.purchaseDate),
      expiryDate: dateToStr(b.expiryDate),
      openedAt: dateToStr(b.openedAt),
      effectiveExpiry: eff.date,
      expiryReason: eff.reason,
      status: st.status,
      daysLeft: st.daysLeft,
      cost: numOrNull(b.cost),
      createdAt: b.createdAt,
    };
  });

  const inStock = batches.filter((b) => toMilli(b.quantity) > 0);
  const quantity = fromMilli(inStock.reduce((s, b) => s + toMilli(b.quantity), 0));
  const status = worstStatus(inStock.map((b) => b.status));

  // Earliest effective expiry among batches still in stock
  const dated = inStock.filter((b) => b.effectiveExpiry).sort((a, b) => (a.effectiveExpiry! < b.effectiveExpiry! ? -1 : 1));
  const next = dated[0] ?? null;

  const purchaseDates = batches.map((b) => b.purchaseDate).filter(Boolean) as string[];
  const costed = inStock.filter((b) => b.cost != null && b.initialQuantity > 0);
  const stockValue = costed.length
    ? Math.round(costed.reduce((s, b) => s + (b.cost! / b.initialQuantity) * b.quantity, 0) * 100) / 100
    : null;

  const minStock = num(row.minStock);
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    unit: row.unit,
    quantity,
    minStock,
    lowStock: isLowStock(quantity, minStock),
    status,
    daysLeft: next?.daysLeft ?? null,
    nextExpiry: next?.effectiveExpiry ?? null,
    nextStart: next ? (next.purchaseDate ?? next.createdAt.toISOString().slice(0, 10)) : null,
    purchaseDate: purchaseDates.sort().at(-1) ?? null,
    noExpiry: row.noExpiry,
    openedShelfLifeDays: row.openedShelfLifeDays,
    effectiveOpenedShelfLifeDays: shelfLife,
    category: { id: row.category.id, name: row.category.name },
    location: { id: row.location.id, name: row.location.name },
    barcode: row.barcode,
    notes: row.notes,
    imageId: row.imageId,
    isDemo: row.isDemo,
    version: row.version,
    stockValue,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    batches: batches.sort((a, b) => {
      if (a.effectiveExpiry && b.effectiveExpiry) return a.effectiveExpiry < b.effectiveExpiry ? -1 : 1;
      if (a.effectiveExpiry) return -1;
      if (b.effectiveExpiry) return 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    }),
  };
}

export async function loadItemViews(ctx: Ctx, opts: { deleted?: boolean } = {}): Promise<ItemView[]> {
  const rows = await prisma.item.findMany({
    where: { userId: ctx.userId, deletedAt: opts.deleted ? { not: null } : null },
    include: itemInclude,
  });
  return rows.map((r) => toItemView(r, ctx));
}

/** Loads one item, scoped to the owner. Another user's id simply returns 404. */
export async function getItemView(ctx: Ctx, itemId: string, db: Tx | typeof prisma = prisma): Promise<ItemView> {
  const row = await db.item.findFirst({ where: { id: itemId, userId: ctx.userId, deletedAt: null }, include: itemInclude });
  if (!row) throw notFound("Item");
  return toItemView(row, ctx);
}

/** Sort key: most urgent first, then soonest expiry, then name. */
export function byUrgency(a: ItemView, b: ItemView): number {
  const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (r !== 0) return r;
  if (a.nextExpiry && b.nextExpiry && a.nextExpiry !== b.nextExpiry) return a.nextExpiry < b.nextExpiry ? -1 : 1;
  if (a.lowStock !== b.lowStock) return a.lowStock ? -1 : 1;
  return a.name.localeCompare(b.name);
}

export function needsAttention(i: ItemView): boolean {
  return i.status === "EXPIRED" || i.status === "EXPIRING" || i.status === "NO_DATE" || i.lowStock;
}
