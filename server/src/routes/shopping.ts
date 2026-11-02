import { Router } from "express";
import { z } from "zod";
import { num, prisma } from "../db.js";
import { logActivity } from "../lib/activity.js";
import { dateStrToDate } from "../lib/dates.js";
import { badRequest, conflict, handler, notFound, param, parse } from "../lib/http.js";
import { convert, isUnit, roundQty } from "../lib/units.js";
import * as v from "../lib/validators.js";
import { uid } from "../middleware/auth.js";
import { getCtx, getItemView, loadItemViews } from "../services/pantry.js";

export const shoppingRouter = Router();

type Row = Awaited<ReturnType<typeof prisma.shoppingItem.findFirstOrThrow>>;
const view = (s: Row) => ({ ...s, quantity: num(s.quantity) });

shoppingRouter.get(
  "/",
  handler(async (req, res) => {
    const userId = uid(req);
    const rows = await prisma.shoppingItem.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }] });
    res.json({
      pending: rows.filter((r) => r.status === "PENDING").map(view),
      purchased: rows
        .filter((r) => r.status === "PURCHASED")
        .sort((a, b) => (b.purchasedAt?.getTime() ?? 0) - (a.purchasedAt?.getTime() ?? 0))
        .map(view),
    });
  }),
);

const addSchema = z.object({
  name: v.trimmed(100, "Product name"),
  quantity: v.quantity(),
  unit: v.unit,
  itemId: z.string().uuid().nullish(),
  note: v.optionalText(200),
  /** When a pending entry already exists: add quantities together instead of erroring */
  merge: z.boolean().optional(),
});

shoppingRouter.post(
  "/",
  handler(async (req, res) => {
    const userId = uid(req);
    const body = parse(addSchema, req.body);
    if (body.itemId && !(await prisma.item.findFirst({ where: { id: body.itemId, userId } }))) throw notFound("Pantry item");

    const existing = await prisma.shoppingItem.findFirst({
      where: { userId, status: "PENDING", name: { equals: body.name, mode: "insensitive" } },
    });
    if (existing) {
      const extra = isUnit(body.unit) && isUnit(existing.unit) ? convert(body.quantity, body.unit, existing.unit) : null;
      if (!body.merge) {
        throw conflict(`“${existing.name}” is already on your list (${num(existing.quantity)} ${existing.unit})`, "DUPLICATE_ENTRY", {
          existingId: existing.id,
          canMerge: extra != null,
        });
      }
      if (extra == null) throw badRequest(`Can't combine ${body.unit} with ${existing.unit}`);
      const updated = await prisma.shoppingItem.update({
        where: { id: existing.id },
        data: { quantity: roundQty(num(existing.quantity) + extra) },
      });
      res.json({ entry: view(updated), merged: true });
      return;
    }

    const entry = await prisma.shoppingItem.create({
      data: { userId, name: body.name, quantity: roundQty(body.quantity), unit: body.unit, itemId: body.itemId ?? null, note: body.note },
    });
    await logActivity(prisma, userId, "SHOPPING_ADDED", "shopping", `Added ${body.name} to the shopping list`, entry.id);
    res.status(201).json({ entry: view(entry) });
  }),
);

/** Adds every low-stock / out-of-stock pantry item that isn't already on the list. */
shoppingRouter.post(
  "/from-low-stock",
  handler(async (req, res) => {
    const userId = uid(req);
    const ctx = await getCtx(userId);
    const low = (await loadItemViews(ctx)).filter((i) => i.lowStock);
    const pending = await prisma.shoppingItem.findMany({ where: { userId, status: "PENDING" } });
    const pendingNames = new Set(pending.map((p) => p.name.toLowerCase()));
    const pendingItemIds = new Set(pending.map((p) => p.itemId).filter(Boolean));

    const toAdd = low.filter((i) => !pendingItemIds.has(i.id) && !pendingNames.has(i.name.toLowerCase()));
    if (toAdd.length) {
      await prisma.shoppingItem.createMany({
        data: toAdd.map((i) => ({
          userId,
          name: i.name,
          itemId: i.id,
          unit: i.unit,
          // Suggest enough to get back above the minimum (at least 1 unit)
          quantity: Math.max(roundQty(i.minStock * 2 - i.quantity), i.minStock > 0 ? i.minStock : 1, 1),
          note: "Added from low stock",
        })),
      });
      await logActivity(prisma, userId, "SHOPPING_ADDED", "shopping", `Added ${toAdd.length} low-stock item(s) to the shopping list`);
    }
    res.json({ added: toAdd.length, skipped: low.length - toAdd.length });
  }),
);

shoppingRouter.patch(
  "/:id",
  handler(async (req, res) => {
    const userId = uid(req);
    const id = param(req, "id");
    const body = parse(
      z.object({
        name: v.trimmed(100, "Product name").optional(),
        quantity: v.quantity().optional(),
        unit: v.unit.optional(),
        note: v.optionalText(200).optional(),
        status: z.enum(["PENDING", "PURCHASED"]).optional(),
      }),
      req.body,
    );
    const existing = await prisma.shoppingItem.findFirst({ where: { id, userId } });
    if (!existing) throw notFound("Shopping list entry");
    if (body.name && body.name.toLowerCase() !== existing.name.toLowerCase()) {
      const dup = await prisma.shoppingItem.findFirst({ where: { userId, status: "PENDING", id: { not: id }, name: { equals: body.name, mode: "insensitive" } } });
      if (dup) throw conflict(`“${dup.name}” is already on your list`, "DUPLICATE_ENTRY", { fields: { name: "Already on the list" } });
    }
    const data: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(body)) if (val !== undefined) data[k] = val;
    if (body.status === "PURCHASED" && existing.status !== "PURCHASED") data.purchasedAt = new Date();
    if (body.status === "PENDING") {
      data.purchasedAt = null;
      data.addedToPantry = false;
    }
    const updated = await prisma.shoppingItem.update({ where: { id }, data });
    if (body.status === "PURCHASED" && existing.status !== "PURCHASED") {
      await logActivity(prisma, userId, "SHOPPING_PURCHASED", "shopping", `Bought ${existing.name}`, id);
    }
    res.json({ entry: view(updated) });
  }),
);

shoppingRouter.delete(
  "/purchased",
  handler(async (req, res) => {
    const userId = uid(req);
    const { count } = await prisma.shoppingItem.deleteMany({ where: { userId, status: "PURCHASED" } });
    res.json({ removed: count });
  }),
);

shoppingRouter.delete(
  "/:id",
  handler(async (req, res) => {
    const userId = uid(req);
    const id = param(req, "id");
    const existing = await prisma.shoppingItem.findFirst({ where: { id, userId } });
    if (!existing) throw notFound("Shopping list entry");
    await prisma.shoppingItem.delete({ where: { id } });
    await logActivity(prisma, userId, "SHOPPING_REMOVED", "shopping", `Removed ${existing.name} from the shopping list`, id);
    res.json({ ok: true });
  }),
);

/**
 * Marks an entry as bought and (optionally) puts it into the pantry.
 * The user confirms the real quantity and expiry date — nothing is guessed.
 */
shoppingRouter.post(
  "/:id/purchase",
  handler(async (req, res) => {
    const userId = uid(req);
    const id = param(req, "id");
    const body = parse(
      z.object({
        addToPantry: z.boolean(),
        quantity: v.quantity().optional(),
        purchaseDate: v.optionalDate("Purchase date"),
        expiryDate: v.optionalDate("Expiry date"),
        noExpiry: z.boolean().optional(),
        cost: v.money(),
        categoryId: z.string().uuid().optional(),
        locationId: z.string().uuid().optional(),
      }),
      req.body,
    );
    const entry = await prisma.shoppingItem.findFirst({ where: { id, userId } });
    if (!entry) throw notFound("Shopping list entry");
    if (entry.addedToPantry) throw conflict("This entry was already added to the pantry", "ALREADY_ADDED");
    const ctx = await getCtx(userId);

    if (!body.addToPantry) {
      const updated = await prisma.shoppingItem.update({ where: { id }, data: { status: "PURCHASED", purchasedAt: new Date() } });
      await logActivity(prisma, userId, "SHOPPING_PURCHASED", "shopping", `Bought ${entry.name}`, id);
      res.json({ entry: view(updated) });
      return;
    }

    const quantity = body.quantity ?? num(entry.quantity);
    const purchaseDate = body.purchaseDate ?? ctx.today;
    // Use the linked pantry item, or an existing item with the same name, so we never create a duplicate
    const linked =
      (entry.itemId ? await prisma.item.findFirst({ where: { id: entry.itemId, userId, deletedAt: null } }) : null) ??
      (await prisma.item.findFirst({ where: { userId, deletedAt: null, unit: entry.unit, name: { equals: entry.name, mode: "insensitive" } } }));
    const noExpiry = linked ? linked.noExpiry : Boolean(body.noExpiry);

    const fields: Record<string, string> = {};
    if (purchaseDate > ctx.today) fields.purchaseDate = "Purchase date can't be in the future";
    if (!noExpiry && !body.expiryDate) fields.expiryDate = "Expiry date is required";
    if (body.expiryDate && body.expiryDate < purchaseDate) fields.expiryDate = "Expiry date can't be before the purchase date";
    if (!linked && !body.categoryId) fields.categoryId = "Choose a category";
    if (!linked && !body.locationId) fields.locationId = "Choose a storage location";
    if (Object.keys(fields).length) throw badRequest("Please fix the highlighted fields", { fields });

    if (!linked) {
      const [cat, loc] = await Promise.all([
        prisma.category.findFirst({ where: { id: body.categoryId!, userId } }),
        prisma.location.findFirst({ where: { id: body.locationId!, userId } }),
      ]);
      if (!cat || !loc) throw badRequest("Choose a valid category and storage location");
    }

    // Quantity entered in the list's unit; convert into the pantry item's unit if they differ
    let batchQty = quantity;
    if (linked && linked.unit !== entry.unit) {
      const c = isUnit(entry.unit) && isUnit(linked.unit) ? convert(quantity, entry.unit, linked.unit) : null;
      if (c == null) throw badRequest(`The list uses ${entry.unit} but the pantry item uses ${linked.unit}`);
      batchQty = c;
    }

    const itemId = await prisma.$transaction(async (tx) => {
      // Claim the entry first: if a second identical request (double-click) arrives, it finds nothing to claim
      const claimed = await tx.shoppingItem.updateMany({ where: { id, userId, addedToPantry: false }, data: { addedToPantry: true } });
      if (claimed.count === 0) throw conflict("This entry was already added to the pantry", "ALREADY_ADDED");
      const batch = {
        quantity: roundQty(batchQty),
        initialQuantity: roundQty(batchQty),
        purchaseDate: dateStrToDate(purchaseDate),
        expiryDate: body.expiryDate ? dateStrToDate(body.expiryDate) : null,
        cost: body.cost,
      };
      let targetId: string;
      if (linked) {
        await tx.batch.create({ data: { ...batch, itemId: linked.id } });
        await tx.item.update({ where: { id: linked.id }, data: { version: { increment: 1 } } });
        targetId = linked.id;
        await logActivity(tx, userId, "RESTOCKED", "item", `Restocked ${linked.name} from the shopping list`, linked.id);
      } else {
        const created = await tx.item.create({
          data: {
            userId,
            name: entry.name,
            unit: entry.unit,
            categoryId: body.categoryId!,
            locationId: body.locationId!,
            noExpiry,
            batches: { create: batch },
          },
        });
        targetId = created.id;
        await logActivity(tx, userId, "ITEM_CREATED", "item", `Added ${entry.name} to the pantry from the shopping list`, created.id);
      }
      await tx.shoppingItem.update({
        where: { id },
        data: { status: "PURCHASED", purchasedAt: new Date(), addedToPantry: true, itemId: targetId },
      });
      await logActivity(tx, userId, "SHOPPING_PURCHASED", "shopping", `Bought ${entry.name}`, id);
      return targetId;
    });

    const updated = await prisma.shoppingItem.findUniqueOrThrow({ where: { id } });
    res.json({ entry: view(updated), item: await getItemView(ctx, itemId) });
  }),
);
