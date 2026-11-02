import { Router } from "express";
import { z } from "zod";
import { emailConfigured } from "../config.js";
import { prisma } from "../db.js";
import { logActivity } from "../lib/activity.js";
import { isValidTimezone } from "../lib/dates.js";
import { handler, notFound, pageParams, param, parse } from "../lib/http.js";
import { uid } from "../middleware/auth.js";
import { syncNotifications } from "../services/notifications.js";
import { getSettings } from "../services/pantry.js";

// Notifications, activity log and settings.
export const accountRouter = Router();

accountRouter.get(
  "/notifications",
  handler(async (req, res) => {
    const userId = uid(req);
    await syncNotifications(userId); // generate any alerts that became due since the last visit
    const unreadOnly = req.query.unread === "true";
    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId, dismissedAt: null, ...(unreadOnly ? { readAt: null } : {}) }, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.notification.count({ where: { userId, readAt: null, dismissedAt: null } }),
    ]);
    res.json({ notifications, unread, emailConfigured: emailConfigured() });
  }),
);

accountRouter.get(
  "/notifications/unread-count",
  handler(async (req, res) => {
    const userId = uid(req);
    await syncNotifications(userId);
    res.json({ unread: await prisma.notification.count({ where: { userId, readAt: null, dismissedAt: null } }) });
  }),
);

accountRouter.post(
  "/notifications/read-all",
  handler(async (req, res) => {
    const { count } = await prisma.notification.updateMany({ where: { userId: uid(req), readAt: null, dismissedAt: null }, data: { readAt: new Date() } });
    res.json({ updated: count });
  }),
);

accountRouter.post(
  "/notifications/:id/read",
  handler(async (req, res) => {
    const body = parse(z.object({ read: z.boolean().default(true) }), req.body ?? {});
    const { count } = await prisma.notification.updateMany({
      where: { id: param(req, "id"), userId: uid(req) },
      data: { readAt: body.read ? new Date() : null },
    });
    if (!count) throw notFound("Notification");
    res.json({ ok: true });
  }),
);

accountRouter.delete(
  "/notifications/:id",
  handler(async (req, res) => {
    const { count } = await prisma.notification.updateMany({
      where: { id: param(req, "id"), userId: uid(req), dismissedAt: null },
      data: { dismissedAt: new Date(), readAt: new Date() },
    });
    if (!count) throw notFound("Notification");
    res.json({ ok: true });
  }),
);

accountRouter.get(
  "/activity",
  handler(async (req, res) => {
    const userId = uid(req);
    const { page, pageSize, skip } = pageParams(req.query);
    const type = typeof req.query.entityType === "string" && req.query.entityType ? req.query.entityType : undefined;
    const where = { userId, ...(type ? { entityType: type } : {}) };
    const [activities, total] = await Promise.all([
      prisma.activity.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize }),
      prisma.activity.count({ where }),
    ]);
    res.json({ activities, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  }),
);

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY"] as const;

accountRouter.get(
  "/settings",
  handler(async (req, res) => {
    const settings = await getSettings(uid(req));
    res.json({ settings, emailConfigured: emailConfigured(), currencies: CURRENCIES });
  }),
);

accountRouter.put(
  "/settings",
  handler(async (req, res) => {
    const userId = uid(req);
    const body = parse(
      z.object({
        warningDays: z.coerce.number().int("Whole days only").min(0, "Can't be negative").max(60, "Use 60 days or fewer"),
        timezone: z.string().refine(isValidTimezone, "Choose a valid time zone"),
        currency: z.enum(CURRENCIES),
        notifyExpiring: z.boolean(),
        notifyLowStock: z.boolean(),
        notifyRunOut: z.boolean(),
        emailReminders: z.boolean(),
      }),
      req.body,
    );
    await getSettings(userId);
    const settings = await prisma.settings.update({ where: { userId }, data: body });
    await logActivity(prisma, userId, "SETTINGS_UPDATED", "settings", `Updated settings (warning period ${body.warningDays} days)`);
    res.json({ settings, emailConfigured: emailConfigured() });
  }),
);
