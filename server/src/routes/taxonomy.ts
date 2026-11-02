import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { logActivity } from "../lib/activity.js";
import { badRequest, conflict, handler, notFound, param, parse } from "../lib/http.js";
import { uid } from "../middleware/auth.js";

// Categories and storage locations behave the same way, so one router factory serves both.
// Deleting one that is still used requires choosing where its items move — records never become orphaned.

type Kind = "category" | "location";

const nameField = z.string({ error: "Name is required" }).trim().min(1, "Name is required").max(50, "Name must be at most 50 characters");

export function taxonomyRouter(kind: Kind) {
  const r = Router();
  const label = kind === "category" ? "Category" : "Storage location";
  // Prisma delegates share the same shape for these operations
  const model = (kind === "category" ? prisma.category : prisma.location) as unknown as typeof prisma.location;
  const fk = kind === "category" ? "categoryId" : "locationId";

  const bodySchema =
    kind === "category"
      ? z.object({
          name: nameField,
          openedShelfLifeDays: z
            .union([z.literal(""), z.null(), z.coerce.number().int("Whole days only").min(0).max(3650)])
            .optional()
            .transform((x) => (x === "" || x == null ? null : Number(x))),
        })
      : z.object({ name: nameField });

  r.get(
    "/",
    handler(async (req, res) => {
      const userId = uid(req);
      const rows = await (kind === "category"
        ? prisma.category.findMany({ where: { userId }, orderBy: { name: "asc" }, include: { _count: { select: { items: { where: { deletedAt: null } } } } } })
        : prisma.location.findMany({ where: { userId }, orderBy: { name: "asc" }, include: { _count: { select: { items: { where: { deletedAt: null } } } } } }));
      res.json({ [kind === "category" ? "categories" : "locations"]: rows.map(({ _count, ...row }) => ({ ...row, itemCount: _count.items })) });
    }),
  );

  r.post(
    "/",
    handler(async (req, res) => {
      const userId = uid(req);
      const body = parse(bodySchema, req.body);
      const dup = await model.findFirst({ where: { userId, name: { equals: body.name, mode: "insensitive" } } });
      if (dup) throw conflict(`${label} “${dup.name}” already exists`, "DUPLICATE", { fields: { name: "Already exists" } });
      const row = await (model as unknown as { create: (a: unknown) => Promise<{ id: string }> }).create({ data: { ...body, userId } });
      await logActivity(prisma, userId, kind === "category" ? "CATEGORY_CHANGED" : "LOCATION_CHANGED", kind, `Created ${label.toLowerCase()} “${body.name}”`, row.id);
      res.status(201).json({ [kind]: row });
    }),
  );

  r.patch(
    "/:id",
    handler(async (req, res) => {
      const userId = uid(req);
      const id = param(req, "id");
      const body = parse(bodySchema, req.body);
      const existing = await model.findFirst({ where: { id, userId } });
      if (!existing) throw notFound(label);
      const dup = await model.findFirst({ where: { userId, id: { not: id }, name: { equals: body.name, mode: "insensitive" } } });
      if (dup) throw conflict(`${label} “${dup.name}” already exists`, "DUPLICATE", { fields: { name: "Already exists" } });
      const row = await (model as unknown as { update: (a: unknown) => Promise<unknown> }).update({ where: { id }, data: body });
      await logActivity(prisma, userId, kind === "category" ? "CATEGORY_CHANGED" : "LOCATION_CHANGED", kind, `Renamed/updated ${label.toLowerCase()} “${existing.name}”`, id);
      res.json({ [kind]: row });
    }),
  );

  r.delete(
    "/:id",
    handler(async (req, res) => {
      const userId = uid(req);
      const id = param(req, "id");
      const reassignTo = typeof req.query.reassignTo === "string" && req.query.reassignTo ? req.query.reassignTo : null;
      const existing = await model.findFirst({ where: { id, userId } });
      if (!existing) throw notFound(label);

      // Includes items in the trash: they still reference this record
      const inUse = await prisma.item.count({ where: { userId, [fk]: id } });
      if (inUse > 0 && !reassignTo) {
        throw conflict(`${inUse} item(s) use “${existing.name}”. Choose where to move them before deleting.`, "IN_USE", { itemCount: inUse });
      }
      if (reassignTo) {
        if (reassignTo === id) throw badRequest(`Choose a different ${label.toLowerCase()} to move items to`);
        const target = await model.findFirst({ where: { id: reassignTo, userId } });
        if (!target) throw badRequest(`The ${label.toLowerCase()} to move items to was not found`);
      }

      await prisma.$transaction(async (tx) => {
        if (reassignTo && inUse > 0) await tx.item.updateMany({ where: { userId, [fk]: id }, data: { [fk]: reassignTo } });
        if (kind === "category") await tx.category.delete({ where: { id } });
        else await tx.location.delete({ where: { id } });
        await logActivity(tx, userId, kind === "category" ? "CATEGORY_CHANGED" : "LOCATION_CHANGED", kind, `Deleted ${label.toLowerCase()} “${existing.name}”${inUse ? ` and moved ${inUse} item(s)` : ""}`, id);
      });
      res.json({ ok: true, moved: inUse });
    }),
  );

  return r;
}
