import { emailConfigured } from "../config.js";
import { prisma } from "../db.js";
import { describeDaysLeft } from "../lib/status.js";
import { pushToUsers } from "./push.js";
import { sendMail } from "../lib/mailer.js";
import { getCtx, getSettings, loadItemViews } from "./pantry.js";
import { predictionsFor } from "./insights.js";

type NewNotification = {
  userId: string;
  type: "EXPIRING" | "EXPIRED" | "LOW_STOCK" | "RUNNING_OUT";
  title: string;
  message: string;
  itemId: string;
  dedupeKey: string;
};

/**
 * Generates in-app alerts from the current pantry state. Safe to call any time:
 * each alert has a dedupe key (e.g. one "expiring" alert per batch per expiry date),
 * and the database's unique index guarantees no duplicates even under concurrent calls.
 */
export async function syncNotifications(userId: string): Promise<number> {
  const settings = await getSettings(userId);
  const ctx = await getCtx(userId);
  const items = await loadItemViews(ctx);
  const out: NewNotification[] = [];

  if (settings.notifyExpiring) {
    // One alert per item per status, listing each affected batch. The key includes the batches and
    // their dates, so a new batch (or a changed date) produces a fresh alert, but repeats never do.
    for (const item of items) {
      for (const type of ["EXPIRED", "EXPIRING"] as const) {
        const batches = item.batches.filter((b) => b.quantity > 0 && b.effectiveExpiry && b.status === type);
        if (!batches.length) continue;
        const parts = batches.map(
          (b) => `${b.quantity} ${item.unit} ${describeDaysLeft(b.daysLeft).toLowerCase()}${b.expiryReason === "OPENED" ? " (since opened)" : ""}`,
        );
        out.push({
          userId,
          itemId: item.id,
          type,
          title: type === "EXPIRED" ? `${item.name} has expired` : `${item.name} expires soon`,
          message: type === "EXPIRED" ? `${parts.join("; ")}. Check it and record it as used or wasted.` : `${parts.join("; ")}.`,
          dedupeKey: `${type}:${item.id}:${batches.map((b) => `${b.id.slice(0, 8)}@${b.effectiveExpiry}`).join(",")}`,
        });
      }
    }
  }

  if (settings.notifyLowStock) {
    for (const item of items) {
      if (!item.lowStock) continue;
      // A new "episode" starts after each restock, so the user is alerted again next time it runs low
      const latestBatch = [...item.batches].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      out.push({
        userId,
        itemId: item.id,
        type: "LOW_STOCK",
        title: item.quantity <= 0 ? `${item.name} is out of stock` : `${item.name} is running low`,
        message: item.quantity <= 0 ? "Add it to your shopping list." : `Only ${item.quantity} ${item.unit} left (minimum ${item.minStock}).`,
        dedupeKey: `LOW_STOCK:${item.id}:${latestBatch?.id ?? "none"}`,
      });
    }
  }

  if (settings.notifyRunOut) {
    const predictions = await predictionsFor(ctx, items.filter((i) => !i.lowStock));
    for (const p of predictions.filter((x) => x.daysLeft <= 3)) {
      out.push({
        userId,
        itemId: p.itemId,
        type: "RUNNING_OUT",
        title: `${p.name} may run out soon`,
        message: `At your recent pace (~${p.dailyRate >= 10 ? Math.round(p.dailyRate) : Number(p.dailyRate.toFixed(2))} ${p.unit}/day) it may last about ${p.daysLeft} more day(s). Estimate only.`,
        dedupeKey: `RUNNING_OUT:${p.itemId}:${p.runOutDate}`,
      });
    }
  }

  if (!out.length) return 0;
  const { count } = await prisma.notification.createMany({ data: out, skipDuplicates: true });
  return count;
}

/** Removes photos that were uploaded but never saved on an item, and old password-reset links. */
export async function cleanupStaleData(now = new Date()) {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const images = await prisma.itemImage.deleteMany({ where: { item: null, createdAt: { lt: dayAgo } } });
  const tokens = await prisma.passwordResetToken.deleteMany({ where: { OR: [{ expiresAt: { lt: dayAgo } }, { usedAt: { lt: dayAgo } }] } });
  return { images: images.count, tokens: tokens.count };
}

/**
 * Daily job: refresh alerts for every user and, for users who enabled it AND when SMTP is configured,
 * email a digest of new alerts. Each notification's emailStatus records what really happened.
 */
export async function runDailyReminders(): Promise<{ users: number; emailed: number; pushed: number }> {
  // Household members work on the owner's pantry, so they get the owner's alerts instead of their own
  const users = await prisma.user.findMany({
    where: { membership: null },
    select: { id: true, email: true, name: true, settings: true, household: { select: { members: { select: { userId: true, user: { select: { email: true } } } } } } },
  });
  let emailed = 0;
  let pushed = 0;
  for (const u of users) {
    try {
      await syncNotifications(u.id);
      // Phone/browser push: one summary per day to every device of everyone sharing this pantry
      const toPush = await prisma.notification.findMany({ where: { userId: u.id, pushedAt: null, readAt: null, dismissedAt: null }, orderBy: { createdAt: "asc" }, take: 30 });
      if (toPush.length) {
        const body = toPush.slice(0, 3).map((n) => n.title).join(" · ") + (toPush.length > 3 ? ` and ${toPush.length - 3} more` : "");
        const r = await pushToUsers([u.id, ...(u.household?.members.map((m) => m.userId) ?? [])], {
          title: toPush.length === 1 ? "1 item needs attention" : `${toPush.length} items need attention`,
          body,
          url: "/notifications",
          tag: "daily-alerts",
        });
        if (r.sent) {
          await prisma.notification.updateMany({ where: { id: { in: toPush.map((n) => n.id) } }, data: { pushedAt: new Date() } });
          pushed++;
        }
      }
      if (!u.settings?.emailReminders || !emailConfigured()) continue;
      const pending = await prisma.notification.findMany({
        where: { userId: u.id, emailStatus: "NOT_REQUESTED", readAt: null, dismissedAt: null },
        orderBy: { createdAt: "asc" },
        take: 30,
      });
      if (!pending.length) continue;
      const body = `Hi ${u.household?.members.length ? "everyone" : u.name},\n\nHere is your Smart Pantry update:\n\n${pending.map((n) => `• ${n.title} — ${n.message}`).join("\n")}\n\nOpen Smart Pantry to take action.`;
      const to = [u.email, ...(u.household?.members.map((m) => m.user.email) ?? [])].join(", ");
      const status = await sendMail(to, `Smart Pantry: ${pending.length} item(s) need attention`, body);
      if (status === "NOT_CONFIGURED") continue;
      await prisma.notification.updateMany({ where: { id: { in: pending.map((p) => p.id) } }, data: { emailStatus: status } });
      if (status === "SENT") emailed++;
    } catch (err) {
      console.error(`[reminders] user ${u.id} failed:`, (err as Error).message);
    }
  }
  return { users: users.length, emailed, pushed };
}
