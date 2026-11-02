import { prisma, type Tx } from "../db.js";
import { logActivity } from "../lib/activity.js";
import { planFefo } from "../lib/fefo.js";
import { badRequest, conflict, HttpError, notFound } from "../lib/http.js";
import { convert, fromMilli, isUnit, roundQty, toMilli } from "../lib/units.js";
import { itemInclude, toItemView, type Ctx, type ItemView } from "./pantry.js";

export interface DeductInput {
  type: "CONSUMED" | "WASTED";
  quantity: number;
  unit?: string | null;
  reason?: "EXPIRED" | "SPOILED" | "LEFTOVER" | "OVERBOUGHT" | "DAMAGED" | "OTHER" | null;
  note?: string | null;
  batchId?: string | null;
  /** The user confirmed they really ate food that is past its date. */
  allowExpired?: boolean;
}

/** Locks the item's batches for this transaction so two simultaneous updates can't oversell stock. */
export async function lockItemBatches(tx: Tx, itemId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Batch" WHERE "itemId" = ${itemId} FOR UPDATE`;
}

/**
 * Records consumption or waste. Stock is taken First-Expiry-First-Out.
 * Expired stock is never silently "eaten": consuming it needs explicit confirmation.
 */
export async function deductStock(ctx: Ctx, itemId: string, input: DeductInput) {
  return prisma.$transaction(async (tx) => {
    const exists = await tx.item.findFirst({ where: { id: itemId, userId: ctx.userId, deletedAt: null }, select: { id: true } });
    if (!exists) throw notFound("Item");
    await lockItemBatches(tx, itemId);
    const row = await tx.item.findUniqueOrThrow({ where: { id: itemId }, include: itemInclude });
    const item = toItemView(row, ctx);

    // Convert e.g. 250 g when the item is tracked in kg
    let amount = input.quantity;
    if (input.unit && input.unit !== item.unit) {
      if (!isUnit(input.unit) || !isUnit(item.unit)) throw badRequest("Unknown unit");
      const converted = convert(input.quantity, input.unit, item.unit);
      if (converted == null) {
        throw badRequest(`Can't convert ${input.unit} to ${item.unit}`, { fields: { unit: `Use a unit compatible with ${item.unit}` } });
      }
      amount = converted;
    }
    amount = roundQty(amount);
    if (amount <= 0) throw badRequest("Quantity is too small", { fields: { quantity: "Quantity is too small for this unit" } });

    let candidates = item.batches.filter((b) => toMilli(b.quantity) > 0);
    if (input.batchId) {
      candidates = candidates.filter((b) => b.id === input.batchId);
      if (!candidates.length) throw notFound("Batch");
    }
    if (!candidates.length) throw conflict(`${item.name} is out of stock`, "OUT_OF_STOCK");

    if (input.type === "CONSUMED" && !input.allowExpired) {
      const usable = candidates.filter((b) => b.status !== "EXPIRED");
      const expiredQty = fromMilli(candidates.filter((b) => b.status === "EXPIRED").reduce((s, b) => s + toMilli(b.quantity), 0));
      const usableQty = fromMilli(usable.reduce((s, b) => s + toMilli(b.quantity), 0));
      if (toMilli(amount) > toMilli(usableQty) && expiredQty > 0) {
        throw new HttpError(
          409,
          usableQty > 0
            ? `Only ${usableQty} ${item.unit} is within date; ${expiredQty} ${item.unit} is past its expiry date.`
            : `All remaining ${item.name} is past its expiry date. Record it as wasted, or confirm you consumed it.`,
          "EXPIRED_STOCK",
          { usableQty, expiredQty },
        );
      }
      candidates = usable.length ? usable : candidates;
    }

    const available = fromMilli(candidates.reduce((s, b) => s + toMilli(b.quantity), 0));
    if (toMilli(amount) > toMilli(available)) {
      throw badRequest(`Only ${available} ${item.unit} available`, { fields: { quantity: `Cannot exceed ${available} ${item.unit}` } });
    }

    const plan = planFefo(
      candidates.map((b) => ({ id: b.id, quantity: b.quantity, expiry: b.effectiveExpiry, createdAt: b.createdAt })),
      amount,
    );

    let cost = 0;
    let allCosted = true;
    for (const a of plan.allocations) {
      await tx.batch.update({ where: { id: a.batchId }, data: { quantity: a.remaining } });
      const b = item.batches.find((x) => x.id === a.batchId)!;
      if (b.cost != null && b.initialQuantity > 0) cost += (b.cost / b.initialQuantity) * a.take;
      else allCosted = false;
    }

    const event = await tx.usageEvent.create({
      data: {
        userId: ctx.userId,
        itemId,
        itemName: item.name,
        categoryName: item.category.name,
        type: input.type,
        quantity: amount,
        unit: item.unit,
        reason: input.type === "WASTED" ? (input.reason ?? "OTHER") : null,
        // Only an estimate, and only when every batch used had a price
        estimatedCost: allCosted ? Math.round(cost * 100) / 100 : null,
        // Eaten while "expiring soon": counts as food rescued from the bin
        rescued: input.type === "CONSUMED" && plan.allocations.some((a) => item.batches.find((b) => b.id === a.batchId)?.status === "EXPIRING"),
        note: input.note ?? null,
        isDemo: item.isDemo,
      },
    });

    await logActivity(
      tx,
      ctx.userId,
      input.type === "CONSUMED" ? "CONSUMED" : "WASTED",
      "item",
      input.type === "CONSUMED"
        ? `Used ${amount} ${item.unit} of ${item.name}`
        : `Discarded ${amount} ${item.unit} of ${item.name} (${(input.reason ?? "OTHER").toLowerCase()})`,
      itemId,
    );

    const updated = toItemView(await tx.item.findUniqueOrThrow({ where: { id: itemId }, include: itemInclude }), ctx);
    return { event, item: updated, allocations: plan.allocations };
  });
}

export function itemSummary(i: ItemView) {
  return `${i.name} (${i.quantity} ${i.unit})`;
}
