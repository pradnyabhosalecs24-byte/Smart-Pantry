import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { handler, parse } from "../lib/http.js";
import { uid } from "../middleware/auth.js";
import { computeGamification } from "../services/gamification.js";
import { getCtx } from "../services/pantry.js";

export const gamificationRouter = Router();

gamificationRouter.get(
  "/",
  handler(async (req, res) => {
    res.json(await computeGamification(await getCtx(uid(req))));
  }),
);

/** Marks badges as celebrated, so the "badge unlocked" moment only shows once. */
gamificationRouter.post(
  "/seen",
  handler(async (req, res) => {
    const { keys } = parse(z.object({ keys: z.array(z.string().max(40)).max(50) }), req.body);
    const { count } = await prisma.achievement.updateMany({ where: { userId: uid(req), key: { in: keys }, seenAt: null }, data: { seenAt: new Date() } });
    res.json({ updated: count });
  }),
);
