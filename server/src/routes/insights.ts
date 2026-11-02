import { Router } from "express";
import { z } from "zod";
import { num, prisma } from "../db.js";
import { addDays, isValidDateStr } from "../lib/dates.js";
import { badRequest, handler, pageParams, parse } from "../lib/http.js";
import { uid } from "../middleware/auth.js";
import { categoryBreakdown, computeAnalytics, statusBreakdown } from "../services/analytics.js";
import { predictionsFor } from "../services/insights.js";
import { byUrgency, getCtx, loadItemViews, type Ctx, type ItemView } from "../services/pantry.js";

export const insightsRouter = Router();

const compact = (i: ItemView) => ({
  id: i.id,
  name: i.name,
  unit: i.unit,
  quantity: i.quantity,
  minStock: i.minStock,
  status: i.status,
  daysLeft: i.daysLeft,
  nextExpiry: i.nextExpiry,
  nextStart: i.nextStart,
  lowStock: i.lowStock,
  category: i.category.name,
  location: i.location.name,
  imageId: i.imageId,
  createdAt: i.createdAt,
});

insightsRouter.get(
  "/dashboard",
  handler(async (req, res) => {
    const ctx = await getCtx(uid(req));
    const items = await loadItemViews(ctx);
    const count = (s: string) => items.filter((i) => i.status === s).length;
    const since30 = new Date(Date.now() - 30 * 86_400_000);

    const [recentActivity, unread, waste30, predictions] = await Promise.all([
      prisma.activity.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 8 }),
      prisma.notification.count({ where: { userId: ctx.userId, readAt: null } }),
      prisma.usageEvent.findMany({ where: { userId: ctx.userId, type: "WASTED", occurredAt: { gte: since30 } }, select: { estimatedCost: true } }),
      predictionsFor(ctx, items),
    ]);

    res.json({
      today: ctx.today,
      warningDays: ctx.warningDays,
      currency: ctx.currency,
      counts: {
        total: items.length,
        safe: count("SAFE"),
        expiring: count("EXPIRING"),
        expired: count("EXPIRED"),
        noDate: count("NO_DATE"),
        noExpiry: count("NO_EXPIRY"),
        outOfStock: count("OUT_OF_STOCK"),
        lowStock: items.filter((i) => i.lowStock).length,
      },
      statusBreakdown: statusBreakdown(items),
      categoryBreakdown: categoryBreakdown(items),
      expiringSoon: items.filter((i) => i.status === "EXPIRED" || i.status === "EXPIRING").sort(byUrgency).slice(0, 6).map(compact),
      lowStock: items.filter((i) => i.lowStock).sort((a, b) => a.quantity - b.quantity).slice(0, 6).map(compact),
      recentItems: [...items].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5).map(compact),
      recentActivity,
      predictions: predictions.filter((p) => p.daysLeft <= 14).slice(0, 5),
      waste30: {
        events: waste30.length,
        estimatedCost: Math.round(waste30.reduce((s, w) => s + (w.estimatedCost == null ? 0 : num(w.estimatedCost)), 0) * 100) / 100,
        withoutPrice: waste30.filter((w) => w.estimatedCost == null).length,
      },
      stockValue: Math.round(items.reduce((s, i) => s + (i.stockValue ?? 0), 0) * 100) / 100,
      unreadNotifications: unread,
      hasDemoData: items.some((i) => i.isDemo),
    });
  }),
);

/** Parses ?from&to (YYYY-MM-DD). Defaults to the last 90 days; max range 2 years. */
export function parseRange(ctx: Ctx, q: Record<string, unknown>) {
  const to = typeof q.to === "string" && q.to ? q.to : ctx.today;
  const from = typeof q.from === "string" && q.from ? q.from : addDays(to, -89);
  if (!isValidDateStr(from) || !isValidDateStr(to)) throw badRequest("Dates must be valid (YYYY-MM-DD)");
  if (from > to) throw badRequest("The start date must be before the end date");
  if (from < addDays(to, -731)) throw badRequest("Please choose a range of 2 years or less");
  return { from, to };
}

insightsRouter.get(
  "/analytics",
  handler(async (req, res) => {
    const ctx = await getCtx(uid(req));
    const { from, to } = parseRange(ctx, req.query);
    const items = await loadItemViews(ctx);
    res.json(await computeAnalytics(ctx, items, from, to));
  }),
);

insightsRouter.get(
  "/predictions",
  handler(async (req, res) => {
    const ctx = await getCtx(uid(req));
    const items = await loadItemViews(ctx);
    res.json({
      predictions: await predictionsFor(ctx, items),
      method: "Average daily consumption over the last 30 days. Needs at least 2 recorded uses. Estimates only.",
    });
  }),
);

const usageQuery = z.object({
  type: z.enum(["CONSUMED", "WASTED"]).optional(),
  search: z.string().trim().max(100).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

insightsRouter.get(
  "/usage",
  handler(async (req, res) => {
    const ctx = await getCtx(uid(req));
    const q = parse(usageQuery, req.query);
    const { page, pageSize, skip } = pageParams(req.query);
    const range = q.from || q.to ? parseRange(ctx, q) : null;
    const where = {
      userId: ctx.userId,
      ...(q.type ? { type: q.type } : {}),
      ...(q.search ? { itemName: { contains: q.search, mode: "insensitive" as const } } : {}),
      ...(range ? { occurredAt: { gte: new Date(`${range.from}T00:00:00Z`), lt: new Date(`${addDays(range.to, 1)}T00:00:00Z`) } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.usageEvent.findMany({ where, orderBy: { occurredAt: "desc" }, skip, take: pageSize }),
      prisma.usageEvent.count({ where }),
    ]);
    res.json({
      events: rows.map((r) => ({ ...r, quantity: num(r.quantity), estimatedCost: r.estimatedCost == null ? null : num(r.estimatedCost) })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  }),
);
