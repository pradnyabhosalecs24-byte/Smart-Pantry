import { Router } from "express";
import { z } from "zod";
import { lockKey, prisma } from "../db.js";
import { logActivity } from "../lib/activity.js";
import { dateStrToDate } from "../lib/dates.js";
import { badRequest, conflict, handler, notFound, pageParams, param, parse } from "../lib/http.js";
import { STATUS_RANK } from "../lib/status.js";
import { roundQty } from "../lib/units.js";
import * as v from "../lib/validators.js";
import { uid } from "../middleware/auth.js";
import { byUrgency, getCtx, getItemView, itemInclude, loadItemViews, needsAttention, toItemView, type Ctx, type ItemView } from "../services/pantry.js";
import { deductStock, lockItemBatches } from "../services/stock.js";

export const itemsRouter = Router();

// ---------- validation ----------

const batchFields = {
  quantity: v.quantity(),
  purchaseDate: v.optionalDate("Purchase date"),
  expiryDate: v.optionalDate("Expiry date"),
  cost: v.money(),
};

const itemFields = {
  name: v.trimmed(100, "Item name"),
  brand: v.optionalText(80),
  categoryId: v.id("Category"),
  locationId: v.id("Storage location"),
  unit: v.unit,
  minStock: v.nonNegative("Minimum stock").default(0),
  openedShelfLifeDays: z.union([z.literal(""), z.null(), z.coerce.number().int("Must be whole days").min(0).max(3650)]).optional().transform((x) => (x === "" || x == null ? null : Number(x))),
  noExpiry: z.boolean().default(false),
  barcode: z.union([z.literal(""), z.null(), z.string().trim().regex(/^\d{6,14}$/, "Barcode must be 6–14 digits")]).optional().transform((x) => x || null),
  notes: v.optionalText(500),
  imageId: z.string().uuid().nullish(),
};

const createSchema = z.object({
  ...itemFields,
  ...batchFields,
  duplicateStrategy: z.enum(["merge", "separate"]).optional(),
});

const updateSchema = z.object({
  version: z.coerce.number().int().positive("Version is required"),
  ...Object.fromEntries(Object.entries(itemFields).map(([k, s]) => [k, (s as z.ZodType).optional()])),
}) as z.ZodType<{ version: number } & Partial<{ [K in keyof typeof itemFields]: z.infer<(typeof itemFields)[K]> }>>;

/** Shared date rules: no future purchase date, expiry not before purchase, expiry required unless non-perishable. */
function checkDates(ctx: Ctx, b: { purchaseDate: string | null; expiryDate: string | null }, noExpiry: boolean) {
  const fields: Record<string, string> = {};
  if (b.purchaseDate && b.purchaseDate > ctx.today) fields.purchaseDate = "Purchase date can't be in the future";
  if (b.purchaseDate && b.expiryDate && b.expiryDate < b.purchaseDate) fields.expiryDate = "Expiry date can't be before the purchase date";
  if (!noExpiry && !b.expiryDate) fields.expiryDate = "Expiry date is required (or tick “No expiry date” for items like salt)";
  if (Object.keys(fields).length) throw badRequest("Please fix the highlighted fields", { fields });
}

async function assertOwnership(userId: string, data: { categoryId?: string; locationId?: string; imageId?: string | null }) {
  const fields: Record<string, string> = {};
  if (data.categoryId && !(await prisma.category.findFirst({ where: { id: data.categoryId, userId } }))) fields.categoryId = "Choose a valid category";
  if (data.locationId && !(await prisma.location.findFirst({ where: { id: data.locationId, userId } }))) fields.locationId = "Choose a valid storage location";
  if (data.imageId && !(await prisma.itemImage.findFirst({ where: { id: data.imageId, userId } }))) fields.imageId = "Image not found";
  if (Object.keys(fields).length) throw badRequest("Please fix the highlighted fields", { fields });
}

// ---------- list / search / filter / sort / paginate ----------

const STATUS_FILTERS = ["SAFE", "EXPIRING", "EXPIRED", "NO_DATE", "NO_EXPIRY", "OUT_OF_STOCK", "LOW_STOCK", "ATTENTION"] as const;
const SORTS = ["urgency", "name", "quantity", "purchaseDate", "expiry", "createdAt"] as const;

const listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  categoryId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  status: z.enum(STATUS_FILTERS).optional(),
  sort: z.enum(SORTS).default("urgency"),
  order: z.enum(["asc", "desc"]).default("asc"),
});

function compare(sort: (typeof SORTS)[number], a: ItemView, b: ItemView): number {
  const nullsLast = (x: string | null, y: string | null) => (x === y ? 0 : x == null ? 1 : y == null ? -1 : x < y ? -1 : 1);
  switch (sort) {
    case "name":
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    case "quantity":
      return a.quantity - b.quantity;
    case "purchaseDate":
      return nullsLast(a.purchaseDate, b.purchaseDate);
    case "expiry":
      return nullsLast(a.nextExpiry, b.nextExpiry);
    case "createdAt":
      return a.createdAt.getTime() - b.createdAt.getTime();
    default:
      return byUrgency(a, b);
  }
}

export function filterItems(items: ItemView[], q: z.infer<typeof listQuery>): ItemView[] {
  const term = q.search?.toLowerCase();
  return items.filter((i) => {
    if (term && !i.name.toLowerCase().includes(term) && !(i.brand ?? "").toLowerCase().includes(term) && !(i.barcode ?? "").includes(term)) return false;
    if (q.categoryId && i.category.id !== q.categoryId) return false;
    if (q.locationId && i.location.id !== q.locationId) return false;
    if (q.status === "LOW_STOCK") return i.lowStock;
    if (q.status === "ATTENTION") return needsAttention(i);
    if (q.status) return i.status === q.status;
    return true;
  });
}

itemsRouter.get(
  "/",
  handler(async (req, res) => {
    const q = parse(listQuery, req.query);
    const { page, pageSize, skip } = pageParams(req.query);
    const ctx = await getCtx(uid(req));
    // Status depends on "today" in the user's time zone, so it is computed in code, not stored.
    const all = await loadItemViews(ctx);
    const filtered = filterItems(all, q).sort((a, b) => {
      const c = compare(q.sort, a, b);
      return q.order === "desc" ? -c : c;
    });
    res.json({
      items: filtered.slice(skip, skip + pageSize),
      total: filtered.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      today: ctx.today,
      warningDays: ctx.warningDays,
    });
  }),
);

// Expiry calendar: every in-stock batch with an effective expiry inside the month
itemsRouter.get(
  "/calendar",
  handler(async (req, res) => {
    const { month } = parse(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM") }), req.query);
    const ctx = await getCtx(uid(req));
    const items = await loadItemViews(ctx);
    const entries = items.flatMap((i) =>
      i.batches
        .filter((b) => b.quantity > 0 && b.effectiveExpiry?.startsWith(month))
        .map((b) => ({ date: b.effectiveExpiry!, itemId: i.id, name: i.name, quantity: b.quantity, unit: i.unit, status: b.status, reason: b.expiryReason })),
    );
    res.json({ month, today: ctx.today, entries: entries.sort((a, b) => (a.date < b.date ? -1 : 1)) });
  }),
);

itemsRouter.get(
  "/trash",
  handler(async (req, res) => {
    const ctx = await getCtx(uid(req));
    const items = await loadItemViews(ctx, { deleted: true });
    res.json({ items: items.sort((a, b) => b.deletedAt!.getTime() - a.deletedAt!.getTime()) });
  }),
);

itemsRouter.get(
  "/:id",
  handler(async (req, res) => {
    const ctx = await getCtx(uid(req));
    res.json({ item: await getItemView(ctx, param(req, "id")), today: ctx.today });
  }),
);

itemsRouter.get(
  "/:id/history",
  handler(async (req, res) => {
    const ctx = await getCtx(uid(req));
    const itemId = param(req, "id");
    const item = await prisma.item.findFirst({ where: { id: itemId, userId: ctx.userId }, select: { id: true } });
    if (!item) throw notFound("Item");
    const [usage, activity] = await Promise.all([
      prisma.usageEvent.findMany({ where: { itemId, userId: ctx.userId }, orderBy: { occurredAt: "desc" }, take: 50 }),
      prisma.activity.findMany({ where: { entityId: itemId, userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);
    res.json({
      usage: usage.map((u) => ({ ...u, quantity: Number(u.quantity), estimatedCost: u.estimatedCost == null ? null : Number(u.estimatedCost) })),
      activity,
    });
  }),
);

// ---------- create ----------

itemsRouter.post(
  "/",
  handler(async (req, res) => {
    const userId = uid(req);
    const body = parse(createSchema, req.body);
    const ctx = await getCtx(userId);
    checkDates(ctx, body, body.noExpiry);
    await assertOwnership(userId, body);

    // Same name + unit already in the pantry? Ask whether to add a batch or keep separate.
    // A double-click sends two identical requests at once; the lock makes the second one see the first
    const findDuplicate = (db: typeof prisma | Parameters<typeof lockKey>[0]) =>
      db.item.findFirst({ where: { userId, deletedAt: null, unit: body.unit, name: { equals: body.name, mode: "insensitive" } } });
    const duplicateError = (d: { id: string; name: string }) =>
      conflict(`“${d.name}” is already in your pantry`, "DUPLICATE_ITEM", { existingItemId: d.id, existingName: d.name });
    const itemLock = `item:${userId}:${body.name.toLowerCase()}:${body.unit}`;

    const duplicate = await findDuplicate(prisma);
    if (duplicate && !body.duplicateStrategy) throw duplicateError(duplicate);

    const batchData = {
      quantity: roundQty(body.quantity),
      initialQuantity: roundQty(body.quantity),
      purchaseDate: body.purchaseDate ? dateStrToDate(body.purchaseDate) : null,
      expiryDate: body.expiryDate ? dateStrToDate(body.expiryDate) : null,
      cost: body.cost,
    };

    if (duplicate && body.duplicateStrategy === "merge") {
      const row = await prisma.$transaction(async (tx) => {
        await tx.batch.create({ data: { ...batchData, itemId: duplicate.id } });
        await tx.item.update({ where: { id: duplicate.id }, data: { version: { increment: 1 } } });
        await logActivity(tx, userId, "RESTOCKED", "item", `Added ${body.quantity} ${body.unit} of ${duplicate.name} as a new batch`, duplicate.id);
        return tx.item.findUniqueOrThrow({ where: { id: duplicate.id }, include: itemInclude });
      });
      res.status(200).json({ item: toItemView(row, ctx), merged: true });
      return;
    }

    const row = await prisma.$transaction(async (tx) => {
      await lockKey(tx, itemLock);
      if (!body.duplicateStrategy) {
        const late = await findDuplicate(tx);
        if (late) throw duplicateError(late);
      }
      const item = await tx.item.create({
        data: {
          userId,
          name: body.name,
          brand: body.brand,
          categoryId: body.categoryId,
          locationId: body.locationId,
          unit: body.unit,
          minStock: body.minStock,
          openedShelfLifeDays: body.openedShelfLifeDays,
          noExpiry: body.noExpiry,
          barcode: body.barcode,
          notes: body.notes,
          imageId: body.imageId ?? null,
          batches: { create: batchData },
        },
        include: itemInclude,
      });
      await logActivity(tx, userId, "ITEM_CREATED", "item", `Added ${item.name} (${body.quantity} ${body.unit})`, item.id);
      return item;
    });
    res.status(201).json({ item: toItemView(row, ctx) });
  }),
);

// ---------- update (optimistic concurrency) ----------

itemsRouter.patch(
  "/:id",
  handler(async (req, res) => {
    const userId = uid(req);
    const id = param(req, "id");
    const body = parse(updateSchema, req.body);
    const ctx = await getCtx(userId);
    const current = await prisma.item.findFirst({ where: { id, userId, deletedAt: null }, include: { batches: true } });
    if (!current) throw notFound("Item");
    await assertOwnership(userId, body);

    if (body.name || body.unit) {
      const dup = await prisma.item.findFirst({
        where: { userId, deletedAt: null, id: { not: id }, unit: body.unit ?? current.unit, name: { equals: body.name ?? current.name, mode: "insensitive" } },
      });
      if (dup) throw conflict(`Another item called “${dup.name}” already uses that unit`, "DUPLICATE_ITEM", { fields: { name: "Name already used" } });
    }
    // Turning off "no expiry" while a batch has no date would leave unknown dates — that's allowed but flagged as NO_DATE.
    if (body.unit && body.unit !== current.unit && current.batches.some((b) => Number(b.quantity) > 0)) {
      throw badRequest("Unit can't change while the item has stock", { fields: { unit: "Use up or adjust the stock first, or create a new item" } });
    }

    const { version, imageId, ...rest } = body;
    const data: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([, val]) => val !== undefined));
    if (imageId !== undefined) data.imageId = imageId;

    // Only succeeds if nobody else saved since this version was read
    const result = await prisma.item.updateMany({ where: { id, userId, version }, data: { ...data, version: { increment: 1 } } });
    if (result.count === 0) {
      throw conflict("This item was changed somewhere else. Reload to see the latest version.", "VERSION_CONFLICT");
    }
    // Replaced or removed image: delete the old one so it doesn't linger
    if (imageId !== undefined && current.imageId && current.imageId !== imageId) {
      await prisma.itemImage.deleteMany({ where: { id: current.imageId, userId } });
    }
    await logActivity(prisma, userId, "ITEM_UPDATED", "item", `Updated details of ${body.name ?? current.name}`, id);
    res.json({ item: await getItemView(ctx, id) });
  }),
);

// ---------- delete → trash → restore / purge ----------

itemsRouter.delete(
  "/:id",
  handler(async (req, res) => {
    const userId = uid(req);
    const id = param(req, "id");
    const item = await prisma.item.findFirst({ where: { id, userId, deletedAt: null } });
    if (!item) throw notFound("Item");
    await prisma.item.update({ where: { id }, data: { deletedAt: new Date(), version: { increment: 1 } } });
    await prisma.notification.deleteMany({ where: { userId, itemId: id, readAt: null } });
    await logActivity(prisma, userId, "ITEM_DELETED", "item", `Moved ${item.name} to trash`, id);
    res.json({ ok: true, undoable: true });
  }),
);

itemsRouter.post(
  "/:id/restore",
  handler(async (req, res) => {
    const userId = uid(req);
    const id = param(req, "id");
    const item = await prisma.item.findFirst({ where: { id, userId, deletedAt: { not: null } } });
    if (!item) throw notFound("Item in trash");
    const clash = await prisma.item.findFirst({
      where: { userId, deletedAt: null, unit: item.unit, name: { equals: item.name, mode: "insensitive" } },
    });
    if (clash) throw conflict(`An active item called “${clash.name}” already exists. Rename or delete it first.`, "DUPLICATE_ITEM");
    await prisma.item.update({ where: { id }, data: { deletedAt: null, version: { increment: 1 } } });
    await logActivity(prisma, userId, "ITEM_RESTORED", "item", `Restored ${item.name} from trash`, id);
    const ctx = await getCtx(userId);
    res.json({ item: await getItemView(ctx, id) });
  }),
);

itemsRouter.delete(
  "/:id/permanent",
  handler(async (req, res) => {
    const userId = uid(req);
    const id = param(req, "id");
    const item = await prisma.item.findFirst({ where: { id, userId, deletedAt: { not: null } } });
    if (!item) throw notFound("Item in trash");
    // Usage history keeps its name snapshot; batches are removed with the item
    await prisma.$transaction(async (tx) => {
      await tx.item.delete({ where: { id } });
      if (item.imageId) await tx.itemImage.deleteMany({ where: { id: item.imageId, userId } });
      await tx.notification.deleteMany({ where: { userId, itemId: id } });
      await logActivity(tx, userId, "ITEM_PURGED", "item", `Permanently deleted ${item.name}`, id);
    });
    res.json({ ok: true });
  }),
);

// ---------- batches: restock, adjust, open ----------

itemsRouter.post(
  "/:id/batches",
  handler(async (req, res) => {
    const userId = uid(req);
    const id = param(req, "id");
    const body = parse(z.object(batchFields), req.body);
    const ctx = await getCtx(userId);
    const item = await prisma.item.findFirst({ where: { id, userId, deletedAt: null } });
    if (!item) throw notFound("Item");
    checkDates(ctx, body, item.noExpiry);
    await prisma.$transaction(async (tx) => {
      await tx.batch.create({
        data: {
          itemId: id,
          quantity: roundQty(body.quantity),
          initialQuantity: roundQty(body.quantity),
          purchaseDate: body.purchaseDate ? dateStrToDate(body.purchaseDate) : null,
          expiryDate: body.expiryDate ? dateStrToDate(body.expiryDate) : null,
          cost: body.cost,
        },
      });
      await tx.item.update({ where: { id }, data: { version: { increment: 1 } } });
      await logActivity(tx, userId, "RESTOCKED", "item", `Restocked ${item.name} with ${body.quantity} ${item.unit}`, id);
    });
    res.status(201).json({ item: await getItemView(ctx, id) });
  }),
);

const batchUpdate = z.object({
  quantity: v.nonNegative("Quantity").optional(),
  purchaseDate: v.optionalDate("Purchase date").optional(),
  expiryDate: v.optionalDate("Expiry date").optional(),
  openedAt: v.optionalDate("Opened date").optional(),
  cost: v.money().optional(),
});

async function ownedBatch(userId: string, itemId: string, batchId: string) {
  const batch = await prisma.batch.findFirst({ where: { id: batchId, itemId, item: { userId, deletedAt: null } }, include: { item: true } });
  if (!batch) throw notFound("Batch");
  return batch;
}

itemsRouter.patch(
  "/:id/batches/:batchId",
  handler(async (req, res) => {
    const userId = uid(req);
    const itemId = param(req, "id");
    const batchId = param(req, "batchId");
    const body = parse(batchUpdate, req.body);
    const ctx = await getCtx(userId);
    const batch = await ownedBatch(userId, itemId, batchId);

    const current = {
      purchaseDate: body.purchaseDate !== undefined ? body.purchaseDate : batch.purchaseDate?.toISOString().slice(0, 10) ?? null,
      expiryDate: body.expiryDate !== undefined ? body.expiryDate : batch.expiryDate?.toISOString().slice(0, 10) ?? null,
    };
    checkDates(ctx, current, batch.item.noExpiry);
    if (body.openedAt && body.openedAt > ctx.today) throw badRequest("Opened date can't be in the future", { fields: { openedAt: "Can't be in the future" } });

    await prisma.$transaction(async (tx) => {
      await lockItemBatches(tx, itemId);
      const data: Record<string, unknown> = {};
      if (body.quantity !== undefined) {
        data.quantity = roundQty(body.quantity);
        // Keep initial >= current so cost-per-unit stays sensible after a manual correction upward
        if (body.quantity > Number(batch.initialQuantity)) data.initialQuantity = roundQty(body.quantity);
      }
      if (body.purchaseDate !== undefined) data.purchaseDate = body.purchaseDate ? dateStrToDate(body.purchaseDate) : null;
      if (body.expiryDate !== undefined) data.expiryDate = body.expiryDate ? dateStrToDate(body.expiryDate) : null;
      if (body.openedAt !== undefined) data.openedAt = body.openedAt ? dateStrToDate(body.openedAt) : null;
      if (body.cost !== undefined) data.cost = body.cost;
      await tx.batch.update({ where: { id: batchId }, data });
      await tx.item.update({ where: { id: itemId }, data: { version: { increment: 1 } } });
      if (body.quantity !== undefined && body.quantity !== Number(batch.quantity)) {
        await logActivity(tx, userId, "QUANTITY_ADJUSTED", "item", `Adjusted ${batch.item.name} batch from ${Number(batch.quantity)} to ${body.quantity} ${batch.item.unit}`, itemId);
      } else {
        await logActivity(tx, userId, "ITEM_UPDATED", "item", `Updated a batch of ${batch.item.name}`, itemId);
      }
    });
    res.json({ item: await getItemView(ctx, itemId) });
  }),
);

itemsRouter.post(
  "/:id/batches/:batchId/open",
  handler(async (req, res) => {
    const userId = uid(req);
    const itemId = param(req, "id");
    const batchId = param(req, "batchId");
    const body = parse(z.object({ openedAt: v.optionalDate("Opened date") }), req.body ?? {});
    const ctx = await getCtx(userId);
    const batch = await ownedBatch(userId, itemId, batchId);
    const openedAt = body.openedAt ?? ctx.today;
    if (openedAt > ctx.today) throw badRequest("Opened date can't be in the future");
    await prisma.batch.update({ where: { id: batchId }, data: { openedAt: dateStrToDate(openedAt) } });
    await prisma.item.update({ where: { id: itemId }, data: { version: { increment: 1 } } });
    await logActivity(prisma, userId, "OPENED", "item", `Marked ${batch.item.name} as opened on ${openedAt}`, itemId);
    res.json({ item: await getItemView(ctx, itemId) });
  }),
);

itemsRouter.delete(
  "/:id/batches/:batchId",
  handler(async (req, res) => {
    const userId = uid(req);
    const itemId = param(req, "id");
    const batchId = param(req, "batchId");
    const ctx = await getCtx(userId);
    const batch = await ownedBatch(userId, itemId, batchId);
    await prisma.batch.delete({ where: { id: batchId } });
    await prisma.item.update({ where: { id: itemId }, data: { version: { increment: 1 } } });
    await logActivity(prisma, userId, "BATCH_DELETED", "item", `Removed a batch of ${batch.item.name} (${Number(batch.quantity)} ${batch.item.unit}) — entered by mistake`, itemId);
    res.json({ item: await getItemView(ctx, itemId) });
  }),
);

// ---------- consume / discard ----------

const usageBody = z.object({
  quantity: v.quantity(),
  unit: v.unit.optional(),
  note: v.optionalText(300),
  batchId: z.string().uuid().optional(),
  allowExpired: z.boolean().optional(),
});

itemsRouter.post(
  "/:id/consume",
  handler(async (req, res) => {
    const body = parse(usageBody, req.body);
    const ctx = await getCtx(uid(req));
    const result = await deductStock(ctx, param(req, "id"), { type: "CONSUMED", ...body });
    res.json({ item: result.item, eventId: result.event.id });
  }),
);

itemsRouter.post(
  "/:id/discard",
  handler(async (req, res) => {
    const body = parse(
      usageBody.extend({ reason: z.enum(["EXPIRED", "SPOILED", "LEFTOVER", "OVERBOUGHT", "DAMAGED", "OTHER"], { error: "Choose a reason" }) }),
      req.body,
    );
    const ctx = await getCtx(uid(req));
    const result = await deductStock(ctx, param(req, "id"), { type: "WASTED", ...body, allowExpired: true });
    res.json({ item: result.item, eventId: result.event.id });
  }),
);

/** Discards every expired batch of an item in one step (common clean-up action). */
itemsRouter.post(
  "/:id/discard-expired",
  handler(async (req, res) => {
    const ctx = await getCtx(uid(req));
    const id = param(req, "id");
    const item = await getItemView(ctx, id);
    const expired = item.batches.filter((b) => b.quantity > 0 && b.status === "EXPIRED");
    if (!expired.length) throw badRequest("This item has no expired stock");
    let latest = item;
    for (const b of expired) {
      latest = (await deductStock(ctx, id, { type: "WASTED", quantity: b.quantity, reason: "EXPIRED", batchId: b.id, allowExpired: true })).item;
    }
    res.json({ item: latest, discarded: expired.length });
  }),
);

export { STATUS_RANK };
