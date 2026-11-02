import { randomInt } from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { lockKey, prisma } from "../db.js";
import { logActivity } from "../lib/activity.js";
import { conflict, handler, HttpError, notFound, param, parse } from "../lib/http.js";
import { actorId } from "../middleware/auth.js";

// Family sharing. Everything here acts as the signed-in person (actorId), never as the shared pantry.
export const householdRouter = Router();

// No 0/O/1/I/L, so codes are easy to read out loud or type from a phone
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 8 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
const normaliseCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

const forbidden = (msg: string) => new HttpError(403, msg, "FORBIDDEN");
const name = z.string({ error: "Name is required" }).trim().min(1, "Name is required").max(60, "Use 60 characters or fewer");
const role = z.enum(["EDITOR", "VIEWER"], { error: "Choose Editor or Viewer" });

// Stops anyone guessing invite codes
const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { message: "Too many attempts. Please wait a few minutes and try again.", code: "RATE_LIMITED" } },
});

async function view(userId: string) {
  const [owned, membership] = await Promise.all([
    prisma.household.findUnique({ where: { ownerId: userId }, include: { owner: true, members: { include: { user: true }, orderBy: { joinedAt: "asc" } } } }),
    prisma.householdMember.findUnique({
      where: { userId },
      include: { household: { include: { owner: true, members: { include: { user: true }, orderBy: { joinedAt: "asc" } } } } },
    }),
  ]);
  const h = membership?.household ?? owned;
  if (!h) return { household: null, role: "OWNER" as const };
  const myRole = membership ? membership.role : "OWNER";
  return {
    role: myRole,
    household: {
      id: h.id,
      name: h.name,
      createdAt: h.createdAt,
      // Only the owner sees and shares the invite code
      inviteCode: myRole === "OWNER" ? h.inviteCode : null,
      owner: { userId: h.owner.id, name: h.owner.name, email: h.owner.email },
      members: h.members.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, role: m.role, joinedAt: m.joinedAt })),
    },
  };
}

householdRouter.get(
  "/",
  handler(async (req, res) => res.json(await view(actorId(req)))),
);

householdRouter.post(
  "/",
  handler(async (req, res) => {
    const me = actorId(req);
    const body = parse(z.object({ name }), req.body);
    await prisma.$transaction(async (tx) => {
      await lockKey(tx, `household:${me}`);
      if (await tx.householdMember.findUnique({ where: { userId: me } })) throw conflict("Leave your current household before creating your own.", "IN_HOUSEHOLD");
      if (await tx.household.findUnique({ where: { ownerId: me } })) throw conflict("You already have a household.", "HAS_HOUSEHOLD");
      await tx.household.create({ data: { name: body.name, ownerId: me, inviteCode: newCode() } });
      await logActivity(tx, me, "HOUSEHOLD_CHANGED", "household", `Created household "${body.name}"`);
    });
    res.status(201).json(await view(me));
  }),
);

async function ownedOrThrow(me: string) {
  const h = await prisma.household.findUnique({ where: { ownerId: me } });
  if (!h) {
    if (await prisma.householdMember.findUnique({ where: { userId: me } })) throw forbidden("Only the household owner can do this.");
    throw notFound("Household");
  }
  return h;
}

householdRouter.patch(
  "/",
  handler(async (req, res) => {
    const me = actorId(req);
    const body = parse(z.object({ name }), req.body);
    const h = await ownedOrThrow(me);
    await prisma.household.update({ where: { id: h.id }, data: { name: body.name } });
    res.json(await view(me));
  }),
);

householdRouter.post(
  "/invite-code",
  handler(async (req, res) => {
    const me = actorId(req);
    const h = await ownedOrThrow(me);
    // The old code stops working immediately; people who already joined stay in
    await prisma.household.update({ where: { id: h.id }, data: { inviteCode: newCode() } });
    res.json(await view(me));
  }),
);

householdRouter.post(
  "/join",
  joinLimiter,
  handler(async (req, res) => {
    const me = actorId(req);
    const body = parse(z.object({ code: z.string({ error: "Enter the invite code" }).trim().min(1, "Enter the invite code").max(40) }), req.body);
    const code = normaliseCode(body.code);
    await prisma.$transaction(async (tx) => {
      await lockKey(tx, `household:${me}`);
      const h = await tx.household.findUnique({ where: { inviteCode: code }, include: { owner: true } });
      if (!h) throw notFound("No household matches that code. Check it with the owner");
      if (h.ownerId === me) throw conflict("This is your own household.", "OWN_HOUSEHOLD");
      if (await tx.householdMember.findUnique({ where: { userId: me } })) throw conflict("You're already in a household. Leave it first.", "IN_HOUSEHOLD");
      const mine = await tx.household.findUnique({ where: { ownerId: me }, include: { _count: { select: { members: true } } } });
      if (mine && mine._count.members > 0) throw conflict("Other people share your household. Remove them or delete it before joining another.", "HAS_MEMBERS");
      // An empty household of your own is removed so you can join
      if (mine) await tx.household.delete({ where: { id: mine.id } });
      await tx.householdMember.create({ data: { householdId: h.id, userId: me, role: "EDITOR" } });
      const who = await tx.user.findUniqueOrThrow({ where: { id: me }, select: { name: true } });
      await logActivity(tx, h.ownerId, "HOUSEHOLD_CHANGED", "household", `${who.name} joined the household`);
    });
    res.json(await view(me));
  }),
);

householdRouter.post(
  "/leave",
  handler(async (req, res) => {
    const me = actorId(req);
    const m = await prisma.householdMember.findUnique({ where: { userId: me }, include: { household: true, user: true } });
    if (!m) throw notFound("Household membership");
    await prisma.householdMember.delete({ where: { id: m.id } });
    await logActivity(prisma, m.household.ownerId, "HOUSEHOLD_CHANGED", "household", `${m.user.name} left the household`);
    res.json(await view(me));
  }),
);

householdRouter.patch(
  "/members/:userId",
  handler(async (req, res) => {
    const me = actorId(req);
    const body = parse(z.object({ role }), req.body);
    const h = await ownedOrThrow(me);
    const { count } = await prisma.householdMember.updateMany({ where: { householdId: h.id, userId: param(req, "userId") }, data: { role: body.role } });
    if (!count) throw notFound("Member");
    res.json(await view(me));
  }),
);

householdRouter.delete(
  "/members/:userId",
  handler(async (req, res) => {
    const me = actorId(req);
    const h = await ownedOrThrow(me);
    const m = await prisma.householdMember.findFirst({ where: { householdId: h.id, userId: param(req, "userId") }, include: { user: true } });
    if (!m) throw notFound("Member");
    await prisma.householdMember.delete({ where: { id: m.id } });
    await logActivity(prisma, me, "HOUSEHOLD_CHANGED", "household", `Removed ${m.user.name} from the household`);
    res.json(await view(me));
  }),
);

householdRouter.delete(
  "/",
  handler(async (req, res) => {
    const me = actorId(req);
    const h = await ownedOrThrow(me);
    // Members go back to their own pantries; nobody's data is deleted
    await prisma.household.delete({ where: { id: h.id } });
    await logActivity(prisma, me, "HOUSEHOLD_CHANGED", "household", `Deleted household "${h.name}"`);
    res.json(await view(me));
  }),
);
