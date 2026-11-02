import { parse as parseCsv } from "csv-parse/sync";
import { prisma } from "../db.js";
import { logActivity } from "../lib/activity.js";
import { dateStrToDate, isValidDateStr } from "../lib/dates.js";
import { badRequest } from "../lib/http.js";
import { isUnit, roundQty } from "../lib/units.js";
import type { Ctx } from "./pantry.js";

export const IMPORT_COLUMNS = ["name", "category", "location", "quantity", "unit", "expiryDate", "purchaseDate", "minStock", "brand", "cost", "noExpiry", "notes"] as const;
const MAX_ROWS = 1000;

// Accept friendly header spellings: "Expiry Date", "expiry_date", "EXPIRYDATE" ...
const HEADER_ALIASES: Record<string, (typeof IMPORT_COLUMNS)[number]> = {
  name: "name", item: "name", itemname: "name", product: "name",
  category: "category",
  location: "location", storage: "location", storagelocation: "location",
  quantity: "quantity", qty: "quantity",
  unit: "unit", units: "unit",
  expirydate: "expiryDate", expiry: "expiryDate", expirationdate: "expiryDate", bestbefore: "expiryDate",
  purchasedate: "purchaseDate", purchased: "purchaseDate",
  minstock: "minStock", minimumstock: "minStock", minimum: "minStock",
  brand: "brand",
  cost: "cost", price: "cost",
  noexpiry: "noExpiry",
  notes: "notes", note: "notes",
};

/** Accepts YYYY-MM-DD, or DD-MM-YYYY / DD/MM/YYYY (day first, as used in India). */
export function normaliseDate(raw: string): string | null | "invalid" {
  const s = raw.trim();
  if (!s) return null;
  if (isValidDateStr(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isValidDateStr(iso) ? iso : "invalid";
  }
  return "invalid";
}

export interface ImportRow {
  row: number;
  name: string;
  category: string;
  location: string;
  quantity: number;
  unit: string;
  expiryDate: string | null;
  purchaseDate: string | null;
  minStock: number;
  brand: string | null;
  cost: number | null;
  noExpiry: boolean;
  notes: string | null;
}

export interface ImportPreview {
  totalRows: number;
  valid: ImportRow[];
  errors: { row: number; field: string; message: string }[];
  duplicates: { row: number; name: string; reason: string }[];
  addsToExisting: { row: number; name: string }[];
  newCategories: string[];
  newLocations: string[];
}

export async function previewImport(ctx: Ctx, csv: string): Promise<ImportPreview> {
  let records: Record<string, string>[];
  try {
    records = parseCsv(csv.replace(/^﻿/, ""), {
      columns: (header: string[]) => header.map((h) => HEADER_ALIASES[h.toLowerCase().replace(/[^a-z]/g, "")] ?? `__ignored_${h}`),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (err) {
    throw badRequest(`The file is not valid CSV: ${(err as Error).message}`);
  }
  if (!records.length) throw badRequest("The file has no data rows");
  if (records.length > MAX_ROWS) throw badRequest(`Please import at most ${MAX_ROWS} rows at a time`);
  if (!("name" in records[0]) || !("quantity" in records[0]) || !("unit" in records[0])) {
    throw badRequest("Missing required columns. The file needs at least: name, quantity, unit (see the template).");
  }

  const [categories, locations, items] = await Promise.all([
    prisma.category.findMany({ where: { userId: ctx.userId } }),
    prisma.location.findMany({ where: { userId: ctx.userId } }),
    prisma.item.findMany({ where: { userId: ctx.userId, deletedAt: null }, include: { batches: true } }),
  ]);
  const catNames = new Set(categories.map((c) => c.name.toLowerCase()));
  const locNames = new Set(locations.map((l) => l.name.toLowerCase()));

  const out: ImportPreview = { totalRows: records.length, valid: [], errors: [], duplicates: [], addsToExisting: [], newCategories: [], newLocations: [] };
  const seen = new Set<string>();

  records.forEach((r, idx) => {
    const row = idx + 2; // +1 header, +1 for 1-based numbering like a spreadsheet
    const err = (field: string, message: string) => out.errors.push({ row, field, message });
    const before = out.errors.length;

    const name = (r.name ?? "").trim();
    if (!name) err("name", "Name is required");
    else if (name.length > 100) err("name", "Name is too long (max 100)");

    const quantity = Number(r.quantity);
    if (!r.quantity || !Number.isFinite(quantity) || quantity <= 0) err("quantity", "Quantity must be a number greater than 0");
    else if (quantity > 1_000_000) err("quantity", "Quantity is too large");

    const unit = (r.unit ?? "").trim().toLowerCase();
    if (!isUnit(unit)) err("unit", `Unknown unit “${r.unit ?? ""}”. Use one of: g, kg, ml, l, pcs, dozen, pack, bottle, can, box`);

    const noExpiry = /^(true|yes|y|1)$/i.test((r.noExpiry ?? "").trim());
    const expiry = normaliseDate(r.expiryDate ?? "");
    const purchase = normaliseDate(r.purchaseDate ?? "");
    if (expiry === "invalid") err("expiryDate", "Expiry date must be YYYY-MM-DD or DD/MM/YYYY");
    if (purchase === "invalid") err("purchaseDate", "Purchase date must be YYYY-MM-DD or DD/MM/YYYY");
    if (!noExpiry && expiry == null) err("expiryDate", "Expiry date is required (or set noExpiry to yes)");
    if (typeof purchase === "string" && purchase !== "invalid" && purchase > ctx.today) err("purchaseDate", "Purchase date can't be in the future");
    if (typeof purchase === "string" && typeof expiry === "string" && purchase !== "invalid" && expiry !== "invalid" && expiry < purchase) {
      err("expiryDate", "Expiry date is before the purchase date");
    }

    const minStock = r.minStock ? Number(r.minStock) : 0;
    if (!Number.isFinite(minStock) || minStock < 0) err("minStock", "Minimum stock must be 0 or more");
    const cost = r.cost ? Number(r.cost.replace(/[₹$,\s]/g, "")) : null;
    if (cost != null && (!Number.isFinite(cost) || cost < 0)) err("cost", "Cost must be a positive number");

    if (out.errors.length > before) return;

    const category = (r.category ?? "").trim() || "Other";
    const location = (r.location ?? "").trim() || "Pantry Shelf";
    const rec: ImportRow = {
      row,
      name,
      category,
      location,
      quantity: roundQty(quantity),
      unit,
      expiryDate: expiry as string | null,
      purchaseDate: purchase as string | null,
      minStock,
      brand: (r.brand ?? "").trim() || null,
      cost: cost == null ? null : Math.round(cost * 100) / 100,
      noExpiry,
      notes: (r.notes ?? "").trim() || null,
    };

    // Duplicate inside the file
    const key = `${name.toLowerCase()}|${unit}|${rec.expiryDate}|${rec.quantity}`;
    if (seen.has(key)) {
      out.duplicates.push({ row, name, reason: "Same item, quantity and expiry appears earlier in this file" });
      return;
    }
    seen.add(key);

    // Already imported before? (same item with a batch of identical quantity and expiry)
    const existing = items.find((i) => i.name.toLowerCase() === name.toLowerCase() && i.unit === unit);
    if (existing) {
      const same = existing.batches.some(
        (b) => Number(b.initialQuantity) === rec.quantity && (b.expiryDate?.toISOString().slice(0, 10) ?? null) === rec.expiryDate,
      );
      if (same) {
        out.duplicates.push({ row, name, reason: "Already in your pantry with the same quantity and expiry" });
        return;
      }
      out.addsToExisting.push({ row, name: existing.name });
    }

    if (!catNames.has(category.toLowerCase()) && !out.newCategories.some((c) => c.toLowerCase() === category.toLowerCase())) out.newCategories.push(category);
    if (!locNames.has(location.toLowerCase()) && !out.newLocations.some((l) => l.toLowerCase() === location.toLowerCase())) out.newLocations.push(location);
    out.valid.push(rec);
  });

  return out;
}

/** Imports the valid rows of a preview in one transaction (all or nothing). */
export async function commitImport(ctx: Ctx, preview: ImportPreview) {
  const userId = ctx.userId;
  if (!preview.valid.length) throw badRequest("There are no valid new rows to import");
  return prisma.$transaction(
    async (tx) => {
      const catId = new Map((await tx.category.findMany({ where: { userId } })).map((c) => [c.name.toLowerCase(), c.id]));
      const locId = new Map((await tx.location.findMany({ where: { userId } })).map((l) => [l.name.toLowerCase(), l.id]));
      for (const name of preview.newCategories) catId.set(name.toLowerCase(), (await tx.category.create({ data: { userId, name } })).id);
      for (const name of preview.newLocations) locId.set(name.toLowerCase(), (await tx.location.create({ data: { userId, name } })).id);

      let created = 0;
      let batchesAdded = 0;
      for (const r of preview.valid) {
        const batch = {
          quantity: r.quantity,
          initialQuantity: r.quantity,
          expiryDate: r.expiryDate ? dateStrToDate(r.expiryDate) : null,
          purchaseDate: r.purchaseDate ? dateStrToDate(r.purchaseDate) : null,
          cost: r.cost,
        };
        const existing = await tx.item.findFirst({ where: { userId, deletedAt: null, unit: r.unit, name: { equals: r.name, mode: "insensitive" } } });
        if (existing) {
          await tx.batch.create({ data: { ...batch, itemId: existing.id } });
          batchesAdded++;
        } else {
          await tx.item.create({
            data: {
              userId,
              name: r.name,
              brand: r.brand,
              unit: r.unit,
              minStock: r.minStock,
              noExpiry: r.noExpiry,
              notes: r.notes,
              categoryId: catId.get(r.category.toLowerCase())!,
              locationId: locId.get(r.location.toLowerCase())!,
              batches: { create: batch },
            },
          });
          created++;
        }
      }
      await logActivity(tx, userId, "IMPORTED", "import", `Imported ${created} new item(s) and ${batchesAdded} batch(es) from CSV`);
      return { created, batchesAdded };
    },
    { timeout: 60_000 },
  );
}
