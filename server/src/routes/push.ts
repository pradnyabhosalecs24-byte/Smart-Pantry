import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { badRequest, handler, parse } from "../lib/http.js";
import { actorId } from "../middleware/auth.js";
import { pushToUsers, vapidKeys } from "../services/push.js";

// Push subscriptions belong to the person and their device, not to the shared pantry
export const pushRouter = Router();

pushRouter.get(
  "/public-key",
  handler(async (_req, res) => res.json({ publicKey: (await vapidKeys()).publicKey })),
);

const subscription = z.object({
  endpoint: z.string().url("Invalid push endpoint").max(2000).refine((u) => u.startsWith("https://"), "Push endpoint must use https"),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

pushRouter.post(
  "/subscribe",
  handler(async (req, res) => {
    const me = actorId(req);
    const s = parse(subscription, req.body);
    // The same browser re-subscribing (or a different person signing in on it) takes the subscription over
    await prisma.pushSubscription.upsert({
      where: { endpoint: s.endpoint },
      create: { userId: me, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth },
      update: { userId: me, p256dh: s.keys.p256dh, auth: s.keys.auth },
    });
    const devices = await prisma.pushSubscription.count({ where: { userId: me } });
    res.json({ ok: true, devices });
  }),
);

pushRouter.post(
  "/unsubscribe",
  handler(async (req, res) => {
    const me = actorId(req);
    const { endpoint } = parse(z.object({ endpoint: z.string().max(2000) }), req.body);
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: me } });
    res.json({ ok: true });
  }),
);

pushRouter.get(
  "/status",
  handler(async (req, res) => res.json({ devices: await prisma.pushSubscription.count({ where: { userId: actorId(req) } }) })),
);

pushRouter.post(
  "/test",
  handler(async (req, res) => {
    const me = actorId(req);
    const result = await pushToUsers([me], { title: "Smart Pantry", body: "Phone notifications are working. We'll tell you when food is about to expire.", url: "/notifications", tag: "test" });
    if (!result.sent && !result.failed) throw badRequest("Turn on notifications on this device first.");
    res.json(result);
  }),
);
