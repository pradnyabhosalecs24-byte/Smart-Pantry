import { num, prisma } from "../db.js";
import { addDays, dateStrToDate, diffDays, todayInTz } from "../lib/dates.js";
import { toReportingUnit } from "../lib/units.js";
import type { Ctx, ItemView } from "./pantry.js";

const round2 = (n: number) => Math.round(n * 100) / 100;

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** Monday of the week containing the date. */
function weekStart(date: string): string {
  const dow = dateStrToDate(date).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

export function statusBreakdown(items: ItemView[]) {
  const labels: Record<string, string> = {
    SAFE: "Safe",
    EXPIRING: "Expiring soon",
    EXPIRED: "Expired",
    NO_DATE: "Date missing",
    NO_EXPIRY: "No expiry",
    OUT_OF_STOCK: "Out of stock",
  };
  return Object.entries(labels).map(([status, label]) => ({ status, label, count: items.filter((i) => i.status === status).length }));
}

export function categoryBreakdown(items: ItemView[]) {
  const map = new Map<string, { category: string; items: number; inStock: number; lowStock: number; value: number; valueKnown: boolean }>();
  for (const i of items) {
    const row = map.get(i.category.name) ?? { category: i.category.name, items: 0, inStock: 0, lowStock: 0, value: 0, valueKnown: false };
    row.items++;
    if (i.quantity > 0) row.inStock++;
    if (i.lowStock) row.lowStock++;
    if (i.stockValue != null) {
      row.value = round2(row.value + i.stockValue);
      row.valueKnown = true;
    }
    map.set(i.category.name, row);
  }
  return [...map.values()].sort((a, b) => b.items - a.items);
}

export async function computeAnalytics(ctx: Ctx, items: ItemView[], from: string, to: string) {
  // occurredAt is a timestamp; widen by a day each side, then filter precisely by the user's local date
  const events = await prisma.usageEvent.findMany({
    where: { userId: ctx.userId, occurredAt: { gte: dateStrToDate(addDays(from, -1)), lt: dateStrToDate(addDays(to, 2)) } },
    orderBy: { occurredAt: "asc" },
  });
  const usage = events
    .map((e) => ({ ...e, date: todayInTz(ctx.timezone, e.occurredAt), qty: num(e.quantity), cost: e.estimatedCost == null ? null : num(e.estimatedCost) }))
    .filter((e) => e.date >= from && e.date <= to);

  const batches = await prisma.batch.findMany({
    where: { item: { userId: ctx.userId } },
    select: { purchaseDate: true, createdAt: true, cost: true },
  });
  const purchases = batches
    .map((b) => ({ date: b.purchaseDate ? b.purchaseDate.toISOString().slice(0, 10) : todayInTz(ctx.timezone, b.createdAt), cost: b.cost == null ? null : num(b.cost) }))
    .filter((p) => p.date >= from && p.date <= to);

  const consumed = usage.filter((u) => u.type === "CONSUMED");
  const wasted = usage.filter((u) => u.type === "WASTED");

  // Quantities have different units, so totals are grouped by unit family (kg / l / pcs ...)
  const wastedByUnit = new Map<string, number>();
  for (const w of wasted) {
    const r = toReportingUnit(w.qty, w.unit);
    wastedByUnit.set(r.unit, round2((wastedByUnit.get(r.unit) ?? 0) + r.quantity));
  }

  const months = monthsBetween(from, to);
  const monthly = months.map((month) => {
    const c = consumed.filter((u) => u.date.startsWith(month));
    const w = wasted.filter((u) => u.date.startsWith(month));
    const p = purchases.filter((x) => x.date.startsWith(month));
    return {
      month,
      consumed: c.length,
      wasted: w.length,
      wastedCost: round2(w.reduce((s, x) => s + (x.cost ?? 0), 0)),
      purchaseCost: round2(p.reduce((s, x) => s + (x.cost ?? 0), 0)),
    };
  });

  const weeks: string[] = [];
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) weeks.push(w);
  const trend = weeks.map((week) => {
    const end = addDays(week, 6);
    const inWeek = (d: string) => d >= week && d <= end;
    return {
      week,
      added: purchases.filter((p) => inWeek(p.date)).length,
      consumed: consumed.filter((u) => inWeek(u.date)).length,
      wasted: wasted.filter((u) => inWeek(u.date)).length,
    };
  });

  const groupTop = (list: typeof usage) => {
    const map = new Map<string, { name: string; count: number; quantity: number; unit: string; estimatedCost: number; costKnown: boolean }>();
    for (const u of list) {
      const r = toReportingUnit(u.qty, u.unit);
      const key = `${u.itemName.toLowerCase()}|${r.unit}`;
      const row = map.get(key) ?? { name: u.itemName, count: 0, quantity: 0, unit: r.unit, estimatedCost: 0, costKnown: false };
      row.count++;
      row.quantity = round2(row.quantity + r.quantity);
      if (u.cost != null) {
        row.estimatedCost = round2(row.estimatedCost + u.cost);
        row.costKnown = true;
      }
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.count - a.count || b.estimatedCost - a.estimatedCost).slice(0, 8);
  };

  const reasons = new Map<string, number>();
  for (const w of wasted) reasons.set(w.reason ?? "OTHER", (reasons.get(w.reason ?? "OTHER") ?? 0) + 1);

  const wastedCostKnown = wasted.filter((w) => w.cost != null);
  return {
    range: { from, to, days: diffDays(from, to) + 1 },
    currency: ctx.currency,
    summary: {
      consumedEvents: consumed.length,
      wastedEvents: wasted.length,
      wasteRate: consumed.length + wasted.length ? round2((wasted.length / (consumed.length + wasted.length)) * 100) : 0,
      wastedEstimatedCost: round2(wastedCostKnown.reduce((s, w) => s + w.cost!, 0)),
      wastedWithoutPrice: wasted.length - wastedCostKnown.length,
      wastedByUnit: [...wastedByUnit.entries()].map(([unit, quantity]) => ({ unit, quantity })),
      purchaseCost: round2(purchases.reduce((s, p) => s + (p.cost ?? 0), 0)),
      purchasesWithoutPrice: purchases.filter((p) => p.cost == null).length,
      lowStockItems: items.filter((i) => i.lowStock).length,
      stockValue: round2(items.reduce((s, i) => s + (i.stockValue ?? 0), 0)),
    },
    monthly,
    trend,
    topWasted: groupTop(wasted),
    topConsumed: groupTop(consumed),
    wasteReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    statusBreakdown: statusBreakdown(items),
    categoryBreakdown: categoryBreakdown(items),
  };
}

export type Analytics = Awaited<ReturnType<typeof computeAnalytics>>;
