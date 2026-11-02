import { num, prisma } from "../db.js";
import { addDays, todayInTz } from "../lib/dates.js";
import { predictRunOut, type RunOutPrediction } from "../lib/predictions.js";
import type { Ctx, ItemView } from "./pantry.js";

export interface ItemPrediction extends RunOutPrediction {
  itemId: string;
  name: string;
  unit: string;
  quantity: number;
}

/** Run-out forecast for every in-stock item that has enough recent consumption history. */
export async function predictionsFor(ctx: Ctx, items: ItemView[], windowDays = 30): Promise<ItemPrediction[]> {
  const since = new Date(Date.now() - (windowDays + 2) * 86_400_000);
  const events = await prisma.usageEvent.findMany({
    where: { userId: ctx.userId, type: "CONSUMED", occurredAt: { gte: since }, itemId: { in: items.map((i) => i.id) } },
    select: { itemId: true, quantity: true, occurredAt: true },
  });
  const byItem = new Map<string, { date: string; quantity: number }[]>();
  for (const e of events) {
    const list = byItem.get(e.itemId!) ?? [];
    list.push({ date: todayInTz(ctx.timezone, e.occurredAt), quantity: num(e.quantity) });
    byItem.set(e.itemId!, list);
  }
  const out: ItemPrediction[] = [];
  for (const item of items) {
    if (item.quantity <= 0) continue;
    const p = predictRunOut(item.quantity, byItem.get(item.id) ?? [], ctx.today, windowDays);
    if (p) out.push({ ...p, itemId: item.id, name: item.name, unit: item.unit, quantity: item.quantity });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

export function withinDays(today: string, date: string, days: number) {
  return date <= addDays(today, days);
}
