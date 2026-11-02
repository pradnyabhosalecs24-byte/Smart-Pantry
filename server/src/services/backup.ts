import { z } from "zod";
import { num, prisma } from "../db.js";
import { logActivity } from "../lib/activity.js";
import { dateStrToDate, dateToStr, isValidDateStr } from "../lib/dates.js";
import { badRequest } from "../lib/http.js";
import { UNIT_LIST } from "../lib/units.js";

// Full JSON backup of one user's data (images are not included to keep files small).
// Restore MERGES into the account: it never overwrites or deletes existing records.

export async function buildBackup(userId: string) {
  const [settings, categories, locations, items, shopping, usage] = await Promise.all([
    prisma.settings.findUnique({ where: { userId } }),
    prisma.category.findMany({ where: { userId } }),
    prisma.location.findMany({ where: { userId } }),
    prisma.item.findMany({ where: { userId, deletedAt: null }, include: { batches: true, category: true, location: true } }),
    prisma.shoppingItem.findMany({ where: { userId } }),
    prisma.usageEvent.findMany({ where: { userId } }),
  ]);
  return {
    app: "smart-pantry",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: settings && {
      warningDays: settings.warningDays,
      timezone: settings.timezone,
      currency: settings.currency,
    },
    categories: categories.map((c) => ({ name: c.name, openedShelfLifeDays: c.openedShelfLifeDays })),
    locations: locations.map((l) => ({ name: l.name })),
    items: items.map((i) => ({
      name: i.name,
      brand: i.brand,
      category: i.category.name,
      location: i.location.name,
      unit: i.unit,
      minStock: num(i.minStock),
      openedShelfLifeDays: i.openedShelfLifeDays,
      noExpiry: i.noExpiry,
      barcode: i.barcode,
      notes: i.notes,
      batches: i.batches.map((b) => ({
        quantity: num(b.quantity),
        initialQuantity: num(b.initialQuantity),
        purchaseDate: dateToStr(b.purchaseDate),
        expiryDate: dateToStr(b.expiryDate),
        openedAt: dateToStr(b.openedAt),
        cost: b.cost == null ? null : num(b.cost),
      })),
    })),
    shopping: shopping.map((s) => ({ name: s.name, quantity: num(s.quantity), unit: s.unit, note: s.note, status: s.status })),
    usage: usage.map((u) => ({
      itemName: u.itemName,
      categoryName: u.categoryName,
      type: u.type,
      quantity: num(u.quantity),
      unit: u.unit,
      reason: u.reason,
      estimatedCost: u.estimatedCost == null ? null : num(u.estimatedCost),
      note: u.note,
      occurredAt: u.occurredAt.toISOString(),
    })),
  };
}

const date = z.string().refine(isValidDateStr).nullable();
const unit = z.enum(UNIT_LIST as [string, ...string[]]);
const backupSchema = z.object({
  app: z.literal("smart-pantry"),
  version: z.literal(1),
  categories: z.array(z.object({ name: z.string().trim().min(1).max(50), openedShelfLifeDays: z.number().int().min(0).max(3650).nullable() })).max(500),
  locations: z.array(z.object({ name: z.string().trim().min(1).max(50) })).max(500),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        brand: z.string().max(80).nullable(),
        category: z.string().trim().min(1).max(50),
        location: z.string().trim().min(1).max(50),
        unit,
        minStock: z.number().min(0),
        openedShelfLifeDays: z.number().int().min(0).max(3650).nullable(),
        noExpiry: z.boolean(),
        barcode: z.string().max(14).nullable(),
        notes: z.string().max(500).nullable(),
        batches: z.array(
          z.object({
            quantity: z.number().min(0),
            initialQuantity: z.number().min(0),
            purchaseDate: date,
            expiryDate: date,
            openedAt: date,
            cost: z.number().min(0).nullable(),
          }),
        ),
      }),
    )
    .max(5000),
  shopping: z.array(z.object({ name: z.string().trim().min(1).max(100), quantity: z.number().positive(), unit, note: z.string().max(200).nullable(), status: z.enum(["PENDING", "PURCHASED"]) })).max(2000),
  usage: z
    .array(
      z.object({
        itemName: z.string().min(1).max(100),
        categoryName: z.string().max(50),
        type: z.enum(["CONSUMED", "WASTED"]),
        quantity: z.number().positive(),
        unit: z.string().max(10),
        reason: z.enum(["EXPIRED", "SPOILED", "LEFTOVER", "OVERBOUGHT", "DAMAGED", "OTHER"]).nullable(),
        estimatedCost: z.number().min(0).nullable(),
        note: z.string().max(300).nullable(),
        occurredAt: z.string().datetime(),
      }),
    )
    .max(50000),
});

export async function restoreBackup(userId: string, raw: unknown, dryRun: boolean) {
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw badRequest(`This is not a valid Smart Pantry backup (${first.path.join(".") || "file"}: ${first.message})`);
  }
  const data = parsed.data;

  const existingItems = await prisma.item.findMany({ where: { userId, deletedAt: null }, select: { name: true, unit: true } });
  const itemKeys = new Set(existingItems.map((i) => `${i.name.toLowerCase()}|${i.unit}`));
  const itemsToAdd = data.items.filter((i) => !itemKeys.has(`${i.name.toLowerCase()}|${i.unit}`));
  const pending = await prisma.shoppingItem.findMany({ where: { userId, status: "PENDING" }, select: { name: true } });
  const pendingNames = new Set(pending.map((p) => p.name.toLowerCase()));
  const shoppingToAdd = data.shopping.filter((s) => s.status === "PENDING" && !pendingNames.has(s.name.toLowerCase()));
  const existingUsage = await prisma.usageEvent.findMany({ where: { userId }, select: { itemName: true, type: true, occurredAt: true } });
  const usageKeys = new Set(existingUsage.map((u) => `${u.itemName}|${u.type}|${u.occurredAt.toISOString()}`));
  const usageToAdd = data.usage.filter((u) => !usageKeys.has(`${u.itemName}|${u.type}|${new Date(u.occurredAt).toISOString()}`));

  const summary = {
    items: { add: itemsToAdd.length, skipExisting: data.items.length - itemsToAdd.length },
    shopping: { add: shoppingToAdd.length, skip: data.shopping.length - shoppingToAdd.length },
    usage: { add: usageToAdd.length, skip: data.usage.length - usageToAdd.length },
  };
  if (dryRun) return { dryRun: true, summary };

  await prisma.$transaction(
    async (tx) => {
      const catId = new Map((await tx.category.findMany({ where: { userId } })).map((c) => [c.name.toLowerCase(), c.id]));
      const locId = new Map((await tx.location.findMany({ where: { userId } })).map((l) => [l.name.toLowerCase(), l.id]));
      const ensureCat = async (name: string, days: number | null = null) => {
        const k = name.toLowerCase();
        if (!catId.has(k)) catId.set(k, (await tx.category.create({ data: { userId, name, openedShelfLifeDays: days } })).id);
        return catId.get(k)!;
      };
      const ensureLoc = async (name: string) => {
        const k = name.toLowerCase();
        if (!locId.has(k)) locId.set(k, (await tx.location.create({ data: { userId, name } })).id);
        return locId.get(k)!;
      };
      for (const c of data.categories) await ensureCat(c.name, c.openedShelfLifeDays);
      for (const l of data.locations) await ensureLoc(l.name);

      for (const i of itemsToAdd) {
        await tx.item.create({
          data: {
            userId,
            name: i.name,
            brand: i.brand,
            unit: i.unit,
            minStock: i.minStock,
            openedShelfLifeDays: i.openedShelfLifeDays,
            noExpiry: i.noExpiry,
            barcode: i.barcode,
            notes: i.notes,
            categoryId: await ensureCat(i.category),
            locationId: await ensureLoc(i.location),
            batches: {
              create: i.batches.map((b) => ({
                quantity: b.quantity,
                initialQuantity: Math.max(b.initialQuantity, b.quantity),
                purchaseDate: b.purchaseDate ? dateStrToDate(b.purchaseDate) : null,
                expiryDate: b.expiryDate ? dateStrToDate(b.expiryDate) : null,
                openedAt: b.openedAt ? dateStrToDate(b.openedAt) : null,
                cost: b.cost,
              })),
            },
          },
        });
      }
      if (shoppingToAdd.length) {
        await tx.shoppingItem.createMany({ data: shoppingToAdd.map((s) => ({ userId, name: s.name, quantity: s.quantity, unit: s.unit, note: s.note })) });
      }
      if (usageToAdd.length) {
        await tx.usageEvent.createMany({ data: usageToAdd.map((u) => ({ ...u, userId, occurredAt: new Date(u.occurredAt) })) });
      }
      await logActivity(tx, userId, "BACKUP_RESTORED", "backup", `Restored backup: ${summary.items.add} item(s), ${summary.shopping.add} list entr(ies), ${summary.usage.add} history record(s)`);
    },
    { timeout: 120_000 },
  );
  return { dryRun: false, summary };
}
