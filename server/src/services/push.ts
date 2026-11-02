import webpush from "web-push";
import { prisma } from "../db.js";

// Phone / browser push notifications (Web Push). Works on Android Chrome, desktop browsers,
// and iPhone/iPad (iOS 16.4+) once Smart Pantry is added to the Home Screen.

let keys: { publicKey: string; privateKey: string } | null = null;

/**
 * VAPID keys identify this server to the push services. Taken from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
 * when set; otherwise generated once and stored in the database, so subscriptions survive restarts.
 */
export async function vapidKeys() {
  if (keys) return keys;
  const envPub = process.env.VAPID_PUBLIC_KEY;
  const envPriv = process.env.VAPID_PRIVATE_KEY;
  if (envPub && envPriv) keys = { publicKey: envPub, privateKey: envPriv };
  else {
    const stored = await prisma.appConfig.findUnique({ where: { key: "vapid" } });
    if (stored) keys = JSON.parse(stored.value);
    else {
      const fresh = webpush.generateVAPIDKeys();
      // If two servers race, the first saved pair wins and both use it
      await prisma.appConfig.upsert({ where: { key: "vapid" }, create: { key: "vapid", value: JSON.stringify(fresh) }, update: {} });
      keys = JSON.parse((await prisma.appConfig.findUniqueOrThrow({ where: { key: "vapid" } })).value);
    }
  }
  return keys!;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/** Sends to every device of these users. Dead subscriptions (uninstalled app, revoked permission) are removed. */
export async function pushToUsers(userIds: string[], payload: PushPayload): Promise<{ sent: number; failed: number }> {
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  if (!subs.length) return { sent: 0, failed: 0 };
  const k = await vapidKeys();
  const options = { vapidDetails: { subject: process.env.VAPID_SUBJECT || "mailto:no-reply@smartpantry.app", ...k }, TTL: 24 * 60 * 60 };
  let sent = 0;
  let failed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), options);
        sent++;
      } catch (err) {
        failed++;
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await prisma.pushSubscription.deleteMany({ where: { id: s.id } });
        else console.error("[push] send failed:", status ?? (err as Error).message);
      }
    }),
  );
  return { sent, failed };
}
